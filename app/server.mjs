import http from 'node:http';
import {readFile,readdir,stat} from 'node:fs/promises';
import {dirname,resolve,join,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomBytes,timingSafeEqual} from 'node:crypto';
import {providerKnowledge,makeResponse} from './lib/knowledge.mjs';
import {aiAnswer} from './lib/ai.mjs';
import {fileStore} from './lib/storage.mjs';
import {mailReady,mailTransport,validateEnquiry,enquiryMail,sanitizeTranscript} from './lib/mail.mjs';
import {extractDocument,chunkDocument} from './lib/documents.mjs';

const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const TYPES={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.png':'image/png','.svg':'image/svg+xml','.ico':'image/x-icon'};
export async function createApplication({env=process.env,fetchImpl=fetch,transport=null,dataDir}={}) {
  const seedFiles=await readdir(join(ROOT,'data/tenants')),profiles=new Map();
  for(const file of seedFiles.filter(f=>f.endsWith('.json'))){const p=JSON.parse(await readFile(join(ROOT,'data/tenants',file),'utf8'));if(/^[a-z0-9-]{1,50}$/.test(p.id))profiles.set(p.id,p);}
  const shared=JSON.parse(await readFile(join(ROOT,'data/ndis.json'),'utf8'));
  const store=fileStore(dataDir||resolve(ROOT,env.DATA_DIR||'runtime-data'));
  const sessions=new Map(),rates=new Map();let inFlightAI=0;
  const siteOrigin=env.SITE_URL?new URL(env.SITE_URL).origin:null;
  const getProfile=(id)=>{const p=profiles.get(id||env.DEFAULT_TENANT||'care-beyond');if(!p)throw Object.assign(new Error('Unknown provider.'),{status:404});return p;};
  const allOrigins=()=>new Set([siteOrigin,...[...profiles.values()].flatMap(p=>p.allowedOrigins||[]),...(env.ALLOWED_ORIGINS||'').split(',')].filter(Boolean));
  function limit(key,max,period=60000){const now=Date.now();if(rates.size>5000)for(const [k,v] of rates)if(v.until<now)rates.delete(k);const r=rates.get(key);if(!r||r.until<now){rates.set(key,{count:1,until:now+period});return true;}return ++r.count<=max;}
  const ip=(req)=>env.TRUST_PROXY==='true'?String(req.headers['x-forwarded-for']||req.socket.remoteAddress).split(',')[0].trim():req.socket.remoteAddress;
  async function body(req,max=25000){if(!String(req.headers['content-type']||'').startsWith('application/json'))throw Object.assign(new Error('Use application/json.'),{status:415});let bytes=0,chunks=[];for await(const chunk of req){bytes+=chunk.length;if(bytes>max)throw Object.assign(new Error('Request too large.'),{status:413});chunks.push(chunk);}try{return JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw Object.assign(new Error('Invalid JSON.'),{status:400});}}
  function json(res,status,data){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(data));}
  function authenticated(req){const match=String(req.headers.cookie||'').match(/(?:^|;\s*)cbe_admin=([a-f0-9]{64})(?:;|$)/),session=match&&sessions.get(match[1]);if(session&&session.until>Date.now())return true;if(match)sessions.delete(match[1]);return false;}
  function securePassword(value){if(!env.ADMIN_PASSWORD||env.ADMIN_PASSWORD.length<16)return false;const a=Buffer.from(String(value||'')),b=Buffer.from(env.ADMIN_PASSWORD);return a.length===b.length&&timingSafeEqual(a,b);}
  async function documents(p){return store.get(`docs-${p.id}`,[]);}
  async function approved(p){const docs=await documents(p);const today=Date.now();return [...shared,...providerKnowledge(p),...docs.flatMap(d=>d.chunks)].filter(d=>!d.reviewedAt||today-new Date(d.reviewedAt).getTime()<120*86400000||d.scope==='provider');}
  async function reserveBudget(){return store.update('usage',{day:'',month:'',daily:0,monthly:0},v=>{const d=new Date().toISOString().slice(0,10),m=d.slice(0,7);if(v.day!==d){v.day=d;v.daily=0;}if(v.month!==m){v.month=m;v.monthly=0;}if(v.daily>=Number(env.AI_DAILY_LIMIT||300)||v.monthly>=Number(env.AI_MONTHLY_LIMIT||3000))return false;v.daily++;v.monthly++;return true;});}
  async function refreshWebsite(p){
    const pages=[{url:p.website+'/',title:`${p.name} website`},{url:p.servicesSource,title:'Website services'},{url:p.contactSource,title:'Website contact'}];const results=[];
    for(const page of pages){
      let url=new URL(page.url);const approvedHosts=new Set([new URL(p.website).hostname]);let response;
      for(let count=0;count<4;count++){if(url.protocol!=='https:'||!approvedHosts.has(url.hostname))throw new Error('Only the configured HTTPS provider website can be imported.');response=await fetchImpl(url,{redirect:'manual',signal:AbortSignal.timeout(15000),headers:{'User-Agent':'CareBeyondKnowledgeImporter/1.0'}});if([301,302,303,307,308].includes(response.status)){url=new URL(response.headers.get('location'),url);continue;}break;}
      if(!response?.ok||!response.headers.get('content-type')?.includes('text/html'))throw new Error('Website could not be read.');
      let bytes=0;const chunks=[];for await(const c of response.body){bytes+=c.length;if(bytes>2000000)throw new Error('Website page too large.');chunks.push(c);}const html=Buffer.concat(chunks).toString('utf8');
      const {htmlToText}=await import('./lib/html.mjs');let text=htmlToText(html);
      // Canonical business fields are supplied separately; never import conflicting legacy footer details.
      text=text.split('\n').filter(line=>!/(registered|registration|\b\S+@\S+\b|\b(?:\d[\s()-]*){8,}\b)/i.test(line)).join('\n').slice(0,80000);
      if(text.length<30)throw new Error('No readable website text found.');results.push({title:page.title,text,url:url.href});
    }return results;
  }
  const handler=async(req,res)=>{
    const origin=req.headers.origin;
    res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','strict-origin-when-cross-origin');res.setHeader('Permissions-Policy','camera=(), microphone=(), geolocation=()');
    const ancestors=["'self'",...allOrigins()].join(' ');
    res.setHeader('Content-Security-Policy',`default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; font-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors ${ancestors}`);
    if(origin&&allOrigins().has(origin)){res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Vary','Origin');res.setHeader('Access-Control-Allow-Headers','Content-Type');res.setHeader('Access-Control-Allow-Methods','GET, POST, DELETE, OPTIONS');}
    try{
      const url=new URL(req.url,'http://localhost');
      if(url.pathname.startsWith('/api/')&&origin&&!allOrigins().has(origin)&&!(env.NODE_ENV!=='production'&&/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)))return json(res,403,{error:'This origin is not allowed.'});
      if(req.method==='OPTIONS'){res.writeHead(204);return res.end();}
      if(url.pathname.startsWith('/api/')&&!limit(`api-${ip(req)}`,60))return json(res,429,{error:'Please wait a moment before trying again.'});
      if(url.pathname==='/api/health'&&req.method==='GET')return json(res,200,{ok:true});
      if(url.pathname==='/api/config'&&req.method==='GET'){
        const p=getProfile(url.searchParams.get('tenant'));return json(res,200,{profile:p,preview:false,aiEnabled:!!env.OPENAI_API_KEY,emailEnabled:mailReady(env),knowledgeCount:(await approved(p)).length});
      }
      if(url.pathname==='/api/chat'&&req.method==='POST'){
        const b=await body(req),p=getProfile(b.tenant);
        if(origin&&origin!==siteOrigin&&!p.allowedOrigins?.includes(origin)&&env.NODE_ENV==='production')return json(res,403,{error:'Provider origin mismatch.'});
        if(typeof b.message!=='string'||b.message.trim().length<1||b.message.length>1200)return json(res,400,{error:'Please enter a question of 1–1200 characters.'});
        if(!limit(`chat-${ip(req)}`,25))return json(res,429,{error:'Please wait a minute before asking another question.'});
        const history=sanitizeTranscript(b.history),baseline=makeResponse(b.message.trim(),await approved(p),history);
        let result=baseline;
        if(env.OPENAI_API_KEY&&!baseline.direct&&inFlightAI<4&&await reserveBudget()){
          inFlightAI++;try{result=await aiAnswer({query:b.message.trim(),history,context:baseline.context,profile:p,apiKey:env.OPENAI_API_KEY,model:env.OPENAI_MODEL||'gpt-4.1-mini',fetchImpl});}catch{result={...baseline,mode:'knowledge',notice:'Using approved information because the AI service is currently unavailable.'};}finally{inFlightAI--;}
        }
        delete result.context;delete result.direct;return json(res,200,result);
      }
      if(url.pathname==='/api/handoff'&&req.method==='POST'){
        if(!limit(`handoff-${ip(req)}`,3,300000))return json(res,429,{error:'Please wait before sending another enquiry, or email the team directly.'});
        const b=await body(req,50000),p=getProfile(b.tenant);
        if(origin&&origin!==siteOrigin&&!p.allowedOrigins?.includes(origin)&&env.NODE_ENV==='production')return json(res,403,{error:'Provider origin mismatch.'});
        let enquiry;try{enquiry=validateEnquiry(b);}catch(e){return json(res,400,{error:e.message});}
        if(!mailReady(env))return json(res,503,{error:'Email sending is not connected yet. Please open your email app to contact the team.',fallbackEmail:p.email});
        const mail=enquiryMail(p,enquiry,env);
        try{const info=await(transport||mailTransport(env)).sendMail(mail.message);if(!info.accepted?.some(a=>String(a).toLowerCase()===p.email.toLowerCase()))throw new Error('Recipient was not accepted');return json(res,200,{sent:true,reference:mail.reference,message:'Your enquiry was accepted by our email server. The team will reply by email.'});}catch{return json(res,502,{sent:false,error:'The email server could not confirm sending. Please email the team directly. Do not assume your enquiry was delivered.',fallbackEmail:p.email});}
      }
      if(url.pathname==='/api/admin/login'&&req.method==='POST'){
        if(origin&&origin!==siteOrigin&&env.NODE_ENV==='production')return json(res,403,{error:'Use the chatbot dashboard address to sign in.'});
        if(!limit(`login-${ip(req)}`,5,300000))return json(res,429,{error:'Please wait five minutes before trying again.'});
        const b=await body(req);if(!env.ADMIN_PASSWORD||env.ADMIN_PASSWORD.length<16)return json(res,503,{error:'Set ADMIN_PASSWORD to at least 16 characters in Hostinger first.'});
        if(!securePassword(b.password))return json(res,401,{error:'Incorrect password.'});
        const token=randomBytes(32).toString('hex');sessions.set(token,{until:Date.now()+8*3600000});
        res.setHeader('Set-Cookie',`cbe_admin=${token}; HttpOnly; SameSite=Strict; Path=/api/admin; Max-Age=28800${env.NODE_ENV==='production'?'; Secure':''}`);return json(res,200,{ok:true});
      }
      if(url.pathname.startsWith('/api/admin/')){
        if(origin&&origin!==siteOrigin&&env.NODE_ENV==='production')return json(res,403,{error:'Dashboard origin mismatch.'});
        if(!authenticated(req))return json(res,401,{error:'Sign in to manage the knowledge base.'});
        const p=getProfile(url.searchParams.get('tenant'));
        if(url.pathname==='/api/admin/logout'&&req.method==='POST'){const m=String(req.headers.cookie||'').match(/cbe_admin=([a-f0-9]{64})/);if(m)sessions.delete(m[1]);res.setHeader('Set-Cookie','cbe_admin=; HttpOnly; SameSite=Strict; Path=/api/admin; Max-Age=0');return json(res,200,{ok:true});}
        if(url.pathname==='/api/admin/status'&&req.method==='GET')return json(res,200,{tenants:[...profiles.values()].map(p=>({id:p.id,name:p.name})),profile:p,documents:(await documents(p)).map(({chunks,...d})=>({...d,chunkCount:chunks.length})),shared:shared.map(({text,keywords,...d})=>d),aiEnabled:!!env.OPENAI_API_KEY,emailEnabled:mailReady(env),usage:await store.get('usage',{daily:0,monthly:0}),reviewIntervalDays:120});
        if(url.pathname==='/api/admin/documents'&&req.method==='POST'){
          const b=await body(req,7500000);
          if(b.publishConsent!==true)return json(res,400,{error:'Confirm the document is approved for public chatbot answers.'});
          if(typeof b.fileName!=='string'||b.fileName.length>160||typeof b.base64!=='string'||b.base64.length>7000000)return json(res,400,{error:'Choose a document smaller than 5 MB.'});
          const buffer=Buffer.from(b.base64,'base64');if(buffer.length>5000000)return json(res,413,{error:'Maximum file size is 5 MB.'});
          try{const text=await extractDocument(b.fileName,buffer),d=chunkDocument({title:b.fileName,text});await store.update(`docs-${p.id}`,[],list=>{if(list.length>=50)throw new Error('Remove an old document before adding another.');if(list.some(x=>x.id===d.id))throw new Error('This document is already in the knowledge base.');list.push(d);});return json(res,201,{id:d.id,title:d.title,chunkCount:d.chunks.length});}catch(e){return json(res,400,{error:e.message});}
        }
        if(url.pathname==='/api/admin/documents'&&req.method==='DELETE'){
          const b=await body(req);await store.update(`docs-${p.id}`,[],list=>{const i=list.findIndex(d=>d.id===b.id);if(i<0)throw Object.assign(new Error('Document not found.'),{status:404});list.splice(i,1);});return json(res,200,{deleted:true});
        }
        if(url.pathname==='/api/admin/sync'&&req.method==='POST'){
          const b=await body(req);if(b.publishConsent!==true)return json(res,400,{error:'Confirm the website information is approved for public answers.'});
          try{const pages=await refreshWebsite(p),docs=pages.map(v=>({...chunkDocument({...v,scope:'website'}),importedWebsite:true}));await store.update(`docs-${p.id}`,[],list=>{for(let i=list.length-1;i>=0;i--)if(list[i].importedWebsite)list.splice(i,1);list.push(...docs);});return json(res,200,{imported:docs.length});}catch{return json(res,502,{error:'Website import could not complete. Existing knowledge was kept. Try again or upload a document.'});}
        }
      }
      if(url.pathname.startsWith('/api/'))return json(res,404,{error:'Endpoint not found.'});
      if(!['GET','HEAD'].includes(req.method))return json(res,405,{error:'Method not allowed.'});
      let pathname;try{pathname=decodeURIComponent(url.pathname);}catch{return json(res,400,{error:'Invalid path.'});}
      const rel=pathname==='/admin'?'admin.html':pathname==='/widget'?'widget.html':pathname==='/'?'index.html':pathname.replace(/^\//,'');
      const publicRoot=join(ROOT,'dist'),file=resolve(publicRoot,rel);
      if(!file.startsWith(publicRoot+'/')||!TYPES[extname(file)]||rel.split('/').some(p=>p.startsWith('.')))return json(res,404,{error:'Not found.'});
      let contents;try{await stat(file);contents=await readFile(file);}catch{return json(res,404,{error:'Not found.'});}
      res.writeHead(200,{'Content-Type':TYPES[extname(file)],'Cache-Control':'no-cache'});return res.end(req.method==='HEAD'?undefined:contents);
    }catch(e){return json(res,e.status||500,{error:e.status?e.message:'Unable to complete that request. Please try again or contact the team.'});}
  };
  return http.createServer(handler);
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const server=await createApplication();server.requestTimeout=30000;server.headersTimeout=10000;server.listen(Number(process.env.PORT||3000),'0.0.0.0',()=>console.log('Care Beyond assistant is listening.'));
  for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>server.close(()=>process.exit(0)));
}
