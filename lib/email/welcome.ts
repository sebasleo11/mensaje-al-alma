import type { CreateEmailOptions, CreateEmailRequestOptions, CreateEmailResponse } from 'resend';
import { welcomeEmail } from '../../emails/welcome';

export type WelcomeUser = { id: string; email?: string; email_confirmed_at?: string };
export type EmailConfiguration = { from: string; appUrl: string };
export class EmailConfigurationError extends Error {}
export class EmailDeliveryError extends Error {}
export class UnconfirmedEmailError extends Error {}

export function validateEmailConfiguration(from: string | undefined, appUrl: string | undefined): EmailConfiguration {
  if (!from || !appUrl || /[\r\n]/.test(from)) throw new EmailConfigurationError();
  const mailbox = from.match(/<([^<>]+)>$/)?.[1] ?? from;
  if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(mailbox)) throw new EmailConfigurationError();
  let url: URL;
  try { url = new URL(appUrl); } catch { throw new EmailConfigurationError(); }
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if ((url.protocol !== 'https:' && !(url.protocol === 'http:' && local)) ||
      url.username || url.password || url.search || url.hash || url.pathname !== '/') {
    throw new EmailConfigurationError();
  }
  return { from, appUrl: url.origin + '/' };
}

type SendEmail = (message: CreateEmailOptions, options: CreateEmailRequestOptions) => Promise<CreateEmailResponse>;

export async function deliverWelcomeEmail(user: WelcomeUser, config: EmailConfiguration, send: SendEmail) {
  if (!user.email_confirmed_at || !user.email ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(user.email) || user.email.length > 254) {
    throw new UnconfirmedEmailError();
  }
  const template = welcomeEmail(config.appUrl);
  const { data, error } = await send({
    from: config.from,
    to: [user.email],
    ...template,
  }, {
    idempotencyKey: `welcome/${user.id}/v1`,
    signal: AbortSignal.timeout(10_000),
  });
  if (error || !data?.id) throw new EmailDeliveryError();
  // Provider acceptance is not proof of delivery to the recipient's inbox.
  return { id: data.id };
}
