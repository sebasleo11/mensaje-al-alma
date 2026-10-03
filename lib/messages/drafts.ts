import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../../utils/supabase/database.types';

type Client = SupabaseClient<Database>;
export type TextDraftInput = { id: string; userId: string; recipientEmail: string; body: string };

export function isRecipientEmail(value: string) {
  return value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export async function loadLatestTextDraft(client: Client, userId: string) {
  const { data, error } = await client.from('messages')
    .select('*')
    .eq('user_id', userId)
    .eq('content_type', 'text')
    .eq('status', 'draft')
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function saveTextDraft(client: Client, input: TextDraftInput) {
  const recipientEmail = input.recipientEmail.trim();
  if (!isRecipientEmail(recipientEmail) || !input.body.trim() || input.body.length > 5000) {
    throw new Error('Revisá el email y escribí un mensaje de hasta 5000 caracteres.');
  }

  // A stable ID makes retrying safe if an INSERT succeeded but its response was lost.
  const { data: existing, error: lookupError } = await client.from('messages')
    .select('id, status, content_type')
    .eq('id', input.id)
    .eq('user_id', input.userId)
    .maybeSingle();
  if (lookupError) throw lookupError;
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
  const { data, error } = await query.select('*').single();
  if (error) throw error;
  return data;
}
