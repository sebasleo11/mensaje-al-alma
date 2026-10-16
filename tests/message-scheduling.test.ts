import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { transformSync } from 'esbuild';
import { formatUtcOffset,scheduleTime,occupiedSlots,overdue,missingScheduleSchema } from '../lib/messages/scheduling';
export async function verifyScheduling(){
 assert.equal(formatUtcOffset(-180),'UTC−03:00');assert.equal(formatUtcOffset(345),'UTC+05:45');
 const now=Date.parse('2026-10-13T12:00:00Z');
 assert.equal(scheduleTime('2026-10-13T09:05','America/Argentina/Buenos_Aires',undefined,now).scheduledAt,'2026-10-13T12:05:00.000Z');
 for(const local of ['2026-02-30T09:00','invalid','2026-10-12T09:00','2026-10-13T09:04'])assert.throws(()=>scheduleTime(local,'America/Argentina/Buenos_Aires',undefined,now));
 assert.throws(()=>scheduleTime('2026-10-14T09:00','bad/zone',undefined,now));
 assert.throws(()=>scheduleTime('2026-03-08T02:30','America/New_York',undefined,Date.parse('2026-03-01Z')),/no existe/);
 assert.throws(()=>scheduleTime('2026-11-01T01:30','America/New_York',undefined,now),/se repite/);
 assert.equal(scheduleTime('2026-11-01T01:30','America/New_York',-240,now).scheduledAt,'2026-11-01T05:30:00.000Z');
 assert.equal(scheduleTime('2026-11-01T01:30','America/New_York',-300,now).scheduledAt,'2026-11-01T06:30:00.000Z');
 assert.throws(()=>scheduleTime('2026-11-01T01:30','America/New_York',0,now));
 assert.equal(overdue('2026-10-13T12:00Z',now+15*60000),false);
 assert.equal(overdue('2026-10-13T12:00Z',now+15*60000+1),true);
 assert.equal(occupiedSlots([{state:'accepted'},{state:'failed'}],[{state:'scheduled'},{state:'blocked'}]),3);
 assert.equal(occupiedSlots([{state:'prepared'}],[{state:'dispatching'},{state:'cancelled'}]),1,'Transfer/cancel never count twice');
 assert.equal(missingScheduleSchema({code:'PGRST202'}),true);
 assert.equal(missingScheduleSchema({code:'42501'}),false,'Permissions must not be mistaken for missing schema');
 const recoveryPatch=readFileSync('supabase/patches/20261016_dispatching_recovery.sql','utf8');
 const existingAttempt=recoveryPatch.indexOf("where message_id=m.id and user_id=p_user and state<>'failed'");
 const activeSchedule=recoveryPatch.indexOf("state in ('scheduled','blocked','dispatching')");
 assert.ok(existingAttempt>=0&&existingAttempt<activeSchedule,'Dispatching recovery returns the linked attempt before active-schedule conflict');
 assert.match(recoveryPatch,/if p_schedule is null then return a;/);
 assert.match(recoveryPatch,/This is intentionally not a migration/);
 // API transport and Auth are simulated. These assertions do not execute SQL locks.
 let signedIn=true,originAllowed=true,result:any={data:{id:'11111111-1111-4111-8111-111111111111',state:'scheduled'},error:null};
 const calls:any[]=[];
 class HttpError extends Error{constructor(public status:number,message:string){super(message);}}
 const mod={exports:{} as any};
 vm.runInNewContext(transformSync(readFileSync('app/api/messages/[id]/schedule/route.ts','utf8'),{loader:'ts',format:'cjs'}).code,{
  module:mod,exports:mod.exports,Date,Number,Error,
  require:(name:string)=>{
   if(name==='@/lib/messages/http')return {HttpError,authorize:async()=>{if(!originAllowed)throw new HttpError(403,'origin');if(!signedIn)throw new HttpError(401,'auth');return {user:{id:'owner',email_confirmed_at:'yes'}};},body:(r:Request)=>r.json(),validId:(v:string)=>{if(!/^[0-9a-f-]{36}$/.test(v))throw new HttpError(400,'id');return v;},reply:(data:any,status=200)=>Response.json(data,{status}),handled:async(fn:any)=>{try{return await fn();}catch(e:any){return Response.json({error:e.message},{status:e.status??503});}}};
   if(name==='@/utils/supabase/admin')return {createAdminClient:()=>({rpc:async(name:string,args:any)=>{calls.push({name,args});return result;}})};
   if(name==='@/lib/messages/scheduling')return {scheduleTime,missingScheduleSchema};
   throw new Error('Unexpected dependency: '+name);
  }
 });
 const id='11111111-1111-4111-8111-111111111111';
 const payload={action:'confirm',scheduleId:id,expectedUpdatedAt:'2026-10-13T12:00Z',localDatetime:'2099-01-01T09:00',timeZone:'America/Argentina/Buenos_Aires',user_id:'forged'};
 const invoke=(p:any)=>mod.exports.POST(new Request('https://example.com',{method:'POST',body:JSON.stringify(p)}),{params:Promise.resolve({id})});
 assert.equal((await invoke(payload)).status,200);assert.equal(calls[0].args.p_user,'owner');assert.equal(calls[0].args.p_at,'2099-01-01T12:00:00.000Z');
 result={data:null,error:{code:'PGRST202'}};const missing=await invoke(payload);assert.equal(missing.status,503);assert.match((await missing.json()).error,/no está disponible/);
 result={data:{id,state:'scheduled',version:2},error:null};assert.equal((await invoke({...payload,action:'reschedule',version:1})).status,200);assert.equal(calls.at(-1).args.p_version,1);
 result={data:null,error:{code:'40001',message:'schedule changed'}};assert.equal((await invoke({...payload,action:'reschedule',version:1})).status,409);
 result={data:null,error:{code:'42501'}};assert.equal((await invoke(payload)).status,403);
 result={data:{id,state:'cancelled'},error:null};assert.equal((await invoke({action:'cancel',scheduleId:id,version:1})).status,200);
 assert.equal(calls.at(-1).args.p_at,null,'Cancel does not parse a date or send email');
 const count=calls.length;signedIn=false;assert.equal((await invoke(payload)).status,401);signedIn=true;originAllowed=false;assert.equal((await invoke(payload)).status,403);assert.equal(calls.length,count);
 console.log('OK: fechas/IANA/DST, umbrales, cálculo de cuota y API con Auth/RPC simulados; SQL y concurrencia real no ejecutados.');
}
