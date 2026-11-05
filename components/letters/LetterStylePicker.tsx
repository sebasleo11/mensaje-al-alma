'use client';
import { FONTS, PAPERS, letterBackground, type LetterStyle } from '@/lib/letters/styles';

export default function LetterStylePicker({ value, onChange }: { value: LetterStyle; onChange: (v: LetterStyle) => void }) {
  return <div className="letter-picker">
    <fieldset><legend>Papel</legend><div className="letter-swatches">{PAPERS.map(p => <button type="button" key={p.id} aria-pressed={value.paper === p.id} className="letter-swatch" onClick={() => onChange({ ...value, paper: p.id })}><span style={{ background: letterBackground(p), ['--lh' as string]: '0.6rem' }} /><small>{p.name}</small></button>)}</div></fieldset>
    <fieldset><legend>Letra</legend><div className="letter-fonts">{FONTS.map(f => <button type="button" key={f.id} aria-pressed={value.font === f.id} className="letter-font-chip" style={{ fontFamily: f.css }} onClick={() => onChange({ ...value, font: f.id })}>{f.name}</button>)}</div></fieldset>
  </div>;
}
