# Mensaje al Alma

Next.js App Router, React, TypeScript, Tailwind CSS y Supabase.

## Desarrollo

```sh
npm install
npm run dev
```

Abrí http://localhost:3000. Verificaciones: `npm test`, `npm run typecheck` y `npm run build`.

## Configurar Supabase

1. Creá `.env.local` en la raíz, copiando `.env.example`, y completá los valores del proyecto:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://tu-proyecto.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=tu-clave-publica-anon
```

Usá el Project URL y la clave pública `anon` del panel de Supabase. También se admite una clave pública `sb_publishable_…` bajo el mismo nombre de variable. No uses `service_role` ni una clave secreta en variables `NEXT_PUBLIC_*`. `.env.local` está excluido de Git. Reiniciá `npm run dev` después de cambiarlo; en producción reconstruí la aplicación.

2. Aplicá una sola vez el contenido de `supabase/migrations/202610030001_create_messages.sql` en el SQL Editor de tu proyecto. El script crea `messages`, su índice, sus permisos y las cuatro políticas RLS dentro de una transacción. Si ya existe esa tabla, falla intencionalmente: primero compará el esquema para evitar sobrescribir datos. `user_id` referencia `auth.users`: eliminar una cuenta también elimina sus mensajes por `ON DELETE CASCADE`.

3. La sincronización requiere una sesión de **Supabase Auth** iniciada con `utils/supabase/client.ts`. Ingresá desde `/login`: podés iniciar sesión o crear una cuenta con email y contraseña. La barra de navegación muestra «Cerrar sesión» cuando hay una sesión activa. Crear un usuario desde el dashboard no inicia su sesión en el navegador. La landing funciona sin credenciales, con borradores locales.

## Archivos y uso

- `utils/supabase/client.ts`: `createClient()` para Client Components.
- `utils/supabase/server.ts`: `await createClient()` para Server Components, Server Actions y Route Handlers; cookies por solicitud y sin service role.
- `proxy.ts` y `utils/supabase/proxy.ts`: validación/renovación de la sesión SSR con `getClaims()`, conservando cookies y evitando caché compartida.
- `utils/supabase/database.types.ts`: tipos del esquema; regenerarlos desde Supabase si cambia la tabla.
- `lib/messages/drafts.ts`: recuperar el último borrador de texto, insertar o actualizarlo con un ID estable.
- `hooks/use-message-draft.ts`: sesión, carga, guardado, estados de error y fallback local para visitantes.

Ejemplo de servidor:

```ts
import { createClient } from '@/utils/supabase/server';

const supabase = await createClient();
const { data, error } = await supabase.auth.getClaims();
if (error || !data?.claims) throw new Error('Necesitás iniciar sesión.');
const { data: messages, error: queryError } = await supabase
  .from('messages')
  .select('*')
  .eq('user_id', data.claims.sub);
