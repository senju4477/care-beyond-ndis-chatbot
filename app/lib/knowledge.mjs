const STOP = new Set('a an the is are was were do does did can could would should i me my you your we us our they it its to of for from in on with and or be been that this what which how about please tell want need know have has help'.split(' '));
export function tokens(text='') {
  return String(text).toLowerCase().replace(/[^a-z0-9]+/g,' ').trim().split(/\s+/).filter(t=>t.length>1&&!STOP.has(t)).map(t=>t.length>5&&t.endsWith('s')?t.slice(0,-1):t);
}
export function providerKnowledge(p) {
  const base={scope:'provider',reviewedAt:p.verifiedAt};
  return [
    {...base,id:'provider-contact',title:'Contact Care Beyond Expectations',url:p.contactSource,keywords:['contact','email','phone','call','number','get in touch'],text:`You can email ${p.name} at ${p.email} or call ${p.phone}. The business address is ${p.address}. Office hours: Monday–Friday ${p.hours.weekdays}; Saturday ${p.hours.saturday}. Sunday and public holiday hours should be confirmed with the team.`},
    {...base,id:'provider-address',title:'Business address',url:p.contactSource,keywords:['address','office','where are you','location','flemington','north melbourne','visit'],text:`The business address is ${p.address}. Please contact the team before visiting to arrange a suitable time.`},
    {...base,id:'provider-hours',title:'Business hours',url:p.contactSource,keywords:['hour','hours','open','opening','close','closed','weekend','saturday','sunday','business hours','public holiday'],text:`Office hours are Monday–Friday ${p.hours.weekdays} and Saturday ${p.hours.saturday} (${p.timezone}). Sunday and public holiday hours are not confirmed. Support visit times and worker availability are arranged with the team; office hours do not confirm support availability.`},
    {...base,id:'provider-area',title:'Areas we service',url:p.website,keywords:['area','suburb','service area','cover','coverage','where','melbourne','werribee','melton','sunshine','geelong','north','west','east','south'],text:`${p.name} lists its service area as ${p.serviceArea}. The team can confirm availability for your particular suburb and the support you need. You can share your suburb in an enquiry; an exact home address is not needed here.`},
    {...base,id:'provider-services',title:'Our support services',url:p.servicesSource,keywords:['service','services','support','provide','offer','all services','what do you do'],text:`The website lists these supports: ${p.services.map(s=>s.name).join('; ')}. The team will confirm the support options, current availability and arrangements that fit your needs.`},
    {...base,id:'provider-start',title:'Getting started with Care Beyond',url:p.contactSource,keywords:['get started','start support','enquire','referral','book','appointment','availability','new participant','join care','speak','person','human','staff','team','talk','handoff'],text:`You can speak with ${p.name} about your goals, suburb and the kind of support you are looking for. Email ${p.email} or use “Speak to our team” to send an enquiry. The team will explain the next steps and confirm availability; this assistant does not book appointments.`},
    {...base,id:'provider-registration',title:'Provider registration',url:null,keywords:['registered','registration','unregistered','ndis registered','agency managed accepted','provider number'],text:p.registrationStatus==='verified'?`Registration for ${p.name} has been verified in the business profile. Contact the team for registration details and which supports it covers.`:`Registration for ${p.name} has not yet been confirmed for this assistant. Please ask the team directly. I cannot confirm acceptance of agency-managed plans or any registration number.`},
    {...base,id:'provider-pricing',title:'Prices and funding suitability',url:null,keywords:['price','cost','rate','charge','fee','budget','funded','covered','pay','plan accepted','funding cover','can i claim','eligible support'],text:`I do not have a verified price list or enough information to confirm whether a specific support can be paid from your plan. Ask the team for a quote and check funding suitability with your plan manager or the NDIA. I cannot guarantee plan coverage or approval.`},
    ...p.services.map((s,i)=>({...base,id:`provider-service-${i}`,title:s.name,url:p.servicesSource,keywords:[s.name,...s.name.toLowerCase().split(/\W+/)],text:`${p.name} lists ${s.name}. ${s.description} The team can confirm what is available in your area and discuss the next steps.`}))
  ];
}
export function retrieve(query,docs,limit=3) {
  const q=tokens(query),raw=String(query).toLowerCase();
  if(!q.length)return [];
  const df=new Map();
  for(const d of docs) for(const t of new Set(tokens(`${d.title} ${d.text} ${(d.keywords||[]).join(' ')}`)))df.set(t,(df.get(t)||0)+1);
  return docs.map(d=>{
    const ts=tokens(`${d.title} ${d.text} ${(d.keywords||[]).join(' ')}`),freq=new Map();ts.forEach(t=>freq.set(t,(freq.get(t)||0)+1));
    let score=0,matches=0;
    for(const t of new Set(q)){const n=freq.get(t)||0;if(n){matches++;score+=Math.log(1+(docs.length-(df.get(t)||0)+.5)/((df.get(t)||0)+.5))*n*2.2/(n+1.2*(.25+.75*ts.length/100));}}
    const title=new Set(tokens(d.title));score+=q.filter(t=>title.has(t)).length*1.4;
    for(const phrase of d.keywords||[])if(phrase.length>5&&raw.includes(phrase.toLowerCase()))score+=3;
    return {...d,score,coverage:matches/new Set(q).size};
  }).filter(d=>d.score>=2.2&&(d.coverage>=.28||d.score>=7)).sort((a,b)=>b.score-a.score).slice(0,limit);
}
export function directIntent(message) {
  const q=message.toLowerCase();
  if(/\b(in immediate danger|emergency|suicide|suicidal|kill myself|overdose|can't breathe|cannot breathe)\b/.test(q))return 'emergency';
  if(/\b(register(?:ed|ation)?|unregistered|provider number)\b/.test(q)&&!/(find|search|list|what is).{0,25}registered/.test(q))return 'provider-registration';
  if(/\b(contact|email|phone)\b/.test(q)&&/\b(hours|address)\b/.test(q)&&!q.includes('ndis contact'))return 'provider-contact';
  if(/\b(will|can|does|is|am i)\b/.test(q)&&/\b(ndis|plan|funding)\b/.test(q)&&/\b(pay for|cover|fund |claim|approve|approved|eligible for this support)\b/.test(q))return 'provider-pricing';
  if(/\b(office|business|opening|work) hours\b|\b(what time|when).{0,20}(open|close)\b|\b(open|hours).{0,20}(saturday|sunday|weekend)\b/.test(q))return 'provider-hours';
  if(/\b(address|flemington|where is your office|where are you located)\b/.test(q))return 'provider-address';
  if(/\b(email|phone|telephone|contact number|contact details)\b/.test(q)&&!q.includes('ndis contact'))return 'provider-contact';
  if(/\b(human|person|staff|team|call back|callback|referral)\b/.test(q)&&!q.includes('ndis partner'))return 'provider-start';
  if(/\b(your|you|care beyond|cbe)\b/.test(q)&&/\b(cost|price|charge|rate|fee)\b/.test(q))return 'provider-pricing';
  if(/\b(service|cover|support|available|availability)\b/.test(q)&&/\b(area|suburb|melbourne|werribee|melton|geelong|sunshine)\b/.test(q))return 'provider-area';
  if(/\b(what|which|all|list)\b/.test(q)&&/\b(services|supports)\b/.test(q)&&!/ndis (fund|cover)/.test(q))return 'provider-services';
  return null;
}
export function makeResponse(query,docs,history=[]) {
  const direct=directIntent(query);
  if(direct==='emergency')return {answer:'If someone is in immediate danger, call 000 now. This assistant and email enquiries are not monitored emergency services. For an urgent concern about NDIS support safety, use the NDIS Commission complaints guidance.',sources:[{title:'NDIS Commission complaints',url:'https://www.ndiscommission.gov.au/complaints',scope:'ndis'}],handoff:true,mode:'knowledge',direct:true};
  if(/^(hi|hello|hey|good (morning|afternoon|evening))[!. ]*$/i.test(query.trim()))return {answer:'Hello! I can help with Care Beyond Expectations services, contact details and general NDIS information. What would you like to know?',sources:[],handoff:false,mode:'knowledge',direct:true};
  if(/^(thanks|thank you|cheers)[!. ]*$/i.test(query.trim()))return {answer:'You’re welcome. If you’d like help with the next step, you can speak to our team.',sources:[],handoff:false,mode:'knowledge',direct:true};
  let lookup=query;
  if(tokens(query).length<3&&/^(and |what about |how about |that|it|those)/i.test(query)){const previous=history.filter(m=>m.role==='user').at(-1)?.content;if(previous)lookup=`${previous} ${query}`;}
  const found=direct?docs.filter(d=>d.id===direct):retrieve(lookup,docs);
  if(!found.length)return {answer:'I don’t have a reliable answer to that in the approved information yet. I can help with our services, service area, contact details and general NDIS questions. For your specific enquiry, please speak to our team.',sources:[],handoff:true,mode:'knowledge',direct:true};
  const top=found[0], selected=direct?[top]:found.filter(d=>d.score>=top.score*.72).slice(0,2);
  return {answer:selected.map(d=>d.text).join('\n\n'),sources:selected.map(({id,title,url,scope,reviewedAt})=>({id,title,url,scope,reviewedAt})),handoff:/registration|pricing|start|area/.test(top.id),mode:'knowledge',direct:!!direct,context:found};
}
