import 'server-only';

import { Resend } from 'resend';
import {
  deliverWelcomeEmail, EmailConfigurationError, validateEmailConfiguration,
  type WelcomeUser,
} from '@/lib/email/welcome';

export function getEmailConfiguration() {
  return validateEmailConfiguration(process.env.RESEND_FROM_EMAIL, process.env.APP_URL);
}

export function createResendClient() {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new EmailConfigurationError();
  // Lazy construction keeps builds and authentication working before setup.
  return new Resend(key);
}

export function isEmailConfigured() {
  return Boolean(process.env.RESEND_API_KEY && process.env.RESEND_FROM_EMAIL && process.env.APP_URL);
}

/** Call only with a user verified by Supabase Auth, never request-body identity. */
export async function sendWelcomeEmail(user: WelcomeUser) {
  const config = getEmailConfiguration();
  const resend = createResendClient();
  return deliverWelcomeEmail(user, config, (message, options) => resend.emails.send(message, options));
}
