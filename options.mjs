// CBOE 옵션 체인 데일리: 풋콜비율, IV30, 이상 거래(거래량>미결제), 콜/풋 월, Connors RSI -> 기록 + 요약
import fs from 'node:fs';
import {ROOT,kst,load,save,cboeChain,cboeHist,crsiSeries,gemini,telegram,STYLE,PROFILE,sleep} from './lib.mjs';
const WATCH=['SPY','QQQ','IWM','NVDA','TSLA','AAPL','MSFT','AMZN','META','GOOGL','AMD','AVGO','PLTR','COIN','MSTR','IBIT'];
const now=Date.now(),today=kst(now).slice(0,10);
const hist=load('state/opt_history.json',{});
const day={},unusual=[];
for(const s of WATCH){
  try{
    const d=await cboeChain(s);const px=d.current_price||d.close;
    let cv=0,pv=0,co=0,po=0;const callOI={},putOI={};
    for(const o of d.options){const m=o.option.match(/(\d{6})([CP])(\d{8})$/);if(!m)continue;const strike=+m[3]/1000,exp=m[1],isC=m[2]==='C';
      const v=o.volume||0,oi=o.open_interest||0;if(isC){cv+=v;co+=oi;callOI[strike]=(callOI[strike]||0)+oi}else{pv+=v;po+=oi;putOI[strike]=(putOI[strike]||0)+oi}
      const mid=o.last_trade_price||((o.bid||0)+(o.ask||0))/2;const prem=v*mid*100;
      const expD='20'+exp.slice(0,2)+'-'+exp.slice(2,4)+'-'+exp.slice(4);const otm=isC?strike>px:strike<px;
      if(expD>today&&otm&&v>=1000&&v>Math.max(oi,1)*2&&prem>=250000)unusual.push({sym:s,type:isC?'콜':'풋',strike,exp:'20'+exp.slice(0,2)+'-'+exp.slice(2,4)+'-'+exp.slice(4),vol:v,oi,premiumUSD:Math.round(prem),otmPct:Math.round((strike/px-1)*1000)/10});
    }
    const wall=o=>Object.entries(o).sort((a,b)=>b[1]-a[1])[0]?.[0];
    const h=await cboeHist(s);const closes=h.map(x=>x.close);const cr=crsiSeries(closes);
    day[s]={close:px,chgPct:d.price_change_percent,iv30:d.iv30,pcVol:pv&&cv?Math.round(pv/cv*100)/100:null,pcOI:po&&co?Math.round(po/co*100)/100:null,callVol:cv,putVol:pv,callWall:+wall(callOI),putWall:+wall(putOI),crsi:cr.at(-1)!=null?Math.round(cr.at(-1)):null};
    await sleep(300);
  }catch(e){console.log('opt fail',s,e.message)}
}
hist[today]=day;const dates=Object.keys(hist).sort();for(const k of dates.slice(0,-400))delete hist[k];
save('state/opt_history.json',hist);
// 전일 대비 변화
const prev=hist[dates.filter(d=>d<today).at(-1)]||{};
for(const s in day){const p=prev[s];if(p){day[s].iv30Chg=Math.round((day[s].iv30-p.iv30)*10)/10;day[s].pcVolChg=p.pcVol!=null&&day[s].pcVol!=null?Math.round((day[s].pcVol-p.pcVol)*100)/100:null}}
unusual.sort((a,b)=>b.premiumUSD-a.premiumUSD);
const prompt=`너는 옵션 플로우 애널리스트다. ${PROFILE()}
아래 CBOE 지연 데이터(전 거래일 기준)로 "[옵션 체인 데일리] ${today}" 텔레그램 메시지를 써라.
구성: 1) 한 줄 요약(시장 전체 심리: SPY/QQQ 풋콜비율, IV30) 2) 눈에 띄는 종목 3~5개(풋콜비율 급변, IV30 급등락, 콜월/풋월 대비 현재가 위치, CRSI 10 이하 과매도 또는 90 이상 과매수) 3) 이상 거래 상위 5개(거래량이 미결제의 2배 이상, 프리미엄 큰 순: 종목, 콜/풋, 행사가, 만기, 프리미엄, 현재가 대비 %) 4) 한 줄 결론.
해석 시 단정 금지: 이상 거래는 헤지일 수도 있음을 명시. 이 메시지에는 뉴스 판단 문구를 넣지 마라. 한국어, 텔레그램용 일반 텍스트(마크다운 기호, 이모지, 긴 대시 금지). 숫자는 주어진 데이터만, IV30은 소수 첫째 자리까지.
데이터: ${JSON.stringify({day,prevAvailable:!!Object.keys(prev).length,unusualTop:unusual.slice(0,12)})}`;
const msg=await gemini(prompt);
await telegram(msg||`[옵션 체인 데일리] ${today}\n`+Object.entries(day).map(([s,v])=>`${s} P/C ${v.pcVol} IV30 ${v.iv30} CRSI ${v.crsi}`).join('\n'));
console.log('OPTIONS SENT',Object.keys(day).length,unusual.length);
