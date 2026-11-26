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
export async function gemini(prompt){
  const key=process.env.GEMINI_KEY;if(!key)return null;
  for(const model of ['gemini-flash-latest','gemini-flash-lite-latest','gemini-3.5-flash-lite']){
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
export const STYLE='한국어, 텔레그램용 일반 텍스트(마크다운 기호 *, #, ** 금지, 이모지 금지, 긴 대시 금지). 숫자는 주어진 데이터만 쓰고 지어내지 말 것. 뉴스 헤드라인에 근거가 없으면 "관련 기사 없음(뉴스 선행 가능성)"이라고 쓸 것. 투자 권유 표현 금지.';
export const PROFILE=()=>`독자: 미국 주식과 크립토에 투자하는 한국 개인투자자. 관심사: ${C.profile.interests.join(', ')}.`;
