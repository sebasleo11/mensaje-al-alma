import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { getSupabaseConfig } from './config';
import type { Database } from './database.types';
export function createAdminClient() {
 const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
 if (!key) throw new Error('Server configuration unavailable');
 if(!key.startsWith('sb_secret_')){try{const claims=JSON.parse(Buffer.from(key.split('.')[1],'base64url').toString('utf8'));if(claims.role!=='service_role'||(getSupabaseConfig().url.endsWith('.supabase.co')&&claims.ref!==new URL(getSupabaseConfig().url).hostname.split('.')[0]))throw new Error();}catch{throw new Error('Server configuration invalid');}} 
 return createClient<Database>(getSupabaseConfig().url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
