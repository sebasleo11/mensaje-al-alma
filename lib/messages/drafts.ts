import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../../utils/supabase/database.types';

type Client = SupabaseClient<Database>;
export type TextDraftInput = { id: string; userId: string; recipientEmail: string; body: string };
export const DRAFT_TIMEOUT_MS = 15_000;
export class DraftRequestError extends Error {
  constructor(public stage: 'session' | 'load' | 'save', public code: string, public status: number) {
    super('Draft request failed');
    this.name = 'DraftRequestError';
  }
}

export async function withDraftDeadline<T>(request: PromiseLike<T>, stage: DraftRequestError['stage'], timeout = DRAFT_TIMEOUT_MS): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Promise.resolve(request),
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new DraftRequestError(stage, 'timeout', 0)), timeout); }),
    ]);
  } finally { clearTimeout(timer); }
}

export function draftRecoveryMessage(error: unknown) {
  const failure = error as { code?: string; status?: number } | null;
  if (failure?.code === 'PGRST205' || failure?.code === 'PGRST204') {
    return 'Por ahora no podemos acceder a tus borradores guardados. Tus palabras no se reemplazaron. Reintentá cuando se restablezca el acceso.';
  }
  if (failure?.status === 401 || failure?.code === 'session_not_found' || failure?.code === 'refresh_token_not_found') {
    return 'Necesitamos que vuelvas a iniciar sesión para recuperar tus palabras.';
  }
  if (failure?.status === 403 || failure?.code === '42501') {
    return 'No pudimos acceder a tu borrador con esta cuenta. Tus palabras no se reemplazaron.';
  }
  return 'No pudimos recuperar tu borrador. Reintentá antes de editar para cuidar tus palabras.';
}

export function reportDraftFailure(stage: DraftRequestError['stage'], error: unknown) {
  const failure = error as { code?: unknown; status?: unknown } | null;
  // Only fixed metadata: never log SDK messages, HTML, IDs, content or tokens.
  console.warn('No se pudo completar el acceso al borrador.', {
    stage: error instanceof DraftRequestError ? error.stage : stage,
    code: typeof failure?.code === 'string' && /^(PGRST\d{3}|\d{5}|timeout|session_not_found|refresh_token_not_found)$/.test(failure.code) ? failure.code : 'unknown',
    status: typeof failure?.status === 'number' ? failure.status : null,
  });
}

export function isRecipientEmail(value: string) {
  return value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export async function loadLatestTextDraft(client: Client, userId: string, signal = AbortSignal.timeout(DRAFT_TIMEOUT_MS)) {
  const { data, error, status } = await withDraftDeadline(client.from('messages')
    .select('*')
    .eq('user_id', userId)
    .eq('content_type', 'text')
    .eq('status', 'draft')
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(1)
    .abortSignal(signal)
    .maybeSingle(), 'load');
  if (error) throw new DraftRequestError('load', error.code, status);
  return data;
}

export async function saveTextDraft(client: Client, input: TextDraftInput) {
  const recipientEmail = input.recipientEmail.trim();
  if (!isRecipientEmail(recipientEmail) || !input.body.trim() || input.body.length > 5000) {
    throw new Error('Revisá el email y escribí un mensaje de hasta 5000 caracteres.');
  }

  // A stable ID makes retrying safe if an INSERT succeeded but its response was lost.
  const signal = AbortSignal.timeout(DRAFT_TIMEOUT_MS);
  const { data: existing, error: lookupError, status: lookupStatus } = await withDraftDeadline(client.from('messages')
    .select('id, status, content_type')
    .eq('id', input.id)
    .eq('user_id', input.userId)
    .abortSignal(signal)
    .maybeSingle(), 'save');
  if (lookupError) throw new DraftRequestError('save', lookupError.code, lookupStatus);
  if (existing && (existing.status !== 'draft' || existing.content_type !== 'text')) {
    throw new Error('Este mensaje ya no es un borrador. Volvé a abrir el editor.');
  }

  const fields = { recipient_email: recipientEmail, content_body: input.body };
  const query = existing
    ? client.from('messages').update(fields)
      .eq('id', input.id).eq('user_id', input.userId)
      .eq('status', 'draft').eq('content_type', 'text')
    : client.from('messages').insert({
      id: input.id, user_id: input.userId, ...fields, content_type: 'text', status: 'draft',
    });
  const { data, error, status } = await withDraftDeadline(query.select('*').abortSignal(signal).single(), 'save');
  if (error) throw new DraftRequestError('save', error.code, status);
  return data;
}
