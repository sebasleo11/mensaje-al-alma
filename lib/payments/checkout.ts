export type CheckoutOrder = {
  id: string;
  external_reference: string;
  user_id: string;
  package_code: string;
  status: string;
  idempotency_key: string;
  mp_preference_id: string | null;
  created_at: string;
};

export type CheckoutOrderRepository = {
  findByIdempotencyKey: (userId: string, key: string) => Promise<CheckoutOrder | null>;
  findPendingOrders: (userId: string, packageCode: string) => Promise<CheckoutOrder[]>;
  create: (input: { userId: string; packageCode: string; idempotencyKey: string; orderId: string }) => Promise<CheckoutOrder>;
};

export class CheckoutOrderConflictError extends Error {}
export class CheckoutLinkError extends Error {}

export async function getOrCreateCheckoutOrder(
  repository: CheckoutOrderRepository,
  input: { userId: string; packageCode: string; idempotencyKey: string; orderId: string },
) {
  const byKey = await repository.findByIdempotencyKey(input.userId, input.idempotencyKey);
  if (byKey) {
    if (byKey.package_code !== input.packageCode || byKey.status !== 'pending') {
      throw new CheckoutOrderConflictError('La clave de idempotencia ya fue usada para otra operación.');
    }
    return { order: byKey, resumed: true };
  }

  const pending = await repository.findPendingOrders(input.userId, input.packageCode);
  if (pending.length) {
    const latest = [...pending].sort((a, b) => {
      const byDate = Date.parse(b.created_at) - Date.parse(a.created_at);
      return byDate || b.id.localeCompare(a.id);
    })[0];
    return { order: latest, resumed: true };
  }
  return { order: await repository.create(input), resumed: false };
}

export function selectMercadoPagoCheckoutUrl(input: { initPoint?: string | null }) {
  if (!input.initPoint) throw new CheckoutLinkError('Mercado Pago no devolvió un enlace de Checkout Pro.');
  return input.initPoint;
}

function safeDiagnosticMessage(error: unknown) {
  const diagnosticSource = error instanceof Error && 'providerCause' in error ? (error as Error & { providerCause?: unknown }).providerCause ?? error : error;
  const providerCause = diagnosticSource && typeof diagnosticSource === 'object' ? (diagnosticSource as { cause?: unknown }).cause : undefined;
  let causeText = '';
  if (providerCause !== undefined) {
    try { causeText = ` cause=${typeof providerCause === 'string' ? providerCause : JSON.stringify(providerCause)}`; }
    catch { causeText = ' cause=[unserializable]'; }
  }
  const raw = diagnosticSource instanceof Error ? `${diagnosticSource.name}: ${diagnosticSource.message}${causeText}` : `${String(diagnosticSource)}${causeText}`;
  return raw
    .replace(/https?:\/\/[^\s/@]+:[^\s/@]+@[^\s]+/gi, '[url-redacted]')
    .replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g, '[email]')
    .replace(/Bearer\s+[^\s]+/gi, 'Bearer [redacted]')
    .replace(/(token|secret|authorization|api[-_]?key)[=: ]+[^\s,;]+/gi, '$1=[redacted]')
    .replace(/\b(?:APP_USR-|TEST-)[A-Za-z0-9_-]+\b/g, '[token]')
    .replace(/[A-Za-z0-9_-]{32,}/g, '[redacted]')
    .slice(0, 300);
}

function diagnosticCode(error: unknown) {
  const diagnosticSource = error instanceof Error && 'providerCause' in error ? (error as Error & { providerCause?: unknown }).providerCause ?? error : error;
  if (!diagnosticSource || typeof diagnosticSource !== 'object') return 'unknown';
  const record = diagnosticSource as Record<string, unknown>;
  const value = record.code ?? record.statusCode ?? record.status;
  return typeof value === 'string' || typeof value === 'number' ? String(value).slice(0, 80) : 'unknown';
}

export function logCheckoutDiagnostic(stage: string, error: unknown) {
  console.error(`[payments/checkout] stage=${stage} code=${diagnosticCode(error)} message=${safeDiagnosticMessage(error)}`);
}

export async function runCheckoutStage<T>(stage: string, action: () => Promise<T> | T) {
  try {
    return await action();
  } catch (error) {
    if (error && typeof error === 'object') {
      const annotated = error as { stage?: string; code?: string };
      annotated.stage = stage;
      annotated.code = diagnosticCode(error);
    }
    logCheckoutDiagnostic(stage, error);
    throw error;
  }
}
