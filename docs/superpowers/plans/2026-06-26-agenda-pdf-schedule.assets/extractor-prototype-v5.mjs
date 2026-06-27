import * as pdfjs from "/Users/ericweiss/FX-Webpage-Template/node_modules/pdfjs-dist/legacy/build/pdf.mjs";
import { readFileSync } from "node:fs";
const file=process.argv[2];
const doc=await pdfjs.getDocument({data:new Uint8Array(readFileSync(file)),isEvalSupported:false,useSystemFonts:true}).promise;

const L=[];
for(let p=1;p<=doc.numPages;p++){
  const tc=await (await doc.getPage(p)).getTextContent();
  const rows=new Map();
  for(const it of tc.items){ if(!it.str||!it.str.trim())continue;
    const y=Math.round(it.transform[5]); const size=Math.round(Math.hypot(it.transform[0],it.transform[1])*10)/10;
    if(!rows.has(y))rows.set(y,{items:[],sig:new Map()}); const r=rows.get(y);
    r.items.push({x:it.transform[4],s:it.str}); const k=`${it.fontName}|${size}`; r.sig.set(k,(r.sig.get(k)||0)+it.str.length); }
  for(const y of [...rows.keys()].sort((a,b)=>b-a)){ const r=rows.get(y);
    const text=r.items.sort((a,b)=>a.x-b.x).map(i=>i.s).join(" ").replace(/\s+/g," ").trim(); if(!text)continue;
    const [font,size]=[...r.sig.entries()].sort((a,b)=>b[1]-a[1])[0][0].split("|");
    L.push({p,y,text,font,size:parseFloat(size),len:text.length}); }
}
const lines=L.filter(l=>!/^Page \d+/i.test(l.text)&&!/^Institutional Investor/i.test(l.text)&&l.text!=="th");
const noSp=(t)=>t.replace(/\s+/g,"");
const clockRange=(t)=>/^\d{1,2}:?\d{0,2}(AM|PM)?[–—-]\d{1,2}:?\d{0,2}(AM|PM)?$/i.test(noSp(t));
const clockSingle=(t)=>/^\d{1,2}:\d{2}(AM|PM)?$/i.test(noSp(t));
const isClock=(t)=>(clockRange(t)||clockSingle(t))&&t.length<26;
const timeSizes=new Map(); for(const l of lines) if(isClock(l.text)) timeSizes.set(l.size,(timeSizes.get(l.size)||0)+1);
const timeSize=[...timeSizes.entries()].sort((a,b)=>b[1]-a[1])[0]?.[0]??14;
const isTime=(l)=>Math.abs(l.size-timeSize)<1.5&&isClock(l.text);
const bodyTally=new Map(); for(const l of lines) if(l.len>55) bodyTally.set(`${l.font}|${l.size}`,(bodyTally.get(`${l.font}|${l.size}`)||0)+1);
const bodyKey=[...bodyTally.entries()].sort((a,b)=>b[1]-a[1])[0]?.[0];
const idxTimes=lines.map((l,i)=>isTime(l)?i:-1).filter(i=>i>=0);
const aboveTally=new Map(); for(const i of idxTimes){ const a=lines[i-1]; if(a&&!isTime(a)) aboveTally.set(`${a.font}|${a.size}`,(aboveTally.get(`${a.font}|${a.size}`)||0)+1); }
const titleKeys=new Set([...aboveTally.entries()].filter(([k,n])=>n>=2).map(([k])=>k));
const K=(l)=>`${l.font}|${l.size}`; const isBody=(l)=>K(l)===bodyKey; const isTitle=(l)=>titleKeys.has(K(l))&&!isTime(l);
const DOWc=/^(mon|tues?|wednes?|thurs?|fri|satur?|sun)day,?[a-z]*\d/i;
const isDay=(l)=>DOWc.test(noSp(l.text))&&/20\d{2}/.test(noSp(l.text));
function dayFor(i){ for(let j=i;j>=0;j--){ if(isDay(lines[j])) return lines[j].text.replace(/\s+/g," ").trim(); } return null; }
const LABEL=/^(Moderator|Panelists?|Speakers?|Presented by|Presenter|Chairperson|Forum Chairperson|Discussion Leader|Interviewer|Featuring)\s*:/i;
const ROOMKW=/\b(Ballroom|Salon|Salons|Room|Foyer|Hall|Suite|Lounge|Terrace|Adorn|Lakeview|LaSalle|La Salle|Delaware|Drawing|Pavilion|Atrium|Gallery)\b/i;
const trackMarker=/^(Breakout\s+[IVX\d]+|[IVX]{1,3}\.\s|Track\s+\w+)/i;
const shapeRoomish=(l)=>l.len<=46&&!/[.?!]$/.test(l.text)&&/^[A-Z0-9]/.test(l.text)&&l.text.split(" ").length<=9&&!LABEL.test(l.text)&&!isDay(l)&&!isTime(l);
const fwd=[];
for(const i of idxTimes){ const cands=[];
  for(let m=i+1;m<lines.length&&m<=i+6;m++){ const l=lines[m]; if(isTime(l)||isDay(l))break; if(shapeRoomish(l)) cands.push({idx:m,text:l.text}); if(isBody(l)&&cands.length)break; }
  fwd.push(cands); }
