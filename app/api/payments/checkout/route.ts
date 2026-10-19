import { authorize, body, handled, HttpError, reply } from '@/lib/messages/http';
import { findPaymentPackage } from '@/lib/payments/packages';
import { createMercadoPagoPreference, getMercadoPagoConfig, MercadoPagoConfigurationError } from '@/lib/payments/mercadopago';
import { createAdminClient } from '@/utils/supabase/admin';

function idempotencyKey(request: Request) {
  const value = request.headers.get('idempotency-key')?.trim() ?? '';
  if (!/^[A-Za-z0-9._:-]{16,128}$/.test(value)) throw new HttpError(400, 'Falta una clave de idempotencia válida.');
  return value;
}

export async function POST(request: Request) {
  return handled(async () => {
    const { user } = await authorize(request, true);
    const input = await body(request);
    const selected = findPaymentPackage(input.package_code);
    if (!selected) throw new HttpError(409, 'El paquete no existe o todavía no está habilitado.');
    let config;
    try { config = getMercadoPagoConfig(); } catch (error) {
      if (error instanceof MercadoPagoConfigurationError) throw new HttpError(503, error.message);
      throw error;
    }
    const key = idempotencyKey(request);
    const admin = createAdminClient();
    const existing = await admin.from('payment_orders').select('*').eq('user_id', user.id).eq('idempotency_key', key).maybeSingle();
    if (existing.error) throw existing.error;
    if (existing.data) {
      if (existing.data.package_code !== selected.package_code || !existing.data.mp_preference_id) throw new HttpError(409, 'La clave de idempotencia ya fue usada para otra operación.');
      return reply({ checkoutUrl: null, orderId: existing.data.id, status: existing.data.status });
    }
    const orderId = crypto.randomUUID();
    const created = await admin.from('payment_orders').insert({
      id: orderId, user_id: user.id, package_code: selected.package_code, credit_amount: selected.credit_amount,
      amount: selected.amount_ars, currency: selected.currency, status: 'pending', external_reference: orderId, idempotency_key: key,
    }).select('*').single();
    if (created.error) throw created.error;
    const preference = await createMercadoPagoPreference(config, {
      externalReference: orderId, packageCode: selected.package_code, title: selected.name,
      amountArs: selected.amount_ars, currency: selected.currency, payerEmail: user.email ?? undefined,
    }, key);
    const updated = await admin.from('payment_orders').update({ mp_preference_id: preference.id, updated_at: new Date().toISOString() }).eq('id', orderId).select('id,status').single();
    if (updated.error) throw updated.error;
    return reply({ checkoutUrl: preference.initPoint });
  });
}
