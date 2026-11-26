// 매주 일요일: "옵션 체인 데이터와 CRSI가 다음 주가 움직임을 예측한다"는 가설을 반증 시도 -> 리포트
import {kst,load,cboeHist,crsiSeries,gemini,telegram,STYLE,PROFILE,sleep} from './lib.mjs';
const now=Date.now(),dow=new Date(now+9*3600e3).getUTCDay();
if(dow!==0&&!process.env.FORCE){console.log('not sunday');process.exit(0)}
const SYMS=['SPY','QQQ','IWM','NVDA','TSLA','AAPL','MSFT','AMZN','META','AMD','COIN'];
// 1) CRSI 20년 백테스트: 신호 다음 5거래일 수익률 vs 전체 평균
const bt={};
for(const s of SYMS){try{const h=await cboeHist(s);const c=h.map(x=>x.close);const cr=crsiSeries(c);const f5=c.map((x,i)=>i+5<c.length?c[i+5]/x-1:null);
  const stat=sel=>{const a=f5.filter((v,i)=>v!=null&&cr[i]!=null&&sel(cr[i]));if(!a.length)return null;const m=a.reduce((x,y)=>x+y,0)/a.length;return {n:a.length,avg5dPct:Math.round(m*10000)/100,winPct:Math.round(a.filter(v=>v>0).length/a.length*100)}};
  bt[s]={all:stat(()=>true),crsiBelow10:stat(v=>v<10),crsiAbove90:stat(v=>v>90),last3y_below10:null};
  await sleep(300);}catch(e){console.log('bt fail',s)}}
// 2) 옵션 특징값(누적 기록) vs 다음날/5일 수익률 상관
const hist=load('state/opt_history.json',{});const dates=Object.keys(hist).sort();
const pairs=[];for(let i=0;i<dates.length-1;i++){for(const s in hist[dates[i]]){const a=hist[dates[i]][s],b=hist[dates[i+1]]?.[s],b5=hist[dates[i+5]]?.[s];if(!b||a.pcVol==null)continue;pairs.push({s,pc:a.pcVol,iv:a.iv30,r1:b.close/a.close-1,r5:b5?b5.close/a.close-1:null})}}
const corr=(x,y)=>{const n=x.length;if(n<10)return null;const mx=x.reduce((a,b)=>a+b)/n,my=y.reduce((a,b)=>a+b)/n;let sxy=0,sx=0,sy=0;for(let i=0;i<n;i++){sxy+=(x[i]-mx)*(y[i]-my);sx+=(x[i]-mx)**2;sy+=(y[i]-my)**2}return Math.round(sxy/Math.sqrt(sx*sy)*100)/100};
const optStats={days:dates.length,samples:pairs.length,corr_pc_r1:corr(pairs.map(p=>p.pc),pairs.map(p=>p.r1)),corr_pc_r5:(()=>{const q=pairs.filter(p=>p.r5!=null);return corr(q.map(p=>p.pc),q.map(p=>p.r5))})()};
const prompt=`너는 회의적인 퀀트 리서처다. 가설: "모든 꿀팁은 CBOE 옵션 체인 데이터에 있다(옵션 데이터와 CRSI로 다음 주가 움직임을 예측할 수 있다)". 이 가설을 반증(disprove)하려고 시도하는 주간 리포트를 써라. ${PROFILE()}
구성: "[가설 반증 리포트] ${kst(now).slice(0,10)}" / 1) 결론 한 줄(반증됨/반증 실패/데이터 부족) 2) CRSI 20년 백테스트 해석: CRSI<10 이후 5일 평균 수익률과 승률이 전체 평균보다 의미 있게 높은지 종목별 요약(표본 수 언급) 3) 옵션 풋콜비율과 이후 수익률 상관(표본 ${pairs.length}개, 10개 미만이면 "데이터 축적 중"이라고만) 4) 생존편향, 과최적화, 거래비용 등 반론 5) 다음 주에 검증할 것 1~2개.
과장 금지. ${STYLE}
데이터: ${JSON.stringify({crsiBacktest:bt,optionsFeatureStats:optStats})}`;
const msg=await gemini(prompt);
await telegram(msg||'[가설 반증 리포트] AI 생성 실패\n'+JSON.stringify(bt).slice(0,3000));
console.log('WEEKLY SENT');
