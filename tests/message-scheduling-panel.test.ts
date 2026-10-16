import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { transformSync } from 'esbuild';
import * as quota from '../lib/messages/quota';
import * as scheduling from '../lib/messages/scheduling';
export async function verifySchedulingPanel(){
 const message={id:'11111111-1111-4111-8111-111111111111',recipient_email:'recipient@example.com',content_body:'Palabras conservadas',content_type:'text',status:'draft',created_at:'2026-10-13T12:00Z',updated_at:'2026-10-13T12:00Z'};
 for(const mode of ['missing','scheduled','uncertain','accepted','credit','exhausted','ordinary_exhausted']){
  const slots:any[]=[],effects:any[]=[];let cursor=0,dirty=true,view:any;
  const schedule={id:'22222222-2222-4222-8222-222222222222',message_id:message.id,state:'scheduled',local_datetime:'2099-01-01T09:00',time_zone:'America/Argentina/Buenos_Aires',utc_offset_minutes:-180,version:1};
  const react={useState:(initial:any)=>{const i=cursor++;slots[i]??={value:initial};return [slots[i].value,(v:any)=>{slots[i].value=typeof v==='function'?v(slots[i].value):v;dirty=true;}];},useRef:(v:any)=>{const i=cursor++;slots[i]??={current:v};return slots[i];},useCallback:(fn:any)=>{cursor++;return fn;},useEffect:(fn:any,deps:any[])=>{const i=cursor++;if(!slots[i]||deps.some((v:any,j:number)=>slots[i].deps[j]!==v)){slots[i]={deps};effects.push(fn);}}};
  const requests:string[]=[];let cancelled=false;
  const mod={exports:{} as any};
  vm.runInNewContext(transformSync(readFileSync('components/messages/MessagesPanel.tsx','utf8'),{loader:'tsx',format:'cjs',jsx:'automatic'}).code,{
   module:mod,exports:mod.exports,URLSearchParams,Date,Intl,Number,Error,AbortSignal,crypto:globalThis.crypto,
   document:{documentElement:{dataset:{}}},localStorage:{getItem:()=>null},window:{location:{search:''},addEventListener:()=>{},removeEventListener:()=>{}},
   fetch:async(url:string,init:any)=>{
    requests.push(url);
    const current=mode==='scheduled'&&!cancelled?schedule:null;
    const data=url.endsWith('/send')?{state:mode}:url.endsWith('/schedule')?(cancelled=true,{schedule:{...schedule,state:'cancelled'}}):url==='/api/messages'?{messages:[message],attempts:[],used:current?1:0,quota:{limit:mode==='credit'||mode==='exhausted'?53:3,additional:mode==='credit'||mode==='exhausted'?50:0,used:mode==='credit'||mode==='ordinary_exhausted'?3:mode==='exhausted'?53:current?1:0,remaining:mode==='credit'?50:mode==='exhausted'||mode==='ordinary_exhausted'?0:current?2:3},schedules:current?[current]:[],schedulingAvailable:mode!=='missing'}:{message,asset:null,mediaUrl:null,attempt:null,schedule:current,schedulingAvailable:mode!=='missing'};
    return Response.json(data);
   },
   require:(name:string)=>{
    if(name==='react')return react;
    if(name==='react/jsx-runtime')return {jsx:(type:any,props:any)=>({type,props}),jsxs:(type:any,props:any)=>({type,props}),Fragment:'fragment'};
    if(name==='@/lib/messages/quota')return quota;
    if(name==='@/lib/messages/scheduling')return scheduling;
    if(name==='@/utils/supabase/client')return {createClient:()=>({auth:{onAuthStateChange:()=>({data:{subscription:{unsubscribe:()=>{}}}})}})};
    if(name==='@/utils/supabase/config')return {};
    if(name==='@/lib/media/browser')return {uploadPrivateFile:()=>{throw new Error('No media upload allowed in this test');}};
    if(['next/link','lucide-react','./MediaPicker','@/components/BrandMark'].includes(name))return new Proxy({}, {get:()=>()=>null});
    throw new Error('Unexpected '+name);
   }
  });
  async function flush(){for(let i=0;i<8;i++){if(dirty){dirty=false;cursor=0;view=mod.exports.default({userId:'owner'});while(effects.length)effects.shift()();}await new Promise<void>(r=>setImmediate(r));}}
  function nodes(node:any):any[]{if(!node||typeof node!=='object')return [];if(Array.isArray(node))return node.flatMap(n=>nodes(n));return [node,...nodes(node.props?.children)];}
  function text(node:any):string{if(typeof node==='string')return node;if(Array.isArray(node))return node.map(text).join(' ');return node&&typeof node==='object'?text(node.props?.children):'';}
  function button(label:string){const b=nodes(view).find(n=>n.type==='button'&&text(n)===label);assert.ok(b,'Button '+label);return b;}
  await flush();button(mode==='scheduled'?'Abrir mensaje':'Editar').props.onClick();await flush();
  assert.equal(nodes(view).find(n=>n.type==='textarea').props.value,message.content_body);
  if(mode==='missing'){assert.match(text(view),/programación todavía no está disponible/);assert.ok(!nodes(view).some(n=>n.type==='button'&&text(n)==='Revisar programación'));}
  else if(mode==='scheduled'){
   assert.equal(nodes(view).find(n=>n.type==='fieldset').props.disabled,true);
   assert.ok(!nodes(view).some(n=>n.type==='button'&&text(n)==='Revisar envío'));
   button('Cancelar programación y conservar borrador').props.onClick();await flush();const cancel=button('Confirmar cancelación').props.onClick;cancel();cancel();await flush();assert.equal(requests.filter(r=>r.endsWith('/schedule')).length,1,'Double click issues one scheduling mutation');
   assert.equal(nodes(view).find(n=>n.type==='textarea').props.value,message.content_body);assert.equal(nodes(view).find(n=>n.type==='fieldset').props.disabled,false);
  }else if(mode==='credit'){assert.equal(button('Revisar envío').props.disabled,false);assert.match(text(view),/50 de 53 envíos disponibles/);}
  else if(mode==='exhausted'||mode==='ordinary_exhausted'){assert.equal(button('Revisar envío').props.disabled,true);assert.match(text(view),/No te quedan envíos/);}
  else{
   button('Revisar envío').props.onClick();await flush();await button('Confirmar envío ahora').props.onClick();await flush();
   assert.equal(nodes(view).some(n=>n.type==='textarea'),mode!=='accepted','Immediate editor closes only on accepted');
  }
  assert.ok(!requests.some(r=>r.includes('/scheduled-messages/run')));
 }
 console.log('OK: panel real con hooks/transporte simulados: esquema ausente, bloqueo, cancelación conserva borrador y cierre inmediato sólo ante accepted. Sin navegador/SQL real.');
}
