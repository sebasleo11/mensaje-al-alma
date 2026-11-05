export type LetterPaper = { id: string; name: string; background: string; ink: string; line: string | null; margin: string | null; page: string; border: string };
export type LetterFont = { id: string; name: string; css: string; email: string; size: number; lineHeight: number };

const lined = (line: string) => `repeating-linear-gradient(to bottom,transparent 0,transparent calc(var(--lh) - 1px),${line} calc(var(--lh) - 1px),${line} var(--lh))`;

export const PAPERS: LetterPaper[] = [
  { id: 'clasica', name: 'Carta clásica', background: '#fbf6ea', ink: '#2f2a22', line: '#d9cfb8', margin: '#e3a9a0', page: '#efe7d3', border: '#e1d6bb' },
  { id: 'azul', name: 'Renglones azules', background: '#fdfdfb', ink: '#243a63', line: '#b9cbe6', margin: '#e8a2a2', page: '#e9eef6', border: '#d5deec' },
  { id: 'pergamino', name: 'Pergamino', background: 'radial-gradient(ellipse at center,#f6e8c6 0%,#ecd7a6 70%,#dfc58d 100%)', ink: '#46321a', line: null, margin: null, page: '#e7d6b0', border: '#d4bb83' },
  { id: 'kraft', name: 'Papel kraft', background: '#d8bd96', ink: '#3b2a18', line: null, margin: null, page: '#c9ac80', border: '#b99a6c' },
  { id: 'rosa', name: 'Rosa suave', background: '#fcebee', ink: '#5a2f3c', line: '#f0cbd3', margin: null, page: '#f7dde2', border: '#eec3cc' },
  { id: 'salvia', name: 'Verde salvia', background: '#eaf0e4', ink: '#2c4234', line: '#cddcc5', margin: null, page: '#dde7d5', border: '#c3d4b9' },
  { id: 'acuarela', name: 'Acuarela', background: 'radial-gradient(circle at 15% 10%,#dbe9f4 0,transparent 55%),radial-gradient(circle at 90% 90%,#f8dfe6 0,transparent 55%),#fffdf8', ink: '#33405a', line: null, margin: null, page: '#f1eef0', border: '#e3dde3' },
  { id: 'cuadriculado', name: 'Cuadriculado', background: 'linear-gradient(#d6e2d0 1px,transparent 1px),linear-gradient(90deg,#d6e2d0 1px,transparent 1px),#fdfdf8', ink: '#27402f', line: null, margin: null, page: '#eef0e6', border: '#d3dccb' },
  { id: 'puntos', name: 'Puntitos dorados', background: 'radial-gradient(#d9c58f 1.2px,transparent 1.6px) 0 0/22px 22px,#fffbf0', ink: '#3d3420', line: null, margin: null, page: '#f4edd9', border: '#e6d9b2' },
  { id: 'noche', name: 'Noche estrellada', background: 'radial-gradient(#ffffff55 1px,transparent 1.5px) 0 0/46px 46px,radial-gradient(#ffffff33 1px,transparent 1.5px) 23px 23px/46px 46px,#1f2a44', ink: '#f3ead2', line: null, margin: null, page: '#161e33', border: '#34436a' },
];

export const FONTS: LetterFont[] = [
  { id: 'caveat', name: 'Caveat', css: "'Caveat',cursive", email: "'Caveat','Segoe Script','Bradley Hand',cursive", size: 1.55, lineHeight: 2.1 },
  { id: 'homemade', name: 'Homemade Apple', css: "'Homemade Apple',cursive", email: "'Homemade Apple','Segoe Script','Bradley Hand',cursive", size: 1.05, lineHeight: 2.3 },
  { id: 'dancing', name: 'Dancing Script', css: "'Dancing Script',cursive", email: "'Dancing Script','Brush Script MT','Segoe Script',cursive", size: 1.5, lineHeight: 2.1 },
  { id: 'reenie', name: 'Reenie Beanie', css: "'Reenie Beanie',cursive", email: "'Reenie Beanie','Bradley Hand','Segoe Print',cursive", size: 1.85, lineHeight: 1.9 },
  { id: 'kalam', name: 'Kalam', css: "'Kalam',cursive", email: "'Kalam','Segoe Print','Comic Sans MS',cursive", size: 1.2, lineHeight: 2.1 },
  { id: 'lora', name: 'Serif elegante', css: "'Lora',Georgia,serif", email: "'Lora',Georgia,'Times New Roman',serif", size: 1.12, lineHeight: 2 },
];

export const DEFAULT_STYLE = { paper: 'clasica', font: 'caveat' };
export type LetterStyle = { paper: string; font: string };
export const findPaper = (id?: string | null) => PAPERS.find(p => p.id === id) ?? PAPERS[0];
export const findFont = (id?: string | null) => FONTS.find(f => f.id === id) ?? FONTS[0];
export const letterBackground = (paper: LetterPaper) => (paper.line ? `${lined(paper.line)},${paper.background}` : paper.background);
