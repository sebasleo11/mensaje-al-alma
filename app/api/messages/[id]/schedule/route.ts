import { authorize,body,handled,HttpError,reply,validId } from '@/lib/messages/http';
import { createAdminClient } from '@/utils/supabase/admin';
import { missingScheduleSchema,scheduleTime } from '@/lib/messages/scheduling';
export async function POST(request:Request,context:{params:Promise<{id:string}>}){return handled(async()=>{
 const {user}=await authorize(request,true);
 if(!user.email_confirmed_at)throw new HttpError(403,'Confirmá el email de tu cuenta antes de programar.');
 const id=validId((await context.params).id),input=await body(request);
 const scheduleId=validId(typeof input.scheduleId==='string'?input.scheduleId:'');
 const action=input.action;
 if(!['confirm','reschedule','cancel'].includes(String(action)))throw new HttpError(400,'Revisá la acción de programación.');
 const version=typeof input.version==='number'&&Number.isSafeInteger(input.version)&&input.version>0?input.version:null;
 if(action!=='confirm'&&!version)throw new HttpError(409,'Actualizá la programación antes de cambiarla.');
 let time:ReturnType<typeof scheduleTime>|null=null;
 if(action!=='cancel')try{
  if(typeof input.localDatetime!=='string'||typeof input.timeZone!=='string'||(input.utcOffsetMinutes!==undefined&&(!Number.isInteger(input.utcOffsetMinutes)||typeof input.utcOffsetMinutes!=='number')))throw new Error('Revisá fecha, hora y zona.');
  time=scheduleTime(input.localDatetime,input.timeZone,input.utcOffsetMinutes as number|undefined);
 }catch(e){throw new HttpError(400,e instanceof Error?e.message:'Revisá fecha y zona.');}
 const expected=typeof input.expectedUpdatedAt==='string'?input.expectedUpdatedAt:null;
 if(action==='confirm'&&(!expected||!Number.isFinite(Date.parse(expected))))throw new HttpError(409,'Guardá y revisá tu borrador antes de programar.');
 const result=await createAdminClient().rpc('change_message_schedule',{p_user:user.id,p_message:id,p_id:scheduleId,p_action:String(action),p_expected:expected,p_version:version,p_at:time?.scheduledAt??null,p_zone:time?.timeZone??null,p_local:time?.localDatetime??null,p_offset:time?.utcOffsetMinutes??null});
 if(missingScheduleSchema(result.error))throw new HttpError(503,'La programación todavía no está disponible. Tu borrador sigue guardado.');
 if(result.error)throw new HttpError(result.error.code==='42501'?403:409,result.error.message==='free quota used'?'No te quedan envíos disponibles.':result.error.message==='schedule started'?'El envío comenzó; ya no podemos cambiarlo.':'No pudimos cambiar la programación. Actualizá el mensaje y revisá fecha, cupo y versión.');
 if(!result.data||result.data.id!==scheduleId)throw new HttpError(503,'No pudimos confirmar la programación. Actualizá el mensaje para consultar su estado.');
 return reply({schedule:result.data});
});}
