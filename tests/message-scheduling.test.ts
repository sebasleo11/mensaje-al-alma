import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { transformSync } from 'esbuild';
import { formatUtcOffset,scheduleTime,occupiedSlots,overdue,missingScheduleSchema,latestSchedule,schedulePresentation } from '../lib/messages/scheduling';
export async function verifyScheduling(){
 const panel=readFileSync('components/messages/MessagesPanel.tsx','utf8');
 assert.match(panel,/Guardar borrador/);
 assert.match(panel,/Enviar ahora/);
 assert.match(panel,/Programar envío/);
 assert.match(panel,/Todavía no programaste este mensaje/);
 assert.match(panel,/Confirmar programación/);
 assert.match(panel,/Se reservará un cupo y el mensaje se enviará automáticamente en la fecha indicada/);
 assert.doesNotMatch(panel,/El envío automático aún no está habilitado/);
 assert.match(panel,/const refreshed=await reload\(\)/);
 assert.match(panel,/schedule-status-card/);
 assert.match(panel,/status:r.status/);
 const schedule:any={id:'22222222-2222-4222-8222-222222222222',message_id:'11111111-1111-4111-8111-111111111111',state:'scheduled',updated_at:'2026-10-13T12:01:00Z',local_datetime:'2099-01-01T09:00',time_zone:'America/Argentina/Buenos_Aires',utc_offset_minutes:-180};
 assert.equal(schedulePresentation(schedule).label,'En espera de envío');
 assert.equal(schedulePresentation(schedule).title,'Mensaje preparado');
 assert.equal(schedulePresentation(schedule).description,'Mensaje preparado. Tu mensaje quedó guardado y se enviará automáticamente en la fecha indicada.');
 assert.equal(schedulePresentation({...schedule,state:'blocked'}).label,'En revisión');
 assert.equal(schedulePresentation({...schedule,state:'dispatching'}).label,'Enviando');
 assert.equal(schedulePresentation({...schedule,state:'cancelled'}).label,'Cancelado');
 assert.equal(schedulePresentation({...schedule,state:'finished'},'accepted').label,'Enviado');
 assert.equal(schedulePresentation({...schedule,state:'finished'},'uncertain').label,'Resultado incierto');
 assert.equal(latestSchedule([{...schedule,updated_at:'2026-10-13T12:00:00Z'},{...schedule,updated_at:'2026-10-13T12:02:00Z',state:'cancelled'}],schedule.message_id)?.state,'cancelled');
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
 const localSchedule:{state:string}={state:'scheduled'};
 assert.equal(occupiedSlots([],[localSchedule]),1,'Confirming a schedule reserves one slot');
 localSchedule.state='scheduled';
 assert.equal(occupiedSlots([],[localSchedule]),1,'Rescheduling preserves the same reservation');
 localSchedule.state='cancelled';
 assert.equal(occupiedSlots([],[localSchedule]),0,'Cancelling releases the reservation');
 localSchedule.state='dispatching';
 assert.equal(occupiedSlots([{state:'prepared'}],[localSchedule]),1,'Dispatching transfers, rather than duplicates, the reservation');
 localSchedule.state='finished';
 assert.equal(occupiedSlots([{state:'uncertain'}],[localSchedule]),1,'Uncertain result keeps the attempt quota');
 localSchedule.state='blocked';
 assert.equal(occupiedSlots([],[localSchedule]),1,'Blocked overdue schedule keeps its reservation');
 assert.equal(overdue('2026-10-13T12:00Z',Date.parse('2026-10-13T12:15:00.001Z')),true,'Overdue schedules are not auto-dispatched after 15 minutes');
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
  module:mod,exports:mod.exports,Date,Number,Error,process:{env:{NODE_ENV:'test'}},
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
 assert.equal((await invoke(payload)).status,200);assert.equal(calls[0].args.p_user,'owner');assert.equal(calls[0].args.p_action,'confirm');assert.equal(calls[0].args.p_version,null,'Initial creation does not send a schedule version');assert.equal(calls[0].args.p_at,'2099-01-01T12:00:00.000Z');
 result={data:null,error:{code:'PGRST202'}};const missing=await invoke(payload);assert.equal(missing.status,503);assert.match((await missing.json()).error,/no está disponible/);
 result={data:{id,state:'scheduled',version:2},error:null};assert.equal((await invoke({...payload,action:'reschedule',version:1})).status,200);assert.equal(calls.at(-1).args.p_action,'reschedule');assert.equal(calls.at(-1).args.p_id,id);assert.equal(calls.at(-1).args.p_version,1);
 result={data:null,error:{code:'40001',message:'schedule changed'}};assert.equal((await invoke({...payload,action:'reschedule',version:1})).status,409);
 result={data:null,error:{code:'42501'}};assert.equal((await invoke(payload)).status,403);
 result={data:{id,state:'cancelled'},error:null};assert.equal((await invoke({action:'cancel',scheduleId:id,version:1})).status,200);
 assert.equal(calls.at(-1).args.p_at,null,'Cancel does not parse a date or send email');
 const count=calls.length;signedIn=false;assert.equal((await invoke(payload)).status,401);signedIn=true;originAllowed=false;assert.equal((await invoke(payload)).status,403);assert.equal(calls.length,count);
 console.log('OK: fechas/IANA/DST, umbrales, cálculo de cuota y API con Auth/RPC simulados; SQL y concurrencia real no ejecutados.');
}
