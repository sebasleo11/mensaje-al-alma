import { quotaSummary } from '@/lib/messages/quota';
import { missingScheduleSchema,occupiedSlots } from '@/lib/messages/scheduling';
import { authorize, body, handled, HttpError, reply, validId } from '@/lib/messages/http';
import { messageInput } from '@/lib/messages/panel';
export async function GET(request: Request) { return handled(async () => {
 const { client, user } = await authorize(request);
 const [messages, attempts, schedules, quota] = await Promise.all([
  client.from('messages').select('*').eq('user_id',user.id).order('created_at',{ascending:false}),
  client.from('message_send_attempts').select('id,message_id,state,provider_id,recipient_email,content_body,content_type,asset_id,revoked_at,created_at').eq('user_id',user.id).order('created_at',{ascending:false}),
  client.from('message_schedules').select('*').eq('user_id',user.id).order('created_at',{ascending:false}),
  client.rpc('get_message_quota',{}),
 ]);
 if (messages.error || attempts.error) throw new Error('List failed');
 if(schedules.error&&!missingScheduleSchema(schedules.error))throw new Error('Schedule list failed');
 if(quota.error&&!missingScheduleSchema(quota.error))throw new Error('Quota unavailable');
 // Missing quota RPC: conservative legacy fallback; never infer development credits.
 const balance=quota.error?quotaSummary({limit:3,additional:0,used:occupiedSlots(attempts.data,schedules.data??[]),remaining:Math.max(0,3-occupiedSlots(attempts.data,schedules.data??[]))}):quotaSummary(quota.data);
 return reply({ quota:balance, schedules:schedules.data??[], schedulingAvailable:!schedules.error, messages: messages.data, attempts: attempts.data, used: balance.used });
 }); }
export async function POST(request: Request) { return handled(async () => {
 const { client, user } = await authorize(request,true);
 const input = await body(request);
 let fields; try { fields=messageInput(input); } catch { throw new HttpError(400,'Agregá un email válido y revisá tu mensaje.'); }
 const id = validId(typeof input.id === 'string' ? input.id : '');
 // A browser-generated stable UUID deduplicates an uncertain save, not identity.
 const { data: existing, error: lookupError } = await client.from('messages').select('*').eq('id',id).eq('user_id',user.id).maybeSingle();
 if(lookupError) throw lookupError;
 if(existing){if(existing.recipient_email!==fields.recipient_email||existing.content_body!==fields.content_body||existing.content_type!==fields.content_type)throw new HttpError(409,'Este borrador ya se guardó con otras palabras. Volvé a abrirlo para conservar ambas versiones.');return reply({message:existing});}
 const { data,error }=await client.from('messages').insert({id,user_id:user.id,...fields,status:'draft'}).select('*').single();
 if(error) throw error;
 return reply({message:data},201);
 }); }
