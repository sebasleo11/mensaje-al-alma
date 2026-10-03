import { EmailConfigurationError, UnconfirmedEmailError, type WelcomeUser } from './welcome';

type Dependencies = {
  authenticate: () => Promise<WelcomeUser | null>;
  appUrl: () => string;
  send: (user: WelcomeUser) => Promise<{ id: string }>;
};

function json(body: Record<string, unknown>, status: number) {
  return Response.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } });
}

export async function handleSendWelcome(request: Request, dependencies: Dependencies) {
  try {
    const user = await dependencies.authenticate();
    if (!user) return json({ error: 'Necesitás iniciar sesión.' }, 401);
    if (!user.email || !user.email_confirmed_at) {
      return json({ error: 'Primero confirmá el email de tu cuenta.' }, 403);
    }
    // Fixed configured origin, not proxy/Host headers supplied by a caller.
    if (request.headers.get('origin') !== new URL(dependencies.appUrl()).origin) {
      return json({ error: 'Esta solicitud debe realizarse desde la aplicación.' }, 403);
    }
    // No arbitrary to/from/subject/html fields: the request body is never used.
    const { id } = await dependencies.send(user);
    return json({ status: 'accepted', id }, 200);
  } catch (error) {
    if (error instanceof EmailConfigurationError) {
      return json({ error: 'El envío de correos todavía no está disponible.' }, 503);
    }
    if (error instanceof UnconfirmedEmailError) {
      return json({ error: 'Necesitás un email confirmado en tu cuenta.' }, 403);
    }
    // Never serialize provider errors, API keys or recipients into the response.
    return json({ error: 'No pudimos procesar el correo. Podés volver a intentar.' }, 502);
  }
}
