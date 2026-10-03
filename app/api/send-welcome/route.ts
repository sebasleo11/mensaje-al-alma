import { AuthSessionMissingError } from '@supabase/supabase-js';
import { createClient } from '@/utils/supabase/server';
import { isSupabaseConfigured } from '@/utils/supabase/config';
import { getEmailConfiguration, sendWelcomeEmail } from '@/utils/resend';
import { handleSendWelcome } from '@/lib/email/welcome-handler';

export const runtime = 'nodejs';
export const maxDuration = 15;

export async function POST(request: Request) {
  return handleSendWelcome(request, {
    authenticate: async () => {
      if (!isSupabaseConfigured()) return null;
      const supabase = await createClient();
      const { data, error } = await supabase.auth.getUser();
      if (error && !(error instanceof AuthSessionMissingError)) throw error;
      return data.user;
    },
    appUrl: () => getEmailConfiguration().appUrl,
    send: sendWelcomeEmail,
  });
}
