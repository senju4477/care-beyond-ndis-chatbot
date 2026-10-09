import {mkdir, readFile, writeFile, rename} from 'node:fs/promises';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
export function fileStore(directory) {
  let writes=Promise.resolve();
  const name=(key)=>{if(!/^[a-z0-9-]+$/.test(key))throw new Error('Invalid record key');return join(directory,`${key}.json`);};
  async function get(key,fallback){try{return JSON.parse(await readFile(name(key),'utf8'));}catch(e){if(e.code==='ENOENT')return structuredClone(fallback);throw e;}}
  async function put(key,value){await mkdir(directory,{recursive:true,mode:0o700});const target=name(key),temp=`${target}.${randomUUID()}.tmp`;await writeFile(temp,JSON.stringify(value,null,2),{mode:0o600});await rename(temp,target);}
  function update(key,fallback,fn){const next=writes.then(async()=>{const value=await get(key,fallback),result=await fn(value);await put(key,value);return result;});writes=next.catch(()=>{});return next;}
  return {get,update};
}
