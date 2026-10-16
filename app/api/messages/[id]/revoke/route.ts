import { authorize,handled,HttpError,reply,validId } from '@/lib/messages/http';
import { createAdminClient } from '@/utils/supabase/admin';
export async function POST(request:Request,context:{params:Promise<{id:string}>}){return handled(async()=>{
 const {user}=await authorize(request,true);const id=validId((await context.params).id);const r=await createAdminClient().from('message_send_attempts').update({revoked_at:new Date().toISOString()}).eq('message_id',id).eq('user_id',user.id).in('state',['accepted','delivered','bounced']).select('id');
 if(r.error||!r.data.length)throw new HttpError(404,'No encontramos un enlace activo de ese mensaje.');return reply({revoked:true});
});}
