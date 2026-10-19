import { reply } from '@/lib/messages/http';
import { getMercadoPagoConfig, getMercadoPagoPayment, getMercadoPagoPreference, MercadoPagoConfigurationError, MercadoPagoProviderError, normalizePaymentStatus } from '@/lib/payments/mercadopago';
import { verifyMercadoPagoSignature } from '@/lib/payments/signature';
import { validatePaymentReconciliation } from '@/lib/payments/reconciliation';
import { createAdminClient } from '@/utils/supabase/admin';

export async function POST(request: Request) {
  let config;
  try { config = getMercadoPagoConfig(); } catch (error) {
    return reply({ error: error instanceof MercadoPagoConfigurationError ? error.message : 'Payment webhook unavailable.' }, 503);
  }
  const url = new URL(request.url);
  const dataId = url.searchParams.get('data.id') ?? url.searchParams.get('id');
  const requestId = request.headers.get('x-request-id');
  if (!verifyMercadoPagoSignature({ signature: request.headers.get('x-signature'), requestId, dataId, secret: config.webhookSecret })) return reply({ error: 'Invalid signature' }, 401);
  const type = url.searchParams.get('type') ?? url.searchParams.get('topic');
  if (type && type !== 'payment') return reply({ received: true });
  if (!dataId) return reply({ received: true });
  try {
    const payment = await getMercadoPagoPayment(config, dataId);
    if (!payment.external_reference || payment.transaction_amount == null || !payment.currency_id) return reply({ error: 'Payment data incomplete' }, 422);
    const admin = createAdminClient();
    const order = await admin.from('payment_orders').select('external_reference,amount,currency,package_code,mp_preference_id').eq('external_reference', payment.external_reference).maybeSingle();
    if (order.error) return reply({ error: 'Payment reconciliation unavailable' }, 503);
    if (!order.data?.mp_preference_id) return reply({ error: 'Payment order incomplete' }, 422);
    const preference = await getMercadoPagoPreference(config, order.data.mp_preference_id);
    const item = preference.items?.find(candidate => candidate.id === order.data?.package_code);
    if (preference.external_reference !== order.data.external_reference || preference.id !== order.data.mp_preference_id || !item || item.quantity !== 1 || item.unit_price !== Number(order.data.amount) || item.currency_id !== order.data.currency || payment.currency_id !== order.data.currency || payment.transaction_amount !== Number(order.data.amount)) {
      return reply({ error: 'Payment validation failed' }, 422);
    }
    try {
      validatePaymentReconciliation(order.data, {
        externalReference: payment.external_reference,
        packageCode: item.id ?? '',
        paymentId: payment.id,
        preferenceId: order.data.mp_preference_id,
        amount: payment.transaction_amount,
        currency: payment.currency_id,
      });
    } catch {
      return reply({ error: 'Payment validation failed' }, 422);
    }
    const result = await admin.rpc('reconcile_payment_order', {
      p_external_reference: payment.external_reference, p_package_code: order.data.package_code, p_payment_id: payment.id,
      p_preference_id: order.data.mp_preference_id,
      p_mp_status: payment.status, p_mp_status_detail: payment.status_detail ?? null,
      p_status: normalizePaymentStatus(payment.status), p_amount: payment.transaction_amount, p_currency: payment.currency_id,
    });
    if (result.error) return reply({ error: 'Payment reconciliation unavailable' }, 503);
    return reply({ received: true, status: result.data?.status ?? normalizePaymentStatus(payment.status) });
  } catch (error) {
    if (error instanceof MercadoPagoProviderError) return reply({ error: 'Payment provider unavailable' }, 503);
    return reply({ error: 'Payment reconciliation unavailable' }, 503);
  }
}
