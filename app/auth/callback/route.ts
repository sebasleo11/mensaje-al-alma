import { after, NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { isSupabaseConfigured } from '@/utils/supabase/config';
import { isEmailConfigured, sendWelcomeEmail } from '@/utils/resend';

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code');
  if (code && isSupabaseConfigured()) {
    try {
      const supabase = await createClient();
      const { data, error } = await supabase.auth.exchangeCodeForSession(code);
      if (!error) {
        if (data.user && isEmailConfigured()) {
          const user = data.user; // Returned by the verified Auth code exchange.
          after(async () => {
            try { await sendWelcomeEmail(user); }
            catch { console.warn('No se pudo procesar el correo de bienvenida.'); }
          });
        }
        return sameOriginRedirect('/');
      }
    } catch {
      // Present a human-readable failure without exposing tokens or SDK details.
    }
  }
  return sameOriginRedirect('/login?confirmation=failed');
}

function sameOriginRedirect(path: '/' | '/login?confirmation=failed') {
  // Relative Location keeps the browser's public origin, even behind a proxy.
  return new NextResponse(null, {
    status: 303,
    headers: { Location: path, 'Cache-Control': 'private, no-store' },
  });
}
