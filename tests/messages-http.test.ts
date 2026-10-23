import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { transformSync } from 'esbuild';
import { withDraftDeadline } from '../lib/messages/drafts';
export async function verifyMessageHttp(){
 let signedIn=true;let verified=0;
 const client={auth:{getUser:async()=>{verified++;return {data:{user:signedIn?{id:'verified-owner'}:null},error:null};}}};
 const module={exports:{} as any};
 const env={APP_URL:'https://example.com',NEXT_PUBLIC_APP_URL:'https://example.com'};
 vm.runInNewContext(transformSync(readFileSync('lib/messages/http.ts','utf8'),{loader:'ts',format:'cjs'}).code,{
  module,exports:module.exports,URL,Response,process:{env},
  require:(name:string)=>{if(name==='server-only')return {};if(name==='@/utils/supabase/server')return {createClient:async()=>client};if(name==='./drafts')return {withDraftDeadline};throw new Error('Unexpected module');},
 });
 const helpers=module.exports;
 const authorized=new Request('https://example.com/api/messages',{method:'POST',headers:{Origin:'https://example.com'},body:JSON.stringify({user_id:'forged-owner'})});
 assert.equal((await helpers.authorize(authorized,true)).user.id,'verified-owner');
 delete env.APP_URL;
 assert.equal((await helpers.authorize(authorized,true)).user.id,'verified-owner');
 env.APP_URL='https://example.com';
 await assert.rejects(helpers.authorize(new Request('https://example.com/api/messages',{headers:{Origin:'https://evil.example'}}),true),(e:any)=>e.status===403);
 await assert.rejects(helpers.authorize(new Request('https://example.com/api/messages'),true),(e:any)=>e.status===403);
 signedIn=false;await assert.rejects(helpers.authorize(authorized,true),(e:any)=>e.status===401);
 assert.equal(verified,3,'Only allowed origins reach verified Auth; body identity ignored');
 await assert.rejects(helpers.body(new Request('https://example.com',{method:'POST',body:'x'.repeat(16001)})),(e:any)=>e.status===413);
 const masked=await helpers.handled(async()=>{throw new Error('secret private text');});assert.equal(masked.status,503);assert.equal((await masked.text()).includes('secret'),false);
 console.log('OK: origen autorizado, Auth verificado, identidad de body ignorada, límites y errores sin datos privados. Adaptador de sesión simulado.');
}
