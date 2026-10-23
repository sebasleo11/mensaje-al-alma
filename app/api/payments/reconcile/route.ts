import { authorize, body, HttpError, reply } from '@/lib/messages/http';
import { getMercadoPagoConfig, getMercadoPagoPayment, getMercadoPagoPreference, MercadoPagoConfigurationError, MercadoPagoProviderError, normalizePaymentStatus } from '@/lib/payments/mercadopago';
import { validatePaymentReconciliation } from '@/lib/payments/reconciliation';
import { createAdminClient } from '@/utils/supabase/admin';

function text(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

export async function POST(request: Request) {
  try {
    const { user } = await authorize(request, true);
    const input = await body(request);
    const paymentId = text(input.payment_id);
    const externalReference = text(input.external_reference);
    if (!/^\d{1,30}$/.test(paymentId) || !/^[A-Za-z0-9._:-]{1,128}$/.test(externalReference)) {
      throw new HttpError(400, 'Faltan identificadores válidos del pago.');
    }
    const config = getMercadoPagoConfig();
    const payment = await getMercadoPagoPayment(config, paymentId);
    if (payment.external_reference !== externalReference || payment.transaction_amount == null || !payment.currency_id) {
      throw new HttpError(422, 'Los datos del pago no coinciden con el regreso informado.');
    }
    const admin = createAdminClient();
    const order = await admin.from('payment_orders')
      .select('id,user_id,external_reference,amount,currency,package_code,mp_preference_id')
      .eq('user_id', user.id)
      .eq('external_reference', externalReference)
      .maybeSingle();
    if (order.error) throw new Error('Payment order lookup failed');
    if (!order.data?.mp_preference_id) throw new HttpError(422, 'La orden de pago todavía no está lista para reconciliar.');
    const preference = await getMercadoPagoPreference(config, order.data.mp_preference_id);
    const item = preference.items?.find(candidate => candidate.id === order.data?.package_code);
    if (preference.external_reference !== order.data.external_reference || preference.id !== order.data.mp_preference_id || !item || item.quantity !== 1 || item.unit_price !== Number(order.data.amount) || item.currency_id !== order.data.currency || payment.currency_id !== order.data.currency || payment.transaction_amount !== Number(order.data.amount)) {
      throw new HttpError(422, 'La validación del pago no coincide con la orden.');
    }
    validatePaymentReconciliation(order.data, {
      externalReference: payment.external_reference,
      packageCode: item.id ?? '',
      paymentId: payment.id,
      preferenceId: order.data.mp_preference_id,
      amount: payment.transaction_amount,
      currency: payment.currency_id,
    });
    const result = await admin.rpc('reconcile_payment_order', {
      p_external_reference: payment.external_reference,
      p_package_code: order.data.package_code,
      p_payment_id: payment.id,
      p_preference_id: order.data.mp_preference_id,
      p_mp_status: payment.status,
      p_mp_status_detail: payment.status_detail ?? null,
      p_status: normalizePaymentStatus(payment.status),
      p_amount: payment.transaction_amount,
      p_currency: payment.currency_id,
    });
    if (result.error) throw new Error('Payment reconciliation failed');
    return reply({ received: true, status: result.data?.status ?? normalizePaymentStatus(payment.status) });
  } catch (error) {
    if (error instanceof HttpError) return reply({ error: error.message }, error.status);
    if (error instanceof MercadoPagoConfigurationError || error instanceof MercadoPagoProviderError) return reply({ error: 'No pudimos verificar el pago todavía.' }, 503);
    return reply({ error: 'No pudimos reconciliar el pago todavía.' }, 503);
  }
}
