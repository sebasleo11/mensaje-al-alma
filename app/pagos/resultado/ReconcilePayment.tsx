'use client';

import { useEffect, useState } from 'react';

export default function ReconcilePayment({
  status,
  paymentId,
  externalReference,
}: {
  status: string;
  paymentId?: string;
  externalReference?: string;
}) {
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!paymentId || !externalReference || !['approved', 'success', 'pending'].includes(status)) return;
    let active = true;
    void fetch('/api/payments/reconcile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ payment_id: paymentId, external_reference: externalReference }),
    }).then(async response => {
      const data = await response.json() as { status?: string; error?: string };
      if (!active) return;
      if (!response.ok) {
        setMessage(data.error ?? 'Todavía no pudimos verificar el pago.');
        return;
      }
      setMessage(data.status === 'approved'
        ? 'El pago fue confirmado. La acreditación se procesó de forma segura.'
        : 'El pago sigue pendiente de confirmación.');
    }).catch(() => {
      if (active) setMessage('Todavía no pudimos verificar el pago.');
    });
    return () => { active = false; };
  }, [externalReference, paymentId, status]);

  return message ? <p className="auth-help mt-4 text-center" role="status">{message}</p> : null;
}
