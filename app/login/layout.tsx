import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Ingresar — Mensaje al Alma',
  description: 'Ingresá o creá tu cuenta para guardar tus palabras y retomarlas a tu ritmo.',
};

export default function LoginLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
