import { createAdminClient } from '@/utils/supabase/admin';
import { validRecipientToken } from '@/lib/email/message';
import { body,handled,HttpError,reply,validId } from '@/lib/messages/http';
export async function POST(request:Request){return handled(async()=>{
 const input=await body(request);const id=validId(String(input.id));const token=typeof input.token==='string'?input.token:'';
 if(!validRecipientToken(id,token,process.env.RECIPIENT_TOKEN_SECRET??''))throw new HttpError(404,'Este enlace no está disponible.');
 const admin=createAdminClient();const a=await admin.from('message_send_attempts').select('*').eq('id',id).in('state',['accepted','delivered','bounced']).is('revoked_at',null).maybeSingle();
 if(a.error||!a.data)throw new HttpError(404,'Este enlace no está disponible.');
 let mediaUrl:string|null=null;
 if(a.data.asset_id){const asset=await admin.from('message_assets').select('path,mime').eq('id',a.data.asset_id).eq('user_id',a.data.user_id).eq('state','ready').single();if(asset.error)throw asset.error;const url=await admin.storage.from('alma-private').createSignedUrl(asset.data.path,120);if(url.error)throw url.error;mediaUrl=url.data.signedUrl;}
 return reply({content:a.data.content_body,format:a.data.content_type,mediaUrl});
});}
