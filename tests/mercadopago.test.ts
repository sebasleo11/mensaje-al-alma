import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { findPaymentPackage } from '../lib/payments/packages';
import { createMercadoPagoClient, getMercadoPagoConfig, normalizePaymentStatus } from '../lib/payments/mercadopago';
import { verifyMercadoPagoSignature } from '../lib/payments/signature';
import { canTransitionPaymentOrder, validatePaymentReconciliation } from '../lib/payments/reconciliation';
import { createHmac } from 'node:crypto';
import { MercadoPagoConfig, Preference } from 'mercadopago';

export function verifyMercadoPago() {
  assert.equal(findPaymentPackage('missing'), null);
  assert.equal(findPaymentPackage(''), null);
  assert.equal(findPaymentPackage('known-but-disabled'), null);
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
  const migration = readFileSync('supabase/migrations/202610190006_payment_orders.sql', 'utf8');
  const quotaMigration = readFileSync('supabase/migrations/202610190007_payment_credit_quota.sql', 'utf8');
  assert.doesNotMatch(checkout, /input\.(amount|amount_ars|credit_amount|currency)/);
  assert.match(checkout, /idempotency-key/);
  assert.match(migration, /unique \(source_type, source_id\)/);
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
