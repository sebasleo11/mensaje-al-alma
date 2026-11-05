import { CalendarClock, FileText, Gift, HeartPulse, Home, Mail, Palette, PenLine, Send, Wallet, type LucideIcon } from 'lucide-react';

export type NavItem = { id: string; label: string; icon?: LucideIcon; href: string; children?: NavItem[] };

/** Sidebar tree. Children load inside the same window; the open item expands right below itself. */
export const NAV: NavItem[] = [
  { id: 'inicio', label: 'Inicio', icon: Home, href: '/' },
  { id: 'mensajes', label: 'Mis mensajes', icon: Mail, href: '/mis-mensajes?seccion=todos', children: [
    { id: 'programados', label: 'Programados', icon: CalendarClock, href: '/mis-mensajes?seccion=scheduled' },
    { id: 'borradores', label: 'Borradores', icon: FileText, href: '/mis-mensajes?seccion=drafts' },
    { id: 'enviados', label: 'Enviados', icon: Send, href: '/mis-mensajes?seccion=sent' },
  ] },
  { id: 'nuevo', label: 'Nuevo mensaje', icon: PenLine, href: '/mis-mensajes?nuevo=text', children: [
    { id: 'n-text', label: 'Texto', href: '/mis-mensajes?nuevo=text' },
    { id: 'n-audio', label: 'Audio', href: '/mis-mensajes?nuevo=audio' },
    { id: 'n-video', label: 'Video', href: '/mis-mensajes?nuevo=video' },
    { id: 'n-photo', label: 'Fotos', href: '/mis-mensajes?nuevo=photo' },
  ] },
  { id: 'cartas', label: 'Cartas', icon: Palette, href: '/cartas?vista=text', children: [
    { id: 'c-text', label: 'Papel y letra', href: '/cartas?vista=text' },
    { id: 'c-audio', label: 'Con audio', href: '/cartas?vista=audio' },
    { id: 'c-video', label: 'Con video', href: '/cartas?vista=video' },
    { id: 'c-email', label: 'Así llega al mail', href: '/cartas?vista=email' },
  ] },
  { id: 'vida', label: 'Signo de vida', icon: HeartPulse, href: '/mis-mensajes?seccion=vida' },
  { id: 'precios', label: 'Formatos y precios', icon: Wallet, href: '/mis-mensajes?seccion=pricing' },
  { id: 'regalar', label: 'Regalar', icon: Gift, href: '/#regalar' },
];

export const DEMO_NAV: NavItem = { id: 'demo', label: 'Lo que reciben', icon: Mail, href: '/demo' };

/** Which item is active for the current location (deepest match wins). */
export function isActive(item: NavItem, pathname: string, search: string) {
  const [path, query = ''] = item.href.split('?');
  if (item.href.includes('#')) return false;
  if (path !== pathname) return false;
  if (!query) return !search || pathname !== '/';
  const wanted = new URLSearchParams(query), have = new URLSearchParams(search);
  return [...wanted].every(([k, v]) => have.get(k) === v);
}
