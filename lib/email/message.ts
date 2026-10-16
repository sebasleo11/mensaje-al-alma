import { createHmac, timingSafeEqual } from 'node:crypto';
import type { SendAttempt } from '@/utils/supabase/database.types';
export function escapeHtml(value:string){return value.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));}
export function recipientToken(id:string,secret:string){if(secret.length<32)throw new Error('Recipient secret unavailable');return createHmac('sha256',secret).update(`alma-recipient/v1/${id}`).digest('base64url');}
export function validRecipientToken(id:string,token:string,secret:string){if(!/^[A-Za-z0-9_-]{43}$/.test(token))return false;const expected=recipientToken(id,secret);return timingSafeEqual(Buffer.from(token),Buffer.from(expected));}
export function messageEmail(attempt:SendAttempt,secret:string){
 const link=attempt.asset_id?new URL(`/recibir/${attempt.id}`,attempt.app_url).href+'#'+recipientToken(attempt.id,secret):null;
 const text=`Alguien te dejó unas palabras en Mensaje al Alma.\n\n${attempt.content_body}${link?'\n\nAbrí tu mensaje privado: '+link:''}\n\nA tu ritmo, con todo el corazón.`;
 const html=`<!doctype html><html lang="es"><body style="margin:0;background:#faf9f6;color:#283d35;font-family:Arial,sans-serif"><main style="max-width:560px;margin:32px auto;padding:32px;background:#fffefb;border:1px solid #e5e7df;border-radius:14px"><p style="color:#486653">mensaje al alma.</p><h1 style="font-size:24px">Unas palabras para vos.</h1><p style="white-space:pre-wrap;line-height:1.8">${escapeHtml(attempt.content_body)}</p>${link?`<p><a href="${escapeHtml(link)}" style="color:#486653">Abrir mi mensaje privado</a></p>`:''}<p style="color:#78817a;font-size:12px">A tu ritmo, con todo el corazón.</p></main></body></html>`;
 return {from:attempt.sender,to:[attempt.recipient_email],subject:'Un mensaje al alma para vos',html,text,tags:[{name:'alma_attempt',value:attempt.id}]};
}
export function confirmedProviderRejection(status:number|null|undefined,replay:boolean){return !replay && !!status && [400,401,403,422].includes(status);}
