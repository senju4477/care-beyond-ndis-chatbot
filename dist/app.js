import {makeResponse,providerKnowledge} from './knowledge.js';
const $=id=>document.getElementById(id);
const params=new URLSearchParams(location.search),tenant=params.get('tenant')||'care-beyond';
let config,docs=[],history=[],busy=false;
function node(tag,className,text){const e=document.createElement(tag);if(className)e.className=className;if(text!==undefined)e.textContent=text;return e;}
function toast(text){document.querySelector('.toast')?.remove();const e=node('div','toast',text);e.setAttribute('role','status');document.body.append(e);setTimeout(()=>e.remove(),4500);}
function setView(view){if(!document.querySelector('.view'))return;document.querySelectorAll('.view').forEach(el=>{el.hidden=el.id!==`view-${view}`;});document.querySelectorAll('.nav-button').forEach(el=>{const active=el.dataset.view===view;el.classList.toggle('active',active);if(active)el.setAttribute('aria-current','page');else el.removeAttribute('aria-current');});if(view==='chat')$('question')?.focus();}
function initWelcome(){
  $('chatLog').replaceChildren();history=[];
  const e=node('div','welcome');
  e.append(node('div','welcome-decoration','✧'));
  const h=node('h3');h.append(document.createTextNode('Hello. Let’s find your '),node('em',null,'next step.'));e.append(h);
  e.append(node('p',null,'I can help you explore our supports, understand general NDIS information, or get in touch with our team. Where would you like to start?'));
  const suggestions=node('div','suggestions');
  for(const [label,q] of [['What supports do you offer?','What support services do you provide?'],['Do you service my area?','What areas do you service?'],['How does NDIS funding work?','What are the different NDIS plan management options?'],['How can I get in touch?','What are your contact details and business hours?']]){
    const b=node('button','suggestion',label);b.type='button';b.append(node('span',null,'↗'));b.addEventListener('click',()=>ask(q));suggestions.append(b);
  }
  e.append(suggestions,node('p','welcome-caption','↗  Answers include sources where available.'));
  $('chatLog').append(e);
}
function addMessage(role,text,result){
  const wrapper=node('div',`message ${role}`),content=node('div','message-content');
  if(role==='assistant'){wrapper.append(node('div','message-avatar','✧'));content.append(node('p','message-name','Care Beyond guide'));}
  const textElement=node('div','message-body',text);content.append(textElement);
  if(result?.sources?.length){
    const sources=node('div','answer-sources');
    for(const source of result.sources){
      let e;if(source.url&&/^https:\/\//.test(source.url)){e=node('a',`answer-source ${source.scope==='ndis'?'ndis':''}`);e.href=source.url;e.target='_blank';e.rel='noopener noreferrer';e.title=`${source.scope==='ndis'?'Official NDIS guidance':'Approved business information'}${source.reviewedAt?' · Reviewed '+source.reviewedAt:''}`;}else e=node('span','answer-source');
      e.textContent=`${source.scope==='ndis'?'◇':'↗'} ${source.title}`;sources.append(e);
    }content.append(sources);
  }
  if(result){const actions=node('div','answer-actions');const copy=node('button','text-button muted','Copy answer');copy.type='button';copy.addEventListener('click',async()=>{try{await navigator.clipboard.writeText(text);toast('Answer copied.');}catch{toast('Copy is unavailable. You can select and copy the answer.');}});actions.append(copy);
    if(result.handoff){const team=node('button','text-button','Speak to our team ↗');team.type='button';team.addEventListener('click',openHandoff);actions.append(team);}content.append(actions);
    if(config.preview||result.notice)content.append(node('p','answer-mode',result.notice||'Answer from approved information'));
  }
  wrapper.append(content);$('chatLog').append(wrapper);$('chatLog').scrollTop=$('chatLog').scrollHeight;
}
async function ask(question){
  const q=question.trim();if(!q||busy)return;
  if(q.length>1200){toast('Please keep your question under 1,200 characters.');return;}
  setView('chat');busy=true;$('question').value='';$('question').style.height='auto';const send=$('chatForm').querySelector('button');send.disabled=true;if($('resetChat'))$('resetChat').disabled=true;
  addMessage('user',q);const typing=node('div','typing','Finding the relevant information…');typing.setAttribute('role','status');$('chatLog').append(typing);$('chatLog').setAttribute('aria-busy','true');
  let result;
  try{
    if(config.preview){result=makeResponse(q,docs,history);delete result.context;}
    else {const response=await fetch('api/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({tenant,message:q,history:history.slice(-8)}),signal:AbortSignal.timeout(30000)});const data=await response.json();if(!response.ok)throw new Error(data.error||'Unable to find an answer right now.');result=data;}
    history.push({role:'user',content:q},{role:'assistant',content:result.answer});history=history.slice(-40);
  }catch(error){result={answer:error.name==='TimeoutError'?'The response took too long. Please try again or speak to our team.':error.message,sources:[],handoff:true};}
  typing.remove();$('chatLog').setAttribute('aria-busy','false');addMessage('assistant',result.answer,result);busy=false;send.disabled=false;if($('resetChat'))$('resetChat').disabled=false;$('question').focus();
}
function openHandoff(){
  $('handoffStatus').textContent='';
  $('handoffMode').textContent=config.emailEnabled?'Your enquiry will be emailed to '+config.profile.email+'. The team will reply by email.':'This version opens an email draft addressed to '+config.profile.email+'. You’ll send it from your email app.';
  $('handoffSubmit').replaceChildren(document.createTextNode(config.emailEnabled?'Email the team':'Open email app'),node('span',null,'↗'));
  if(!$('visitorMessage').value){const last=history.filter(m=>m.role==='user').at(-1);if(last)$('visitorMessage').value=last.content;}
  $('handoffDialog').showModal();
}
function emailDraft(data){
  let text=`Hello ${config.profile.name},\n\n${data.message}\n\nName: ${data.name}\nEmail: ${data.email}\nPhone: ${data.phone||'Not provided'}\nSuburb: ${data.suburb||'Not provided'}`;
  if(data.includeTranscript&&history.length)text+='\n\nConversation shared with my enquiry:\n'+history.slice(-8).map(m=>`${m.role==='user'?'Me':'Assistant'}: ${m.content}`).join('\n\n');
  if(text.length>6500)text=text.slice(0,6450)+'\n[Conversation shortened for the email draft]';
  return `mailto:${config.profile.email}?subject=${encodeURIComponent('Website support enquiry')}&body=${encodeURIComponent(text)}`;
}
function renderDetails(){
  const p=config.profile;
  if($('reviewBanner'))$('reviewBanner').hidden=!config.preview;
  if($('contactEmail')){$('contactEmail').textContent=p.email;$('contactEmail').href=`mailto:${p.email}`;}
  if($('contactAddress'))$('contactAddress').textContent=p.address;
  if($('contactHours'))$('contactHours').textContent=`Mon–Fri ${p.hours.weekdays}\nSaturday ${p.hours.saturday}`;
  if($('emailFallback')){$('emailFallback').href=`mailto:${p.email}`;$('emailFallback').textContent=`Or email ${p.email} directly`;}
  if($('view-sources')){
    const privacy=node('p','privacy-note',config.aiEnabled?'Your conversation stays in this tab. For AI answers, your question, recent messages and relevant source excerpts are sent to our AI service. This app does not retain routine chat logs. An email enquiry shares only the details you submit, and the conversation only if you choose to include it. Please avoid sensitive records.':'Your conversation stays in this tab and this app does not retain routine chat logs. An email enquiry shares only the details you submit, and the conversation only if you choose to include it. Please avoid sensitive records.');
    $('view-sources').querySelector('.information-panel').append(privacy);
  }
  if($('servicesGrid'))for(const s of p.services){const e=node('article','service-card');e.append(node('h3',null,s.name),node('p',null,s.description));const b=node('button','text-button','Ask about this support ↗');b.type='button';b.addEventListener('click',()=>ask(`Tell me about your ${s.name} service.`));e.append(b);$('servicesGrid').append(e);}
  if($('sourceList')){
    const items=[{title:'Care Beyond · Services',url:p.servicesSource,reviewedAt:p.verifiedAt},{title:'Care Beyond · Contact & business hours',url:p.contactSource,reviewedAt:p.verifiedAt},...docs.filter(d=>d.scope==='ndis')];const seen=new Set();
    for(const s of items){if(seen.has(s.url))continue;seen.add(s.url);const a=node('a');a.href=s.url;a.target='_blank';a.rel='noopener noreferrer';const label=node('span',null,s.title);label.append(node('small',null,`Reviewed ${s.reviewedAt}`));a.append(label,node('span',null,'↗'));$('sourceList').append(a);}
  }
}
async function init(){
  const seedResponse=await fetch('public-data.json'),seed=await seedResponse.json();
  try{const r=await fetch(`api/config?tenant=${encodeURIComponent(tenant)}`,{signal:AbortSignal.timeout(8000)});if(r.status===404||r.headers.get('content-type')?.includes('text/html'))config=seed;else {const c=await r.json();if(!r.ok)throw new Error(c.error);config=c;}}
  catch{config=seed;toast('Using the review knowledge base.');}
  docs=[...seed.documents.filter(d=>d.scope==='ndis'),...providerKnowledge(config.profile)];
  renderDetails();initWelcome();
  document.querySelectorAll('[data-view]').forEach(e=>e.addEventListener('click',()=>setView(e.dataset.view)));
  document.querySelectorAll('[data-question]').forEach(e=>e.addEventListener('click',()=>ask(e.dataset.question)));
  document.querySelectorAll('[data-handoff]').forEach(e=>e.addEventListener('click',openHandoff));
  $('chatForm').addEventListener('submit',e=>{e.preventDefault();ask($('question').value);});
  $('question').addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();ask($('question').value);}});
  $('question').addEventListener('input',()=>{$('question').style.height='auto';$('question').style.height=Math.min($('question').scrollHeight,130)+'px';});
  $('resetChat')?.addEventListener('click',()=>{initWelcome();$('question').focus();toast('A new conversation is ready.');});
  $('exportChat')?.addEventListener('click',()=>{if(!history.length){toast('Start a conversation first.');return;}const text=`${config.profile.name} — conversation\n${new Date().toLocaleString('en-AU')}\n\n`+history.map(m=>`${m.role==='user'?'You':'Assistant'}: ${m.content}`).join('\n\n');const blob=new Blob([text],{type:'text/plain;charset=utf-8'}),url=URL.createObjectURL(blob),a=node('a');a.href=url;a.download='Care-Beyond-Conversation.txt';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
  $('closeHandoff').addEventListener('click',()=>$('handoffDialog').close());
  $('handoffDialog').addEventListener('click',e=>{if(e.target===$('handoffDialog')){const r=$('handoffDialog').getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)$('handoffDialog').close();}});
  $('handoffForm').addEventListener('submit',async e=>{
    e.preventDefault();const form=new FormData(e.target),data=Object.fromEntries(form);data.tenant=tenant;data.consent=form.has('consent');data.includeTranscript=form.has('includeTranscript');data.transcript=data.includeTranscript?history:[];
    const draft=emailDraft(data);$('emailFallback').href=draft;
    if(!config.emailEnabled){const a=node('a');a.href=draft;a.target='_blank';a.rel='noopener';a.click();$('handoffStatus').textContent='Your email draft is ready to open. Review and send it from your email app. If nothing opens, use the email link below. No email has been sent by this page.';return;}
    $('handoffSubmit').disabled=true;$('handoffStatus').textContent='Sending your enquiry…';
    try{const r=await fetch('api/handoff',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data),signal:AbortSignal.timeout(30000)});const result=await r.json();if(!r.ok||!result.sent)throw new Error(result.error||'Sending could not be confirmed.');$('handoffStatus').textContent=`Your enquiry was accepted by the email server. Reference: ${result.reference}. The team will reply by email.`;e.target.reset();$('emailFallback').href=`mailto:${config.profile.email}`;}
    catch(error){$('handoffStatus').textContent=error.name==='TimeoutError'?'Sending timed out. Delivery could not be confirmed. Please use the email link below.':error.message;}
    finally{$('handoffSubmit').disabled=false;}
  });
  $('closeWidget')?.addEventListener('click',()=>{if(window.parent===window){location.href='./';return;}const origin=params.get('parentOrigin');if(origin&&/^https?:\/\//.test(origin))window.parent.postMessage({type:'care-beyond-close'},origin);});
  if($('closeWidget'))window.addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('handoffDialog').open)$('closeWidget').click();});
}
init().catch(()=>{if($('chatLog'))$('chatLog').append(node('p','form-status','The guide could not load. Please email info@carebeyondexp.com.au or call 0459 157 002.'));});
