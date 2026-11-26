// 5분 감시: 고가치 시그널 -> 뉴스 헤드라인 + Gemini 해석 -> 텔레그램
import {C,load,save,kst,kalshiAll,kalshiEvent,kUrl,news,gemini,telegram,STYLE,PROFILE} from './lib.mjs';
const now=Date.now();
const hist=load('state/prices.json',{}),alerted=load('state/alerted.json',{});
const noise=new RegExp(C.noiseTitleRegex,'i'),kw=C.interestKeywords.map(s=>s.toLowerCase());
const rows=await kalshiAll();
const signals=[],newHist={};
for(const r of rows){
  const h=(hist[r.tk]||[]).filter(x=>now-x[0]<=2*3600e3);
  if(r.oi>=C.minLiquidityUSD/4||r.v24>=C.minLiquidityUSD/4){h.push([now,r.p]);newHist[r.tk]=h.slice(-30)}
  if(noise.test(r.q+' '+r.opt))continue;
  if(r.close&&(new Date(r.close)-now)/3600e3<C.minHoursToClose)continue;
  const liq=Math.max(r.oi,r.v24),text=(r.q+' '+r.opt).toLowerCase(),interested=kw.some(k=>text.includes(k)),f=interested?C.interestBoostFactor:1;
  if(liq<C.minLiquidityUSD*f)continue;
  const at=ms=>{let b=null;for(const x of h){if(now-x[0]>=ms*0.8&&now-x[0]<=ms*1.6)b=x}return b};
  const p5=at(5*60e3),p60=at(60*60e3);
  const d5=p5?Math.round((r.p-p5[1])*100):null,d60=p60?Math.round((r.p-p60[1])*100):null;
  const why=[];
  if(d5!=null&&Math.abs(d5)>=C.move5mPP*f)why.push(`5분 ${d5>0?'+':''}${d5}%p`);
  if(d60!=null&&Math.abs(d60)>=C.move60mPP*f)why.push(`1시간 ${d60>0?'+':''}${d60}%p`);
  if(!why.length)continue;
  const lastEv=alerted['EV:'+r.ev],last=alerted[r.tk];
  if(lastEv&&now-lastEv.ts<C.realertHours*3600e3&&!(last&&Math.abs(r.p-last.p)>=0.08))continue;
  if(last&&now-last.ts<C.realertHours*3600e3&&Math.abs(r.p-last.p)<0.08)continue;
  const score=Math.max(Math.abs(d5||0)*3,Math.abs(d60||0)*1.5)*Math.log10(liq)*(interested?1.5:1);
  signals.push({score:Math.round(score),cat:r.cat,q:r.q,opt:r.opt,now:Math.round(r.p*100),d5,d60,oi:Math.round(r.oi),v24:Math.round(r.v24),why:why.join(', '),url:kUrl(r.ev),tk:r.tk,ev:r.ev});
}
signals.sort((a,b)=>b.score-a.score);
const seen=new Set(),uniq=[];for(const s of signals){if(!seen.has(s.ev)){seen.add(s.ev);uniq.push(s)}if(uniq.length>=4)break}
for(const s of uniq){alerted[s.tk]={ts:now,p:s.now/100};alerted['EV:'+s.ev]={ts:now,p:0}}
for(const k of Object.keys(alerted))if(now-alerted[k].ts>48*3600e3)delete alerted[k];
save('state/prices.json',newHist);
save('state/top_markets.json',rows.filter(r=>!noise.test(r.q)).sort((a,b)=>b.oi-a.oi).slice(0,250).map(r=>[r.q,r.opt,Math.round(r.p*100)+'%',kUrl(r.ev)]));save('state/alerted.json',alerted);
if(!uniq.length){console.log('NO_SIGNAL',kst(now),'markets',rows.length);process.exit(0)}
for(const s of uniq.slice(0,3)){s.distribution=await kalshiEvent(s.ev);s.headlines=await news(s.q.replace(/[?"]/g,'').slice(0,90))}
const raw=uniq.map(s=>`${s.q} / ${s.opt}\n${s.why}, 현재 ${s.now}%\nOI $${s.oi} / 24h 거래 $${s.v24}\n${s.url}`).join('\n\n');
const prompt=`너는 예측시장 시그널 알림 작성자다. ${PROFILE()}
아래 Kalshi 시그널(JSON: 확률 변화, 전체 옵션 분포 distribution, 최근 2일 뉴스 헤드라인 headlines)을 보고 알림을 써라.
형식: 첫 줄 "[고가치 시그널] ${kst(now).slice(11)}". 시그널마다 5줄: 1) 질문 / 옵션  2) 변화(why)와 현재 확률, 다중 옵션이면 상위 분포 요약  3) OI와 24h 거래량(달러)  4) 배경 한 줄 + (뉴스 선행/동행/후행 판단)  5) 미국 주식·크립토 시사점 한 줄. 그리고 링크.
거래 규모가 작으면(OI 5만 달러 미만) "신뢰도 낮음" 표시. ${STYLE}
데이터:
${JSON.stringify(uniq,null,1)}`;
const msg=await gemini(prompt);
await telegram(msg||(`[고가치 시그널] ${kst(now)}\n\n`+raw+'\n\n(AI 해석 실패로 원본 데이터만 전송)'));
console.log('SENT',uniq.length);
