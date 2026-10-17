import { authorize,body,handled,HttpError,reply,validId } from '@/lib/messages/http';
import { createAdminClient } from '@/utils/supabase/admin';
import { missingScheduleSchema,scheduleTime } from '@/lib/messages/scheduling';
function scheduleRpcMessage(message:string, action:string) {
 const known:Record<string,string>={
  'message changed':'El mensaje cambió desde que lo revisaste. Volvé a abrirlo y guardá tus cambios antes de programar.',
  'schedule unavailable':'No encontramos una programación activa para este mensaje.',
  'confirmation conflict':'La confirmación ya no coincide con la programación revisada. Volvé a revisar la fecha.',
  'free quota used':'No te quedan envíos disponibles.',
  'schedule started':'El envío comenzó; ya no podemos cambiarlo.',
  'minimum advance':'Programá con al menos 5 minutos de anticipación.',
  'invalid time zone':'Revisá la zona horaria y la fecha elegidas.',
  'invalid local time':'La fecha, hora y zona horaria no coinciden.',
  'email unconfirmed':'Confirmá el email de tu cuenta antes de programar.',
  'message locked':'El mensaje ya tiene un envío o una programación activa.',
  'media unavailable':'El archivo guardado no está disponible para programar este mensaje.',
 };
 return known[message]??(process.env.NODE_ENV==='development'&&message?message:action==='confirm'?'No pudimos crear la programación. Revisá fecha, cupo y versión.':'No pudimos actualizar la programación. Revisá fecha, cupo y versión.');
}
export async function POST(request:Request,context:{params:Promise<{id:string}>}){return handled(async()=>{
 const {user}=await authorize(request,true);
 if(!user.email_confirmed_at)throw new HttpError(403,'Confirmá el email de tu cuenta antes de programar.');
 const id=validId((await context.params).id),input=await body(request);
 const scheduleId=validId(typeof input.scheduleId==='string'?input.scheduleId:'');
 const action=input.action;
 if(process.env.NODE_ENV==='development')console.debug('[schedule-api]',{method:'POST',endpoint:'/api/messages/[id]/schedule',message_id:id,action,schedule_id:scheduleId,version:input.version??null,local_datetime:input.localDatetime??null,time_zone:input.timeZone??null,utc_offset_minutes:input.utcOffsetMinutes??null});
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
 if(process.env.NODE_ENV==='development')console.debug('[schedule-api]',{method:'POST',endpoint:'/api/messages/[id]/schedule',message_id:id,schedule_id:scheduleId,status:result.error?409:200,state:result.data?.state??null,error:result.error?.message??null});
 if(missingScheduleSchema(result.error))throw new HttpError(503,'La programación todavía no está disponible. Tu borrador sigue guardado.');
 if(result.error)throw new HttpError(result.error.code==='42501'?403:409,scheduleRpcMessage(result.error.message,String(action)));
 if(!result.data||result.data.id!==scheduleId)throw new HttpError(503,'No pudimos confirmar la programación. Actualizá el mensaje para consultar su estado.');
 return reply({schedule:result.data});
});}
