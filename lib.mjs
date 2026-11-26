import fs from 'node:fs';
export const ROOT=new URL('.',import.meta.url).pathname;
export const C=JSON.parse(fs.readFileSync(ROOT+'config.json','utf8'));
export const sleep=ms=>new Promise(r=>setTimeout(r,ms));
export const load=(f,d)=>{try{return JSON.parse(fs.readFileSync(ROOT+f,'utf8'))}catch{return d}};
export const save=(f,o)=>{fs.mkdirSync(ROOT+'state',{recursive:true});fs.writeFileSync(ROOT+f,JSON.stringify(o))};
export const kst=(t=Date.now())=>new Date(t+9*3600e3).toISOString().replace('T',' ').slice(0,16)+' KST';
const KB='https://api.elections.kalshi.com/trade-api/v2';
export async function kalshiAll(){
  let cur='',n=0,rows=[];
  do{
    let d;
    for(let a=0;a<4;a++){try{const r=await fetch(KB+'/events?status=open&limit=200&with_nested_markets=true'+(cur?'&cursor='+cur:''));if(r.ok){d=await r.json();break}}catch{}await sleep(1500)}
    if(!d)throw new Error('kalshi fetch failed at page '+n);
    for(const e of d.events){
      if(C.excludeCategories.includes(e.category??null))continue;
      if(C.excludeSeriesRegex&&new RegExp(C.excludeSeriesRegex).test(e.series_ticker||e.event_ticker.split('-')[0]))continue;
      for(const m of e.markets||[])rows.push({tk:m.ticker,ev:e.event_ticker,series:e.series_ticker||e.event_ticker.split('-')[0],cat:e.category,q:e.title,opt:m.yes_sub_title||m.title,p:+m.last_price_dollars||0,p24:+m.previous_price_dollars||0,oi:+m.open_interest_fp||0,v24:+m.volume_24h_fp||0,close:m.close_time,open:m.open_time});
    }
    cur=d.cursor;n++;
  }while(cur&&n<300);
  return rows;
}
export async function kalshiEvent(evTicker){
  try{const r=await fetch(KB+'/events/'+evTicker+'?with_nested_markets=true');const j=await r.json();
    return (j.event?.markets||j.markets||[]).map(m=>({opt:m.yes_sub_title,now:Math.round((+m.last_price_dollars||0)*100),prev24h:Math.round((+m.previous_price_dollars||0)*100)})).filter(o=>o.now>=1||o.prev24h>=1).sort((a,b)=>b.now-a.now).slice(0,12);
  }catch{return []}
}
export const kUrl=ev=>'https://kalshi.com/markets/'+ev.split('-')[0].toLowerCase();
export async function news(q,n=5){
  try{const r=await fetch('https://news.google.com/rss/search?q='+encodeURIComponent(q+' when:2d')+'&hl=en-US&gl=US&ceid=US:en');const x=await r.text();
    return [...x.matchAll(/<item><title>(.*?)<\/title>.*?<pubDate>(.*?)<\/pubDate>/gs)].slice(0,n).map(m=>m[1].replace(/&amp;/g,'&').replace(/&#39;/g,"'").replace(/&quot;/g,'"')+' ('+m[2].slice(5,22)+' GMT)');
  }catch{return []}
}
export async function gemini(prompt,fast=false){
  const key=process.env.GEMINI_KEY;if(!key)return null;
  for(const model of fast?['gemini-flash-lite-latest','gemini-3.5-flash-lite','gemini-flash-latest']:['gemini-flash-latest','gemini-flash-lite-latest','gemini-3.5-flash-lite']){
    for(let a=0;a<2;a++){
      try{const r=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,{method:'POST',headers:{'x-goog-api-key':key,'content-type':'application/json'},body:JSON.stringify({contents:[{parts:[{text:prompt}]}]})});
        const j=await r.json();const t=j.candidates?.[0]?.content?.parts?.map(p=>p.text).join('');if(t)return t.trim();
      }catch{}
      await sleep(4000);
    }
  }
  return null;
}
export async function telegram(text){
  if(process.env.DRY){console.log('----DRY TELEGRAM----\n'+text);return}
  const token=process.env.TELEGRAM_TOKEN,chat_id=process.env.TELEGRAM_CHAT_ID;
  const chunks=[];let rest=text.trim();
  while(rest.length){let cut=rest.length<=3900?rest.length:rest.lastIndexOf('\n',3900);if(cut<1000)cut=3900;chunks.push(rest.slice(0,cut));rest=rest.slice(cut).trim();}
  for(const c of chunks){const r=await fetch(`https://api.telegram.org/bot${token}/sendMessage`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({chat_id,text:c,disable_web_page_preview:true})});const j=await r.json();if(!j.ok)throw new Error('telegram '+JSON.stringify(j))}
}
export const STYLE='한국어, 텔레그램용 일반 텍스트(마크다운 기호 *, #, ** 금지, 이모지 금지, 긴 대시 금지). 숫자는 주어진 데이터만 쓰고 지어내지 말 것. 뉴스 헤드라인에 근거가 없으면 "관련 기사 없음(뉴스 선행 가능성)"이라고 쓸 것. 투자 권유 표현 금지. 거래소 이름은 항상 영문 Kalshi, Polymarket으로 표기.';
export const STYLE_PLAIN='한국어, 텔레그램용 일반 텍스트(마크다운 기호 *, #, ** 금지, 이모지 금지, 긴 대시 금지). 숫자는 주어진 데이터만 쓰고 지어내지 말 것. 뉴스 관련 문구 금지. 투자 권유 표현 금지.';
export const PROFILE=()=>`독자: 미국 주식과 크립토에 투자하는 한국 개인투자자. 관심사: ${C.profile.interests.join(', ')}.`;

