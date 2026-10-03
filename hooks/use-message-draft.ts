'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { AuthSessionMissingError, type SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/utils/supabase/client';
import { isSupabaseConfigured } from '@/utils/supabase/config';
import type { Database } from '@/utils/supabase/database.types';
import { isRecipientEmail, loadLatestTextDraft, saveTextDraft } from '@/lib/messages/drafts';

const LOCAL_KEY = 'alma-draft';
type Source = 'local' | 'cloud' | 'unavailable';

async function verifiedUser(client: SupabaseClient<Database>) {
  const { data, error } = await client.auth.getUser();
  // A missing session is expected for visitors. Network/auth failures are not.
  if (error && !(error instanceof AuthSessionMissingError)) throw error;
  return data.user;
}

export function useMessageDraft(isOpen: boolean, onNotice: (text: string) => void) {
  const [client, setClient] = useState<SupabaseClient<Database> | null>(null);
  const [initialized, setInitialized] = useState(false);
  const [configFailed, setConfigFailed] = useState(false);
  const [recipient, setRecipient] = useState('');
  const [message, setMessage] = useState('');
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [source, setSource] = useState<Source>('unavailable');
  const [revision, setRevision] = useState(0);
  const draftId = useRef<string | null>(null);
  const loadedOwner = useRef<string | null | undefined>(undefined);
  const observedOwner = useRef<string | null | undefined>(undefined);
  const generation = useRef(0);
  const saveInFlight = useRef(false);

  useEffect(() => {
    if (!isSupabaseConfigured()) {
      setInitialized(true);
      return;
    }
    try {
      const supabase = createClient();
      setClient(supabase);
      const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
        // No awaited Supabase calls here: Auth holds an internal lock in this callback.
        const owner = session?.user.id ?? null;
        if (event === 'INITIAL_SESSION') observedOwner.current = owner;
        if ((event === 'SIGNED_IN' || event === 'SIGNED_OUT') && observedOwner.current !== owner) {
          observedOwner.current = owner;
          generation.current++;
          loadedOwner.current = undefined;
          draftId.current = null;
          setRecipient('');
          setMessage('');
          setSaved(false);
          setLoading(true);
          setRevision(value => value + 1);
        }
      });
      setInitialized(true);
      return () => subscription.unsubscribe();
    } catch {
      setConfigFailed(true);
      setInitialized(true);
    }
  }, []);

  useEffect(() => {
    if (!isOpen || !initialized) return;
    const current = ++generation.current;
    let active = true;
    setLoading(true);
    setBlocked(false);
    setSaved(false);
    setSource('unavailable');
    setRecipient('');
    setMessage('');
    loadedOwner.current = undefined;
    draftId.current = null;

    async function load() {
      // Let the dialog's opening effect finish before publishing any notices.
      await Promise.resolve();
      try {
        if (configFailed) throw new Error('Invalid configuration');
        const user = client ? await verifiedUser(client) : null;
        const draft = user && client ? await loadLatestTextDraft(client, user.id) : null;
        if (!active || generation.current !== current) return;
        loadedOwner.current = user?.id ?? null;
        observedOwner.current = user?.id ?? null;
        if (user) {
          setSource('cloud');
          draftId.current = draft?.id ?? null;
          setRecipient(draft?.recipient_email ?? '');
          setMessage(draft?.content_body ?? '');
          onNotice(draft ? 'Recuperamos tu último borrador de texto de tu cuenta.' : 'Este borrador se guardará en tu cuenta al tocar Guardar.');
        } else {
          setSource('local');
          const raw = localStorage.getItem(LOCAL_KEY);
          if (raw) {
            const local: unknown = JSON.parse(raw);
            if (typeof local !== 'object' || !local) throw new Error('Invalid local draft');
            const value = local as { recipient?: unknown; message?: unknown };
            const email = typeof value.recipient === 'string' ? value.recipient : '';
            setRecipient(isRecipientEmail(email) ? email : '');
            setMessage(typeof value.message === 'string' ? value.message.slice(0, 5000) : '');
            onNotice(email && !isRecipientEmail(email)
              ? 'Recuperamos tu texto. Ahora agregá el email de esa persona.'
              : 'Recuperamos tu borrador de este navegador.');
          }
        }
      } catch {
        if (!active || generation.current !== current) return;
        loadedOwner.current = undefined;
        setBlocked(true);
        onNotice('No pudimos recuperar tu borrador. Reintentá antes de editar para cuidar tus palabras.');
      } finally {
        if (active && generation.current === current) setLoading(false);
      }
    }
    void load();
    return () => { active = false; generation.current++; };
  }, [isOpen, initialized, client, configFailed, revision, onNotice]);

  async function saveDraft(event: FormEvent) {
    event.preventDefault();
    if (loading || blocked || saveInFlight.current || loadedOwner.current === undefined) return;
    if (!isRecipientEmail(recipient.trim()) || !message.trim() || message.length > 5000) {
      onNotice('Agregá un email válido y unas palabras para guardar tu borrador.');
      return;
    }
    saveInFlight.current = true;
    setSaving(true);
    setSaved(false);
    const current = generation.current;
    try {
      const user = client ? await verifiedUser(client) : null;
      // Never save the old user's visible text into a newly signed-in account.
      if (generation.current !== current) return;
      if ((user?.id ?? null) !== loadedOwner.current) {
        onNotice('Tu sesión cambió. Volvé a abrir el editor antes de guardar.');
        setBlocked(true);
        return;
      }
      if (user && client) {
        const id = draftId.current ?? crypto.randomUUID();
        draftId.current = id;
        await saveTextDraft(client, { id, userId: user.id, recipientEmail: recipient, body: message });
        if (generation.current !== current) return;
        setSaved(true);
        setSource('cloud');
        onNotice('Tu borrador quedó guardado en tu cuenta. No se envió ningún email.');
      } else {
        localStorage.setItem(LOCAL_KEY, JSON.stringify({ version: 1, recipient: recipient.trim(), message }));
        if (generation.current !== current) return;
        setSaved(true);
        setSource('local');
        onNotice('Tu borrador quedó guardado en este navegador. Para sincronizarlo necesitás iniciar sesión.');
      }
    } catch {
      if (generation.current === current) {
        onNotice('No pudimos guardar tu borrador. Tu texto sigue acá: reintentá o copialo para conservarlo.');
      }
    } finally {
      saveInFlight.current = false;
      setSaving(false);
    }
  }

  return {
    recipient, setRecipient, message, setMessage, saved, setSaved,
    loading, saving, blocked, source, saveDraft,
    retry: () => setRevision(value => value + 1),
  };
}
