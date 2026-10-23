import { authorize, body, HttpError, reply } from '@/lib/messages/http';
import { findPaymentPackage } from '@/lib/payments/packages';
import { createMercadoPagoPreference, getMercadoPagoConfig, getMercadoPagoPreference, MercadoPagoConfigurationError, MercadoPagoProviderError } from '@/lib/payments/mercadopago';
import { CheckoutLinkError, CheckoutOrderConflictError, getOrCreateCheckoutOrder, runCheckoutStage, selectMercadoPagoCheckoutUrl, type CheckoutOrder } from '@/lib/payments/checkout';
import { createAdminClient } from '@/utils/supabase/admin';

function idempotencyKey(request: Request) {
  const value = request.headers.get('idempotency-key')?.trim() ?? '';
  if (!/^[A-Za-z0-9._:-]{16,128}$/.test(value)) throw new HttpError(400, 'Falta una clave de idempotencia válida.');
  return value;
}

export async function POST(request: Request) {
  try {
    const { user } = await runCheckoutStage('authorization', () => authorize(request, true));
    const input = await body(request);
    const selected = findPaymentPackage(input.package_code);
    if (!selected) throw new HttpError(409, 'El paquete no existe o todavía no está habilitado.');
    const config = await runCheckoutStage('configuration', () => getMercadoPagoConfig());
    const key = idempotencyKey(request);
    const admin = await runCheckoutStage('order_get_or_create', () => createAdminClient());
    const repository = {
      findByIdempotencyKey: async (userId: string, idempotencyKey: string) => {
        const result = await admin.from('payment_orders').select('id,external_reference,user_id,package_code,status,idempotency_key,mp_preference_id,created_at').eq('user_id', userId).eq('idempotency_key', idempotencyKey).maybeSingle();
        if (result.error) throw result.error;
        return result.data as CheckoutOrder | null;
      },
      findPendingOrders: async (userId: string, packageCode: string) => {
        const result = await admin.from('payment_orders').select('id,external_reference,user_id,package_code,status,idempotency_key,mp_preference_id,created_at').eq('user_id', userId).eq('package_code', packageCode).eq('status', 'pending').order('created_at', { ascending: false }).limit(2);
        if (result.error) throw result.error;
        return (result.data ?? []) as CheckoutOrder[];
      },
      create: async ({ userId, packageCode, idempotencyKey, orderId }: { userId: string; packageCode: string; idempotencyKey: string; orderId: string }) => {
        const created = await admin.from('payment_orders').insert({
          id: orderId, user_id: userId, package_code: packageCode, credit_amount: selected.credit_amount,
          amount: selected.amount_ars, currency: selected.currency, status: 'pending', external_reference: orderId, idempotency_key: idempotencyKey,
        }).select('id,external_reference,user_id,package_code,status,idempotency_key,mp_preference_id,created_at').single();
        if (created.error) throw created.error;
        return created.data as CheckoutOrder;
      },
    };
    const { order }: { order: CheckoutOrder } = await runCheckoutStage('order_get_or_create', () => getOrCreateCheckoutOrder(repository, { userId: user.id, packageCode: selected.package_code, idempotencyKey: key, orderId: crypto.randomUUID() }));
    if (order.mp_preference_id) {
      const existingPreference = await runCheckoutStage('preference_get', () => getMercadoPagoPreference(config, order.mp_preference_id!));
      const checkoutUrl = await runCheckoutStage('redirect_url_select', () => selectMercadoPagoCheckoutUrl({ initPoint: existingPreference.initPoint }));
      return reply({ checkoutUrl, orderId: order.id, status: order.status });
    }
    const preference = await runCheckoutStage('preference_create', () => createMercadoPagoPreference(config, {
      externalReference: order.external_reference, packageCode: selected.package_code, title: selected.name,
      amountArs: selected.amount_ars, currency: selected.currency, payerEmail: user.email ?? undefined,
    }, order.idempotency_key));
    const updated = await runCheckoutStage('save-preference-id', async () => {
      const result = await admin.from('payment_orders').update({ mp_preference_id: preference.id, updated_at: new Date().toISOString() }).eq('id', order.id).select('id,status').single();
      if (result.error) throw result.error;
      return result;
    });
    const checkoutUrl = await runCheckoutStage('redirect_url_select', () => selectMercadoPagoCheckoutUrl({ initPoint: preference.initPoint }));
    return reply({ checkoutUrl, orderId: order.id, status: updated.data.status });
  } catch (error) {
    const typed = error as Error & { stage?: string; code?: string };
    const status = error instanceof HttpError ? error.status
      : error instanceof CheckoutOrderConflictError ? 409
      : error instanceof MercadoPagoConfigurationError ? 503
      : error instanceof MercadoPagoProviderError || error instanceof CheckoutLinkError ? 502
      : 503;
    const message = error instanceof HttpError
      ? error.message
      : 'No pudimos completar esta acción. Tus palabras siguen guardadas; podés reintentar.';
    return reply({ error: message, stage: typed.stage ?? 'unknown', code: typed.code ?? 'unknown' }, status);
  }
}
