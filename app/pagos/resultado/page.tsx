import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, Check, Clock3, Heart, X } from 'lucide-react';
import BrandMark from '@/components/BrandMark';
import ReconcilePayment from './ReconcilePayment';

export const metadata: Metadata = {
  title: 'Resultado del pago — Mensaje al Alma',
  description: 'Estado informativo del regreso desde Mercado Pago.',
};

type PaymentStatus = 'approved' | 'success' | 'pending' | 'failure';

const statusCopy: Record<PaymentStatus, {
  eyebrow: string;
  title: string;
  description: string;
}> = {
  approved: {
    eyebrow: 'RECIBIMOS TU REGRESO',
    title: 'Estamos confirmando tu pago.',
    description: 'La acreditación final se procesa mediante una notificación segura. Esta pantalla, por sí sola, no acredita créditos.',
  },
  success: {
    eyebrow: 'RECIBIMOS TU REGRESO',
    title: 'Estamos confirmando tu pago.',
    description: 'La acreditación final se procesa mediante una notificación segura. Esta pantalla, por sí sola, no acredita créditos.',
  },
  pending: {
    eyebrow: 'PAGO PENDIENTE',
    title: 'Tu pago todavía está en proceso.',
    description: 'Cuando Mercado Pago confirme el estado, la cuenta se actualizará mediante una notificación segura.',
  },
  failure: {
    eyebrow: 'PAGO NO CONFIRMADO',
    title: 'No pudimos confirmar el pago.',
    description: 'Podés volver a intentarlo cuando la configuración de pagos esté habilitada.',
  },
};

export default async function PaymentResultPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string | string[]; payment_id?: string | string[]; external_reference?: string | string[] }>;
}) {
  const params = await searchParams;
  const rawStatus = params.status;
  const rawPaymentId = params.payment_id;
  const rawExternalReference = params.external_reference;
  const status = (Array.isArray(rawStatus) ? rawStatus[0] : rawStatus) as PaymentStatus;
  const safeStatus: PaymentStatus = statusCopy[status] ? status : 'pending';
  const copy = statusCopy[safeStatus];
  const paymentId = Array.isArray(rawPaymentId) ? rawPaymentId[0] : rawPaymentId;
  const externalReference = Array.isArray(rawExternalReference) ? rawExternalReference[0] : rawExternalReference;
  const StatusIcon = safeStatus === 'approved' || safeStatus === 'success' ? Check : safeStatus === 'failure' ? X : Clock3;

  return (
    <main className="auth-page min-h-dvh px-5 py-8 sm:px-8 sm:py-12">
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4">
        <Link href="/" className="brand" aria-label="Mensaje al Alma, inicio">
          <BrandMark />mensaje al alma<span className="brand-dot">.</span>
        </Link>
        <Link href="/" className="auth-back-link">Volver al inicio</Link>
      </header>
      <section className="auth-card mx-auto mt-12 w-full max-w-md rounded-2xl border p-7 sm:mt-16 sm:p-10" aria-labelledby="payment-result-title">
        <div className="auth-heart mx-auto mb-6 flex size-12 items-center justify-center rounded-full">
          <StatusIcon size={23} strokeWidth={1.5} aria-hidden="true" />
        </div>
        <span className="eyebrow justify-center">{copy.eyebrow}</span>
        <h1 id="payment-result-title" className="auth-title mt-4 text-center">{copy.title}</h1>
        <p className="auth-intro mt-3 text-center">{copy.description}</p>
        <ReconcilePayment status={safeStatus} paymentId={paymentId} externalReference={externalReference} />
        <Link href="/" className="button primary mt-7 w-full">
          Volver al inicio <ArrowRight size={17} aria-hidden="true" />
        </Link>
        <p className="auth-help mt-6 flex items-center justify-center gap-2 text-center">
          <Heart size={13} aria-hidden="true" /> Tu tranquilidad primero.
        </p>
      </section>
    </main>
  );
}
