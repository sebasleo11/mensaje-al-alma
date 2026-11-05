'use client';
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { findFont, findPaper, letterBackground, type LetterStyle } from '@/lib/letters/styles';

export function letterVars(style?: Partial<LetterStyle>): CSSProperties {
  const paper = findPaper(style?.paper), font = findFont(style?.font);
  return { '--lh': `${font.lineHeight * font.size}rem`, background: letterBackground(paper), color: paper.ink, fontFamily: font.css, fontSize: `${font.size}rem`, lineHeight: 'var(--lh)', borderColor: paper.border } as CSSProperties;
}

export default function LetterPaper({ text, style, children, className = '' }: { text: string; style?: Partial<LetterStyle>; children?: ReactNode; className?: string }) {
  const paper = findPaper(style?.paper);
  return <article className={`letter-paper ${className}`} style={letterVars(style)}>
    {paper.margin && <span className="letter-margin" style={{ background: paper.margin }} aria-hidden="true" />}
    <div className="letter-text">{text || 'Tus palabras van a aparecer acá, como en una carta de verdad…'}</div>
    {children}
  </article>;
}

/** Letter whose text writes itself as the audio plays; only the last three lines stay visible. */
export function TypingLetter({ text, progress, style }: { text: string; progress: number; style?: Partial<LetterStyle> }) {
  const visible = text.slice(0, Math.floor(text.length * Math.min(1, Math.max(0, progress))));
  return <article className="letter-paper letter-typing" style={letterVars(style)} aria-label="Transcripción del mensaje">
    <div className="letter-typing-window"><div className="letter-text">{visible}<span className="letter-caret" aria-hidden="true" /></div></div>
  </article>;
}

export function AudioLetter({ src, text, style }: { src: string; text: string; style?: Partial<LetterStyle> }) {
  const audio = useRef<HTMLAudioElement>(null);
  const [progress, setProgress] = useState(0);
  useEffect(() => {
    const a = audio.current; if (!a) return;
    const f = () => setProgress(a.duration ? a.currentTime / a.duration : 0);
    a.addEventListener('timeupdate', f); a.addEventListener('seeked', f);
    return () => { a.removeEventListener('timeupdate', f); a.removeEventListener('seeked', f); };
  }, [src]);
  return <div className="letter-media"><audio ref={audio} src={src} controls /><TypingLetter text={text} progress={progress} style={style} /></div>;
}

export function VideoLetter({ src, text, style }: { src: string; text: string; style?: Partial<LetterStyle> }) {
  const paper = findPaper(style?.paper), font = findFont(style?.font);
  return <div className="letter-video-frame" style={{ background: paper.page, borderColor: paper.border }}>
    <div className="letter-video-mat" style={{ background: letterBackground(paper), borderColor: paper.border, color: paper.ink, ['--lh' as string]: '2rem' }}>
      <video src={src} controls playsInline muted loop />
      {text && <p style={{ fontFamily: font.css, fontSize: `${font.size}rem` }}>{text}</p>}
    </div>
  </div>;
}
