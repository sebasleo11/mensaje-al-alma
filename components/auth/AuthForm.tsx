'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRight, Check, Heart, LockKeyhole } from 'lucide-react';
import { createClient } from '@/utils/supabase/client';
import { isSupabaseConfigured } from '@/utils/supabase/config';
import { authErrorMessage } from '@/lib/auth/errors';

type Mode = 'login' | 'register';

export default function AuthForm({ confirmationFailed = false }: { confirmationFailed?: boolean }) {
  const router = useRouter();
  const configured = isSupabaseConfigured();
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(confirmationFailed
    ? 'No pudimos confirmar tu email. El enlace puede haber vencido. Si ya lo confirmaste, probá iniciar sesión.' : '');
  const [notice, setNotice] = useState('');
  const inFlight = useRef(false);

  useEffect(() => {
    try { document.documentElement.dataset.theme = localStorage.getItem('alma-theme') === 'dark' ? 'dark' : 'light'; } catch {}
  }, []);

  function switchMode(next: Mode) {
    if (pending) return;
    setMode(next);
    setPassword('');
    setConfirmation('');
    setError('');
    setNotice('');
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!configured || inFlight.current) return;
    setError('');
    setNotice('');
    if (mode === 'register' && password !== confirmation) {
      setError('Las contraseñas no coinciden. Revisalas con calma.');
      return;
    }
    inFlight.current = true;
    setPending(true);
    try {
      const supabase = createClient();
      const credentials = { email: email.trim(), password };
      const { data, error: authError } = mode === 'login'
        ? await supabase.auth.signInWithPassword(credentials)
        : await supabase.auth.signUp({
          ...credentials,
          options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
        });
      if (authError) {
        setError(authErrorMessage(authError, mode));
        return;
      }
      setPassword('');
      setConfirmation('');
      if (data.session) {
        if (mode === 'register') {
          // Welcome email is independent of successful account creation.
          void fetch('/api/send-welcome', { method: 'POST', credentials: 'same-origin', keepalive: true }).catch(() => {});
        }
        // createBrowserClient has already persisted the session cookies.
        router.replace('/');
        router.refresh();
      } else if (mode === 'register') {
        // Supabase may obfuscate existing accounts; avoid asserting a new account was created.
        setNotice('Revisá tu correo. Si el registro se pudo completar, vas a recibir un enlace para confirmar tu email. Después podés iniciar sesión.');
      } else {
        setError('No pudimos iniciar tu sesión. Volvé a intentar.');
      }
    } catch {
      setError('No pudimos conectarnos. Revisá tu conexión y volvé a intentar.');
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  }

  const register = mode === 'register';
  return (
    <div className="auth-page min-h-dvh px-5 py-8 sm:px-8 sm:py-12">
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4">
        <Link href="/" className="brand" aria-label="Mensaje al Alma, inicio">
          <Heart size={23} strokeWidth={1.5} aria-hidden="true" />mensaje al alma<span className="brand-dot">.</span>
        </Link>
        <Link href="/" className="auth-back-link">Volver al inicio</Link>
      </header>
      <main className="mx-auto mt-12 w-full max-w-md sm:mt-16">
        <section className="auth-card rounded-2xl border p-7 sm:p-10" aria-labelledby="auth-title">
          <div className="auth-heart mx-auto mb-6 flex size-12 items-center justify-center rounded-full">
            <Heart size={23} strokeWidth={1.3} aria-hidden="true" />
          </div>
          <span className="eyebrow justify-center">UN ESPACIO PARA TUS PALABRAS</span>
          <h1 id="auth-title" className="auth-title mt-4 text-center">{register ? 'Empezá a estar más cerca.' : 'Qué bueno que volviste.'}</h1>
          <p className="auth-intro mt-3 text-center">{register ? 'Creá tu cuenta para guardar eso que llevás en el corazón.' : 'Ingresá a tu cuenta y retomá tus palabras, a tu ritmo.'}</p>
          <div className="auth-tabs mt-7 grid grid-cols-2 gap-1 rounded-lg p-1" role="tablist" aria-label="Acceso a tu cuenta">
            <button id="login-tab" type="button" role="tab" aria-selected={!register} aria-controls="auth-panel" disabled={pending} onClick={() => switchMode('login')}>Iniciar sesión</button>
            <button id="register-tab" type="button" role="tab" aria-selected={register} aria-controls="auth-panel" disabled={pending} onClick={() => switchMode('register')}>Crear cuenta</button>
          </div>
          {!configured && <p className="auth-status mt-5" role="status">El acceso a cuentas todavía no está disponible. Podés seguir explorando y guardar tus palabras en este navegador.</p>}
          <div id="auth-panel" role="tabpanel" aria-labelledby={register ? 'register-tab' : 'login-tab'}>
            <form onSubmit={submit} className="mt-6" aria-busy={pending}>
              <fieldset disabled={pending || !configured} className="draft-fields">
                <label htmlFor="auth-email" className="auth-label">Tu email</label>
                <input id="auth-email" name="email" type="email" autoComplete="email" required maxLength={254} placeholder="vos@ejemplo.com" value={email} onChange={event => setEmail(event.target.value)} />
                <label htmlFor="auth-password" className="auth-label mt-5">Tu contraseña</label>
                <input id="auth-password" name="password" type="password" autoComplete={register ? 'new-password' : 'current-password'} required minLength={register ? 8 : undefined} maxLength={128} aria-describedby={register ? 'password-help' : undefined} value={password} onChange={event => setPassword(event.target.value)} />
                {register && <>
                  <p id="password-help" className="auth-help mt-2">Usá al menos 8 caracteres. Combiná letras, números y símbolos.</p>
                  <label htmlFor="auth-confirmation" className="auth-label mt-5">Repetí tu contraseña</label>
                  <input id="auth-confirmation" name="passwordConfirmation" type="password" autoComplete="new-password" required minLength={8} maxLength={128} value={confirmation} onChange={event => setConfirmation(event.target.value)} />
                </>}
                <button type="submit" className="button primary mt-6 w-full" disabled={pending || !configured}>
                  {pending ? (register ? 'Creando tu cuenta…' : 'Ingresando…') : (register ? 'Crear mi cuenta' : 'Ingresar a mi cuenta')}
                  {!pending && <ArrowRight size={17} aria-hidden="true" />}
                </button>
              </fieldset>
              {error && <p className="auth-status auth-error mt-4" role="alert">{error}</p>}
              {notice && <p className="auth-status mt-4" role="status"><Check size={16} aria-hidden="true" />{notice}</p>}
            </form>
          </div>
          <p className="auth-help mt-6 flex items-center justify-center gap-2 text-center"><LockKeyhole size={13} aria-hidden="true" />Tus palabras, en tu espacio personal.</p>
        </section>
        <p className="auth-help mt-6 text-center">Sin apuro. Con todo tu corazón.</p>
      </main>
    </div>
  );
}
