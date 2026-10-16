# Mis mensajes, envío y multimedia privada

Implementación local del 4 de octubre de 2026. Conserva Next.js App Router, React, TypeScript, Tailwind, Supabase y Resend; no agrega dependencias. La landing y su editor rápido de borradores siguen existiendo. El recorrido completo vive en `/mis-mensajes`, accesible desde la navegación cuando hay sesión.

## Estado actual — 12 de octubre de 2026

- Sebastián confirmó mensajes visibles en producción y envíos funcionales de texto, foto y video. Último despliegue reportado: `dpl_Bh9a4ATVtfniu8eEj4xoBjyJpoMu`, READY. La auditoría no pudo verificar el alias activo ni comparar sus fuentes con el checkout; los cambios de coherencia y legibilidad no se desplegaron.
- Las migraciones de mensajes, envío y multimedia ya están aplicadas. No repetirlas. Los problemas de service role y parser WebM están resueltos según el contexto confirmado.
- Proyecto existente: `mensaje-al-alma`, `prj_LItyP5bJWuouJQjCBTKyiXmOU9wu`. Conservá `RECIPIENT_TOKEN_SECRET`: rotarlo invalida enlaces anteriores.
- Resend: `inteligente11.com` verificado y remitente Production reportado `Mensaje al Alma <hola@inteligente11.com>`. La auditoría local encontró las variables principales presentes, pero `RESEND_WEBHOOK_SECRET` ausente/vacío; webhook y variables Production no se pudieron verificar. No confundir configuración local con Production.
- `PRD.md` es la copia íntegra del documento aportado. Establece enviar ahora o guardar; no especifica calendario.

## Verificación del bloque de coherencia y legibilidad

TypeScript y compilación webpack pasaron. La prueba del hook con adaptadores simulados comprobó guardado con ID estable para la transición, bloqueo ante recuperación fallida, cambios pendientes y conservación del borrador anónimo sin escritura en una cuenta. No creó datos reales ni envió correos.

Se ajustaron tamaños mínimos y reglas responsive en código. No hay navegador disponible en esta sesión: quedan pendientes la revisión visual en 320, 375, 390 y 760 px, zoom al 200 % y el recorrido autenticado con un borrador existente. Estos cambios no se desplegaron.

## Recorrido entre editores

- La landing guarda texto local sin sesión o en la cuenta con sesión. Sus archivos seleccionados son sólo una vista previa y deben elegirse de nuevo en el editor completo.
- “Continuar en Mis mensajes” guarda primero el texto existente. Si falla la recuperación o el guardado, no navega. Con sesión, abre el mismo ID guardado en `/mis-mensajes?borrador=ID`.
- Sin sesión, el texto permanece en `alma-draft` del mismo navegador/origen. El editor completo requiere sesión y no importa ese texto a una cuenta. Para recuperarlo, volvé al editor rápido sin sesión en el mismo origen; no se borra ni se mueve automáticamente.
- Cerrar el editor rápido con cambios pide confirmación; cerrar/recargar la página también advierte. El editor completo mantiene guardar y continuar, seguir editando o salir sin guardar.
- En el editor completo: “Guardar borrador” → “Revisar envío” → “Confirmar envío ahora”. Guardar no envía ni programa. El cierre tras envío sigue condicionado a `state === 'accepted'`.

## Aplicar las migraciones (registro anterior)

La migración `202610030001_create_messages.sql` ya fue aplicada según la confirmación del usuario. **No volver a ejecutarla**. El siguiente procedimiento es un antecedente del 4 de octubre, conservado como referencia técnica; no es una instrucción para repetir las migraciones aplicadas:

