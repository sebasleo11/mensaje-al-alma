import { createResendClient } from '@/utils/resend';
import { createAdminClient } from '@/utils/supabase/admin';
import { reply } from '@/lib/messages/http';
export async function POST(request:Request){
 const secret=process.env.RESEND_WEBHOOK_SECRET;if(!secret)return reply({error:'Unavailable'},503);
 let event;try{event=createResendClient().webhooks.verify({payload:await request.text(),headers:{id:request.headers.get('svix-id')??'',timestamp:request.headers.get('svix-timestamp')??'',signature:request.headers.get('svix-signature')??''},webhookSecret:secret});}catch{return reply({error:'Invalid signature'},400);}
 if(!['email.sent','email.delivered','email.bounced','email.failed','email.suppressed'].includes(event.type))return reply({received:true});
 if(!('email_id' in event.data))return reply({received:true});
 try{
  const admin=createAdminClient();const providerId=event.data.email_id;
  const tags='tags' in event.data?event.data.tags:undefined;const attemptId=tags?.alma_attempt;
  const query=admin.from('message_send_attempts').select('id,provider_id');
  const r=attemptId?await query.eq('id',attemptId).maybeSingle():await query.eq('provider_id',providerId).maybeSingle();
  if(r.error)throw r.error;if(!r.data)return reply({received:true});
  // Verified provider events prove acceptance even if the original request timed out.
  const state=event.type==='email.delivered'?'delivered':event.type==='email.sent'?'accepted':'bounced';
  const done=await admin.rpc('finish_message_send',{p_attempt:r.data.id,p_state:state,p_provider:providerId});if(done.error)throw done.error;
  return reply({received:true});
 }catch{return reply({error:'Retry later'},503);}
}
