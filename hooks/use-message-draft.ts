'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { AuthSessionMissingError, type SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/utils/supabase/client';
import { isSupabaseConfigured } from '@/utils/supabase/config';
import type { Database } from '@/utils/supabase/database.types';
import { DraftRequestError, draftRecoveryMessage, isRecipientEmail, loadLatestTextDraft, reportDraftFailure, saveTextDraft, withDraftDeadline } from '@/lib/messages/drafts';
import { LOCAL_DRAFT_KEY, readLocalDraft, writeLocalDraft } from '@/lib/messages/local-draft';

type Source = 'local' | 'cloud' | 'unavailable';

async function verifiedUser(client: SupabaseClient<Database>) {
  const { data, error } = await withDraftDeadline(client.auth.getUser(), 'session');
  // A missing session is expected for visitors. Network/auth failures are not.
  if (error && !(error instanceof AuthSessionMissingError)) throw new DraftRequestError('session', error.code ?? 'unknown', error.status ?? 0);
  return data.user;
}

export function useMessageDraft(isOpen: boolean, onNotice: (text: string) => void) {
  const [client, setClient] = useState<SupabaseClient<Database> | null>(null);
  const [initialized, setInitialized] = useState(false);
  const [configFailed, setConfigFailed] = useState(false);
  const [recipient, setRecipient] = useState('');
  const [message, setMessage] = useState('');
  const [saved, setSaved] = useState(false);
  const [baseline, setBaseline] = useState({ recipient: '', message: '' });
  const dirty = recipient !== baseline.recipient || message !== baseline.message;
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
          setBaseline({ recipient: '', message: '' });
          setSaved(false);
          setSource('unavailable');
          setBlocked(true);
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
    setBlocked(true);
    setSaved(false);
    setSource('unavailable');
    // Keep visible words while retrying; account changes clear them separately.
    loadedOwner.current = undefined;
    draftId.current = null;
    const controller = new AbortController();

    async function load() {
      // Let the dialog's opening effect finish before publishing any notices.
      await Promise.resolve();
      try {
        if (configFailed) throw new Error('Invalid configuration');
        const user = client ? await verifiedUser(client) : null;
        const draft = user && client ? await loadLatestTextDraft(client, user.id, controller.signal) : null;
        if (!active || generation.current !== current) return;
        if (user) {
          setSource('cloud');
          draftId.current = draft?.id ?? null;
          setRecipient(draft?.recipient_email ?? '');
          setMessage(draft?.content_body ?? '');
          setBaseline({ recipient: draft?.recipient_email ?? '', message: draft?.content_body ?? '' });
          let hasLocalDraft = false;
          // Browser storage may be disabled; it must not block cloud recovery.
          try { hasLocalDraft = localStorage.getItem(LOCAL_DRAFT_KEY) !== null; } catch {}
          onNotice(draft ? 'Recuperamos tu último borrador de texto de tu cuenta.' : hasLocalDraft
            ? 'No encontramos un borrador en esta cuenta. Hay uno guardado en este navegador; para revisarlo, cerrá sesión acá. No lo movimos a tu cuenta.'
            : 'Este borrador se guardará en tu cuenta al tocar Guardar.');
        } else {
          const local = readLocalDraft(localStorage);
          setRecipient(local?.recipient ?? '');
          setMessage(local?.message ?? '');
          setBaseline({ recipient: local?.recipient ?? '', message: local?.message ?? '' });
          setSource('local');
          if (local) {
            onNotice(local.needsEmail
              ? 'Recuperamos tu texto. Ahora agregá el email de esa persona.'
              : 'Recuperamos tu borrador de este navegador.');
          } else onNotice('Este borrador se guardará en este navegador al tocar Guardar.');
        }
        loadedOwner.current = user?.id ?? null;
        observedOwner.current = user?.id ?? null;
        setBlocked(false);
      } catch (error) {
        if (!active || generation.current !== current) return;
        controller.abort();
        loadedOwner.current = undefined;
        setSource('unavailable');
        setBlocked(true);
        reportDraftFailure('load', error);
        onNotice(draftRecoveryMessage(error));
      } finally {
        if (active && generation.current === current) setLoading(false);
      }
    }
    void load();
    return () => { active = false; generation.current++; controller.abort(); };
  }, [isOpen, initialized, client, configFailed, revision, onNotice]);

  async function saveCurrentDraft() {
    if (loading || blocked || saveInFlight.current || loadedOwner.current === undefined) return null;
    if (!isRecipientEmail(recipient.trim()) || !message.trim() || message.length > 5000) {
      onNotice('Agregá un email válido y unas palabras para guardar tu borrador.');
      return null;
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
        onNotice('Tu borrador quedó guardado en tu cuenta. No se envió ni se programó ningún email.');
        setBaseline({ recipient, message });
        return { source: 'cloud' as const, id };
      } else {
        writeLocalDraft(localStorage, recipient, message);
        if (generation.current !== current) return;
        setSaved(true);
        setSource('local');
        onNotice('Tu borrador quedó guardado en este navegador. No se envía ni se mueve automáticamente a una cuenta.');
        setBaseline({ recipient, message });
        return { source: 'local' as const, id: null };
      }
    } catch (error) {
      if (generation.current === current) {
        reportDraftFailure('save', error);
        onNotice('No pudimos guardar tu borrador. Tu texto sigue acá: reintentá o copialo para conservarlo.');
      }
    } finally {
      saveInFlight.current = false;
      setSaving(false);
    }
  }

  async function saveDraft(event: FormEvent) {
    event.preventDefault();
    await saveCurrentDraft();
  }

  return {
    recipient, setRecipient, message, setMessage, saved, setSaved,
    loading, saving, blocked, source, dirty, saveDraft, saveCurrentDraft,
    retry: () => { if (!loading && !saving) setRevision(value => value + 1); },
  };
}
