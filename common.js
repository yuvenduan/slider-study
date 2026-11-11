// Shared by index.html and the three study parts: rater name, form, browser storage, sending answers to the endpoint, progress.
// An answer counts as saved only when the endpoint replies {ok:true}; until then it stays in this browser's queue and is re-sent.
(function(){
const CFG=window.STUDY_CONFIG||{};
const QS=(()=>{try{return new URLSearchParams(location.search)}catch(e){return new URLSearchParams("")}})();
// ?study=test... sends to a test tab (only names starting with "test" are accepted) and keeps its own browser storage
const QSTUDY=(QS.get("study")||"").replace(/[^A-Za-z0-9_-]/g,"").slice(0,40);
const STUDY=/^test/.test(QSTUDY)?QSTUDY:(CFG.STUDY||"study_v1");
const PFX="hs2v1_"+STUDY+"_";
const PAGES=["grag","unislider","faces","video"];
const LABEL={grag:"Image sliders, set 1",unislider:"Image sliders, set 2",faces:"Two-edit face sliders",video:"Video sliders"};
function lsGet(k,d){try{const v=localStorage.getItem(k);return v==null?d:JSON.parse(v)}catch(e){return d}}
function lsSet(k,v){try{localStorage.setItem(k,JSON.stringify(v));return true}catch(e){return false}}
function rnd(n){const c="abcdefghijkmnpqrstuvwxyz23456789",a=new Uint8Array(n);let s="";
  try{crypto.getRandomValues(a)}catch(e){for(let i=0;i<n;i++)a[i]=Math.floor(Math.random()*256)}
  for(let i=0;i<n;i++)s+=c[a[i]%c.length];return s}
let rid=lsGet(PFX+"rid","");if(!rid){rid=rnd(10);lsSet(PFX+"rid",rid)}
let rcode=(QS.get("r")||"").replace(/[^A-Za-z0-9_.-]/g,"").slice(0,40);
if(rcode)lsSet(PFX+"rcode",rcode);else rcode=lsGet(PFX+"rcode","")||"";
// FNV-1a 32-bit of the trimmed, lower-cased name -> form 1..n (deterministic; a link with ?form=k overrides)
function fnv(s){let h=0x811c9dc5;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,0x01000193)>>>0}return h>>>0}
function normName(n){return String(n||"").trim().replace(/\s+/g," ").toLowerCase()}
function formFor(name,n){return (fnv(normName(name))%n)+1}
const H={STUDY:STUDY,CFG:CFG,QS:QS,PAGES:PAGES,LABEL:LABEL,rid:()=>rid,rcode:()=>rcode,formFor:formFor,lsGet:lsGet,lsSet:lsSet};
H.name=()=>lsGet(PFX+"name","")||"";
H.setName=n=>lsSet(PFX+"name",String(n).trim().slice(0,60));
// ---- form assignment (v2, 2026-11-11): ONE link for everyone ----
// Order: ?form=k in the URL (mode "link") > the assignment stored in this browser for this name > (TEST_ names: from the name hash,
// mode "test", no server call) > the server's {action:"assign"} (mode "server": forms handed out in turn, a returning name gets its
// form again) > FALLBACK when the call fails or the server is the old version (no form in the reply): from the name hash, mode
// "fallback". Never blocks the rater. A browser that started under the old pages keeps its old form (mode "v1").
const ASSIGN=PFX+"assign";
function isTest(name){return /^test_/i.test(String(name||"").trim())}
H.isTestName=isTest;
// synchronous: the form already known for this name (0 = not assigned yet)
H.form=function(nForms,name){const q=parseInt(QS.get("form")||"",10),nn=normName(name);
  if(q>=1&&q<=nForms){lsSet(ASSIGN,{form:q,name:nn,mode:"link"});return q}
  const a=lsGet(ASSIGN,null);
  if(a&&a.form>=1&&a.form<=nForms&&(a.mode==="link"||a.name===nn))return a.form;
  const st=lsGet(PFX+"form",null);   // stored by the first version of the pages
  if(st&&st.form>=1&&st.form<=nForms&&(st.link||st.name===nn)){lsSet(ASSIGN,{form:st.form,name:nn,mode:st.link?"link":"v1"});return st.form}
  if(nn&&isTest(name)){const f=formFor(name,nForms);lsSet(ASSIGN,{form:f,name:nn,mode:"test"});return f}
  return 0};
