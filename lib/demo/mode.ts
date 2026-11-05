/** Local demo with invented data. Never active in production builds, whatever the env says. */
export const DEMO = process.env.NEXT_PUBLIC_DEMO_MODE === 'true' && process.env.NODE_ENV !== 'production';
export const DEMO_USER = { id: '00000000-0000-4000-8000-000000000001', email: 'demo@mensajealalma.local', email_confirmed_at: '2026-01-01T00:00:00Z' };
