import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { findPaymentPackage, listEnabledPaymentPackages } from '../lib/payments/packages';
import { assertCheckoutEnvironment, createMercadoPagoClient, getMercadoPagoConfig, normalizePaymentStatus, preferenceAutoReturnField, preferenceNotificationField } from '../lib/payments/mercadopago';
import { verifyMercadoPagoSignature } from '../lib/payments/signature';
import { canTransitionPaymentOrder, validatePaymentReconciliation } from '../lib/payments/reconciliation';
import { createHmac } from 'node:crypto';
import { MercadoPagoConfig, Preference } from 'mercadopago';
import { getOrCreateCheckoutOrder, runCheckoutStage, selectMercadoPagoCheckoutUrl, type CheckoutOrder } from '../lib/payments/checkout';
import { openCheckout, requestCheckout } from '../lib/payments/browser';

export async function verifyMercadoPago() {
  const previousNodeEnvironment = process.env.NODE_ENV;
  process.env.NODE_ENV = 'test';
  const originalConsoleError = console.error;
  let diagnostic: unknown[] = [];
  console.error = (...args: unknown[]) => { diagnostic = args; };
  let caught: unknown;
  try {
    await runCheckoutStage('save-preference-id', async () => {
      throw Object.assign(new Error('provider APP_USR-secret-token email@example.com https://user:pass@example.com/x'), { code: 'PGRST205' });
    });
  } catch (error) {
    caught = error;
  } finally {
    console.error = originalConsoleError;
    if (previousNodeEnvironment === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = previousNodeEnvironment;
  }
  assert.equal((caught as { stage?: string }).stage, 'save-preference-id');
  assert.equal((caught as { code?: string }).code, 'PGRST205');
  assert.equal(diagnostic[0], '[payments/checkout] stage=save-preference-id code=PGRST205 message=Error: provider [token]=[redacted] [url-redacted]');
  console.error = (...args: unknown[]) => { diagnostic = args; };
  try {
    await assert.rejects(runCheckoutStage('preference_create', async () => {
      const providerError = Object.assign(new Error('Bad Request'), { status: 400, cause: [{ message: 'auto_return invalid' }] });
      throw Object.assign(new Error('No pudimos crear la preferencia.'), { providerCause: providerError });
    }));
  } finally {
    console.error = originalConsoleError;
  }
  assert.match(String(diagnostic[0]), /auto_return invalid/);
  let redirectedTo = '';
  const returnedUrl = await openCheckout('pack_texto_1', 'checkout-key-123456', async (_input, init) => {
    assert.equal(init?.method, 'POST');
    assert.equal((init?.headers as Record<string, string>)['idempotency-key'], 'checkout-key-123456');
    assert.deepEqual(JSON.parse(String(init?.body)), { package_code: 'pack_texto_1' });
    return new Response(JSON.stringify({ checkoutUrl: 'https://seller.example/init_point/test-preference' }), { status: 200 });
  }, url => { redirectedTo = url; });
  assert.equal(returnedUrl, 'https://seller.example/init_point/test-preference');
  assert.equal(redirectedTo, 'https://seller.example/init_point/test-preference');
  await assert.rejects(requestCheckout('pack_texto_1', 'checkout-key-123456', async () => new Response(JSON.stringify({}), { status: 200 })), /URL válida/);
  const originalBrowserConsoleError = console.error;
  let browserDiagnostic: unknown[] = [];
  console.error = (...args: unknown[]) => { browserDiagnostic = args; };
  try {
    await assert.rejects(
      requestCheckout('pack_texto_1', 'checkout-key-123456', async () => new Response(JSON.stringify({
        error: 'No pudimos completar esta acción.', stage: 'save-preference-id', code: 'PGRST205',
      }), { status: 503 })),
      error => {
        assert.equal((error as { stage?: string }).stage, 'save-preference-id');
        assert.equal((error as { code?: string }).code, 'PGRST205');
        return true;
      },
    );
  } finally {
    console.error = originalBrowserConsoleError;
  }
  assert.deepEqual(browserDiagnostic, ['[payments/checkout]', { stage: 'save-preference-id', code: 'PGRST205', message: 'No pudimos completar esta acción.' }]);
  const olderPendingOrder: CheckoutOrder = { id: 'order-older', external_reference: 'external-older', user_id: 'user-1', package_code: 'pack_texto_1', status: 'pending', idempotency_key: 'older-key-123456', mp_preference_id: null, created_at: '2026-10-21T21:08:24.000Z' };
  const pendingOrder: CheckoutOrder = { id: 'order-pending', external_reference: 'external-latest', user_id: 'user-1', package_code: 'pack_texto_1', status: 'pending', idempotency_key: 'same-key-123456', mp_preference_id: null, created_at: '2026-10-22T21:08:24.000Z' };
  const existingPreferenceOrder: CheckoutOrder = { ...pendingOrder, id: 'order-with-preference', external_reference: 'external-with-preference', idempotency_key: 'existing-key-123456', mp_preference_id: 'pref-existing', created_at: '2026-10-23T21:08:24.000Z' };
  let inserts = 0;
  const simulatedRepository = {
    findByIdempotencyKey: async () => null,
    findPendingOrders: async () => [olderPendingOrder, pendingOrder],
    create: async () => { inserts++; return pendingOrder; },
  };
  const resumed = await getOrCreateCheckoutOrder(simulatedRepository, { userId: 'user-1', packageCode: pendingOrder.package_code, idempotencyKey: 'new-client-key-123456', orderId: 'would-not-be-used' });
  assert.equal(resumed.order.id, pendingOrder.id);
  assert.equal(resumed.order.external_reference, pendingOrder.external_reference);
  assert.equal(resumed.order.idempotency_key, pendingOrder.idempotency_key);
  assert.equal(resumed.resumed, true);
  assert.equal(inserts, 0);
  const preferenceRepository = {
    findByIdempotencyKey: async () => existingPreferenceOrder,
    findPendingOrders: async () => [],
    create: async () => { inserts++; return pendingOrder; },
  };
  const resumedPreference = await getOrCreateCheckoutOrder(preferenceRepository, { userId: 'user-1', packageCode: pendingOrder.package_code, idempotencyKey: 'existing-key-123456', orderId: 'would-not-be-used' });
  assert.equal(resumedPreference.order.mp_preference_id, 'pref-existing');
  assert.equal(resumedPreference.order.idempotency_key, existingPreferenceOrder.idempotency_key);
  assert.equal(inserts, 0);
  assert.equal(selectMercadoPagoCheckoutUrl({ initPoint: 'https://seller.example/init_point/test-preference' }), 'https://seller.example/init_point/test-preference');
  assert.equal(selectMercadoPagoCheckoutUrl({ initPoint: 'https://production.example/checkout' }), 'https://production.example/checkout');
  assert.throws(() => selectMercadoPagoCheckoutUrl({ initPoint: null }), /enlace de Checkout Pro/);
  assert.equal(findPaymentPackage('missing'), null);
  assert.equal(findPaymentPackage(''), null);
  assert.equal(findPaymentPackage('known-but-disabled'), null);
  const previousPackageEnvironment = { appUrl: process.env.NEXT_PUBLIC_APP_URL, environment: process.env.MP_ENVIRONMENT };
  process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3000';
  process.env.MP_ENVIRONMENT = 'test';
  const localPackages = listEnabledPaymentPackages();
  assert.equal(localPackages.length, 5);
  assert.deepEqual(localPackages, [
    { package_code: 'pack_texto_1', name: 'Mensaje de Texto', credit_amount: 1, amount_ars: 2000, currency: 'ARS' },
    { package_code: 'pack_audio_1', name: 'Mensaje con Audio y Texto', credit_amount: 1, amount_ars: 3000, currency: 'ARS' },
    { package_code: 'pack_fotos_1', name: 'Mensaje con Fotos y Texto', credit_amount: 1, amount_ars: 4000, currency: 'ARS' },
    { package_code: 'pack_video_45s_1', name: 'Mensaje en Video (hasta 45s) y Texto', credit_amount: 1, amount_ars: 5000, currency: 'ARS' },
    { package_code: 'pack_video_15m_1', name: 'Mensaje en Video Extendido (hasta 15 min) y Texto', credit_amount: 1, amount_ars: 45000, currency: 'ARS' },
  ]);
  const selectedLocalPackage = findPaymentPackage('pack_texto_1');
  assert.equal(selectedLocalPackage?.enabled, true);
  assert.deepEqual({ package_code: selectedLocalPackage?.package_code, name: selectedLocalPackage?.name, credit_amount: selectedLocalPackage?.credit_amount, amount_ars: selectedLocalPackage?.amount_ars, currency: selectedLocalPackage?.currency }, localPackages[0]);
  process.env.MP_ENVIRONMENT = 'production';
  assert.equal(findPaymentPackage('pack_texto_1')?.enabled, true);
  assert.equal(listEnabledPaymentPackages().length, 5);
  process.env.MP_ENVIRONMENT = 'test';
  process.env.NEXT_PUBLIC_APP_URL = 'https://mensaje-al-alma.example';
  assert.equal(findPaymentPackage('pack_texto_1')?.enabled, true);
  assert.equal(listEnabledPaymentPackages().length, 5);
  if (previousPackageEnvironment.appUrl === undefined) delete process.env.NEXT_PUBLIC_APP_URL; else process.env.NEXT_PUBLIC_APP_URL = previousPackageEnvironment.appUrl;
  if (previousPackageEnvironment.environment === undefined) delete process.env.MP_ENVIRONMENT; else process.env.MP_ENVIRONMENT = previousPackageEnvironment.environment;
  assert.equal(normalizePaymentStatus('approved'), 'approved');
  assert.equal(normalizePaymentStatus('pending'), 'pending');
  assert.equal(normalizePaymentStatus('rejected'), 'rejected');
  assert.equal(normalizePaymentStatus('cancelled'), 'cancelled');
  assert.equal(normalizePaymentStatus('refunded'), 'refunded');
  assert.equal(normalizePaymentStatus('charged_back'), 'charged_back');
  assert.equal(canTransitionPaymentOrder('pending', 'approved'), true);
  assert.equal(canTransitionPaymentOrder('pending', 'rejected'), true);
  assert.equal(canTransitionPaymentOrder('pending', 'cancelled'), true);
  assert.equal(canTransitionPaymentOrder('approved', 'refunded'), true);
  assert.equal(canTransitionPaymentOrder('approved', 'charged_back'), true);
  assert.equal(canTransitionPaymentOrder('approved', 'pending'), false);
  assert.equal(canTransitionPaymentOrder('rejected', 'approved'), false);
  const order = { external_reference: 'order-1', package_code: 'pack-1', amount: 100, currency: 'ARS', mp_preference_id: 'pref-1' };
  const validPayment = { externalReference: 'order-1', packageCode: 'pack-1', paymentId: '123', preferenceId: 'pref-1', amount: 100, currency: 'ARS' };
  assert.doesNotThrow(() => validatePaymentReconciliation(order, validPayment));
  for (const invalid of [
    { ...validPayment, paymentId: '' },
    { ...validPayment, preferenceId: '' },
    { ...validPayment, amount: 101 },
    { ...validPayment, currency: 'USD' },
    { ...validPayment, externalReference: 'other' },
    { ...validPayment, packageCode: 'other' },
  ]) assert.throws(() => validatePaymentReconciliation(order, invalid));

  const previous = { ...process.env };
  process.env.MP_WEBHOOK_SECRET = 'local-webhook-secret';
  process.env.MP_NOTIFICATION_URL = 'https://example.com/api/mercadopago/webhook';
  process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3000';
  delete process.env.MP_ACCESS_TOKEN;
  assert.throws(() => getMercadoPagoConfig(), /MP_ACCESS_TOKEN/);
  Object.keys(process.env).forEach(key => { if (!(key in previous)) delete process.env[key]; });
  Object.entries(previous).forEach(([key, value]) => { if (value === undefined) delete process.env[key]; else process.env[key] = value; });

  const client = createMercadoPagoClient({ accessToken: 'local-test-token', webhookSecret: 'secret', notificationUrl: 'https://example.com/api/mercadopago/webhook', appUrl: 'http://localhost:3000' });
  assert.ok(client instanceof MercadoPagoConfig);
  assert.ok(new Preference(client));

  const previousEnvironment = process.env.MP_ENVIRONMENT;
  delete process.env.MP_ENVIRONMENT;
  assert.throws(() => assertCheckoutEnvironment('http://localhost:3000'), /MP_ENVIRONMENT=test/);
  process.env.MP_ENVIRONMENT = 'production';
  assert.throws(() => assertCheckoutEnvironment('http://localhost:3000'), /MP_ENVIRONMENT=test/);
  process.env.MP_ENVIRONMENT = 'test';
  assert.doesNotThrow(() => assertCheckoutEnvironment('http://localhost:3000'));
  assert.doesNotThrow(() => assertCheckoutEnvironment('https://mensaje-al-alma.example'));
  if (previousEnvironment === undefined) delete process.env.MP_ENVIRONMENT;
  else process.env.MP_ENVIRONMENT = previousEnvironment;

  const previousNotificationEnvironment = { ...process.env };
  process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3000';
  process.env.MP_ENVIRONMENT = 'test';
  process.env.MP_ACCESS_TOKEN = 'local-test-token';
  delete process.env.MP_WEBHOOK_SECRET;
  process.env.MP_NOTIFICATION_URL = 'http://127.0.0.1:54321/api/mercadopago/webhook';
  const localConfig = getMercadoPagoConfig();
  assert.equal(localConfig.notificationUrl, undefined);
  assert.equal(localConfig.webhookSecret, undefined);
  assert.deepEqual(preferenceNotificationField(localConfig), {});
  assert.deepEqual(preferenceAutoReturnField('http://localhost:3000'), {});
  assert.deepEqual(preferenceAutoReturnField('https://mensaje-al-alma.example'), { auto_return: 'approved' });
  assert.throws(() => getMercadoPagoConfig({ requireWebhookSecret: true }), /MP_WEBHOOK_SECRET/);
  const webhook = readFileSync('lib/payments/webhook-handler.ts', 'utf8');
  assert.match(webhook, /getMercadoPagoConfig\(\{ requireWebhookSecret: true \}\)/);
  assert.match(webhook, /if \(!config\.webhookSecret\)/);
  assert.match(readFileSync('app/api/payments/webhook/route.ts', 'utf8'), /handleMercadoPagoWebhook/);
  delete process.env.MP_NOTIFICATION_URL;
  process.env.MP_WEBHOOK_SECRET = 'local-test-webhook-secret';
  for (const appUrl of ['https://preview.example', 'https://mensaje-al-alma.example']) {
    process.env.NEXT_PUBLIC_APP_URL = appUrl;
    const productionConfig = getMercadoPagoConfig();
    assert.equal(productionConfig.notificationUrl, `${appUrl}/api/payments/webhook`);
  }
  Object.keys(process.env).forEach(key => { if (!(key in previousNotificationEnvironment)) delete process.env[key]; });
  Object.entries(previousNotificationEnvironment).forEach(([key, value]) => { if (value === undefined) delete process.env[key]; else process.env[key] = value; });

  const secret = 'local-test-secret';
  const nowMs = 1_700_000_000_000;
  const dataId = '12345';
  const requestId = 'request-1';
  const ts = String(nowMs);
  const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`;
  const v1 = createHmac('sha256', secret).update(manifest).digest('hex');
  const signature = `ts=${ts},v1=${v1}`;
  assert.equal(verifyMercadoPagoSignature({ signature, requestId, dataId, secret, nowMs }), true);
  assert.equal(verifyMercadoPagoSignature({ signature: `${signature}x`, requestId, dataId, secret, nowMs }), false);
  assert.equal(verifyMercadoPagoSignature({ signature, requestId, dataId, secret, nowMs: nowMs + 6 * 60 * 1000 }), false);
  assert.equal(verifyMercadoPagoSignature({ signature, requestId, dataId, secret: 'other', nowMs }), false);
  const checkout = readFileSync('app/api/payments/checkout/route.ts', 'utf8');
  const mercadopago = readFileSync('lib/payments/mercadopago.ts', 'utf8');
  const resultPage = readFileSync('app/pagos/resultado/page.tsx', 'utf8');
  const reconcileRoute = readFileSync('app/api/payments/reconcile/route.ts', 'utf8');
  const migration = readFileSync('supabase/migrations/202610190006_payment_orders.sql', 'utf8');
  const quotaMigration = readFileSync('supabase/migrations/202610190007_payment_credit_quota.sql', 'utf8');
  assert.doesNotMatch(checkout, /input\.(amount|amount_ars|credit_amount|currency)/);
  assert.match(checkout, /idempotency-key/);
  for (const stage of ['authorization', 'configuration', 'order_get_or_create', 'preference_create', 'preference_get', 'save-preference-id', 'redirect_url_select']) {
    assert.match(checkout, new RegExp(`runCheckoutStage\\('${stage}'`));
  }
  assert.match(checkout, /stage: typed\.stage \?\? 'unknown'/);
  assert.match(checkout, /code: typed\.code \?\? 'unknown'/);
  assert.doesNotMatch(checkout, /sandbox_init_point|sandboxInitPoint/);
  assert.match(mercadopago, /providerCause/);
  assert.match(mercadopago, /response\.init_point/);
  assert.match(resultPage, /payment_id/);
  assert.match(resultPage, /external_reference/);
  assert.match(reconcileRoute, /reconcile_payment_order/);
  assert.match(reconcileRoute, /eq\('user_id', user\.id\)/);
  assert.match(migration, /unique \(source_type, source_id\)/);
  assert.match(migration, /p_status='approved' and not exists/);
  assert.match(migration, /insert into public\.message_credit_grants/);
  const simulatedGrants: Array<{ source_type: string; source_id: string; amount: number }> = [];
  const simulateApprovedGrant = () => {
    if (!simulatedGrants.some(grant => grant.source_type === 'mercado_pago' && grant.source_id === 'order-1')) {
      simulatedGrants.push({ source_type: 'mercado_pago', source_id: 'order-1', amount: 1 });
    }
  };
  simulateApprovedGrant();
  simulateApprovedGrant();
  assert.equal(simulatedGrants.length, 1);
  assert.equal(simulatedGrants[0].amount, 1);
  assert.match(migration, /mp_preference_id/);
  assert.match(migration, /p_package_code text/);
  assert.match(migration, /approved payment requires identifiers/);
  assert.match(migration, /invalid payment state transition/);
  assert.match(migration, /grant select, insert, update on public\.payment_orders to service_role/);
  assert.match(migration, /Refunds and chargebacks do not revoke credits automatically/);
  assert.match(quotaMigration, /where user_id=p_user and status='active'/);
  assert.match(quotaMigration, /3::bigint/);
  assert.doesNotMatch(quotaMigration, /message_send_attempts\s+set|message_schedules\s+set|create function public\.reserve_message_send/);
  assert.match(quotaMigration, /grant execute on function public\.get_message_quota\(\) to authenticated/);
  assert.doesNotMatch(migration, /grant all on public\.payment_orders/);
  console.log('OK: paquetes deshabilitados, estados de pago y firma HMAC sin llamadas a Mercado Pago.');
}
