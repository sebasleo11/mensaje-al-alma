export type CheckoutResponse = { checkoutUrl?: unknown; error?: unknown; stage?: unknown; code?: unknown };
export type CheckoutClientError = Error & { stage?: string; code?: string };

function responseText(value: unknown, fallback: string) {
  return typeof value === 'string' && value ? value : fallback;
}

export async function requestCheckout(
  packageCode: string,
  idempotencyKey: string,
  fetcher: typeof fetch = fetch,
) {
  const response = await fetcher('/api/payments/checkout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'idempotency-key': idempotencyKey },
    body: JSON.stringify({ package_code: packageCode }),
    signal: AbortSignal.timeout(30_000),
  });
  const data = await response.json() as CheckoutResponse;
  if (!response.ok) {
    const stage = responseText(data.stage, 'unknown');
    const code = responseText(data.code, 'unknown');
    console.error('[payments/checkout]', { stage: data.stage || 'unknown', code: data.code || 'unknown', message: data.error });
    const error = new Error(responseText(data.error, 'No pudimos iniciar Checkout Pro.') as string) as CheckoutClientError;
    error.stage = stage;
    error.code = code;
    throw error;
  }
  if (typeof data.checkoutUrl !== 'string' || !data.checkoutUrl) throw new Error('Checkout Pro no devolvió una URL válida.');
  return data.checkoutUrl;
}

export async function openCheckout(
  packageCode: string,
  idempotencyKey: string,
  fetcher: typeof fetch = fetch,
  redirect: (url: string) => void = url => window.location.assign(url),
) {
  const checkoutUrl = await requestCheckout(packageCode, idempotencyKey, fetcher);
  redirect(checkoutUrl);
  return checkoutUrl;
}
