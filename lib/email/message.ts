import { createHmac, timingSafeEqual } from 'node:crypto';
import type { SendAttempt } from '@/utils/supabase/database.types';
import { letterEmailHtml } from '@/lib/letters/email';
export function escapeHtml(value:string){return value.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));}
export function recipientToken(id:string,secret:string){if(secret.length<32)throw new Error('Recipient secret unavailable');return createHmac('sha256',secret).update(`alma-recipient/v1/${id}`).digest('base64url');}
export function validRecipientToken(id:string,token:string,secret:string){if(!/^[A-Za-z0-9_-]{43}$/.test(token))return false;const expected=recipientToken(id,secret);return timingSafeEqual(Buffer.from(token),Buffer.from(expected));}
export function messageEmail(attempt:SendAttempt,secret:string){
 const link=attempt.asset_id?new URL(`/recibir/${attempt.id}`,attempt.app_url).href+'#'+recipientToken(attempt.id,secret):null;
 const text=`Alguien te dejó unas palabras en Mensaje al Alma.\n\n${attempt.content_body}${link?'\n\nAbrí tu mensaje privado: '+link:''}\n\nA tu ritmo, con todo el corazón.`;
 // Paper/font come from the attempt once the DB stores them; until then the classic letter is used.
 const style={paper:attempt.letter_paper,font:attempt.letter_font};
 const html=letterEmailHtml({body:attempt.content_body,style,link,kind:attempt.content_type});
 return {from:attempt.sender,to:[attempt.recipient_email],subject:'Un mensaje al alma para vos',html,text,tags:[{name:'alma_attempt',value:attempt.id}]};
}
export function confirmedProviderRejection(status:number|null|undefined,replay:boolean){return !replay && !!status && [400,401,403,422].includes(status);}
