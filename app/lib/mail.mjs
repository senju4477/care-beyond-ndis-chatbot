import nodemailer from 'nodemailer';
export function mailReady(env) {return !!(env.SMTP_HOST&&env.SMTP_USER&&env.SMTP_PASSWORD);}
export function mailTransport(env) {
  return nodemailer.createTransport({host:env.SMTP_HOST,port:Number(env.SMTP_PORT||465),secure:env.SMTP_SECURE!=='false',requireTLS:env.SMTP_SECURE==='false',auth:{user:env.SMTP_USER,pass:env.SMTP_PASSWORD},connectionTimeout:10000,greetingTimeout:10000,socketTimeout:15000});
}
export function validateEnquiry(body) {
  const name=String(body.name||'').trim(),email=String(body.email||'').trim(),message=String(body.message||'').trim();
  if(name.length<2||name.length>100||/[\r\n]/.test(name))throw new Error('Please enter your name (2–100 characters).');
  if(!/^[^\s@\r\n]+@[^\s@\r\n]+\.[^\s@\r\n]+$/.test(email)||email.length>254)throw new Error('Please enter a valid email address.');
  if(message.length<5||message.length>3000)throw new Error('Please enter an enquiry of 5–3000 characters.');
  if(body.consent!==true)throw new Error('Please agree to sending your details to the team.');
  if(body.website)throw new Error('Unable to accept this enquiry.');
  const phone=String(body.phone||'').trim(),suburb=String(body.suburb||'').trim();
  if(phone.length>30||suburb.length>100||/[\r\n]/.test(phone+suburb))throw new Error('Please check your phone number and suburb.');
  const transcript=body.includeTranscript===true?sanitizeTranscript(body.transcript):[];
  return {name,email,message,phone,suburb,transcript};
}
export function sanitizeTranscript(input) {
  if(!Array.isArray(input))return [];
  return input.slice(-20).filter(m=>['user','assistant'].includes(m?.role)&&typeof m.content==='string').map(m=>({role:m.role,content:m.content.slice(0,1500)}));
}
export function enquiryMail(profile,enquiry,env) {
  const reference=`CBE-${Date.now().toString(36).toUpperCase()}`;
  return {reference,message:{from:{name:profile.name,address:env.SMTP_FROM||env.SMTP_USER},to:profile.email,replyTo:enquiry.email,subject:`Website enquiry — ${profile.name} — ${reference}`,text:`Website chatbot enquiry\nReference: ${reference}\n\nName: ${enquiry.name}\nEmail: ${enquiry.email}\nPhone: ${enquiry.phone||'Not provided'}\nSuburb: ${enquiry.suburb||'Not provided'}\n\nEnquiry:\n${enquiry.message}\n\n${enquiry.transcript.length?'Conversation shared with consent:\n'+enquiry.transcript.map(m=>`${m.role==='user'?'Visitor':'Assistant'}: ${m.content}`).join('\n\n'):'The visitor did not share the conversation.'}\n\nPlease reply to the visitor using Reply-To. No booking or funding approval has been made.`}};
}
