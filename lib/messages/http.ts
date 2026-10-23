import 'server-only';
import { createClient } from '@/utils/supabase/server';
import { withDraftDeadline } from './drafts';
export class HttpError extends Error { constructor(public status: number, message: string) { super(message); } }
export function reply(data: unknown, status = 200) { return Response.json(data, { status, headers: { 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer' } }); }
export function validId(value: string) { if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) throw new HttpError(400, 'No encontramos ese mensaje.'); return value; }
function appOrigin(){
 const url=new URL(process.env.APP_URL?.trim()||process.env.NEXT_PUBLIC_APP_URL||'');const local=['localhost','127.0.0.1','[::1]'].includes(url.hostname);
 if((url.protocol!=='https:'&&!(url.protocol==='http:'&&local))||url.username||url.password||url.search||url.hash||url.pathname!=='/')throw new Error('App origin unavailable');
 return url.origin;
}
export async function authorize(request: Request, mutation = false) {
 if (mutation && request.headers.get('origin') !== appOrigin()) throw new HttpError(403, 'Realizá esta acción desde la aplicación.');
 const client = await createClient();
 const { data, error } = await withDraftDeadline(client.auth.getUser(), 'session');
 if (error || !data.user) throw new HttpError(401, 'Necesitás iniciar sesión para continuar.');
 return { client, user: data.user };
}
export async function body(request: Request) {
 const text = await request.text();
 if (text.length > 16000) throw new HttpError(413, 'El mensaje es demasiado largo.');
 try { return JSON.parse(text) as Record<string, unknown>; } catch { throw new HttpError(400, 'Revisá los datos del mensaje.'); }
}
export async function handled(action: () => Promise<Response>) {
 try { return await action(); } catch (e) { return reply({ error: e instanceof HttpError ? e.message : 'No pudimos completar esta acción. Tus palabras siguen guardadas; podés reintentar.' }, e instanceof HttpError ? e.status : 503); }
}
