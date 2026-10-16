import { missingScheduleSchema } from '@/lib/messages/scheduling';
import { authorize, body, handled, HttpError, reply, validId } from '@/lib/messages/http';
import { messageInput } from '@/lib/messages/panel';
import { createAdminClient } from '@/utils/supabase/admin';
import { cleanupAsset } from '@/lib/media/storage';
type Context={params:Promise<{id:string}>};
export async function GET(request:Request,context:Context){return handled(async()=>{
 const {client,user}=await authorize(request); const id=validId((await context.params).id);
 const {data,error}=await client.from('messages').select('*').eq('id',id).eq('user_id',user.id).maybeSingle();
 if(error)throw error;if(!data)throw new HttpError(404,'No encontramos ese mensaje en tu cuenta.');
 const {data:assets,error:assetError}=await client.from('message_assets').select('*').eq('message_id',id).eq('state','ready').order('created_at',{ascending:false}).limit(1);
 if(assetError)throw assetError;
 let mediaUrl:string|null=null;
 if(assets?.[0]){const signed=await client.storage.from('alma-private').createSignedUrl(assets[0].path,300);if(signed.error)throw signed.error;mediaUrl=signed.data.signedUrl;}
 const attempt=await client.from('message_send_attempts').select('id,message_id,state,provider_id,recipient_email,content_body,content_type,asset_id,revoked_at,created_at').eq('message_id',id).eq('user_id',user.id).order('created_at',{ascending:false}).limit(1);if(attempt.error)throw attempt.error;
 const schedules=await client.from('message_schedules').select('*').eq('message_id',id).eq('user_id',user.id).in('state',['scheduled','blocked','dispatching']).maybeSingle();
 if(schedules.error&&!missingScheduleSchema(schedules.error))throw schedules.error;
 return reply({schedule:schedules.data,schedulingAvailable:!schedules.error,message:data,asset:assets?.[0]??null,mediaUrl,attempt:attempt.data?.[0]??null});
});}
export async function PATCH(request:Request,context:Context){return handled(async()=>{
 const {client,user}=await authorize(request,true);const id=validId((await context.params).id);
 let fields;try{fields=messageInput(await body(request));}catch{throw new HttpError(400,'Revisá el destinatario y el contenido.');}
 // Format is immutable after creating the draft; changing it creates another message.
 const before=await client.from('messages').select('content_type').eq('id',id).eq('user_id',user.id).single();
 if(before.error||before.data.content_type!==fields.content_type)throw new HttpError(409,'Creá otro mensaje para elegir un formato distinto.');
 const {data,error}=await client.from('messages').update(fields).eq('id',id).eq('user_id',user.id).eq('status','draft').select('*').single();
 if(error)throw new HttpError(409,'Este mensaje está protegido mientras comprobamos su envío. Tus cambios siguen en el editor.');
 return reply({message:data});
});}
export async function DELETE(request:Request,context:Context){return handled(async()=>{
 const {client,user}=await authorize(request,true);const id=validId((await context.params).id);
 const m=await client.from('messages').select('*').eq('id',id).eq('user_id',user.id).single();
 if(m.error||m.data.status!=='draft')throw new HttpError(409,'Sólo podés eliminar borradores sin envíos pendientes.');
 const attempts=await client.from('message_send_attempts').select('id,state').eq('message_id',id);if(attempts.error||attempts.data?.some(a=>a.state!=='failed'))throw new HttpError(409,'Este borrador tiene un intento que debemos conservar. Podés continuar editándolo si el envío fue rechazado.');
 const admin=createAdminClient();const assets=await admin.from('message_assets').select('id').eq('message_id',id).eq('user_id',user.id);
 if(assets.error)throw assets.error;
 for(const a of assets.data??[])await cleanupAsset(admin,user.id,a.id,false);
 if(attempts.data?.length){const archived=await admin.from('messages').update({archived_at:new Date().toISOString()}).eq('id',id).eq('user_id',user.id);if(archived.error)throw archived.error;return reply({deleted:true});}
 const {data,error}=await client.from('messages').delete().eq('id',id).eq('user_id',user.id).eq('status','draft').select('id');
 if(error||!data?.length)throw new HttpError(409,'No pudimos eliminarlo: hay un intento de envío que debemos conservar.');
 return reply({deleted:true});
});}
