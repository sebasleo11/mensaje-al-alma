'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import BrandMark from '@/components/BrandMark';
import LetterPaper, { AudioLetter, VideoLetter } from './LetterPaper';
import LetterStylePicker from './LetterStylePicker';
import { letterEmailHtml } from '@/lib/letters/email';
import { DEFAULT_STYLE, type LetterStyle } from '@/lib/letters/styles';

const SAMPLE = `Querida Sofi,\n\nHoy quería contarte algo que nunca supe decirte en voz alta: cada vez que te veo reír, entiendo para qué sirven los días difíciles.\n\nGracias por tantos domingos, por las sopas, por quedarte cuando todos se iban. Si estás leyendo esto, quiero que sepas que lo hice con todo el amor que tenía.\n\nTe abrazo siempre,\nPapá`;

// 24 s soft tone so the audio demo has a real duration to sync the typing against.
function toneWav() {
  const rate = 8000, n = rate * 24, buf = new ArrayBuffer(44 + n * 2), v = new DataView(buf);
  const w = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  w(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); w(8, 'WAVEfmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, 'data'); v.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) v.setInt16(44 + i * 2, Math.sin(i / 14) * 900 * (0.5 + 0.5 * Math.sin(i / 4000)), true);
  return URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }));
}

const tabs = [['text', 'Texto'], ['audio', 'Audio'], ['video', 'Video'], ['email', 'Así llega al mail']] as const;

export default function LettersLab() {
  const [text, setText] = useState(SAMPLE);
  const [style, setStyle] = useState<LetterStyle>(DEFAULT_STYLE);
  const [tab, setTab] = useState<(typeof tabs)[number][0]>('text');
  const [wav, setWav] = useState('');
  useEffect(() => { // el menú lateral cambia la vista sin recargar la página
    const set = (v?: string) => { if (v === 'text' || v === 'audio' || v === 'video' || v === 'email') setTab(v); };
    set(new URLSearchParams(window.location.search).get('vista') ?? undefined);
    const h = (e: Event) => set((e as CustomEvent).detail?.vista);
    window.addEventListener('alma-nav', h); return () => window.removeEventListener('alma-nav', h);
  }, []);
  useEffect(() => { const u = toneWav(); setWav(u); return () => URL.revokeObjectURL(u); }, []);
  useEffect(() => { try { document.documentElement.dataset.theme = localStorage.getItem('alma-theme') === 'dark' ? 'dark' : 'light'; } catch {} }, []);
  const email = useMemo(() => letterEmailHtml({ body: text, style, link: 'https://mensaje-al-alma.vercel.app/', kind: 'text' }), [text, style]);
  return <div className="messages-page letters-lab">
    <header className="messages-header"><Link href="/" className="brand"><BrandMark size={22} />mensaje al alma<span className="brand-dot">.</span></Link><Link href="/" className="auth-back-link">Volver al inicio</Link></header>
    <main>
      <div className="messages-heading"><div><span className="eyebrow">VISTA PREVIA DE CARTAS</span><h1>Cómo lo va a recibir esa persona</h1><p>Elegí papel y letra, escribí, y mirá cómo queda en cada formato. Es una demo: no se guarda ni se envía nada.</p></div></div>
      <div className="letters-layout">
        <section className="letters-controls"><label htmlFor="lab-text">Tus palabras</label><textarea id="lab-text" rows={9} maxLength={5000} value={text} onChange={e => setText(e.target.value)} /><LetterStylePicker value={style} onChange={setStyle} /></section>
        <section className="letters-stage" aria-live="polite">
          <div className="letters-tabs" role="tablist">{tabs.map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}>{l}</button>)}</div>
          {tab === 'text' && <LetterPaper text={text} style={style} />}
          {tab === 'audio' && wav && <AudioLetter src={wav} text={text} style={style} />}
          {tab === 'video' && <VideoLetter src="/videos/colibri.mp4" text="Para vos, con todo mi cariño." style={style} />}
          {tab === 'email' && <iframe className="letters-email" title="Vista previa del email" srcDoc={email} sandbox="" />}
          {tab === 'audio' && <p className="letters-hint">Mientras suena la voz, el texto se escribe solo y quedan visibles las últimas tres líneas.</p>}
          {tab === 'video' && <p className="letters-hint">El video va dentro de un marco con el papel que elegiste.</p>}
        </section>
      </div>
    </main>
  </div>;
}
