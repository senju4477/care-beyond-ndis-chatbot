import {createHash} from 'node:crypto';
export async function extractDocument(fileName,buffer) {
  const extension=fileName.toLowerCase().split('.').at(-1);
  let text;
  if(['txt','md'].includes(extension))text=buffer.toString('utf8');
  else if(extension==='pdf'){
    const {PDFParse}=await import('pdf-parse');const parser=new PDFParse({data:buffer});
    try{text=(await parser.getText()).text;}finally{await parser.destroy();}
  }else if(extension==='docx'){
    const mammoth=await import('mammoth');text=(await mammoth.extractRawText({buffer})).value;
  }else throw new Error('Supported documents: PDF, DOCX, TXT and Markdown.');
  text=String(text).replace(/\u0000/g,'').trim();
  if(text.length<30)throw new Error('No readable text found. Scanned PDFs need OCR before upload.');
  if(text.length>150000)throw new Error('This document is too long. Please split it into smaller documents.');
  return text;
}
export function chunkDocument({title,text,url=null,scope='documents',reviewedAt=new Date().toISOString().slice(0,10)}) {
  const docId=createHash('sha256').update(title+'\n'+text).digest('hex').slice(0,16),parts=[];
  for(let pos=0;pos<text.length;){let end=Math.min(pos+1200,text.length);if(end<text.length){const split=text.lastIndexOf('\n',end);if(split>pos+500)end=split;}parts.push({id:`doc-${docId}-${parts.length}`,documentId:docId,title,url,scope,reviewedAt,keywords:[],text:text.slice(pos,end).trim()});if(end>=text.length)break;pos=Math.max(pos+1,end-120);}
  return {id:docId,title,scope,url,reviewedAt,chunks:parts};
}
