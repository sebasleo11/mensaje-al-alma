import { randomUUID } from 'node:crypto';
import type { Message, MessageSchedule, SendAttempt } from '@/utils/supabase/database.types';
import { DEMO_USER } from './mode';
import { letterEmailHtml } from '@/lib/letters/email';

type Store = { messages: Message[]; attempts: SendAttempt[]; schedules: MessageSchedule[]; emails: Record<string, string>; checkinAt: string };
const g = globalThis as unknown as { __almaDemo?: Store };
const iso = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString();
const base = { user_id: DEMO_USER.id, status: 'draft' as const, archived_at: null, release_on_lapse: false, letter_paper: 'clasica', letter_font: 'caveat' };

function seed(): Store {
  const m1: Message = { ...base, id: randomUUID(), recipient_email: 'sofia@ejemplo.com', content_type: 'text', created_at: iso(-9), updated_at: iso(-9), letter_paper: 'azul', letter_font: 'homemade',
    content_body: 'Querida Sofi,\n\nHoy quería contarte algo que nunca supe decirte en voz alta: cada vez que te veo reír, entiendo para qué sirven los días difíciles.\n\nTe abrazo siempre,\nPapá' };
  const m2: Message = { ...base, id: randomUUID(), recipient_email: 'mateo@ejemplo.com', content_type: 'text', created_at: iso(-6), updated_at: iso(-6), letter_paper: 'pergamino', letter_font: 'dancing', release_on_lapse: true,
    content_body: 'Mateo, hijo:\n\nTe dejo la historia de cómo conocí a tu madre, en un colectivo lleno de gente, un martes de lluvia. Quiero que la sepas completa.\n\nCon todo mi amor.' };
  const m3: Message = { ...base, id: randomUUID(), recipient_email: 'abuela.rosa@ejemplo.com', content_type: 'text', created_at: iso(-3), updated_at: iso(-3), letter_paper: 'rosa', letter_font: 'caveat',
    content_body: 'Abuela, feliz cumpleaños. Gracias por las tardes de mate y por enseñarme a no rendirme nunca.' };
  const m4: Message = { ...base, id: randomUUID(), recipient_email: 'lucia@ejemplo.com', content_type: 'text', status: 'sent', created_at: iso(-20), updated_at: iso(-18), letter_paper: 'salvia', letter_font: 'kalam',
    content_body: 'Lu, gracias por estar. Por escucharme cuando nadie más podía. Te quiero mucho.' };
  const when = iso(12);
  const scheduled: MessageSchedule = { id: randomUUID(), message_id: m3.id, user_id: DEMO_USER.id, scheduled_at: when, time_zone: 'America/Argentina/Buenos_Aires', local_datetime: when.slice(0, 10) + 'T09:00', utc_offset_minutes: -180, message_updated_at: m3.updated_at, asset_id: null, version: 1, state: 'scheduled', attempt_id: null, started_at: null, cancelled_at: null, created_at: iso(-2), updated_at: iso(-2), last_error_code: null, confirmation: {} };
  const sentAttempt: SendAttempt = { id: randomUUID(), message_id: m4.id, user_id: DEMO_USER.id, recipient_email: m4.recipient_email, content_type: 'text', content_body: m4.content_body, asset_id: null, email_payload: null, sender: 'Mensaje al Alma <hola@demo.local>', app_url: 'http://localhost:3001/', state: 'delivered', provider_id: 'demo', lease_until: null, revoked_at: null, created_at: iso(-18), updated_at: iso(-18), letter_paper: m4.letter_paper, letter_font: m4.letter_font };
  return { messages: [m3, m2, m1, m4], attempts: [sentAttempt], schedules: [scheduled], emails: { [sentAttempt.id]: letterEmailHtml({ body: sentAttempt.content_body, style: { paper: sentAttempt.letter_paper, font: sentAttempt.letter_font }, link: null }) }, checkinAt: iso(-8) };
}
export function store(): Store { return (g.__almaDemo ??= seed()); }
export function resetDemo() { g.__almaDemo = seed(); }
