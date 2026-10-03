'use client';

import { useEffect, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { createClient } from '@/utils/supabase/client';
import { isSupabaseConfigured } from '@/utils/supabase/config';

/** Session state for UI only. Database authorization remains enforced by RLS. */
export function useAuthUser() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isSupabaseConfigured()) {
      setLoading(false);
      return;
    }
    let active = true;
    let version = 0;
    try {
      const supabase = createClient();
      const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
        version++;
        if (active) {
          setUser(session?.user ?? null);
          setLoading(false);
        }
      });
      const initialVersion = version;
      void supabase.auth.getUser().then(({ data, error }) => {
        if (active && version === initialVersion) {
          setUser(error ? null : data.user);
          setLoading(false);
        }
      }).catch(() => {
        if (active && version === initialVersion) {
          setUser(null);
          setLoading(false);
        }
      });
      return () => { active = false; subscription.unsubscribe(); };
    } catch {
      setLoading(false);
    }
  }, []);

  return { user, loading };
}
