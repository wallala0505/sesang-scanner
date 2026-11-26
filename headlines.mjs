// 고신호 헤드라인 감시: 텔레 미러 / RSS / EDGAR / 구글뉴스 -> 키워드 1차 필터 -> Gemini가 중요도 판단 + 관련 예측시장 연결 -> 텔레그램
import fs from 'node:fs';
import {ROOT,C,load,save,kst,news,gemini,telegram,tgChannel,rss,STYLE,PROFILE} from './lib.mjs';
const S=JSON.parse(fs.readFileSync(ROOT+'sources.json','utf8'));
const seen=load('state/seen_headlines.json',{}),first=!Object.keys(seen).length,now=Date.now();
const kw=C.interestKeywords.map(s=>s.toLowerCase().trim()).concat(['breaking','urgent','halt','default','downgrade','resign','ceasefire','sanction','invasion','strike','emergency','bankrupt','sec ','doj','probe','fraud','short']);
const items=[];
const push=(src,arr,filter)=>{for(const x of arr){if(!x.text||seen[x.id])continue;seen[x.id]=now;const t=(x.text+' '+(x.summary||'')).toLowerCase();if(!filter||kw.some(k=>t.includes(k))||/🚨/.test(x.text))items.push({src,text:x.text.slice(0,400),time:x.time,url:x.url})}};
for(const t of S.telegram){try{push(t.label,(await tgChannel(t.name)).slice(-30),t.filter)}catch(e){console.log('tg fail',t.name)}}
for(const f of S.rss){try{push(f.label,(await rss(f.url)).slice(0,15),f.filter)}catch(e){console.log('rss fail',f.label)}}
// EDGAR 8-K: 회계/감사 경고(4.01 감사인 교체, 4.02 재무제표 신뢰 불가) 전체 + 관심 기업의 경영진 변동(5.02)/상장폐지 통지(3.01)
try{const ed=await rss('https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&type=8-K&count=100&output=atom',{'User-Agent':'sesang-scanner research contact@example.com'});
  const arr=[];for(const e of ed){const its=[...(e.summary||'').matchAll(/Item (\d\.\d\d)/g)].map(m=>m[1]);const red=its.some(i=>S.edgar.redFlagItems.includes(i));const watch=its.some(i=>S.edgar.watchItems.includes(i))&&S.edgar.watchCompanies.some(c=>e.text.toLowerCase().includes(c.toLowerCase()));if(red||watch)arr.push({...e,text:e.text+' ['+its.map(i=>'Item '+i).join(', ')+']'})}
  push('SEC 8-K 공시',arr,false);
}catch{console.log('edgar fail')}
const minute=new Date().getUTCMinutes();
if(minute<6||first){for(const g of S.gnews){try{push(g.label,(await news(g.q,6)).map(h=>({id:'gn:'+h,text:h,time:'',url:''})),false)}catch{}}}// 구글뉴스는 시간당 1회
for(const k of Object.keys(seen))if(now-seen[k]>4*86400e3)delete seen[k];
save('state/seen_headlines.json',seen);
if(first){console.log('HEADLINES first run: baseline',Object.keys(seen).length);process.exit(0)}// 첫 실행은 기준선만 저장
if(!items.length){console.log('NO_HEADLINE');process.exit(0)}
const markets=load('state/top_markets.json',[]);
const prompt=`너는 투자 속보 데스크다. ${PROFILE()}
아래는 최근 5분간 새로 들어온 헤드라인 후보다. 이 중 미국 주식·크립토·금리에 실제로 영향을 줄 "고가치" 항목만 골라라(보통 0~3개, 없으면 정확히 NONE 한 단어만 출력).
고가치 기준: 시장을 움직일 새 사실(정책 결정, 경제지표 서프라이즈, 대형 기업 경영진/회계 이슈, 지정학 급변, 규제 조치, 숏 리포트 등). 단순 반복, 의견, 소형주 일상 공시는 제외.
각 항목 형식(3~4줄): "[속보] 헤드라인 요약(한국어)" / 출처와 시각 / 관련 예측시장이 아래 목록에 있으면 "관련 베팅: 질문 - 현재 확률" (없으면 생략) / 시사점 한 줄 / 링크(있으면).
첫 줄은 "[고신호 헤드라인] ${kst(now).slice(11)}". ${STYLE}
헤드라인 후보:
${JSON.stringify(items.slice(0,40))}
참고용 Kalshi 주요 마켓(질문|옵션|확률|링크):
${markets.slice(0,200).map(m=>m.join('|')).join('\n')}`;
const out=await gemini(prompt,true);
if(!out||/^NONE\b/.test(out.trim())){console.log('HEADLINES none important',items.length);process.exit(0)}
await telegram(out);console.log('HEADLINES SENT');
