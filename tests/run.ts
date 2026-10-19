import { verifyQuota } from './message-quota.test';
import { verifySchedulingPanel } from './message-scheduling-panel.test';
import { verifyScheduling } from './message-scheduling.test';
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import { validateSupabaseConfig, SupabaseConfigurationError } from '../utils/supabase/config';
import { authErrorMessage } from '../lib/auth/errors';
import { verifyDrafts } from './drafts.test';
import { verifyMessageHttp } from './messages-http.test';
import { verifyMessageFeatures } from './message-features.test';
import { verifyDraftHook } from './draft-hook.test';
import { verifyMercadoPago } from './mercadopago.test';

const key = (role = 'anon', ref = 'testproject') => `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ role, ref })).toString('base64url')}.test`;
const url = 'https://testproject.supabase.co';
assert.equal(validateSupabaseConfig(url, key()).url, url);
assert.equal(validateSupabaseConfig(url, 'sb_publishable_test').key, 'sb_publishable_test');
for (const [u, k] of [
  [undefined, undefined], [url + '/auth/v1', key()],
  ['https://otherproject.supabase.co', key()], [url, key('service_role')],
  [url, 'sb_secret_test'], [url, 'tu-clave-publica-anon'], [url, 'invalid'],
] as const) {
  assert.throws(() => validateSupabaseConfig(u, k), SupabaseConfigurationError);
}
assert.match(authErrorMessage({ status: 0 }, 'register'), /conectarnos/);
assert.match(authErrorMessage({ status: 503 }, 'register'), /no está disponible/);
assert.match(authErrorMessage({ code: 'weak_password' }, 'register'), /más segura/);

async function verifySignup() {
  let requests = 0;
  const client = createClient(url, key(), {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: async (input, init) => {
      requests++;
      const target = new URL(String(input));
      assert.equal(target.pathname, '/auth/v1/signup');
      assert.equal(target.searchParams.get('redirect_to'), 'http://localhost:3000/auth/callback');
      assert.equal(init?.method, 'POST');
      const body = JSON.parse(String(init?.body));
      assert.equal(body.email, 'test@example.com');
      assert.equal(body.password, 'test-only-password');
      return new Response(JSON.stringify({ user: { id: 'test-user', email: body.email }, session: null }), {
        status: 200, headers: { 'Content-Type': 'application/json' },
      });
    } },
  });
  const { data, error } = await client.auth.signUp({
    email: 'test@example.com', password: 'test-only-password',
    options: { emailRedirectTo: 'http://localhost:3000/auth/callback' },
  });
  assert.equal(error, null);
  assert.equal(data.session, null);
  assert.equal(data.user?.id, 'test-user');
  assert.equal(requests, 1);
}

verifySignup().then(verifyDrafts).then(verifyDraftHook).then(verifyMessageFeatures).then(verifyMessageHttp).then(verifyScheduling).then(verifySchedulingPanel).then(verifyQuota).then(verifyMercadoPago).then(() => console.log('OK: configuración, errores de Auth y signup con transporte simulado.')).catch(() => {
  console.error('Falló la verificación de Auth o borradores.');
  process.exitCode = 1;
});
