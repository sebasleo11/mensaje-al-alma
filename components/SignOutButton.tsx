'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { LogOut } from 'lucide-react';
import { createClient } from '@/utils/supabase/client';

export default function SignOutButton() {
  const router = useRouter();
  const inFlight = useRef(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');

  async function signOut() {
    if (inFlight.current) return;
    inFlight.current = true;
    setPending(true);
    setError('');
    try {
      const supabase = createClient();
      // Close this browser's session, keeping other devices signed in.
      const { error: authError } = await supabase.auth.signOut({ scope: 'local' });
      if (authError) throw authError;
      router.replace('/');
      router.refresh();
    } catch {
      setError('No pudimos cerrar la sesión. Volvé a intentar.');
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  }

  return (
    <div className="signout-control">
      <button type="button" className="auth-nav-link" onClick={signOut} disabled={pending} aria-busy={pending}>
        <LogOut size={15} aria-hidden="true" />
        {pending ? 'Cerrando…' : 'Cerrar sesión'}
      </button>
      {error && <p className="auth-nav-error" role="alert">{error}</p>}
    </div>
  );
}
