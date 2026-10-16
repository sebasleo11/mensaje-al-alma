export class SupabaseConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SupabaseConfigurationError';
  }
}

export function validateSupabaseConfig(rawUrl: string | undefined, rawKey: string | undefined) {
  const url = rawUrl?.trim();
  const key = rawKey?.trim();
  if (!url || !key || ['undefined', 'null'].includes(url) || ['undefined', 'null'].includes(key)) {
    throw new SupabaseConfigurationError('Faltan NEXT_PUBLIC_SUPABASE_URL o NEXT_PUBLIC_SUPABASE_ANON_KEY. Completá .env.local y reiniciá el servidor de desarrollo.');
  }
  let parsed: URL;
  try { parsed = new URL(url); }
  catch { throw new SupabaseConfigurationError('NEXT_PUBLIC_SUPABASE_URL debe ser una URL válida del proyecto Supabase.'); }
  if (!['https:', 'http:'].includes(parsed.protocol) || parsed.username || parsed.password || parsed.search || parsed.hash || !['', '/'].includes(parsed.pathname)) {
    throw new SupabaseConfigurationError('NEXT_PUBLIC_SUPABASE_URL debe ser el origen del proyecto Supabase, sin rutas como /auth/v1, parámetros ni credenciales.');
  }
  if (/\s/.test(key)) {
    throw new SupabaseConfigurationError('NEXT_PUBLIC_SUPABASE_ANON_KEY contiene espacios. Copiá nuevamente la clave pública del proyecto.');
  }
  if (key.startsWith('sb_secret_')) {
    throw new SupabaseConfigurationError('Usá una clave pública de Supabase en NEXT_PUBLIC_SUPABASE_ANON_KEY.');
  }
  if (/tu-proyecto|your-project/.test(parsed.hostname) || /^(tu-clave|your-)/.test(key)) {
    throw new SupabaseConfigurationError('Reemplazá los valores de ejemplo por la URL y la clave pública de tu proyecto Supabase.');
  }
  // Legacy anon keys carry a project ref. This is a configuration check,
  // not signature verification; opaque publishable keys are checked by Supabase.
  if (!key.startsWith('sb_publishable_')) {
    let claims: { role?: string; ref?: string };
    try {
      const parts = key.split('.');
      if (parts.length !== 3) throw new Error('Invalid JWT');
      const payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
      claims = JSON.parse(atob(payload.padEnd(Math.ceil(payload.length / 4) * 4, '=')));
      if (!claims || typeof claims !== 'object' || claims.role !== 'anon') throw new Error('Not anon');
    } catch {
      throw new SupabaseConfigurationError('Usá una clave pública anon o publishable válida de Supabase.');
    }
    if (parsed.hostname.endsWith('.supabase.co') && claims.ref !== parsed.hostname.split('.')[0]) {
      throw new SupabaseConfigurationError('La URL y la clave pública pertenecen a proyectos Supabase distintos. Copiá ambos valores del mismo proyecto y reiniciá el servidor.');
    }
  }
  return { url: parsed.origin, key };
}

export function isSupabaseConfigured() {
  try { getSupabaseConfig(); return true; }
  catch { return false; }
}

export function getSupabaseConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  // No dynamic process.env access: Next.js inlines these public values in the browser.
  return validateSupabaseConfig(url, key);
}