H.assignMode=function(name){const a=lsGet(ASSIGN,null);return a&&(a.mode==="link"||a.name===normName(name))?a.mode:""};
// asynchronous: ask the server once (8 s timeout), else fall back; resolves to the form number
H.assign=async function(nForms,name){const f0=H.form(nForms,name);if(f0)return f0;const nn=normName(name);if(!nn)return 0;
  let form=0,mode="fallback",returning=false;
  if(CFG.ENDPOINT_URL){const ctl=typeof AbortController!=="undefined"?new AbortController():null,tm=ctl?setTimeout(()=>ctl.abort(),8000):0;
    try{const r=await fetch(CFG.ENDPOINT_URL,{method:"POST",headers:{"Content-Type":"text/plain;charset=utf-8"},redirect:"follow",
          body:JSON.stringify({secret:CFG.ENDPOINT_SECRET||"",action:"assign",study:STUDY,rater:nn,forms:nForms}),signal:ctl?ctl.signal:undefined});
      const j=JSON.parse(await r.text());const k=parseInt(j&&j.form,10);
      if(j&&j.ok===true&&k>=1&&k<=nForms){form=k;mode="server";returning=!!j.returning}}
    catch(e){}finally{if(tm)clearTimeout(tm)}}
  if(!form)form=formFor(name,nForms);
  lsSet(ASSIGN,{form:form,name:nn,mode:mode,returning:returning,at:new Date().toISOString()});return form};
H.answers=p=>lsGet(PFX+p+"_answers",{})||{};
H.queue=p=>lsGet(PFX+p+"_queue",{})||{};
// store one answer and queue it; returns false if the browser refused to store it
H.store=function(p,a){const A=H.answers(p),Q=H.queue(p);A[a.trial]=a;Q[a.trial]=1;const ok=lsSet(PFX+p+"_answers",A);lsSet(PFX+p+"_queue",Q);return ok};
H.rowOf=(p,a)=>Object.assign({id:a.trial},a,{rid:rid,rcode:rcode,study:STUDY,page:p});
H.raterString=name=>[String(name||"").trim(),rid,rcode].filter(Boolean).join("|");
// true only when the endpoint's own reply says ok (an unreadable reply does not count, unless ENDPOINT_NO_CORS is set)
H.post=async function(rows,name){
  const body=JSON.stringify({secret:CFG.ENDPOINT_SECRET||"",study:STUDY,rater:H.raterString(name),rows:rows});
  const ctl=typeof AbortController!=="undefined"?new AbortController():null,tm=ctl?setTimeout(()=>ctl.abort(),20000):0;
  try{const r=await fetch(CFG.ENDPOINT_URL,{method:"POST",headers:{"Content-Type":"text/plain;charset=utf-8"},body:body,
      mode:CFG.ENDPOINT_NO_CORS?"no-cors":"cors",redirect:"follow",signal:ctl?ctl.signal:undefined});
    if(r.type==="opaque")return !!CFG.ENDPOINT_NO_CORS;
    if(!r.ok)return false;
    const j=JSON.parse(await r.text());return !!(j&&j.ok===true)}
  catch(e){return false}
  finally{if(tm)clearTimeout(tm)}};