if (queryError) throw queryError;
```

RLS es la barrera de autorización en la base, incluso si un cliente cambia los filtros de la consulta. INSERT comprueba el nuevo propietario; UPDATE comprueba el propietario actual y el nuevo para impedir transferencias entre usuarios. Los visitantes sin sesión no tienen permisos sobre la tabla.

## Comportamiento del editor

- Pide **email** del destinatario y texto, hasta 5000 caracteres.
- Con sesión: carga el último registro `content_type = 'text'` y `status = 'draft'` del usuario; al guardar actualiza ese registro o crea uno nuevo. Conserva el UUID durante los reintentos para evitar duplicados si se pierde una respuesta.
- Sin sesión o sin configurar Supabase: conserva el borrador local. El texto de los borradores antiguos sigue disponible; si antes guardaste un nombre, tendrás que completar el email.
- Los borradores locales no se importan automáticamente en una cuenta ni se mezclan con los de otro usuario.
- Un error de conexión autenticada no se presenta como un guardado exitoso local: el texto permanece en el editor para reintentar o copiar.
- Los cambios de cuenta limpian el estado anterior; respuestas de operaciones previas no sobrescriben el editor de la nueva sesión.
- El guardado es explícito mediante el botón. No hay autosave, suscripción Realtime ni resolución de conflictos entre ediciones simultáneas en varios dispositivos: la última escritura exitosa prevalece.

## Verificación

`npm test` prueba las consultas con el SDK real y transporte HTTP simulado: carga con filtros, inserción, actualización, reintento sin duplicación, validación y errores de permisos. No demuestra que RLS esté aplicado en tu proyecto remoto.

`supabase/tests/messages_rls.test.sql` contiene 16 comprobaciones pgTAP de acceso propio, bloqueo entre usuarios, transferencia de propietario y acceso anónimo. Ejecutalo **en una instancia local/de prueba**, después de la migración, con `supabase test db` si disponés del CLI y un proyecto local configurado. Todo el fixture se revierte. No se ha ejecutado contra una base real en esta sesión.

Para comprobar la integración real, iniciá sesión en la app, guardá y reabrí el editor: debe existir una única fila del borrador, y editarla debe conservar su ID. Una segunda cuenta no debe poder leer ni modificar esa fila. No ejecutes migraciones remotas sin revisar el SQL.

## Alcance restante

Landing de seis bloques, temas claro/oscuro, selección local de multimedia y tarjeta de invitación copiable. Todavía faltan Storage privado, grabación/compresión multimedia, Resend, el límite de tres envíos y la programación/eliminación de mensajes. Cambiar `status` a `sent` no envía un email; la entrega real requiere otra integración. Los permisos actuales son los solicitados: cada usuario puede gestionar todos los campos de sus propias filas.

Los borradores locales no están cifrados. Las imágenes se cargan desde Unsplash y las tipografías desde Google Fonts; esos proveedores reciben solicitudes del navegador. Antes del lanzamiento se deben revisar assets, privacidad, términos y soporte.

Referencias: [Supabase SSR](https://supabase.com/docs/guides/auth/server-side/creating-a-client?framework=nextjs), [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security).

## Login, registro y cierre de sesión

- `/login` permite alternar entre acceso y registro. Los errores se muestran en español, sin exponer detalles internos; los formularios se bloquean durante la petición.
- El login llama a `signInWithPassword`. El registro llama a `signUp`, con confirmación de contraseña y un mínimo de 8 caracteres (además de las reglas del proyecto Supabase).
- Una sesión válida redirige a `/` con `router.replace` y `router.refresh`. Si el registro requiere confirmar el correo y no devuelve sesión, se muestra un aviso; no se simula una sesión.
- `/auth/callback` intercambia el código PKCE por una sesión y vuelve al inicio. Un enlace inválido vuelve a `/login` con un mensaje claro. No acepta destinos de redirección arbitrarios.
- En Supabase → Authentication → URL Configuration, configurá Site URL con el origen de tu app y agregá `http://localhost:3000/auth/callback` a Redirect URLs (usá el puerto real de desarrollo y, al publicar, tu URL HTTPS). El template estándar con `{{ .ConfirmationURL }}` funciona con este callback; si personalizaste el template para usar `token_hash`, se debe adaptar el flujo de confirmación.
- `components/SignOutButton.tsx` cierra la sesión de este navegador con `scope: 'local'`. No cierra las sesiones de otros dispositivos. Los eventos de Auth actualizan la navegación y el hook de borradores.
- Sin configurar Supabase, la página informa que el acceso aún no está disponible y conserva el acceso a la landing.

Referencias: [Password Auth](https://supabase.com/docs/guides/auth/passwords), [Sign out](https://supabase.com/docs/guides/auth/signout).

Validación de Auth en esta sesión: build y TypeScript correctos; pruebas de borradores existentes pasan. En navegador con una API local simulada se verificaron error de credenciales, login con redirección a `/`, detección de sesión en el editor, cambio de navegación al cerrar sesión y registro sin sesión con aviso de confirmación. Se inspeccionó visualmente la pantalla móvil. Esto no reemplaza probar cuentas, entrega de correo ni RLS en un proyecto Supabase real.
También se comprobó el callback PKCE con la API simulada: conserva `localhost`, establece la sesión y muestra «Cerrar sesión» al volver a `/`; un código sin verificador vuelve al login con error.
