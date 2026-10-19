import { WebhookSignatureValidator } from 'mercadopago';

export type MercadoPagoSignatureInput = {
  signature: string | null;
  requestId: string | null;
  dataId: string | null;
  secret: string;
  nowMs?: number;
  maxAgeMs?: number;
};

export function verifyMercadoPagoSignature(input: MercadoPagoSignatureInput) {
  if (!input.signature || !input.requestId || !input.dataId || !input.secret) return false;
  try {
    WebhookSignatureValidator.validate({
      xSignature: input.signature,
      xRequestId: input.requestId,
      dataId: input.dataId,
      secret: input.secret,
      toleranceSeconds: (input.maxAgeMs ?? 5 * 60 * 1000) / 1000,
      now: () => input.nowMs ?? Date.now(),
    });
    return true;
  } catch {
    return false;
  }
}
