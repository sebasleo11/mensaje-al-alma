import { timingSafeEqual, randomUUID } from 'node:crypto';
import { createAdminClient } from '@/utils/supabase/admin';
import { createResendClient, getEmailConfiguration } from '@/utils/resend';
import { checkinReminderEmail } from '@/lib/email/checkin';
import { nextCheckinAction, LAPSE_DAYS, DAY_MS } from '@/lib/checkin/policy';
import { reply } from '@/lib/messages/http';
export const maxDuration = 60;

function authorized(request: Request) {
  const secret = process.env.CRON_SECRET ?? '';
  const expected = `Bearer ${secret}`, actual = request.headers.get('authorization') ?? '';
  return secret.length >= 16 && actual.length === expected.length && timingSafeEqual(Buffer.from(actual), Buffer.from(expected));
}

/** Daily job: sends proof-of-life reminders and, only after the full warning sequence, releases "on lapse" messages by scheduling them a few minutes ahead. */
export async function GET(request: Request) {
  if (!authorized(request)) return reply({ error: 'Unauthorized' }, 401);
  const admin = createAdminClient(), config = getEmailConfiguration(), now = new Date();
  const candidates = await admin.rpc('life_checkin_candidates');
  if (candidates.error) return reply({ error: 'Could not read check-ins' }, 503);
  const results: Array<{ user: string; action: string }> = [];
  for (const c of candidates.data ?? []) {
    const state = { lastCheckinAt: new Date(c.last_checkin_at), reminderStage: c.reminder_stage, lastReminderAt: null as Date | null, releasedAt: c.released_at ? new Date(c.released_at) : null };
    const row = await admin.from('life_checkins').select('last_reminder_at').eq('user_id', c.user_id).single();
    state.lastReminderAt = row.data?.last_reminder_at ? new Date(row.data.last_reminder_at) : null;
    const action = nextCheckinAction(state, now);
    try {
      if (action.type === 'remind') {
        const user = await admin.auth.admin.getUserById(c.user_id);
        const email = user.data.user?.email;
        if (!email || !user.data.user?.email_confirmed_at) { results.push({ user: c.user_id, action: 'skipped_unconfirmed' }); continue; }
        const mail = checkinReminderEmail({ stage: action.stage, appUrl: config.appUrl, next: c.next_schedule ? new Date(c.next_schedule) : null, scheduledCount: Number(c.scheduled_count), legacyCount: Number(c.legacy_count), releaseOn: new Date(state.lastCheckinAt.getTime() + LAPSE_DAYS * DAY_MS) });
        const sent = await createResendClient().emails.send({ from: config.from, to: [email], subject: mail.subject, html: mail.html, text: mail.text }, { idempotencyKey: `alma-checkin/${c.user_id}/${state.lastCheckinAt.getTime()}/${action.stage}` });
        if (sent.error) throw sent.error;
        // Compare-and-set on the previous stage so a concurrent run or a fresh check-in is never overwritten.
        await admin.from('life_checkins').update({ reminder_stage: action.stage, last_reminder_at: now.toISOString() }).eq('user_id', c.user_id).eq('reminder_stage', c.reminder_stage).eq('last_checkin_at', c.last_checkin_at);
        results.push({ user: c.user_id, action: `reminder_${action.stage}` });
      } else if (action.type === 'release') {
        const drafts = await admin.from('messages').select('id,updated_at').eq('user_id', c.user_id).eq('release_on_lapse', true).eq('status', 'draft').is('archived_at', null);
        if (drafts.error) throw drafts.error;
        const at = new Date(now.getTime() + 6 * 60_000), local = at.toISOString().slice(0, 19);
        if (!drafts.data?.length) { results.push({ user: c.user_id, action: 'nothing_to_release' }); continue; }
        let failed = 0;
        for (const m of drafts.data ?? []) {
          const r = await admin.rpc('change_message_schedule', { p_user: c.user_id, p_message: m.id, p_id: randomUUID(), p_action: 'confirm', p_expected: m.updated_at, p_version: null, p_at: at.toISOString(), p_zone: 'UTC', p_local: local, p_offset: 0 });
          if (r.error) failed++;
        }
        // Mark released only when every message was scheduled; otherwise retry on the next run.
        if (!failed) await admin.from('life_checkins').update({ released_at: now.toISOString() }).eq('user_id', c.user_id).is('released_at', null).eq('last_checkin_at', c.last_checkin_at);
        results.push({ user: c.user_id, action: failed ? 'release_partial' : 'released' });
      }
    } catch { results.push({ user: c.user_id, action: 'error' }); }
  }
  return reply({ processed: results.length, results });
}
