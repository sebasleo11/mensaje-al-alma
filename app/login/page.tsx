'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import AuthForm from '@/components/auth/AuthForm';

function LoginContent() {
  const searchParams = useSearchParams();
  const confirmationFailed = searchParams.get('confirmation') === 'failed';
  return <AuthForm key={confirmationFailed ? 'failed' : 'login'} confirmationFailed={confirmationFailed} />;
}

export default function LoginPage() {
  return (
    <Suspense fallback={<p className="auth-help px-5 py-12 text-center" role="status">Preparando tu espacio…</p>}>
      <LoginContent />
    </Suspense>
  );
}
