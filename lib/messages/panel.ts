import { isRecipientEmail } from './drafts';
import { PAPERS, FONTS } from '@/lib/letters/styles';
import type { ContentType } from '@/utils/supabase/database.types';
export function messageInput(input: Record<string, unknown>) {
 const email = typeof input.recipient_email === 'string' ? input.recipient_email.trim() : '';
 const text = typeof input.content_body === 'string' ? input.content_body : '';
 const type = input.content_type as ContentType;
 if (!isRecipientEmail(email) || text.length > 5000 || !['text','audio','video','photo'].includes(type) || (type === 'text' && !text.trim())) throw new Error('Invalid message');
 const paper = typeof input.letter_paper === 'string' ? input.letter_paper : 'clasica';
 const font = typeof input.letter_font === 'string' ? input.letter_font : 'caveat';
 if (!PAPERS.some(p => p.id === paper) || !FONTS.some(f => f.id === font)) throw new Error('Invalid style');
 return { recipient_email: email, content_body: text, content_type: type, letter_paper: paper, letter_font: font, release_on_lapse: input.release_on_lapse === true };
}
