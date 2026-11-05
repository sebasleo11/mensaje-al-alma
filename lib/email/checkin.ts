import { escapeHtml } from '@/lib/email/message';
import { REMINDER_DAYS } from '@/lib/checkin/policy';

const fmt = (d: Date) => new Intl.DateTimeFormat('es-AR', { dateStyle: 'long', timeZone: 'America/Argentina/Buenos_Aires' }).format(d);

export function checkinReminderEmail(opts: { stage: number; appUrl: string; next: Date | null; scheduledCount: number; legacyCount: number; releaseOn: Date | null }) {
  const final = opts.stage >= REMINDER_DAYS.length;
  const link = new URL('/mis-mensajes', opts.appUrl).href;
  const lines = [
    opts.scheduledCount ? `Tenés ${opts.scheduledCount} mensaje(s) programado(s)${opts.next ? `; el próximo se enviará el ${fmt(opts.next)}` : ''}.` : '',
    opts.legacyCount ? `Tenés ${opts.legacyCount} mensaje(s) que se entregarán si dejás de dar señales de vida.` : '',
    final && opts.releaseOn && opts.legacyCount ? `Si no confirmás antes del ${fmt(opts.releaseOn)}, vamos a entregarlos.` : '',
    'Entrá a tu cuenta y tocá «Estoy bien». Es un solo toque y te da otro mes.',
    'Si querés cambiar alguna fecha, también podés hacerlo desde ahí.',
  ].filter(Boolean);
  const subject = final ? 'Último aviso: confirmá que estás bien' : 'Recordá confirmar que estás bien';
  const text = `${lines.join('\n\n')}\n\nEntrá acá: ${link}`;
  const html = `<!doctype html><html lang="es"><body style="margin:0;background:#faf9f6;font-family:Arial,sans-serif;color:#283d35"><main style="max-width:540px;margin:32px auto;padding:32px;background:#fffefb;border:1px solid #e5e7df;border-radius:14px"><p style="color:#486653;letter-spacing:2px;font-size:12px">MENSAJE AL ALMA</p><h1 style="font-size:22px">${escapeHtml(subject)}</h1>${lines.map(l => `<p style="line-height:1.7">${escapeHtml(l)}</p>`).join('')}<p style="text-align:center;margin:28px 0"><a href="${escapeHtml(link)}" style="background:#486653;color:#fffdf8;text-decoration:none;padding:14px 26px;border-radius:999px;font-weight:600">Estoy bien</a></p></main></body></html>`;
  return { subject, text, html };
}
