import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { transformSync } from 'esbuild';
import * as sdk from '@supabase/supabase-js';
import * as drafts from '../lib/messages/drafts';
import * as local from '../lib/messages/local-draft';

// Run the actual hook with controlled hook primitives and HTTP/session adapters.
// This checks state transitions, not DOM/browser integration or remote RLS.
export async function verifyDraftHook() {
  const slots: any[] = [];
  const effects: (() => void)[] = [];
  let cursor = 0;
  let dirty = true;
  let open = true;
  let view: any;
  let notice = '';
  const onNotice = (text: string) => { notice = text; };
  const react = {
    useState(initial: any) {
      const index = cursor++;
      slots[index] ??= { value: initial };
      return [slots[index].value, (value: any) => {
        const next = typeof value === 'function' ? value(slots[index].value) : value;
        if (!Object.is(next, slots[index].value)) { slots[index].value = next; dirty = true; }
      }];
    },
    useRef(initial: any) { const index = cursor++; slots[index] ??= { current: initial }; return slots[index]; },
    useEffect(effect: () => any, deps: any[]) {
      const index = cursor++;
      const prior = slots[index];
      if (!prior || deps.some((value, i) => !Object.is(value, prior.deps[i]))) {
        effects.push(() => { prior?.cleanup?.(); slots[index] = { deps, cleanup: effect() }; });
      }
    },
  };
  let owner: string | null = 'owner-a';
  let loadFails = true;
  let sessionHangs = false;
  let delayed: ((value: any) => void) | undefined;
  let delayLoad = false;
  const record = { id: 'draft-a', recipient_email: 'recipient@example.com', content_body: 'Original' };
  let authChanged: any;
  const client = { auth: {
    getUser: () => sessionHangs ? new Promise(() => {}) : Promise.resolve({ data: { user: owner ? { id: owner } : null }, error: null }),
    onAuthStateChange: (callback: any) => { authChanged = callback; return { data: { subscription: { unsubscribe() {} } } }; },
  } };
  const items = new Map<string, string>([['alma-draft', JSON.stringify({ recipient: 'Persona querida', message: 'Local anterior' })]]);
  const storage = { getItem: (key: string) => items.get(key) ?? null, setItem: (key: string, value: string) => { items.set(key, value); } };
  let writes = 0;
  const source = transformSync(readFileSync('hooks/use-message-draft.ts', 'utf8'), { loader: 'ts', format: 'cjs' }).code;
  const module = { exports: {} as any };
  vm.runInNewContext(source, {
    module, exports: module.exports, AbortController, crypto: globalThis.crypto, localStorage: storage,
    require: (name: string) => {
      if (name === 'react') return react;
      if (name === '@supabase/supabase-js') return sdk;
      if (name === '@/utils/supabase/client') return { createClient: () => client };
      if (name === '@/utils/supabase/config') return { isSupabaseConfigured: () => true };
      if (name === '@/lib/messages/local-draft') return local;
      if (name === '@/lib/messages/drafts') return {
        ...drafts, reportDraftFailure: () => {},
        withDraftDeadline: (request: any, stage: any) => drafts.withDraftDeadline(request, stage, 20),
        loadLatestTextDraft: async (_client: any, userId: string) => {
          if (delayLoad) return new Promise(resolve => { delayed = resolve; });
          if (loadFails) throw new drafts.DraftRequestError('load', 'PGRST205', 404);
          return userId === 'owner-a' ? { ...record } : null;
        },
        saveTextDraft: async (_client: any, input: any) => {
          assert.equal(input.userId, 'owner-a'); assert.equal(input.id, 'draft-a');
          writes++; record.content_body = input.body;
        },
      };
      throw new Error('Unexpected module');
    },
  });
  async function flush() {
    for (let i = 0; i < 12; i++) {
      if (dirty) { dirty = false; cursor = 0; view = module.exports.useMessageDraft(open, onNotice); while (effects.length) effects.shift()!(); }
      await new Promise<void>(resolve => setImmediate(resolve));
    }
    assert.equal(dirty, false, 'Hook should settle without a render loop');
  }
  await flush();
  assert.equal(view.loading, false); assert.equal(view.blocked, true);
  assert.match(notice, /acceder/); assert.equal(writes, 0);
  assert.equal(await view.saveCurrentDraft(), null, 'Blocked recovery must prevent transition');
  loadFails = false; view.retry(); await flush();
  assert.equal(view.blocked, false); assert.equal(view.message, 'Original');
  assert.equal(view.dirty, false);
  view.setMessage('Original y editado'); await flush();
  assert.equal(view.dirty, true);
  const transition = await view.saveCurrentDraft(); await flush();
  assert.equal(transition.source, 'cloud'); assert.equal(transition.id, 'draft-a');
  assert.equal(view.dirty, false);
  assert.equal(view.saved, true); assert.equal(writes, 1);
  open = false; dirty = true; await flush(); open = true; dirty = true; await flush();
  assert.equal(view.message, 'Original y editado');
  loadFails = true; view.retry(); await flush();
  assert.equal(view.message, 'Original y editado'); assert.equal(view.blocked, true);
  loadFails = false; view.retry(); await flush();
  sessionHangs = true; view.retry(); await flush();
  await new Promise(resolve => setTimeout(resolve, 30)); await flush();
  assert.equal(view.loading, false); assert.equal(view.blocked, true);
  assert.equal(view.message, 'Original y editado'); sessionHangs = false;
  delayLoad = true; view.retry(); await flush(); assert.equal(view.loading, true);
  owner = 'owner-b'; delayLoad = false; authChanged('SIGNED_IN', { user: { id: owner } }); await flush();
  assert.equal(view.message, ''); assert.equal(view.blocked, false);
  assert.match(notice, /No encontramos/); assert.match(notice, /No lo movimos/);
  delayed!({ ...record }); await flush(); assert.equal(view.message, '');
  owner = null; authChanged('SIGNED_OUT', null); await flush();
  assert.equal(view.message, 'Local anterior'); assert.equal(view.source, 'local');
  assert.equal(items.get('alma-draft'), JSON.stringify({ recipient: 'Persona querida', message: 'Local anterior' }));
  view.setRecipient('local@example.com'); await flush();
  const localTransition = await view.saveCurrentDraft(); await flush();
  assert.equal(localTransition.source, 'local'); assert.equal(localTransition.id, null);
  assert.equal(JSON.parse(items.get('alma-draft')!).message, 'Local anterior');
  assert.equal(writes, 1, 'Anonymous transition must not write to an account');
  assert.equal(view.dirty, false);
  view.setMessage(''); await flush();
  assert.equal(await view.saveCurrentDraft(), null, 'Invalid edits must prevent transition');
  assert.equal(view.dirty, true);
  for (const slot of slots) slot?.cleanup?.();
  console.log('OK: hook real con adaptadores controlados: recuperación, edición/guardado/reapertura, timeout, reintento, respuesta antigua y cambio de cuenta sin importar borrador local.');
}
