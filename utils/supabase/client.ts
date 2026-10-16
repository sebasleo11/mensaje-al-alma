'use client';

import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';
import { validateSupabaseConfig } from './config';
import type { Database } from './database.types';

export function createClient(): SupabaseClient<Database> {
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
