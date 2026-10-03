function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[char]!);
}

/** Standalone HTML with inline styles: no app CSS, tracking pixels or external assets. */
export function welcomeEmail(appUrl: string) {
  const link = escapeHtml(appUrl);
  return {
    subject: 'Tus palabras ya tienen un lugar — Mensaje al Alma',
    text: `Bienvenido a Mensaje al Alma.\n\nUn gracias, un te quiero, un acá estoy. No necesitás las palabras perfectas: solo las tuyas.\n\nYa podés empezar un borrador y retomarlo a tu ritmo.\n\nEntrá a tu espacio: ${appUrl}\n\nSin apuro. Con todo tu corazón.\nMensaje al Alma`,
    html: `<!DOCTYPE html>
<html lang="es-AR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Mensaje al Alma</title></head>
<body style="margin:0;padding:0;background:#faf9f6;color:#283d35;font-family:Arial,Helvetica,sans-serif;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">Un espacio para esas palabras que llevás en el corazón.</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#faf9f6;"><tr><td align="center" style="padding:40px 16px;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#fffefb;border:1px solid #e5e7df;border-radius:16px;"><tr><td style="padding:40px 28px;">
<p style="margin:0 0 32px;font-size:18px;font-weight:bold;letter-spacing:-0.5px;">mensaje al alma<span style="color:#bca77c;">.</span></p>
<p style="margin:0 0 16px;font-size:10px;letter-spacing:2px;color:#486653;">UN ESPACIO PARA TUS PALABRAS</p>
<h1 style="margin:0 0 20px;font-size:30px;line-height:1.3;font-weight:400;letter-spacing:-0.6px;">Tus palabras ya tienen un lugar.</h1>
<p style="margin:0 0 18px;font-size:16px;line-height:1.8;color:#66736a;">Un gracias, un te quiero, un acá estoy.<br>No necesitás las palabras perfectas: solo las tuyas.</p>
<p style="margin:0 0 28px;font-size:16px;line-height:1.8;color:#66736a;">Ya podés empezar un borrador y retomarlo a tu ritmo.</p>
<table role="presentation" cellspacing="0" cellpadding="0"><tr><td style="background:#486653;border-radius:7px;"><a href="${link}" style="display:inline-block;padding:16px 24px;font-size:14px;font-weight:bold;color:#fffdf8;text-decoration:none;">Entrar a mi espacio</a></td></tr></table>
<p style="margin:28px 0 0;font-size:13px;line-height:1.8;color:#78817a;">Sin apuro. Con todo tu corazón.</p>
<hr style="margin:30px 0 20px;border:0;border-top:1px solid #e5e7df;">
<p style="margin:0;font-size:11px;line-height:1.8;color:#78817a;">Recibís este correo porque te registraste en Mensaje al Alma.</p>
</td></tr></table>
<p style="margin:20px 0 0;font-size:11px;color:#78817a;">Hecho para acercarnos.</p>
</td></tr></table></body></html>`,
  };
}