const roomFreq=new Map(); fwd.flat().forEach(c=>roomFreq.set(c.text,(roomFreq.get(c.text)||0)+1));
const isRealRoom=(t)=>ROOMKW.test(t)||(roomFreq.get(t)||0)>=2;
function inferAP(h,ap){ if(ap)return ap.toUpperCase(); if(h>=7&&h<=11)return"AM"; return"PM"; }
function fmt(t){ const m=noSp(t).match(/(\d{1,2}):?(\d{2})?(AM|PM)?/i); if(!m)return null; const h=parseInt(m[1],10); const mm=m[2]??"00"; return `${h}:${mm} ${inferAP(h,m[3])}`; }
function normTime(raw){ const parts=noSp(raw).split(/[–—-]/); const a=fmt(parts[0]); const b=parts[1]?fmt(parts[1]):null; return b?`${a} – ${b}`:a; }
const sessions=[];
idxTimes.forEach((i,ai)=>{
  const cands=fwd[ai]; let room=null, subtitle=[];
  for(const c of cands){ if(isRealRoom(c.text)){ room=c.text; break; } else subtitle.push(c.text); }
  const up=[];
  for(let j=i-1;j>=0&&j>=i-4;j--){ const l=lines[j];
    if(isTime(l)||LABEL.test(l.text)||isRealRoom(l.text))break;
    if(isTitle(l)||(up.length===0&&!isBody(l)&&!isRealRoom(l.text)&&!shapeRoomish(l))||(up.length===0&&!isBody(l)&&!isRealRoom(l.text))){ up.unshift(l.text); } else break; }
  const down=[];
  for(let m=i+1;m<lines.length&&m<=i+3;m++){ const l=lines[m];
    if(isTime(l)||isDay(l)||isRealRoom(l.text)||LABEL.test(l.text))break;
    if(isTitle(l)){ down.push(l.text); } else break; }
  const titleParts=[...up,...down,...subtitle.filter(s=>!down.includes(s))];
  const title=titleParts.join(" ").replace(/\s+/g," ").replace(/\s+([:?,])/g,"$1").trim();
  const spanEnd=ai+1<idxTimes.length?idxTimes[ai+1]:lines.length;
  let tracks=[];
  if(/breakout|discussion group/i.test(title)){
    for(let m=i+1;m<spanEnd;m++){ const l=lines[m];
      if(trackMarker.test(l.text)){ const rest=l.text.replace(trackMarker,"").trim(); let tTitle=rest,tRoom=null;
        for(let nn=m+1;nn<spanEnd&&nn<=m+4;nn++){ const x=lines[nn]; if(trackMarker.test(x.text)||isTime(x))break;
          if(!tRoom&&isRealRoom(x.text)){tRoom=x.text;continue;} if(!tTitle&&(isTitle(x)||(!isBody(x)&&!shapeRoomish(x)))){tTitle=x.text;} }
        tracks.push({label:l.text.match(trackMarker)[0].trim(),title:tTitle,room:tRoom}); } } }
  sessions.push({day:dayFor(i),time:normTime(lines[i].text),title:title||null,room,tracks});
});
// monotonic AM/PM auto-repair (deterministic, flagged)
const toMin=(s)=>{ const m=(s||"").match(/(\d{1,2}):(\d{2}) (AM|PM)/); if(!m)return null; let h=(+m[1])%12+(m[3]==="PM"?12:0); return h*60+ +m[2]; };
const flipAP=(s)=>s.replace(/(AM|PM)/,(x)=>x==="AM"?"PM":"AM");
let corrections=0;
{ const byD=new Map(); sessions.forEach(s=>{const d=s.day??"?"; (byD.get(d)||byD.set(d,[]).get(d)).push(s);});
  for(const [,ss] of byD){ let prev=-1;
    for(const s of ss){ if(!s.time)continue; const parts=s.time.split(" – "); let startS=parts[0], endS=parts[1]||null;
      let st=toMin(startS), en=endS?toMin(endS):null;
      if(st!=null&&prev>=0&&st<prev){ const alt=toMin(flipAP(startS)); if(alt!=null&&alt>=prev&&(en==null||alt<=en)){ s.drift=`start→${flipAP(startS)} (source: ${startS})`; startS=flipAP(startS); st=alt; corrections++; } }
      if(st!=null&&en!=null&&en<st){ const altE=toMin(flipAP(endS)); if(altE!=null&&altE>=st){ s.drift=(s.drift?s.drift+"; ":"")+`end→${flipAP(endS)} (source: ${endS})`; endS=flipAP(endS); en=altE; corrections++; } }
      s.time=endS?`${startS} – ${endS}`:startS; if(st!=null)prev=st; } } }