1. Revisá y ejecutá `supabase/migrations/202610040002_messages_panel_delivery.sql` en una base Supabase de prueba del proyecto correcto. Amplía formatos con `photo`, agrega fechas de actualización/archivo, snapshots de envío, cuota/reservas, bloqueo de edición y permisos restringidos. Conserva los mensajes anteriores.
2. Ejecutá `supabase/migrations/202610040003_private_media.sql`. Crea el bucket privado `alma-private`, reserva versionada de archivos, validación/finalización y limpieza controlada.
3. Ejecutá `supabase test db` en una instancia LOCAL/de prueba con pgTAP. Incluye `messages_rls.test.sql` y `message_delivery_media.test.sql`; los fixtures se revierten. No ejecutar fixtures en producción. La prueba antigua de formato inválido ahora usa `document`, porque `photo` pasó a ser válido; no se eliminaron pruebas.
4. Revisá también las demás políticas existentes de `storage.objects`: políticas permisivas globales ajenas a estas migraciones podrían ampliar el acceso al bucket. Las políticas nuevas sólo permiten lectura propia e inserción de objetos previamente reservados; nunca actualización/sustitución ni borrado directo desde el navegador.
5. Después de validar la base de prueba, aplicá las mismas migraciones al proyecto publicado con tu autorización. Vercel no aplica migraciones SQL automáticamente.

## Variables y configuración

Completá `.env.local` y los entornos correspondientes del proyecto Vercel existente. `.env.example` contiene sólo marcadores:

- `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY`: mismo proyecto, anon o publishable.
- `APP_URL`: origen exacto de la aplicación, sin ruta; admite HTTPS y HTTP sólo para localhost. Los cambios mutantes requieren ese Origin. Para una preview, configurá su origen concreto; no se admiten comodines.
- `RESEND_API_KEY`: clave de envío server-only existente.
- `RESEND_FROM_EMAIL`: remitente del dominio verificado en Resend. El registro/bienvenida conserva su infraestructura anterior.
- `SUPABASE_SERVICE_ROLE_KEY`: secreto del **mismo** proyecto, sólo servidor. Se necesita para intentos/cuota, validación/limpieza de archivos y acceso limitado del destinatario. Nunca agregarle `NEXT_PUBLIC_`, enviarlo al navegador o guardarlo en Git. Las operaciones normales usan la sesión verificada y RLS; esta clave sólo se usa tras autorizar cada operación privilegiada.
- `RECIPIENT_TOKEN_SECRET`: mínimo 32 caracteres aleatorios, sólo servidor. Generación local sugerida: `node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"`. Conservá este secreto: rotarlo invalida los enlaces anteriores. No pegues su valor en logs o commits.
- `RESEND_WEBHOOK_SECRET`: secreto de firma del webhook de Resend.
- `CRON_SECRET`: opcional, sólo servidor, para mantenimiento de huérfanos.

La auditoría del 12 de octubre encontró las variables principales presentes localmente, salvo `RESEND_WEBHOOK_SECRET`; `CRON_SECRET` es opcional. Presencia no demuestra validez ni entrega. La configuración Production del webhook sigue sin verificar.

En Resend, configurá un webhook hacia `APP_URL/api/resend/webhook` para `email.sent`, `email.delivered`, `email.bounced`, `email.failed` y `email.suppressed`. El servidor verifica la firma del payload original con el SDK antes de escribir evidencia. Sin webhook, la interfaz puede mostrar aceptación, pero no entrega ni reconciliar un timeout cuyo ID no llegó a guardarse.

En Supabase Auth mantené la confirmación de correo y las Redirect URLs necesarias de cada entorno para `/auth/callback`. No cambies RLS ni permisos para esquivar un error de sesión.

En Vercel, configurá las variables por entorno y creá una nueva compilación/deployment. Primero probá una preview con base y destinatario de prueba autorizados. El bloque de coherencia y legibilidad no fue publicado. No desplegar sin confirmación.

## Crear, guardar, editar y enviar

