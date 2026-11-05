import Link from 'next/link';
import { notFound } from 'next/navigation';
import { DEMO } from '@/lib/demo/mode';
import { store } from '@/lib/demo/store';
export const dynamic = 'force-dynamic';
export const metadata = { title: 'Demo — Mensaje al Alma', robots: { index: false, follow: false } };

// Local demo index: what a recipient would see for each message already "sent".
export default function DemoPage() {
  if (!DEMO) notFound();
  const attempts = [...store().attempts].reverse();
  return <div className="messages-page"><main>
    <div className="messages-heading"><div><span className="eyebrow">MODO DEMO · DATOS INVENTADOS</span><h1>Lo que recibe cada persona</h1><p>Los mensajes enviados desde Mis mensajes aparecen acá. No se manda ningún email real.</p></div><Link className="button primary" href="/mis-mensajes">Ir a Mis mensajes</Link></div>
    <div className="message-library">{attempts.map(a => <article key={a.id} className="message-summary-card"><div className="message-summary-main"><p className="eyebrow">Para {a.recipient_email}</p><p className="message-preview">{a.content_body.slice(0, 110)}…</p></div><div className="gift-actions"><Link className="button secondary" href={`/recibir/${a.id}#demo`}>Ver la carta</Link><a className="button secondary" href={`/api/demo/email/${a.id}`} target="_blank" rel="noreferrer">Ver el mail</a></div></article>)}</div>
  </main></div>;
}
