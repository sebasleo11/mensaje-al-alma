'use client';

import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';
import { validateSupabaseConfig } from './config';
import type { Database } from './database.types';

import { DEMO, DEMO_USER } from '@/lib/demo/mode';

export function createClient(): SupabaseClient<Database> {
  if (DEMO) { // local demo: fixed fake session, no network
    const session = { user: DEMO_USER };
    return { auth: { onAuthStateChange: (cb: (e: string, s: unknown) => void) => { setTimeout(() => cb('INITIAL_SESSION', session), 0); return { data: { subscription: { unsubscribe() {} } } }; }, getUser: async () => ({ data: { user: DEMO_USER }, error: null }), getSession: async () => ({ data: { session }, error: null }), signOut: async () => ({ error: null }) } } as unknown as SupabaseClient<Database>;
  }
  // Static accesses allow Next.js to inline the public values in the browser bundle.
  const { url, key } = validateSupabaseConfig(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
  // The SDK reuses its browser instance; do not cache clients during SSR.
  return createBrowserClient<Database>(url, key, {
    isSingleton: typeof window !== 'undefined',
  });
}
