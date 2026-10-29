import type { Metadata } from 'next';
import './globals.css';
const productionUrl = 'https://mensaje-al-alma.vercel.app/';
export const metadata: Metadata = {
 metadataBase: new URL(productionUrl),
 title: 'Mensaje al Alma — Las palabras que nos acercan',
 description: 'Un espacio para tus palabras pendientes. Escribí, guardá y regalá mensajes a quienes más querés.',
 openGraph: {
  type: 'website',
  locale: 'es_AR',
  url: '/',
  siteName: 'Mensaje al Alma',
  title: 'Mensaje al Alma — Las palabras que nos acercan',
  description: 'Un espacio para tus palabras pendientes. Escribí, guardá y regalá mensajes a quienes más querés.',
  images: [{url: '/images/hero-background-still.webp', width: 1280, height: 720, alt: 'Mensaje al Alma'}],
 },
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="es-AR"><body>{children}</body></html>; }
