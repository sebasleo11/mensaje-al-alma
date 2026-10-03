'use client';

import Link from 'next/link';
import { useAuthUser } from '@/hooks/use-auth-user';
import SignOutButton from '@/components/SignOutButton';

export default function AuthNav() {
  const { user, loading } = useAuthUser();
  if (loading) return <span className="auth-nav-placeholder" role="status" aria-label="Comprobando tu sesión" />;
  return user ? <SignOutButton /> : <Link className="auth-nav-link" href="/login">Ingresar</Link>;
}