const busy={},again={},failN={};
// a part counts as FAILING after two consecutive refused / unreachable sends (the first try and one retry) while answers wait
H.failed=p=>!CFG.ENDPOINT_URL||(failN[p]||0)>=2;
H.anyFailed=()=>PAGES.some(p=>Object.keys(H.queue(p)).length&&H.failed(p));
// send the queued answers of one part, 50 per request; an answer changed while in flight stays queued
H.flush=async function(p,name,onDone){
  if(!CFG.ENDPOINT_URL)return;
  if(busy[p]){again[p]=true;return}
  busy[p]=true;
  try{const A=H.answers(p),Q=H.queue(p);Object.keys(Q).forEach(k=>{if(!A[k])delete Q[k]});lsSet(PFX+p+"_queue",Q);
    const ids=Object.keys(Q);
    for(let i=0;i<ids.length;i+=50){const part=ids.slice(i,i+50),sent=part.map(k=>A[k]);
      if(!await H.post(sent.map(a=>H.rowOf(p,a)),name||H.name())){failN[p]=(failN[p]||0)+1;break}
      failN[p]=0;
      const A2=H.answers(p),Q2=H.queue(p);part.forEach((k,j)=>{if(A2[k]&&A2[k].at===sent[j].at)delete Q2[k]});lsSet(PFX+p+"_queue",Q2);
      if(onDone)onDone()}}
  finally{busy[p]=false;if(onDone)onDone();if(again[p]){again[p]=false;setTimeout(()=>H.flush(p,name,onDone),0)}}};
H.flushAll=(name,onDone)=>Promise.all(PAGES.map(p=>H.flush(p,name,onDone)));
// progress of one form: per part {n, answered, unsent}; done = every answer of every part acknowledged by the endpoint
// order = this rater's part order (H.orderFor); without a name the form's stored order
H.status=function(forms,form,name){const fo=forms&&forms.forms&&forms.forms[String(form)];const parts=(forms&&forms.parts)||PAGES;
  const od=fo?H.orderFor(forms,form,name==null?H.name():name):null;const out={parts:{},n:0,answered:0,unsent:0,order:od?od.parts:parts};
  parts.forEach(p=>{const e=fo&&fo[p];const ids=e?[...e.study,e.obvious,e.repeat].filter(Boolean):[],A=H.answers(p),Q=H.queue(p);
    const a=ids.filter(k=>A[k]).length,u=ids.filter(k=>A[k]&&Q[k]).length;
    out.parts[p]={n:ids.length,answered:a,unsent:u};out.n+=ids.length;out.answered+=a;out.unsent+=u});
  out.done=out.n>0&&out.answered===out.n&&out.unsent===0;return out};
