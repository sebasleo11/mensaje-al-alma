import { isRecipientEmail } from './drafts';
import type { ContentType } from '@/utils/supabase/database.types';
export function messageInput(input: Record<string, unknown>) {
 const email = typeof input.recipient_email === 'string' ? input.recipient_email.trim() : '';
 const text = typeof input.content_body === 'string' ? input.content_body : '';
 const type = input.content_type as ContentType;
 if (!isRecipientEmail(email) || text.length > 5000 || !['text','audio','video','photo'].includes(type) || (type === 'text' && !text.trim())) throw new Error('Invalid message');
 return { recipient_email: email, content_body: text, content_type: type };
}
