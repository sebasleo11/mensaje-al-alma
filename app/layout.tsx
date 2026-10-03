import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = { title: 'Mensaje al Alma — Las palabras que nos acercan', description: 'Un espacio para tus palabras pendientes. Escribí, guardá y regalá mensajes a quienes más querés.' };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="es-AR"><body>{children}</body></html>; }
