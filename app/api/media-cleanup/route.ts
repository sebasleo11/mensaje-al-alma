import { timingSafeEqual } from 'node:crypto';
import { createAdminClient } from '@/utils/supabase/admin';
import { cleanupAsset } from '@/lib/media/storage';
import { reply } from '@/lib/messages/http';
export const maxDuration=60;
export async function GET(request:Request){
 const expected=process.env.CRON_SECRET;const actual=request.headers.get('authorization')??'';
 if(!expected||actual.length!==`Bearer ${expected}`.length||!timingSafeEqual(Buffer.from(actual),Buffer.from(`Bearer ${expected}`)))return reply({error:'Unauthorized'},401);
 try{
  const admin=createAdminClient();const items=await admin.rpc('orphan_message_assets',{});
  if(items.error)throw items.error;let removed=0;
  for(const a of items.data??[])if(await cleanupAsset(admin,a.user_id,a.id,true))removed++;
  return reply({checked:items.data?.length??0,removed});
 }catch{return reply({error:'Maintenance incomplete'},503);}
}
