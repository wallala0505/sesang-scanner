// Kalshi vs Polymarket 같은 질문 가격 차이 탐지 (Gemini가 같은 질문 짝짓기 -> 코드가 차이 계산)
import {C,kst,kalshiAll,kUrl,polyTop,gemini,telegram,load,save} from './lib.mjs';
const now=Date.now();
let poly;try{poly=(await polyTop(300)).filter(p=>p.vol24>=3000&&p.yes>=3&&p.yes<=97).slice(0,250)}catch(e){console.log('poly fail',e.message);process.exit(0)}
const rows=(globalThis.__rows)||await kalshiAll();
const kal=rows.filter(r=>r.oi>=10000&&r.p>=0.03&&r.p<=0.97).sort((a,b)=>b.oi-a.oi).slice(0,600);
const prompt=`두 예측시장 목록에서 "사실상 같은 사건과 같은 결과"를 묻는 짝을 찾아라. 마감 시점이나 기준값이 다르면 짝이 아니다(예: 12월 회의 vs 1월 회의, 5만 달러 vs 5.5만 달러는 다름).
출력은 JSON 배열만: [[kalshi번호, polymarket번호, same]] 형식. same=true면 Kalshi Yes와 Polymarket 첫 결과(yesLabel)가 같은 방향, false면 반대 방향. 확신 없는 짝은 넣지 마라. 최대 25개.
KALSHI (번호|질문|옵션|마감):
${kal.map((r,i)=>`${i}|${r.q}|${r.opt}|${(r.close||'').slice(0,10)}`).join('\n')}
POLYMARKET (번호|질문|yesLabel|마감):
${poly.map((p,i)=>`${i}|${p.q}|${p.yesLabel}|${(p.end||'').slice(0,10)}`).join('\n')}`;
const out=await gemini(prompt);
let pairs=[];try{pairs=JSON.parse(out.replace(/```json|```/g,'').trim())}catch{console.log('parse fail',out?.slice(0,200));process.exit(0)}
const res=[];
for(const [ki,pi,same] of pairs){const k=kal[ki],p=poly[pi];if(!k||!p)continue;const kp=Math.round(k.p*1000)/10,pp=same?p.yes:Math.round((100-p.yes)*10)/10;const gap=Math.round((kp-pp)*10)/10;res.push({q:k.q+' / '+k.opt,poly:p.q,kp,pp,gap,koi:Math.round(k.oi),pvol:p.vol24,ku:kUrl(k.ev),pu:p.url})}
res.sort((a,b)=>Math.abs(b.gap)-Math.abs(a.gap));
save('state/arb_last.json',{ts:now,res});
const big=res.filter(r=>Math.abs(r.gap)>=4);
const lines=[`[Kalshi vs Polymarket 가격 차이] ${kst(now)}`,`같은 질문으로 확인된 짝 ${res.length}개 중 4%p 이상 차이 ${big.length}개`,''];
for(const r of big.slice(0,10))lines.push(`${r.q}\nKalshi ${r.kp}% vs Polymarket ${r.pp}% (차이 ${r.gap>0?'+':''}${r.gap}%p)\nKalshi OI $${r.koi} / Polymarket 24h $${r.pvol}\n${r.ku}\n${r.pu}\n`);
if(!big.length)lines.push('오늘은 의미 있는 차이 없음. 상위 짝:',...res.slice(0,5).map(r=>`${r.q}: Kalshi ${r.kp}% vs Polymarket ${r.pp}%`));
lines.push('','주의: 수수료, 정산 기준 문구, 마감 시각 차이로 실제 차익이 아닐 수 있음. 한국 거주자는 직접 거래 불가하므로 시장 간 견해 차이 지표로 활용.');
await telegram(lines.join('\n'));console.log('ARB SENT',res.length,big.length);
