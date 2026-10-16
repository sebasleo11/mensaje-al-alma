import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/utils/supabase/database.types';
export async function cleanupAsset(admin:SupabaseClient<Database>,userId:string,assetId:string,expiredOnly:boolean){
 const mark=await admin.rpc('mark_asset_cleanup',{p_user:userId,p_asset:assetId,p_expired_only:expiredOnly});if(mark.error)throw mark.error;if(!mark.data)return false;
 const removed=await admin.storage.from('alma-private').remove([mark.data]);if(removed.error)throw removed.error;
 const done=await admin.from('message_assets').update({removed_at:new Date().toISOString()}).eq('id',assetId).eq('user_id',userId);if(done.error)throw done.error;
 // Keep the tombstone metadata for failed-attempt audit references.
 return true;
}
export async function cleanupOrphans(admin:SupabaseClient<Database>,userId:string,messageId:string){
 const items=await admin.from('message_assets').select('id').eq('user_id',userId).eq('message_id',messageId);
 if(items.error)throw items.error;for(const a of items.data??[])await cleanupAsset(admin,userId,a.id,true);
}