1. Iniciá sesión, abrí “Mis mensajes” y elegí “Nuevo mensaje”. Al guardar se usa un UUID nuevo estable durante reintentos. Crear un segundo mensaje no reemplaza el primero.
2. Completá destinatario, formato y contenido. Para multimedia, seleccioná o grabá desde ese editor. Cámara/micrófono se solicitan sólo al elegir grabar.
3. “Guardar borrador” nunca llama a Resend ni programa un envío. La carga de archivo va directamente a Storage con la sesión del usuario y una ruta reservada por el servidor.
4. Volvé a la lista, abrí un ID concreto, editá y guardá. La lista incluye borradores anteriores. Recargá y comprobá los dos borradores independientes.
5. “Revisar envío” requiere cambios guardados y muestra destinatario/contenido; sólo “Confirmar envío ahora” inicia el envío. El servidor carga el mensaje desde la base, obtiene la identidad mediante Auth y comprueba `updated_at`: una edición desde otra ventana obliga a reabrir y confirmar el contenido vigente.
6. El envío conserva destinatario, texto, formato, asset, remitente y **payload exacto** en un intento protegido. El mensaje y su archivo se bloquean antes de invocar Resend.
7. La interfaz distingue aceptación por el proveedor y entrega al servidor de correo destinatario. Un evento `email.delivered` no demuestra lectura humana ni ubicación en Inbox.
8. Sólo se ofrecen eliminaciones de borradores. Si tuvieron un rechazo confirmado, se ocultan mediante archivo lógico para conservar la auditoría del intento; el archivo multimedia se elimina si no tiene referencias protegidas. Los mensajes enviados no ofrecen eliminación del historial. Su cuota no puede restablecerse borrando filas desde el navegador.
9. Al salir con cambios, se ofrece guardar y continuar, seguir editando o salir sin guardar esos cambios. El navegador también advierte al cerrar/recargar una página con cambios.

## Estados, cuota y reintentos

`message_send_accounts` serializa las reservas por cuenta mediante bloqueo de fila. Se permiten como máximo tres intentos no fallidos entre TODOS los formatos. Los borradores y la bienvenida no usan cuota. Un intento incierto conserva su lugar; un rechazo confirmado inicial lo libera. Un reintento encuentra el mismo intento activo, sin descontar otro lugar.

Estados: `prepared → sending → accepted / uncertain / failed`; webhooks verificados pueden aportar `delivered` o `bounced`. Un doble clic/solicitud simultánea sólo puede tomar una lease de envío. Una lease de 60 segundos protege un worker en curso. Después de un timeout, se puede consultar/reconciliar con el **mismo payload e Idempotency-Key** dentro de una ventana conservadora de 23 horas desde la creación del intento. Resend conserva su idempotencia durante 24 horas.

Pasadas 23 horas, un intento incierto NO se reenvía y NO libera cuota por sí solo. Requiere un webhook verificado o revisión administrativa del resultado real en Resend (buscá la etiqueta `alma_attempt`). Si el proveedor confirmó aceptación y su ID coincide con ese payload, un administrador puede registrar esa evidencia con `finish_message_send(attempt_id, 'accepted', provider_id)`. No marcar `failed` por mera ausencia de resultados en una lista: eso no demuestra que no hubo envío. Nunca crear otro intento para esquivar uno incierto.

El navegador no puede invocar las funciones de envío, modificar intentos/cuota, falsificar `status=sent`, editar snapshots ni acceder al payload privado. Los mensajes enviados permanecen inmutables. El cuarto envío se bloquea; se pueden seguir guardando borradores. No hay planes pagos ni programación.

## Multimedia y compatibilidad

- Fotos: decodificación real en el navegador, escala proporcional hasta 2048 px y recodificación a WebP/JPEG con calidad 0.82. El servidor verifica firma/estructura y dimensiones de la imagen final.
- Video: máximo 45 segundos. Se re-encodea mediante canvas + MediaRecorder, hasta 720 px en el lado largo y 24 fps, con bitrate adaptado y audio. Antes de permitir guardar se vuelve a medir duración y se exige que el resultado sea menor que el original y conserve su duración (tolerancia de un segundo por metadatos). No se corta el original. Si no se puede comprimir o el resultado no disminuye, se rechaza con alternativa de navegador/formato; no se presenta como compresión exitosa.
- Audio: máximo 120 segundos. Grabación en WebM/Opus o MP4 según soporte; selección de WebM, M4A/MP4, WAV u Ogg/Opus. Si no se puede grabar, se ofrece seleccionar un archivo. No se recortan automáticamente las grabaciones largas: se rechazan intactas.
- Archivos: hasta 20 MB también en el bucket. El servidor descarga el objeto ya subido desde Storage y verifica su contenedor real, duración y tamaño antes de marcarlo `ready`. WebM se verifica por Tracks, Duration y timestamps de bloques; MP4 por movie/media duration y tabla de samples; WAV por byte rate/data y Ogg/Opus por granules. Es validación de contenedores, no un antivirus ni un decodificador exhaustivo de todos los codecs.
- Se conserva el archivo anterior hasta que el nuevo está subido y validado. Las rutas son `usuario/mensaje/asset.ext` y cada versión es inmutable. No se usa upsert ni un bucket público.
- La compresión depende de MediaRecorder, canvas.captureStream y AudioContext. No se verificó su ejecución real en Chrome/Firefox/Safari de esta sesión. Es imprescindible probar reproducción, sonido, duración y bytes del resultado en los navegadores de destino antes de producción.

