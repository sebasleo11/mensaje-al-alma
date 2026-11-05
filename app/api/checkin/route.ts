import { DEMO } from '@/lib/demo/mode';
import { demoCheckin } from '@/lib/demo/api';
import { authorize, handled, reply } from '@/lib/messages/http';
import { createAdminClient } from '@/utils/supabase/admin';
import { dueAt } from '@/lib/checkin/policy';

function view(row: { last_checkin_at: string; released_at: string | null } | null) {
  return row ? { lastCheckinAt: row.last_checkin_at, dueAt: dueAt(new Date(row.last_checkin_at)).toISOString(), released: !!row.released_at } : null;
}
export async function GET(request: Request) { if (DEMO) return demoCheckin(false); return handled(async () => {
  const { client, user } = await authorize(request);
  const { data, error } = await client.from('life_checkins').select('last_checkin_at,released_at').eq('user_id', user.id).maybeSingle();
  if (error) throw error;
  return reply({ checkin: view(data) });
}); }
// Explicit confirmation only: merely opening the app never counts as proof of life.
export async function POST(request: Request) { if (DEMO) return demoCheckin(true); return handled(async () => {
  const { user } = await authorize(request, true);
  const { data, error } = await createAdminClient().rpc('record_life_checkin', { p_user: user.id });
  if (error) throw error;
  return reply({ checkin: view(data) });
}); }
