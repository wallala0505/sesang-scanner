// 매일 08:00 KST 데일리 브리핑: Kalshi + Polymarket + 뉴스 헤드라인 -> Gemini -> 텔레그램
import fs from 'node:fs';
import {ROOT,C,load,save,kst,kalshiAll,kalshiEvent,kUrl,news,gemini,telegram,STYLE,PROFILE,sleep} from './lib.mjs';
const now=Date.now(),today=kst(now).slice(0,10);
const rows=await kalshiAll();
const noise=new RegExp(C.noiseTitleRegex,'i');
// 주간 비교용 스냅샷 (state/snap/YYYY-MM-DD.json, 10일 보관)
fs.mkdirSync(ROOT+'state/snap',{recursive:true});
const snapFiles=fs.readdirSync(ROOT+'state/snap').sort();
let week=null;for(const f of snapFiles){const dd=(new Date(today)-new Date(f.slice(0,10)))/864e5;if(dd>=6&&dd<=8)week=new Map(JSON.parse(fs.readFileSync(ROOT+'state/snap/'+f,'utf8')))}
fs.writeFileSync(ROOT+'state/snap/'+today+'.json',JSON.stringify(rows.filter(r=>r.oi>=2000).map(r=>[r.tk,Math.round(r.p*100)])));
for(const f of snapFiles)if((new Date(today)-new Date(f.slice(0,10)))/864e5>10)fs.unlinkSync(ROOT+'state/snap/'+f);
const fmt=r=>({q:r.q,opt:r.opt,cat:r.cat,prev24h:Math.round(r.p24*100),now:Math.round(r.p*100),d24:Math.round((r.p-r.p24)*100),dWeek:week?.has(r.tk)?Math.round(r.p*100)-week.get(r.tk):null,vol24:Math.round(r.v24),oi:Math.round(r.oi),url:kUrl(r.ev),ev:r.ev});
const clean=rows.filter(r=>!noise.test(r.q+' '+r.opt)&&!(r.close&&new Date(r.close)-now<36*3600e3));
const movers=clean.filter(r=>r.p24>0&&r.v24>=3000&&Math.abs(r.p-r.p24)>=0.08).sort((a,b)=>Math.abs(b.p-b.p24)*Math.log10(b.v24+b.oi)-Math.abs(a.p-a.p24)*Math.log10(a.v24+a.oi)).slice(0,25).map(fmt);
// 거래량 상위 이벤트 (이벤트 단위 합산) + 전체 분포
const evAgg={};for(const r of clean){const e=evAgg[r.ev]||(evAgg[r.ev]={ev:r.ev,q:r.q,cat:r.cat,v24:0,oi:0});e.v24+=r.v24;e.oi+=r.oi}
const hotEv=Object.values(evAgg).sort((a,b)=>b.v24-a.v24).slice(0,10);
for(const e of hotEv){e.distribution=await kalshiEvent(e.ev);e.url=kUrl(e.ev);e.v24=Math.round(e.v24);e.oi=Math.round(e.oi);await sleep(200)}
const fresh=clean.filter(r=>r.open&&now-new Date(r.open)<36*3600e3&&r.v24>=2000).sort((a,b)=>b.v24-a.v24).slice(0,8).map(fmt);
// Polymarket: gamma 직접 -> 실패 시 Predexon
let poly=[];
try{const r=await fetch('https://gamma-api.polymarket.com/markets?active=true&closed=false&order=volume24hr&ascending=false&limit=150');if(!r.ok)throw 0;const j=await r.json();
  poly=j.filter(m=>!/sports|nba|nfl|nhl|mlb|soccer|esports|tennis|ufc|cricket|vs\.|win on 20/i.test((m.question||'')+' '+(m.category||''))).slice(0,40).map(m=>{const pr=JSON.parse(m.outcomePrices||'[]');return {q:m.question,yes:Math.round((+pr[0]||0)*100),d24:m.oneDayPriceChange!=null?Math.round(m.oneDayPriceChange*100):null,vol24:Math.round(m.volume24hr||0),url:'https://polymarket.com/event/'+(m.events?.[0]?.slug||m.slug)}});
}catch{
  if(process.env.PREDEXON_KEY){try{const r=await fetch('https://api.predexon.com/v2/polymarket/markets?status=open&sort=volume_1d&limit=100',{headers:{'x-api-key':process.env.PREDEXON_KEY}});const j=await r.json();
    poly=j.markets.filter(m=>!/sports|nba|nfl|soccer|esports|tennis|games/i.test((m.tags||[]).join(' ')+' '+m.title)).slice(0,40).map(m=>({q:m.title,yes:Math.round((+m.outcomes?.[0]?.price||0)*100),d24:null,vol24:Math.round(m.rolling_metrics?.volume_1d||0),url:'https://polymarket.com/event/'+m.event_slug}));}catch{}}
}
// 뉴스: 상위 주제별 헤드라인
const topics=[...hotEv.slice(0,5).map(e=>e.q),...movers.slice(0,5).map(m=>m.q),...poly.slice(0,4).map(p=>p.q)];
const headlines={};for(const t of [...new Set(topics)].slice(0,12)){headlines[t]=await news(t.replace(/[?"]/g,'').slice(0,90),4)}
const prompt=`너는 예측시장 기반 투자 뉴스레터 "세상물정 데일리" 편집자다. ${PROFILE()}
철학: 뉴스는 베팅이 끝난 뒤에 나온다. 돈이 어디에 베팅되고 어떻게 바뀌었는지를 전한다.
규칙: 여러 옵션이 있는 이벤트는 distribution 전체를 보고 해석(단일 옵션 숫자로 결론 금지). Kalshi와 Polymarket에 같은 주제가 있으면 나란히 비교. 날씨, 사소한 엔터테인먼트, 0~1% 장기 후보, 소규모 거래는 제외하거나 "신뢰도 낮음". 각 핵심 시그널에 뉴스 헤드라인 근거로 "뉴스 선행/동행/후행" 표시.
형식: 첫 줄 "[세상물정 데일리] ${today}" / 한 줄 요약 / 핵심 시그널 4~7개(질문, 확률 변화 어제->오늘(가능하면 주간), Kalshi vs Polymarket, 거래량·OI, 배경 한 줄, 미국 주식·크립토 시사점, 링크) / 돈이 몰린 큰 그림 2~3줄 / 신규 주목 마켓 1~3개 / 마지막 줄 "참고용이며 투자 권유 아님". ${STYLE}
데이터(JSON):
${JSON.stringify({kalshiMovers24h:movers,kalshiTopVolumeEvents:hotEv,kalshiNewMarkets:fresh,polymarketTopVolume:poly,newsHeadlines:headlines,weekCompareAvailable:!!week})}`;
const brief=await gemini(prompt);
await telegram(brief||`[세상물정 데일리] ${today}\nAI 요약 생성 실패. 상위 급변:\n`+movers.slice(0,8).map(m=>`${m.q} / ${m.opt}: ${m.prev24h}->${m.now}% (${m.url})`).join('\n'));
console.log('DAILY_SENT',!!brief);
