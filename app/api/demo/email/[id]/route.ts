import { DEMO } from '@/lib/demo/mode';
import { store } from '@/lib/demo/store';

// Shows the HTML that would be emailed. Exists only in the local demo.
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  if (!DEMO) return new Response('Not found', { status: 404 });
  const html = store().emails[(await context.params).id];
  if (!html) return new Response('Not found', { status: 404 });
  return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
}
