import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Resend } from 'resend';
import { handleSendWelcome } from '../lib/email/welcome-handler';
import { deliverWelcomeEmail, EmailConfigurationError, validateEmailConfiguration } from '../lib/email/welcome';
import { welcomeEmail } from '../emails/welcome';

const user = { id: 'user-123', email: 'owner@example.com', email_confirmed_at: '2026-10-03T12:00:00Z' };
const config = { from: 'Mensaje al Alma <hello@example.com>', appUrl: 'https://alma.example.com/' };
const request = (origin = 'https://alma.example.com') => new Request('https://alma.example.com/api/send-welcome', {
  method: 'POST', headers: { origin, 'content-type': 'application/json' },
  body: JSON.stringify({ to: 'attacker@example.com', html: '<script>attack</script>' }),
});

test('welcome endpoint requires an authenticated user', async () => {
  let sent = false;
  const response = await handleSendWelcome(request(), {
    authenticate: async () => null, appUrl: () => config.appUrl,
    send: async () => { sent = true; return { id: 'email-1' }; },
  });
  assert.equal(response.status, 401);
  assert.equal(sent, false);
});

test('welcome endpoint requires a confirmed account email', async () => {
  let sent = false;
  const response = await handleSendWelcome(request(), {
    authenticate: async () => ({ ...user, email_confirmed_at: undefined }), appUrl: () => config.appUrl,
    send: async () => { sent = true; return { id: 'email-1' }; },
  });
  assert.equal(response.status, 403);
  assert.equal(sent, false);
});

test('welcome endpoint rejects cross-origin requests and absent origins', async () => {
  for (const origin of ['https://other.example.com', 'null', '']) {
    let sent = false;
    const response = await handleSendWelcome(request(origin), {
      authenticate: async () => user, appUrl: () => config.appUrl,
      send: async () => { sent = true; return { id: 'email-1' }; },
    });
    assert.equal(response.status, 403);
    assert.equal(sent, false);
  }
});

test('welcome endpoint ignores caller-supplied recipients and HTML', async () => {
  const response = await handleSendWelcome(request(), {
    authenticate: async () => user, appUrl: () => config.appUrl,
    send: async recipient => { assert.deepEqual(recipient, user); return { id: 'email-1' }; },
  });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: 'accepted', id: 'email-1' });
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
});

test('welcome endpoint masks configuration and provider errors', async () => {
  for (const [error, status] of [[new EmailConfigurationError('RESEND_API_KEY=secret'), 503], [new Error('private provider message'), 502]] as const) {
    const response = await handleSendWelcome(request(), {
      authenticate: async () => user, appUrl: () => config.appUrl,
      send: async () => { throw error; },
    });
    assert.equal(response.status, status);
    assert.doesNotMatch(await response.text(), /secret|private provider|RESEND_API_KEY/);
  }
});

test('Resend SDK sends the server-selected envelope with HTML, text and stable idempotency key', async () => {
  const originalFetch = globalThis.fetch;
  const calls: { headers: Headers; body: Record<string, unknown> }[] = [];
  globalThis.fetch = async (url, options) => {
    assert.equal(String(url), 'https://api.resend.com/emails');
    calls.push({ headers: new Headers(options?.headers), body: JSON.parse(String(options?.body)) });
    return Response.json({ id: 'email-1' });
  };
  try {
    const resend = new Resend('re_test_key');
    const send = resend.emails.send.bind(resend.emails);
    assert.deepEqual(await deliverWelcomeEmail(user, config, send), { id: 'email-1' });
    await deliverWelcomeEmail(user, config, send);
    assert.deepEqual(calls[0].body.to, [user.email]);
    assert.equal(calls[0].body.from, config.from);
    assert.match(String(calls[0].body.html), /https:\/\/alma\.example\.com\//);
    assert.match(String(calls[0].body.text), /Mensaje al Alma/);
    assert.equal(calls[0].headers.get('idempotency-key'), 'welcome/user-123/v1');
    assert.equal(calls[1].headers.get('idempotency-key'), calls[0].headers.get('idempotency-key'));
    assert.doesNotMatch(JSON.stringify(calls[0].body), /re_test_key/);
  } finally { globalThis.fetch = originalFetch; }
});

test('provider errors are rejected rather than marked as accepted', async () => {
  await assert.rejects(deliverWelcomeEmail(user, config, async () => ({
    data: null, error: { name: 'validation_error', message: 'private provider details' }, headers: null,
  })));
});

test('configuration rejects header injection, unsafe links and non-local HTTP', () => {
  assert.deepEqual(validateEmailConfiguration(config.from, config.appUrl), config);
  assert.equal(validateEmailConfiguration(config.from, 'http://localhost:3000').appUrl, 'http://localhost:3000/');
  for (const appUrl of ['javascript:alert(1)', 'http://external.example.com', 'https://user:password@example.com', 'https://example.com/?redirect=evil', 'https://example.com/path']) {
    assert.throws(() => validateEmailConfiguration(config.from, appUrl), EmailConfigurationError);
  }
  assert.throws(() => validateEmailConfiguration('hello@example.com\r\nBcc: other@example.com', config.appUrl), EmailConfigurationError);
  assert.throws(() => validateEmailConfiguration(undefined, config.appUrl), EmailConfigurationError);
});

test('HTML template escapes attribute values', () => {
  const { html } = welcomeEmail('https://example.com/" onmouseover="attack');
  assert.doesNotMatch(html, /href="https:\/\/example\.com\/" onmouseover=/);
  assert.match(html, /&quot;/);
});
