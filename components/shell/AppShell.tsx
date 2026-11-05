'use client';
import { Suspense, useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { ChevronRight, Moon, PanelLeft, Sun, X } from 'lucide-react';
import BrandMark from '@/components/BrandMark';
import SignOutButton from '@/components/SignOutButton';
import { DEMO_NAV, NAV, isActive, type NavItem } from './nav';

function Tree({ items, depth = 0, pathname, search, open, toggle, go }: { items: NavItem[]; depth?: number; pathname: string; search: string; open: Record<string, boolean>; toggle: (id: string) => void; go: (e: React.MouseEvent) => void }) {
  return <ul className={`shell-tree depth-${depth}`}>{items.map(item => {
    const Icon = item.icon, kids = item.children, active = isActive(item, pathname, search);
    const inside = !!kids?.some(k => isActive(k, pathname, search));
    const expanded = open[item.id] ?? (inside || (!!kids && active));
    return <li key={item.id}>
      <div className={`shell-row${active ? ' is-active' : ''}${inside ? ' is-inside' : ''}`}>
        <Link href={item.href} className="shell-link" aria-current={active ? 'page' : undefined} onClick={e => { go(e); if (kids && !expanded) toggle(item.id); }}>
          {Icon ? <Icon size={18} strokeWidth={1.6} aria-hidden="true" /> : <span className="shell-dot" aria-hidden="true" />}<span>{item.label}</span>
        </Link>
        {kids && <button type="button" className="shell-chevron" aria-label={`${expanded ? 'Cerrar' : 'Abrir'} ${item.label}`} aria-expanded={expanded} onClick={() => toggle(item.id)}><ChevronRight size={16} /></button>}
      </div>
      {kids && expanded && <Tree items={kids} depth={depth + 1} pathname={pathname} search={search} open={open} toggle={toggle} go={go} />}
    </li>;
  })}</ul>;
}

function Shell({ children, demo }: { children: ReactNode; demo: boolean }) {
  const pathname = usePathname(), params = useSearchParams(), search = params.toString();
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [collapsed, setCollapsed] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const [dark, setDark] = useState(false);
  useEffect(() => { try { setCollapsed(localStorage.getItem('alma-shell-collapsed') === '1'); const d = localStorage.getItem('alma-theme') === 'dark'; setDark(d); document.documentElement.dataset.theme = d ? 'dark' : 'light'; } catch {} }, []);
  // Pages react to sub-page changes without remounting (same window, content swaps in place).
  useEffect(() => { setDrawer(false); window.dispatchEvent(new CustomEvent('alma-nav', { detail: Object.fromEntries(new URLSearchParams(search)) })); }, [pathname, search]);
  const toggle = (id: string) => setOpen(o => ({ ...o, [id]: !(o[id] ?? isInside(id)) }));
  const isInside = (id: string) => { const n = NAV.find(x => x.id === id); return !!n && (isActive(n, pathname, search) || !!n.children?.some(k => isActive(k, pathname, search))); };
  // Unsaved edits: ask before leaving the page being edited.
  const go = (e: React.MouseEvent) => { if (document.documentElement.dataset.almaDirty === '1' && !window.confirm('Tenés cambios sin guardar. ¿Querés salir igual?')) e.preventDefault(); };
  const items = demo ? [...NAV, DEMO_NAV] : NAV;
  return <div className={`app-shell${collapsed ? ' is-collapsed' : ''}${drawer ? ' drawer-open' : ''}`}>
    <header className="shell-topbar">
      <button type="button" className="shell-iconbtn shell-toggle" aria-label={drawer ? 'Cerrar menú' : 'Abrir menú'} onClick={() => { if (window.matchMedia('(max-width:900px)').matches) setDrawer(d => !d); else { const c = !collapsed; setCollapsed(c); try { localStorage.setItem('alma-shell-collapsed', c ? '1' : '0'); } catch {} } }}>{drawer ? <X size={20} /> : <PanelLeft size={20} />}</button>
      <Link href="/" className="brand shell-brand" aria-label="Mensaje al Alma, inicio" onClick={go}><BrandMark size={22} /><span>mensaje al alma<span className="brand-dot">.</span></span></Link>
      <div className="shell-top-actions">
        {demo && <span className="shell-badge">Demo</span>}
        <button type="button" className="shell-iconbtn" aria-label={dark ? 'Activar modo claro' : 'Activar modo oscuro'} onClick={() => { const d = !dark; setDark(d); document.documentElement.dataset.theme = d ? 'dark' : 'light'; try { localStorage.setItem('alma-theme', d ? 'dark' : 'light'); } catch {} }}>{dark ? <Sun size={18} /> : <Moon size={18} />}</button>
      </div>
    </header>
    <div className="shell-scrim" onClick={() => setDrawer(false)} aria-hidden="true" />
    <aside className="shell-sidebar" aria-label="Menú de la aplicación">
      <nav><Tree items={items} pathname={pathname} search={search} open={open} toggle={toggle} go={go} /></nav>
      <div className="shell-foot">{demo ? <small>Datos inventados · no se envía nada real</small> : <SignOutButton />}</div>
    </aside>
    <main className="shell-content">{children}</main>
  </div>;
}

export default function AppShell({ children, demo = false }: { children: ReactNode; demo?: boolean }) {
  return <Suspense fallback={null}><Shell demo={demo}>{children}</Shell></Suspense>;
}
