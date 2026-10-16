import type { CreateEmailOptions } from 'resend';
import { authorize, body, handled, HttpError, reply, validId } from '@/lib/messages/http';
import { createAdminClient } from '@/utils/supabase/admin';
import { createResendClient, getEmailConfiguration } from '@/utils/resend';
import { messageEmail } from '@/lib/email/message';
import { sendMessage } from '@/lib/messages/send';
export const maxDuration=60;
export async function POST(request:Request,context:{params:Promise<{id:string}>}){return handled(async()=>{
 const {user}=await authorize(request,true);if(!user.email_confirmed_at)throw new HttpError(403,'Confirmá el email de tu cuenta antes de enviar.');
 const id=validId((await context.params).id);const input=await body(request);const expected=typeof input.expectedUpdatedAt==='string'?input.expectedUpdatedAt:'';if(!expected||!Number.isFinite(Date.parse(expected)))throw new HttpError(409,'Volvé a abrir el borrador y confirmá su contenido antes de enviar.');const config=getEmailConfiguration();const resend=createResendClient();const admin=createAdminClient();
 const secret=process.env.RECIPIENT_TOKEN_SECRET??'';if(secret.length<32)throw new HttpError(503,'El envío todavía no está configurado. Podés guardar tu borrador.');
 const result=await sendMessage({
  reserve:async()=>{const r=await admin.rpc('reserve_message_send',{p_user:user.id,p_message:id,p_sender:config.from,p_app_url:config.appUrl,p_expected:expected});if(r.error){if(r.error.code==='40001')throw new HttpError(409,'El borrador cambió en otra ventana. Volvé a abrirlo y revisá sus palabras antes de enviar.');if(r.error.message==='free quota used')throw new HttpError(409,'No te quedan envíos disponibles. Podés seguir guardando borradores.');throw new HttpError(409,'No pudimos preparar el envío. Comprobá el borrador y su archivo.');}return r.data;},
  prepare:async a=>{
   // Persist the exact payload before dispatch. Replays never re-render it.
   const r=await admin.from('message_send_attempts').update({email_payload:messageEmail(a,secret)}).eq('id',a.id).is('email_payload',null);
   if(r.error)throw r.error;
  },
  claim:async attemptId=>{const r=await admin.rpc('claim_message_send',{p_attempt:attemptId});if(r.error)throw r.error;if(!r.data)return null;const a=r.data.attempt;return {attempt:a,replay:r.data.replay,payload:a.email_payload as unknown as CreateEmailOptions};},
  finish:async(attemptId,state,provider)=>{const r=await admin.rpc('finish_message_send',{p_attempt:attemptId,p_state:state,p_provider:provider});if(r.error)throw r.error;},
  send:(payload,key)=>resend.emails.send(payload,{idempotencyKey:key,signal:AbortSignal.timeout(12000)}),
 });
 return reply(result,result.state==='uncertain'?202:200);
});}