// confidence (recomputed post-repair)
const n=sessions.length;
const pTitle=n?sessions.filter(s=>s.title).length/n:0, pRoom=n?sessions.filter(s=>s.room).length/n:0, pTime=n?sessions.filter(s=>s.time).length/n:0;
let monoOK=true; { const byD=new Map(); sessions.forEach(s=>{const d=s.day??"?";(byD.get(d)||byD.set(d,[]).get(d)).push(s)});
  for(const [,ss] of byD){ let last=-1; for(const s of ss){ const v=toMin((s.time||"").split(" – ")[0]); if(v==null)continue; if(v+1<last)monoOK=false; last=v; } } }
const conf=(n>=5&&pTime>=0.95&&pTitle>=0.80&&pRoom>=0.75&&monoOK)?(corrections>0?"HIGH (auto-corrected)":"HIGH"):"LOW";
const days=new Set(sessions.map(s=>s.day).filter(Boolean));
console.log(`### ${file.split("/").pop()} — ${n} sessions, ${days.size} day(s)  [timeSize=${timeSize}]`);
console.log(`    confidence=${conf}  times=${(pTime*100)|0}% titles=${(pTitle*100)|0}% rooms=${(pRoom*100)|0}% mono=${monoOK} corrections=${corrections}  ${conf==="LOW"?"→ FALL BACK TO EMBED":(corrections>0?"→ SHOW w/ drift flag(s)":"→ SHOW")}`);
let cur=undefined;
sessions.forEach((s,idx)=>{ if(s.day!==cur){cur=s.day; console.log(`\n  —— ${cur||"(no day header)"} ——`);}
  console.log(`  ${String(idx+1).padStart(2)}. ${(s.time||"??").padEnd(18)} | ${(s.room||"—").padEnd(26)} | ${s.title||"‹no title›"}`);
  if(s.drift) console.log(`        ⚠ corrected: ${s.drift}`);
  for(const t of s.tracks) console.log(`        ↳ ${(t.room||"—").padEnd(22)} | ${t.label} ${t.title&&t.title!==t.label?"— "+t.title:""}`); });
