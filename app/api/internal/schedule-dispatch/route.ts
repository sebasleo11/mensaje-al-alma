import type { CreateEmailOptions } from 'resend';
import { createAdminClient } from '@/utils/supabase/admin';
import { createResendClient, getEmailConfiguration } from '@/utils/resend';
import { messageEmail } from '@/lib/email/message';
import { sendMessage } from '@/lib/messages/send';

export const maxDuration = 60;

function authorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  return Boolean(secret && request.headers.get('authorization') === `Bearer ${secret}`);
}

export async function GET(request: Request) {
  if (!authorized(request)) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createAdminClient();
  const config = getEmailConfiguration();
  const recipientSecret = process.env.RECIPIENT_TOKEN_SECRET ?? '';
  if (recipientSecret.length < 32) return Response.json({ error: 'Dispatch is not configured' }, { status: 503 });

  const { data: schedules, error } = await admin
    .from('message_schedules')
    .select('id,message_id,user_id,version')
    .eq('state', 'scheduled')
    .lte('scheduled_at', new Date().toISOString())
    .order('scheduled_at', { ascending: true })
    .order('id', { ascending: true })
    .limit(10);

  if (error) return Response.json({ error: 'Could not read schedules' }, { status: 503 });

  const results: Array<{ id: string; state: string }> = [];
  for (const schedule of schedules ?? []) {
    if (!schedule.user_id) {
      results.push({ id: schedule.id, state: 'review_required' });
      continue;
    }
    try {
      const started = await admin.rpc('begin_message_schedule', {
        p_user: schedule.user_id,
        p_message: schedule.message_id,
        p_id: schedule.id,
        p_version: schedule.version,
        p_sender: config.from,
        p_app_url: config.appUrl,
      });
      if (started.error) {
        results.push({ id: schedule.id, state: 'review_required' });
        continue;
      }
      if (!started.data) {
        results.push({ id: schedule.id, state: 'blocked' });
        continue;
      }

      const reserved = started.data;
      const result = await sendMessage({
        reserve: async () => reserved,
        prepare: async attempt => {
          const payload = messageEmail(attempt, recipientSecret);
          const updated = await admin
            .from('message_send_attempts')
            .update({ email_payload: payload })
            .eq('id', attempt.id)
            .is('email_payload', null);
          if (updated.error) throw updated.error;
        },
        claim: async attemptId => {
          const claimed = await admin.rpc('claim_message_send', { p_attempt: attemptId });
          if (claimed.error) throw claimed.error;
          if (!claimed.data) return null;
          return {
            attempt: claimed.data.attempt,
            replay: claimed.data.replay,
            payload: claimed.data.attempt.email_payload as unknown as CreateEmailOptions,
          };
        },
        finish: async (attemptId, state, provider) => {
          const finished = await admin.rpc('finish_message_send', {
            p_attempt: attemptId,
            p_state: state,
            p_provider: provider,
          });
          if (finished.error) throw finished.error;
        },
        send: (payload, key) => createResendClient().emails.send(payload, {
          idempotencyKey: key,
          signal: AbortSignal.timeout(12000),
        }),
      });
      results.push({ id: schedule.id, state: result.state });
    } catch {
      results.push({ id: schedule.id, state: 'uncertain' });
    }
  }

  return Response.json({ processed: results.length, results });
}
