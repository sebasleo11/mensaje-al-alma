'use client';

import Link from 'next/link';
import { useAuthUser } from '@/hooks/use-auth-user';
import SignOutButton from '@/components/SignOutButton';

type AuthNavProps = {
  mobile?: boolean;
  onNavigate?: () => void;
};

export default function AuthNav({ mobile = false, onNavigate }: AuthNavProps) {
  const { user, loading } = useAuthUser();
  if (loading) return <span className="auth-nav-placeholder" role="status" aria-label="Comprobando tu sesión" />;
  if (!user) return <Link className="auth-nav-link" href="/login" onClick={onNavigate}>Ingresar</Link>;
  return <div className={mobile ? 'mobile-auth-list' : 'auth-account-nav'}><Link className="auth-nav-link" href="/mis-mensajes" onClick={onNavigate}>Mis mensajes</Link><SignOutButton /></div>;
}
