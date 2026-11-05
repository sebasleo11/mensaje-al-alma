import { randomUUID } from 'node:crypto';
import { body, handled, HttpError, reply, validId } from '@/lib/messages/http';
import { messageInput } from '@/lib/messages/panel';
import { messageEmail } from '@/lib/email/message';
import { dueAt } from '@/lib/checkin/policy';
import type { MessageSchedule, SendAttempt } from '@/utils/supabase/database.types';
import { DEMO_USER } from './mode';
import { store } from './store';

const now = () => new Date().toISOString();
const active = (s: MessageSchedule) => ['scheduled', 'blocked', 'dispatching'].includes(s.state);
function quota() {
  const s = store();
  const used = s.attempts.filter(a => a.state !== 'failed').length + s.schedules.filter(x => ['scheduled', 'blocked'].includes(x.state)).length;
  return { limit: 3, additional: 0, used, remaining: Math.max(0, 3 - used) };
}
const attemptFor = (id: string) => store().attempts.filter(a => a.message_id === id).at(-1) ?? null;
const locked = (id: string) => !!attemptFor(id) || store().schedules.some(s => s.message_id === id && active(s));

export const demoList = () => handled(async () => { const s = store(); return reply({ quota: quota(), schedules: s.schedules, schedulingAvailable: true, messages: s.messages, attempts: s.attempts, used: quota().used }); });

export const demoCreate = (request: Request) => handled(async () => {
  const input = await body(request); let fields; try { fields = messageInput(input); } catch { throw new HttpError(400, 'Agregá un email válido y revisá tu mensaje.'); }
  const id = validId(String(input.id)), s = store(), existing = s.messages.find(m => m.id === id);
  if (existing) return reply({ message: existing });
  const message = { ...fields, id, user_id: DEMO_USER.id, status: 'draft' as const, archived_at: null, created_at: now(), updated_at: now() };
  s.messages.unshift(message); return reply({ message }, 201);
});

export const demoGet = (id: string) => handled(async () => {
  const s = store(), message = s.messages.find(m => m.id === validId(id));
  if (!message) throw new HttpError(404, 'No encontramos ese mensaje en tu cuenta.');
  return reply({ schedule: s.schedules.find(x => x.message_id === id && active(x)) ?? null, schedulingAvailable: true, message, asset: null, mediaUrl: null, attempt: attemptFor(id) });
});

export const demoUpdate = (request: Request, id: string) => handled(async () => {
  const s = store(), m = s.messages.find(x => x.id === validId(id));
  let fields; try { fields = messageInput(await body(request)); } catch { throw new HttpError(400, 'Revisá el destinatario y el contenido.'); }
  if (!m || m.content_type !== fields.content_type) throw new HttpError(409, 'Creá otro mensaje para elegir un formato distinto.');
  if (m.status !== 'draft' || locked(id)) throw new HttpError(409, 'Este mensaje está protegido mientras comprobamos su envío. Tus cambios siguen en el editor.');
  Object.assign(m, fields, { updated_at: now() }); return reply({ message: m });
});

export const demoDelete = (id: string) => handled(async () => {
  const s = store(), m = s.messages.find(x => x.id === validId(id));
  if (!m || m.status !== 'draft' || locked(id)) throw new HttpError(409, 'Sólo podés eliminar borradores sin envíos pendientes.');
  s.messages = s.messages.filter(x => x.id !== id); return reply({ deleted: true });
});

export const demoSend = (id: string) => handled(async () => {
  const s = store(), m = s.messages.find(x => x.id === validId(id));
  if (!m || m.status !== 'draft' || locked(id)) throw new HttpError(409, 'No pudimos preparar el envío.');
  if (quota().remaining === 0) throw new HttpError(409, 'No te quedan envíos disponibles. Podés seguir guardando borradores.');
  const attempt: SendAttempt = { id: randomUUID(), message_id: m.id, user_id: m.user_id, recipient_email: m.recipient_email, content_type: m.content_type, content_body: m.content_body, asset_id: null, email_payload: null, sender: 'Mensaje al Alma <hola@demo.local>', app_url: 'http://localhost:3001/', state: 'accepted', provider_id: 'demo', lease_until: null, revoked_at: null, created_at: now(), updated_at: now(), letter_paper: m.letter_paper, letter_font: m.letter_font };
  s.attempts.push(attempt); m.status = 'sent';
  s.emails[attempt.id] = String(messageEmail(attempt, 'demo'.repeat(10)).html);
  return reply({ state: 'accepted', attemptId: attempt.id });
});

export const demoSchedule = (request: Request, id: string) => handled(async () => {
  const s = store(), m = s.messages.find(x => x.id === validId(id)), input = await body(request);
  if (!m) throw new HttpError(404, 'No encontramos ese mensaje.');
  const sid = validId(String(input.scheduleId));
  if (input.action === 'cancel') { const sch = s.schedules.find(x => x.id === sid); if (!sch) throw new HttpError(409, 'No encontramos una programación activa para este mensaje.'); sch.state = 'cancelled'; sch.cancelled_at = now(); sch.version++; return reply({ schedule: sch }); }
  if (typeof input.localDatetime !== 'string' || typeof input.timeZone !== 'string') throw new HttpError(400, 'Revisá fecha y zona.');
  const offset = Number(input.utcOffsetMinutes ?? -180);
  const at = new Date(Date.parse(input.localDatetime + (input.localDatetime.length === 16 ? ':00Z' : 'Z')) - offset * 60000);
  if (!Number.isFinite(at.getTime()) || at.getTime() < Date.now() + 5 * 60000) throw new HttpError(409, 'Programá con al menos 5 minutos de anticipación.');
  let sch = s.schedules.find(x => x.id === sid);
  if (input.action === 'reschedule' && sch) { Object.assign(sch, { scheduled_at: at.toISOString(), time_zone: input.timeZone, local_datetime: input.localDatetime, utc_offset_minutes: offset, version: sch.version + 1, updated_at: now() }); return reply({ schedule: sch }); }
  if (!sch) {
    if (quota().remaining === 0) throw new HttpError(409, 'No te quedan envíos disponibles.');
    sch = { id: sid, message_id: m.id, user_id: m.user_id, scheduled_at: at.toISOString(), time_zone: input.timeZone, local_datetime: input.localDatetime, utc_offset_minutes: offset, message_updated_at: m.updated_at, asset_id: null, version: 1, state: 'scheduled', attempt_id: null, started_at: null, cancelled_at: null, created_at: now(), updated_at: now(), last_error_code: null, confirmation: {} };
    s.schedules.unshift(sch);
  }
  return reply({ schedule: sch });
});

const view = () => ({ lastCheckinAt: store().checkinAt, dueAt: dueAt(new Date(store().checkinAt)).toISOString(), released: false });
export const demoCheckin = (post: boolean) => handled(async () => { if (post) store().checkinAt = now(); return reply({ checkin: view() }); });

export const demoRecipient = (request: Request) => handled(async () => {
  const input = await body(request), a = store().attempts.find(x => x.id === input.id);
  if (!a) throw new HttpError(404, 'Este enlace no está disponible.');
  return reply({ content: a.content_body, format: a.content_type, mediaUrl: null, style: { paper: a.letter_paper, font: a.letter_font } });
});
