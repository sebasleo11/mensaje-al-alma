import { MercadoPagoConfig as MercadoPagoSdkConfig, Payment, Preference } from 'mercadopago';

export type MercadoPagoConfig = {
  accessToken: string;
  webhookSecret?: string;
  notificationUrl?: string;
  appUrl: string;
};

export type PreferenceInput = {
  externalReference: string;
  packageCode: string;
  title: string;
  amountArs: number;
  currency: 'ARS';
  payerEmail?: string;
};

export type MercadoPagoPayment = {
  id: string;
  status: string;
  status_detail?: string | null;
  external_reference?: string | null;
  transaction_amount?: number | null;
  currency_id?: string | null;
  order?: { id?: string | null } | null;
  preference_id?: string | null;
};

export type MercadoPagoPreference = {
  id: string;
  external_reference?: string | null;
  initPoint?: string | null;
  items?: Array<{ id?: string; unit_price?: number; currency_id?: string; quantity?: number }>;
};

export class MercadoPagoConfigurationError extends Error {}
export class MercadoPagoProviderError extends Error {
  constructor(message: string, public readonly providerCause?: unknown) {
    super(message);
    this.name = 'MercadoPagoProviderError';
  }
}

function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new MercadoPagoConfigurationError(`Falta la configuración server-side ${name}.`);
  return value;
}
function publicAppUrl() {
  const raw = required('NEXT_PUBLIC_APP_URL');
  const url = new URL(raw);
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if ((url.protocol !== 'https:' && !(local && url.protocol === 'http:')) || url.username || url.password || url.search || url.hash) {
    throw new MercadoPagoConfigurationError('NEXT_PUBLIC_APP_URL debe ser un origen HTTPS válido.');
  }
  return url.origin;
}

function isLocalAppUrl(appUrl: string) {
  return ['localhost', '127.0.0.1', '[::1]'].includes(new URL(appUrl).hostname);
}

export function assertCheckoutEnvironment(appUrl: string) {
  if (isLocalAppUrl(appUrl) && process.env.MP_ENVIRONMENT !== 'test') {
    throw new MercadoPagoConfigurationError('Checkout Pro local requiere MP_ENVIRONMENT=test.');
  }
}

export function getMercadoPagoConfig(options: { requireWebhookSecret?: boolean } = {}): MercadoPagoConfig {
  const appUrl = publicAppUrl();
  const localTest = isLocalAppUrl(appUrl) && process.env.MP_ENVIRONMENT === 'test';
  const rawNotificationUrl = process.env.MP_NOTIFICATION_URL?.trim();
  let notificationUrl: string | undefined;
  if (rawNotificationUrl) {
    const parsed = new URL(rawNotificationUrl);
    const localNotification = ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname);
    if (localTest && localNotification) {
      notificationUrl = undefined;
    } else if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.search || parsed.hash) {
      throw new MercadoPagoConfigurationError('MP_NOTIFICATION_URL debe ser una URL HTTPS pública.');
    } else {
      notificationUrl = parsed.toString();
    }
  } else if (!(isLocalAppUrl(appUrl) && process.env.MP_ENVIRONMENT === 'test')) {
    notificationUrl = `${appUrl}/api/payments/webhook`;
  }
  const webhookSecret = process.env.MP_WEBHOOK_SECRET?.trim();
  if (!webhookSecret && (options.requireWebhookSecret === true || !localTest)) {
    throw new MercadoPagoConfigurationError('Falta la configuración server-side MP_WEBHOOK_SECRET.');
  }
  return {
    accessToken: required('MP_ACCESS_TOKEN'),
    webhookSecret,
    notificationUrl,
    appUrl,
  };
}

export function createMercadoPagoClient(config: MercadoPagoConfig) {
  return new MercadoPagoSdkConfig({ accessToken: config.accessToken, options: { timeout: 10_000 } });
}

export function preferenceNotificationField(config: MercadoPagoConfig) {
  return config.notificationUrl ? { notification_url: config.notificationUrl } : {};
}

