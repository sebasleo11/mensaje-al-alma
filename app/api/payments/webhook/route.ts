import { handleMercadoPagoWebhook } from '@/lib/payments/webhook-handler';

export async function POST(request: Request) {
  return handleMercadoPagoWebhook(request);
}
