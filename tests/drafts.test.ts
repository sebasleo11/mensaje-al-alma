import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createClient } from '@supabase/supabase-js';
import type { Database, Message } from '../utils/supabase/database.types';
import { loadLatestTextDraft, saveTextDraft } from '../lib/messages/drafts';

const row: Message = {
  id: '00000000-0000-4000-8000-000000000001',
  user_id: '00000000-0000-4000-8000-000000000002',
  recipient_email: 'persona@example.com', content_type: 'text',
  content_body: 'Gracias por estar.', status: 'draft', created_at: '2026-10-03T12:00:00Z',
};
const input = { id: row.id, userId: row.user_id, recipientEmail: row.recipient_email, body: row.content_body };
type Call = { url: URL; method: string; body: Record<string, unknown> | null };
function mockClient(respond: (call: Call) => { body: unknown; status?: number }) {
  const calls: Call[] = [];
  const client = createClient<Database>('https://test.supabase.co', 'test-public-key', {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: async (url, init) => {
        const call: Call = {
          url: new URL(String(url)), method: init?.method ?? 'GET',
          body: init?.body ? JSON.parse(String(init.body)) : null,
        };
        calls.push(call);
        const result = respond(call);
        return new Response(JSON.stringify(result.body), {
          status: result.status ?? 200, headers: { 'Content-Type': 'application/json' },
        });
      },
    },
  });
  return { client, calls };
}

test('loads only the latest text draft of the current user', async () => {
  const { client, calls } = mockClient(() => ({ body: [row] }));
  assert.deepEqual(await loadLatestTextDraft(client, row.user_id), row);
  const params = calls[0].url.searchParams;
  assert.equal(params.get('user_id'), `eq.${row.user_id}`);
  assert.equal(params.get('status'), 'eq.draft');
  assert.equal(params.get('content_type'), 'eq.text');
  assert.equal(params.get('limit'), '1');
  assert.equal(params.get('order'), 'created_at.desc,id.desc');
});

test('inserts a new draft with the authenticated owner and stable ID', async () => {
  const { client, calls } = mockClient(call => ({ body: call.method === 'GET' ? [] : row }));
  assert.deepEqual(await saveTextDraft(client, input), row);
  assert.equal(calls[1].method, 'POST');
  assert.deepEqual(calls[1].body, {
    id: row.id, user_id: row.user_id, recipient_email: row.recipient_email,
    content_body: row.content_body, content_type: 'text', status: 'draft',
  });
});

test('updates the existing draft without rewriting owner, creation date or status', async () => {
  const { client, calls } = mockClient(call => ({ body: call.method === 'GET' ? [row] : row }));
  await saveTextDraft(client, { ...input, body: 'Un nuevo texto.' });
  assert.equal(calls[1].method, 'PATCH');
  assert.deepEqual(calls[1].body, { recipient_email: row.recipient_email, content_body: 'Un nuevo texto.' });
  assert.equal(calls[1].url.searchParams.get('id'), `eq.${row.id}`);
  assert.equal(calls[1].url.searchParams.get('user_id'), `eq.${row.user_id}`);
  assert.equal(calls[1].url.searchParams.get('status'), 'eq.draft');
  assert.equal(calls[1].url.searchParams.get('content_type'), 'eq.text');
});

test('a retry after a lost insert response updates the same record', async () => {
  let persisted = false;
  const { client, calls } = mockClient(call => {
    if (call.method === 'GET') return { body: persisted ? [row] : [] };
    if (call.method === 'POST') {
      persisted = true;
      return { status: 503, body: { message: 'Response unavailable' } };
    }
    return { body: row };
  });
  await assert.rejects(saveTextDraft(client, input));
  await saveTextDraft(client, input);
  assert.deepEqual(calls.map(call => call.method), ['GET', 'POST', 'GET', 'PATCH']);
});

test('does not overwrite messages that are no longer text drafts', async () => {
  for (const changed of [{ status: 'sent' }, { content_type: 'audio' }]) {
    const { client, calls } = mockClient(() => ({ body: [{ ...row, ...changed }] }));
    await assert.rejects(saveTextDraft(client, input), /ya no es un borrador/);
    assert.equal(calls.length, 1);
  }
});

test('rejects invalid email, empty body and oversized text before querying', async () => {
  const { client, calls } = mockClient(() => ({ body: [] }));
  for (const changed of [{ recipientEmail: 'un nombre' }, { body: '  ' }, { body: 'a'.repeat(5001) }]) {
    await assert.rejects(saveTextDraft(client, { ...input, ...changed }));
  }
  assert.equal(calls.length, 0);
});

test('database permission errors propagate instead of reporting a successful save', async () => {
  const { client } = mockClient(() => ({ status: 403, body: { code: '42501', message: 'Access denied' } }));
  await assert.rejects(saveTextDraft(client, input), { code: '42501' });
  await assert.rejects(loadLatestTextDraft(client, row.user_id), { code: '42501' });
});