export function preferenceAutoReturnField(appUrl: string) {
  const url = new URL(appUrl);
  return isLocalAppUrl(appUrl) || url.protocol !== 'https:' ? {} : { auto_return: 'approved' as const };
}

export async function createMercadoPagoPreference(config: MercadoPagoConfig, input: PreferenceInput, idempotencyKey: string) {
  assertCheckoutEnvironment(config.appUrl);
  const unitPrice = Number(input.amountArs);
  if (!Number.isFinite(unitPrice) || unitPrice <= 0) throw new MercadoPagoProviderError('El importe de la preferencia no es válido.');
  try {
    const response = await new Preference(createMercadoPagoClient(config)).create({
      body: {
        items: [{ id: input.packageCode, title: input.title, quantity: 1, unit_price: unitPrice, currency_id: 'ARS' }],
        payer: input.payerEmail ? { email: input.payerEmail } : undefined,
        external_reference: input.externalReference,
        ...preferenceNotificationField(config),
        back_urls: {
          success: `${config.appUrl}/pagos/resultado?status=success`,
          pending: `${config.appUrl}/pagos/resultado?status=pending`,
          failure: `${config.appUrl}/pagos/resultado?status=failure`,
        },
        ...preferenceAutoReturnField(config.appUrl),
      },
      requestOptions: { idempotencyKey },
    });
    if (!response.id || !response.init_point) throw new MercadoPagoProviderError('Mercado Pago no devolvió un enlace de Checkout Pro utilizable.');
    return { id: response.id, initPoint: response.init_point, sandboxInitPoint: response.sandbox_init_point ?? null };
  } catch (error) {
    if (error instanceof MercadoPagoProviderError) throw error;
    throw new MercadoPagoProviderError('No pudimos crear la preferencia de Mercado Pago.', error);
  }
}

export async function getMercadoPagoPayment(config: MercadoPagoConfig, paymentId: string) {
  if (!/^\d{1,30}$/.test(paymentId)) throw new MercadoPagoProviderError('Identificador de pago inválido.');
  try {
    const response = await new Payment(createMercadoPagoClient(config)).get({ id: paymentId });
    const preferenceId = (response as typeof response & { preference_id?: string | null }).preference_id
      ?? (typeof response.metadata?.preference_id === 'string' ? response.metadata.preference_id : null);
    return {
      id: response.id == null ? paymentId : String(response.id),
      status: response.status ?? '',
      status_detail: response.status_detail ?? null,
      external_reference: response.external_reference ?? null,
      transaction_amount: response.transaction_amount ?? null,
      currency_id: response.currency_id ?? null,
      order: response.order ? { id: response.order.id == null ? null : String(response.order.id) } : null,
      preference_id: preferenceId,
    } satisfies MercadoPagoPayment;
  } catch {
    throw new MercadoPagoProviderError('No pudimos consultar el pago en Mercado Pago.');
  }
}

export async function getMercadoPagoPreference(config: MercadoPagoConfig, preferenceId: string) {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(preferenceId)) throw new MercadoPagoProviderError('Identificador de preferencia inválido.');
  try {
    const response = await new Preference(createMercadoPagoClient(config)).get({ preferenceId });
    return {
      id: response.id ?? preferenceId,
      external_reference: response.external_reference ?? null,
      initPoint: response.init_point ?? null,
      items: response.items?.map(item => ({ id: item.id, unit_price: item.unit_price, currency_id: item.currency_id, quantity: item.quantity })),
    } satisfies MercadoPagoPreference;
  } catch (error) {
    if (error instanceof MercadoPagoProviderError) throw error;
    throw new MercadoPagoProviderError('No pudimos consultar la preferencia en Mercado Pago.', error);
  }
}

export function normalizePaymentStatus(status: string | null | undefined) {
  if (status === 'approved') return 'approved' as const;
  if (status === 'pending' || status === 'in_process' || status === 'in_mediation') return 'pending' as const;
  if (status === 'cancelled' || status === 'cancelled_by_collector') return 'cancelled' as const;
  if (status === 'refunded') return 'refunded' as const;
  if (status === 'charged_back') return 'charged_back' as const;
  return 'rejected' as const;
}