## Acceso del destinatario, revocación y limpieza

El email multimedia lleva `/recibir/attempt-id#token`, con un token HMAC-SHA256 de 256 bits limitado al intento. El fragmento no se envía en la URL al servidor: la pantalla lo remite mediante POST al endpoint que verifica el token, estado aceptado y ausencia de revocación. Ese acceso devuelve únicamente la copia enviada y una URL de Storage válida por 120 segundos. No autentica al destinatario en el panel ni habilita otras filas/borradores. Reabrir el enlace crea un acceso temporal nuevo; el correo no depende de una URL firmada que expire en dos minutos.

Como todo enlace de acceso, quien reciba su copia puede abrir ese mensaje. Evitá compartirlo fuera de su destinatario. “Revocar acceso” impide emitir nuevas URLs; no retira el correo recibido ni invalida inmediatamente las URLs de Storage ya emitidas. El historial y el asset referenciado se conservan.

La limpieza elimina mediante la API Storage únicamente objetos sin referencias protegidas: versiones anteriores, subidas incompletas de más de 24 horas y borrados pendientes. Nunca elimina el archivo actual o uno usado por un envío activo/aceptado. Se mantiene metadata de auditoría y se registra `removed_at`; una eliminación incierta se puede reintentar. Opcionalmente ejecutá GET `/api/media-cleanup` con `Authorization: Bearer CRON_SECRET` desde tu mantenimiento autorizado, o configurá ese endpoint en Vercel Cron según el plan disponible. No se creó una tarea remota ni se eliminó ningún objeto real en esta sesión.

## Comprobaciones y límites (antecedentes del 4 de octubre)

Estos resultados corresponden a aquella sesión. No describen el estado actual de producción ni autorizan crear datos o enviar correos. Las migraciones y los envíos posteriores confirmados por Sebastián se registran arriba.

- `npm test`: pruebas previas y nuevas; transporte HTTP simulado, hook controlado, modelo persistente de envío para doble solicitud/cuota/reintentos, snapshots, enlaces, origen/identidad verificada en las rutas, validación de contenedores y condiciones de reducción de video.
- `npm run typecheck` y `npm run build`: compilación de rutas y componentes.
- pgTAP: pruebas nuevas de permisos de columna/RPC, aislamiento, reserva/lease, cuarto intento, formatos compartidos, asociación de assets y prevención de borrado referenciado. **Pendientes de ejecutar** por falta de CLI/base de prueba.
- Navegador: se intentó abrir Chrome y el navegador integrado; ambos indicaron indisponibilidad. No hay verificación visual/móvil, cámara ni compresión nativa real.
- Remoto: no se aplicaron las migraciones, no se probaron RLS/Storage reales ni se envió un email real. No hay destinatario de prueba autorizado ni credenciales privilegiadas configuradas. La petición al usuario de una dirección de prueba está pendiente.

Prueba manual de aceptación: crear DOS borradores distintos → guardar → listar → editar sólo uno → recargar → comprobar ambos → enviar a un destinatario autorizado → verificar aceptación/evento de entrega y copia fiel → repetir con Audio, Video y Fotos → reabrir el enlace recibido → probar token incorrecto y otra cuenta → comprobar el cuarto envío y un timeout. Para video, anotá bytes originales/finales y duración; reproducí el resultado completo con sonido. Los logs no deben incluir texto privado, destinatarios ni secretos.

Referencias oficiales: [idempotencia de Resend](https://resend.com/docs/dashboard/emails/idempotency-keys), [verificación de webhooks](https://resend.com/docs/webhooks/verify-webhooks-requests), [Storage privado](https://supabase.com/docs/guides/storage/buckets/fundamentals), [políticas de Storage](https://supabase.com/docs/guides/storage/security/access-control), [variables en Vercel](https://vercel.com/docs/environment-variables/managing-environment-variables).