H.nextPart=function(st,except){for(const p of st.order){if(p!==except&&st.parts[p].answered<st.parts[p].n)return p}return null};
// ---- per-rater order: part order and trial order from a PRNG seeded by "form|link code" (or "form|name" without a link code) ----
function mulberry(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}
function shuffle(arr,rnd){const a=arr.slice();for(let i=a.length-1;i>0;i--){const j=Math.floor(rnd()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a}
H.seedString=(form,name)=>form+"|"+(rcode?"r:"+rcode:"n:"+normName(name));
// returns {parts:[...], trials:{part:[ids in order]}}; obvious pair at position 3, repeat last with its original among the first four
H.orderFor=function(forms,form,name){const fo=forms.forms[String(form)];if(!fo)return null;const parts=forms.parts||PAGES;
  const rnd=mulberry(fnv(H.seedString(form,name)));const order=shuffle(parts,rnd);const trials={};
  parts.forEach(p=>{const e=fo[p];if(!e){trials[p]=[];return}let ids=shuffle(e.study,rnd);
    if(e.repeat){const k=ids.indexOf(e.repeat_of);if(k>3){const j=Math.floor(rnd()*Math.min(4,ids.length));[ids[k],ids[j]]=[ids[j],ids[k]]}}
    if(e.obvious)ids.splice(Math.min(2,ids.length),0,e.obvious);
    if(e.repeat)ids.push(e.repeat);trials[p]=ids});
  return {parts:order,trials:trials}};
// ---- preloading: whole files as blobs (object URLs), with progress; small LRU so memory stays bounded ----
const blobs=new Map(),inflight=new Map();const MAXBLOBS=12;
function touch(u){const v=blobs.get(u);blobs.delete(u);blobs.set(u,v)}
function evict(keep){while(blobs.size>MAXBLOBS){const k=[...blobs.keys()].find(x=>!keep.has(x));if(!k)break;URL.revokeObjectURL(blobs.get(k));blobs.delete(k)}}
function getOne(u,onBytes){if(blobs.has(u)){touch(u);return Promise.resolve(blobs.get(u))}
  if(inflight.has(u))return inflight.get(u);
  const pr=(async()=>{for(let attempt=0;attempt<3;attempt++){try{const r=await fetch(u);if(!r.ok)throw new Error("HTTP "+r.status);
        const total=+r.headers.get("Content-Length")||0;let got=0;const chunks=[];
        if(r.body&&r.body.getReader){const rd=r.body.getReader();for(;;){const {done,value}=await rd.read();if(done)break;chunks.push(value);got+=value.length;if(onBytes)onBytes(u,got,total)}}
        else{chunks.push(new Uint8Array(await r.arrayBuffer()))}
        const ou=URL.createObjectURL(new Blob(chunks,{type:u.endsWith(".mp4")?"video/mp4":(u.endsWith(".webp")?"image/webp":"application/octet-stream")}));
        blobs.set(u,ou);return ou}catch(e){if(attempt===2)throw e;await new Promise(r=>setTimeout(r,800*(attempt+1)))}}})();
  inflight.set(u,pr);pr.finally(()=>inflight.delete(u));return pr};
H.preload=async function(urls,onProgress){const st={};urls.forEach(u=>st[u]=[0,0]);
  const rep=()=>{if(!onProgress)return;let g=0,t=0;Object.values(st).forEach(([a,b])=>{g+=a;t+=b||a});onProgress(g,t)};
  const out=await Promise.all(urls.map(u=>getOne(u,(uu,g,t)=>{st[uu]=[g,t];rep()}).then(ou=>{if(!st[u][1]){st[u]=[1,1]}rep();return ou})));
  evict(new Set(urls));const m={};urls.forEach((u,i)=>m[u]=out[i]);return m};
H.prefetch=urls=>{urls.forEach(u=>getOne(u).catch(()=>{}))};
// warm the HTTP cache with the first unanswered trial of the rater's next part (called on a part's last trial), so the next part
// starts without a long first download
let warmed=false;
H.warmNextPart=async function(forms,form,name,curPart,root){if(warmed)return;warmed=true;const pre=root?"":"../";try{
  const st=H.status(forms,form,name),nx=H.nextPart(st,curPart);if(!nx)return;
  const od=H.orderFor(forms,form,name),A=H.answers(nx),id=od.trials[nx].find(t=>!A[t]);if(!id)return;
  const j=await (await fetch(pre+nx+"/trials.json")).json(),t=j.trials.find(x=>x.id===id);if(!t)return;
  const g=t.sweep||t.grid||t.clips;[g.fileA,g.fileB].concat(t.source&&t.source.file?[t.source.file]:[]).forEach(f=>{fetch(pre+nx+"/"+f).then(r=>r.blob()).catch(()=>{})})}
  catch(e){}};
// link to a part (p) or to the start page (p = ""), from the start page (root = true) or from a part
// the form travels in the URL only when it came from a link (?form=k); otherwise the next page reads the stored assignment
H.linkTo=function(p,form,root){const q=new URLSearchParams();if(form&&(parseInt(QS.get("form")||"",10)===form||H.assignMode(H.name())==="link"))q.set("form",form);
  if(QSTUDY&&/^test/.test(QSTUDY))q.set("study",QSTUDY);if(rcode)q.set("r",rcode);const qs=q.toString();
  return (root?(p?p+"/":"./"):(p?"../"+p+"/":"../"))+(qs?"?"+qs:"")};
window.addEventListener("online",()=>H.flushAll());
window.HS2=H;
})();
