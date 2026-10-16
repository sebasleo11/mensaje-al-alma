import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import type { Database, Message } from '../utils/supabase/database.types';
import { DraftRequestError, loadLatestTextDraft, saveTextDraft, withDraftDeadline } from '../lib/messages/drafts';
import { LOCAL_DRAFT_KEY, readLocalDraft, writeLocalDraft } from '../lib/messages/local-draft';

export async function verifyDrafts() {
  const records: Message[] = [{ id: 'old-draft', user_id: 'owner-a', recipient_email: 'recipient@example.com', content_type: 'text', content_body: 'Palabras anteriores', status: 'draft', created_at: '2026-10-03T12:00:00Z' }];
  let owner = 'owner-a';
  let failure = false;
  let writes = 0;
  const client = createClient<Database>('https://testproject.supabase.co', 'sb_publishable_test', {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: async (input, init) => {
      const url = new URL(String(input));
      assert.equal(url.pathname, '/rest/v1/messages');
      assert.equal(url.searchParams.get('user_id'), `eq.${owner}`);
      if (failure) return new Response(JSON.stringify({ code: 'PGRST205', message: 'Table unavailable' }), { status: 404 });
      let rows = records.filter(row => row.user_id === owner);
      const id = url.searchParams.get('id');
      if (id) rows = rows.filter(row => `eq.${row.id}` === id);
      if (init?.method === 'PATCH') {
        writes++;
        assert.equal(url.searchParams.get('status'), 'eq.draft');
        assert.equal(url.searchParams.get('content_type'), 'eq.text');
        Object.assign(rows[0], JSON.parse(String(init.body)));
      } else if (init?.method === 'POST') {
        writes++;
        const row = { ...JSON.parse(String(init.body)), created_at: '2026-10-04T12:00:00Z' };
        assert.equal(row.user_id, owner);
        records.push(row); rows = [row];
      } else if (!id) {
        assert.equal(url.searchParams.get('status'), 'eq.draft');
        assert.equal(url.searchParams.get('content_type'), 'eq.text');
        assert.equal(url.searchParams.get('limit'), '1');
        rows = rows.slice(-1);
      }
      const headers = new Headers(init?.headers);
      return new Response(JSON.stringify(headers.get('accept')?.includes('vnd.pgrst.object') ? rows[0] : rows), { status: 200, headers: { 'Content-Type': 'application/json' } });
    } },
  });
  const before = await loadLatestTextDraft(client, owner);
  assert.equal(before?.content_body, 'Palabras anteriores');
  await saveTextDraft(client, { id: before!.id, userId: owner, recipientEmail: before!.recipient_email, body: 'Palabras anteriores y nuevas' });
  const reopened = await loadLatestTextDraft(client, owner);
  assert.equal(reopened?.id, before?.id);
  assert.equal(reopened?.content_body, 'Palabras anteriores y nuevas');
  assert.equal(records.length, 1);
  failure = true;
  await assert.rejects(loadLatestTextDraft(client, owner), error => error instanceof DraftRequestError && error.code === 'PGRST205' && error.status === 404);
  assert.equal(writes, 1);
  failure = false;
  assert.equal((await loadLatestTextDraft(client, owner))?.content_body, reopened?.content_body);
  owner = 'owner-b';
  assert.equal(await loadLatestTextDraft(client, owner), null);
  assert.equal(records[0].user_id, 'owner-a');
  await assert.rejects(withDraftDeadline(new Promise(() => {}), 'session', 10), error => error instanceof DraftRequestError && error.code === 'timeout');
  await assert.rejects(withDraftDeadline(new Promise(() => {}), 'load', 10), error => error instanceof DraftRequestError && error.code === 'timeout');

  const items = new Map<string, string>();
  const storage = { getItem: (key: string) => items.get(key) ?? null, setItem: (key: string, value: string) => { items.set(key, value); } };
  assert.equal(readLocalDraft(storage), null);
  const legacy = JSON.stringify({ recipient: 'Persona querida', message: 'Texto original', unrelated: 'never copy' });
  items.set(LOCAL_DRAFT_KEY, legacy);
  assert.deepEqual(readLocalDraft(storage), { recipient: '', message: 'Texto original', needsEmail: true });
  assert.equal(items.get(LOCAL_DRAFT_KEY), legacy);
  writeLocalDraft(storage, 'recipient@example.com', 'Texto original y nuevo');
  assert.deepEqual(JSON.parse(items.get('alma-draft-backup')!), { recipient: 'Persona querida', message: 'Texto original' });
  assert.equal(readLocalDraft(storage)?.message, 'Texto original y nuevo');
  items.set(LOCAL_DRAFT_KEY, JSON.stringify({ message: 'x'.repeat(5100) }));
  assert.equal(readLocalDraft(storage)?.message.length, 5100);
  items.set(LOCAL_DRAFT_KEY, '{invalid');
  assert.throws(() => readLocalDraft(storage));
  assert.equal(items.get(LOCAL_DRAFT_KEY), '{invalid');
  console.log('OK: recuperación, actualización con ID estable, reapertura, error/reintento, filtros de propietario, timeout y copia local. Transporte simulado; no verifica RLS remoto.');
}