// ---------- 헤드라인/옵션용 공용 함수 ----------
const UA={'User-Agent':'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36'};
const unesc=s=>s.replace(/<br\s*\/?>/g,' ').replace(/<[^>]+>/g,'').replace(/&#036;/g,'$').replace(/&amp;/g,'&').replace(/&#39;/g,"'").replace(/&quot;/g,'"').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/\s+/g,' ').trim();
export async function tgChannel(name){
  const r=await fetch('https://t.me/s/'+name,{headers:UA});const h=await r.text();
  return h.split('tgme_widget_message_wrap').slice(1).map(b=>{
    const post=(b.match(/data-post="([^"]+)"/)||[])[1];const txt=(b.match(/tgme_widget_message_text[^>]*>([\s\S]*?)<\/div>/)||[])[1]||'';const time=(b.match(/datetime="([^"]+)"/)||[])[1]||'';
    return {id:'tg:'+post,text:unesc(txt),time,url:'https://t.me/'+post};
  }).filter(x=>x.text&&x.id!=='tg:undefined');
}
export async function rss(url,headers={}){
  const r=await fetch(url,{headers:{...UA,...headers}});const x=await r.text();
  return [...x.matchAll(/<(item|entry)>([\s\S]*?)<\/\1>/g)].map(m=>{const b=m[2];
    const t=(b.match(/<title[^>]*>([\s\S]*?)<\/title>/)||[])[1]||'';const l=(b.match(/<link[^>]*href="([^"]+)"/)||b.match(/<link>([\s\S]*?)<\/link>/)||[])[1]||'';
    const d=(b.match(/<(pubDate|updated|published)>([\s\S]*?)<\//)||[])[2]||'';const s=(b.match(/<(description|summary)[^>]*>([\s\S]*?)<\/\1>/)||[])[2]||'';
    return {id:'rss:'+(l||t),text:unesc(t.replace(/<!\[CDATA\[|\]\]>/g,'')),summary:unesc(s.replace(/<!\[CDATA\[|\]\]>/g,'')).slice(0,300),time:d,url:unesc(l.replace(/<!\[CDATA\[|\]\]>/g,''))}});
}
export const CBOE_H={...UA,Accept:'application/json',Referer:'https://www.cboe.com/',Origin:'https://www.cboe.com'};
export async function cboeChain(sym){const r=await fetch(`https://cdn.cboe.com/api/global/delayed_quotes/options/${sym}.json`,{headers:CBOE_H});if(!r.ok)throw new Error('cboe '+sym+' '+r.status);return (await r.json()).data}
export async function cboeHist(sym){const r=await fetch(`https://cdn.cboe.com/api/global/delayed_quotes/charts/historical/${sym}.json`,{headers:CBOE_H});if(!r.ok)throw new Error('cboeh '+sym+' '+r.status);return (await r.json()).data.map(d=>({date:d.date,close:+d.close}))}
// Connors RSI = (RSI(3) + RSI(streak,2) + PercentRank(1일 수익률,100)) / 3
function rsi(arr,n){const out=Array(arr.length).fill(null);let g=0,l=0;for(let i=1;i<arr.length;i++){const ch=arr[i]-arr[i-1];const up=Math.max(ch,0),dn=Math.max(-ch,0);if(i<=n){g+=up/n;l+=dn/n;if(i===n)out[i]=l===0?100:100-100/(1+g/l)}else{g=(g*(n-1)+up)/n;l=(l*(n-1)+dn)/n;out[i]=l===0?100:100-100/(1+g/l)}}return out}
export function crsiSeries(closes){
  const streak=[0];for(let i=1;i<closes.length;i++){const p=streak[i-1];streak.push(closes[i]>closes[i-1]?(p>0?p+1:1):closes[i]<closes[i-1]?(p<0?p-1:-1):0)}
  const r3=rsi(closes,3),rs=rsi(streak,2),roc=closes.map((c,i)=>i?c/closes[i-1]-1:0);
  return closes.map((_,i)=>{if(i<101||r3[i]==null||rs[i]==null)return null;const w=roc.slice(i-100,i);const pr=w.filter(x=>x<roc[i]).length/w.length*100;return (r3[i]+rs[i]+pr)/3});
}
export async function polyTop(limit=150){
  let r;try{r=await fetch('https://gamma-api.polymarket.com/markets?active=true&closed=false&order=volume24hr&ascending=false&limit='+limit,{headers:UA})}catch{}
  if(!r||!r.ok){if(!process.env.PREDEXON_KEY)throw new Error('gamma blocked');const p=await (await fetch('https://api.predexon.com/v2/polymarket/markets?status=open&sort=volume_1d&limit=100',{headers:{'x-api-key':process.env.PREDEXON_KEY}})).json();
    return p.markets.filter(m=>!/sports|nba|nfl|soccer|esports|tennis|games/i.test((m.tags||[]).join(' ')+' '+m.title)).map(m=>({q:m.title,yesLabel:m.outcomes?.[0]?.label,yes:Math.round((+m.outcomes?.[0]?.price||0)*1000)/10,d24:null,vol24:Math.round(m.rolling_metrics?.volume_1d||0),liq:Math.round(m.liquidity_usd||0),end:m.end_time,url:'https://polymarket.com/event/'+m.event_slug}))}
  return (await r.json()).filter(m=>!/sports|nba|nfl|nhl|mlb|soccer|esports|tennis|ufc|cricket| vs\.? |win on 20/i.test((m.question||'')+' '+(m.category||''))).map(m=>{const pr=JSON.parse(m.outcomePrices||'[]');const oc=JSON.parse(m.outcomes||'[]');return {q:m.question,yesLabel:oc[0],yes:Math.round((+pr[0]||0)*1000)/10,d24:m.oneDayPriceChange!=null?Math.round(m.oneDayPriceChange*1000)/10:null,vol24:Math.round(m.volume24hr||0),liq:Math.round(m.liquidityNum||m.liquidity||0),end:m.endDate,url:'https://polymarket.com/event/'+(m.events?.[0]?.slug||m.slug)}});
}
