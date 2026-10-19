export type PaymentOrderStatus = 'pending' | 'approved' | 'rejected' | 'cancelled' | 'refunded' | 'charged_back';

export type ReconciliationOrder = {
  external_reference: string;
  package_code: string;
  amount: number;
  currency: string;
  mp_preference_id: string | null;
};

export type ReconciliationPayment = {
  externalReference: string;
  packageCode: string;
  paymentId: string;
  preferenceId: string;
  amount: number;
  currency: string;
};

export function canTransitionPaymentOrder(from: PaymentOrderStatus, to: PaymentOrderStatus) {
  if (from === to) return true;
  if (from === 'pending') return to === 'approved' || to === 'rejected' || to === 'cancelled';
  if (from === 'approved') return to === 'refunded' || to === 'charged_back';
  return false;
}

export function validatePaymentReconciliation(order: ReconciliationOrder, payment: ReconciliationPayment) {
  if (!payment.externalReference || payment.externalReference !== order.external_reference) throw new Error('external reference mismatch');
  if (!payment.packageCode || payment.packageCode !== order.package_code) throw new Error('package mismatch');
  if (!payment.paymentId || !payment.preferenceId) throw new Error('payment identifiers required');
  if (payment.amount !== order.amount) throw new Error('amount mismatch');
  if (payment.currency !== order.currency) throw new Error('currency mismatch');
  if (!order.mp_preference_id || payment.preferenceId !== order.mp_preference_id) throw new Error('preference mismatch');
}
