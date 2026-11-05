import type { ReactNode } from 'react';
import AppShell from '@/components/shell/AppShell';
import { DEMO } from '@/lib/demo/mode';

// Every signed-in screen lives inside the same window: sidebar on the left, content on the right.
export default function AppLayout({ children }: { children: ReactNode }) { return <AppShell demo={DEMO}>{children}</AppShell>; }
