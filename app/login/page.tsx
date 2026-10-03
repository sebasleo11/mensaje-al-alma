import type { Metadata } from 'next';
import AuthForm from '@/components/auth/AuthForm';

export const metadata: Metadata = {
  title: 'Ingresar — Mensaje al Alma',
  description: 'Ingresá o creá tu cuenta para guardar tus palabras y retomarlas a tu ritmo.',
};

export default async function LoginPage({ searchParams }: {
  searchParams: Promise<{ confirmation?: string }>;
}) {
  const { confirmation } = await searchParams;
  return <AuthForm confirmationFailed={confirmation === 'failed'} />;
}
