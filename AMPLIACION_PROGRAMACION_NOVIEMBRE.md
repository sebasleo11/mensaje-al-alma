# Ampliación de noviembre: programación de mensajes

Fecha del diseño: 12 de octubre de 2026. Actualización: 13 de octubre de 2026. **Estado: alcance y reglas de producto indicadas abajo aprobados; primer bloque implementado localmente; migración preparada, no aplicada; automatismo no implementado.**

## Alcance aprobado por Sebastián

Enviar ahora o programar por fecha y hora; mostrar explícitamente la zona horaria; cambiar o cancelar la programación antes de comenzar el envío. Cancelarla conserva el mensaje como borrador. Mantener revisión y confirmación explícitas.

Este archivo complementa `PRD.md` sin reescribirlo. El bloque de legibilidad y responsive ya está publicado y fue comprobado en celular por Sebastián: se conserva. Algunas referencias de `MESSAGES_SETUP.md` a publicación/configuración son antecedentes y no sustituyen esta confirmación. No incluye pagos, saldo comprado, recurrencia ni condiciones por fallecimiento. La actualización documental previa no cambió código ni infraestructura. En el bloque local del 13/10 se implementaron controles/API y se preparó la migración de reservas; no se modificó infraestructura remota, claves ni responsive.

## Reglas de producto aprobadas el 13/10/2026

- Reservar un cupo al confirmar la programación; cancelarla antes del inicio libera esa reserva y conserva el borrador. Reprogramar conserva la reserva.
- Cancelar la programación antes de editar contenido; luego guardar, revisar y confirmar una programación nueva. La reserva liberada no queda garantizada para la nueva confirmación.
- Permitir cancelar o reprogramar hasta comenzar el envío, incluso si pasó la hora prevista mientras todavía no comenzó. Inicio aprobado: transición a `dispatching` y creación/vinculación del intento en una única transacción, compitiendo con cancelar/reprogramar bajo los mismos locks y versión.
- Exigir anticipación mínima de 5 minutos al confirmar o reprogramar, respecto del reloj autoritativo de Postgres. Un atraso superior a 15 minutos queda pendiente de revisión, sin envío automático y conservando la reserva. Esto no aprueba una garantía de inicio ni de llegada a Inbox dentro de 5 minutos.

## Evidencia de disponibilidad en Production — 13/10/2026

Resultado SQL comunicado por Sebastián; no ejecutado ni comprobado de nuevo por el agente en esta actualización:

| Extensión | Versión disponible | Estado reportado |
| --- | --- | --- |
| `pg_cron` | 1.6.4 | Disponible, no instalada. |
| `pg_net` | 0.20.4 | Disponible, no instalada. |
| `supabase_vault` | 0.3.1 | Instalada. |

La disponibilidad confirma que las extensiones pueden encontrarse en el proyecto; no demuestra permisos para habilitarlas, jobs operativos, capacidad, costos ni continuidad. Vault instalada no demuestra que exista el secreto del ejecutor. Cron y solicitudes HTTP aún requieren habilitación futura autorizada. Registro, eventos suscritos y validación operativa de firma del webhook de Resend en Production siguen sin verificar.

## Base existente y restricciones

- `reserve_message_send()` serializa por cuenta y mensaje; cuenta intentos cuyo estado no es `failed`, con máximo tres. Copia destinatario, contenido y archivo en `message_send_attempts`.
- `sendMessage()` persiste el payload y usa `alma-message/<attempt-id>/v1`. `claim_message_send()` aplica una lease de 60 segundos y limita reintentos a 23 horas desde `created_at`. La documentación de [Resend](https://resend.com/docs/dashboard/emails/idempotency-keys) establece una retención de claves de 24 horas.
- Por eso **no crear un intento de envío semanas antes**: su ventana de recuperación vencería antes de enviar. La programación necesita una reserva separada, transferida al intento cuando comienza la ejecución.
- `message_locked()` protege contenido y multimedia; limpieza y lectura del panel hoy sólo consideran intentos. Deben considerar también programaciones activas, sin relajar la inmutabilidad existente.

## Datos y estados propuestos

Nueva tabla `message_schedules`; no agregar estados a `messages.status` ni modificar los estados del proveedor. El mensaje permanece `draft` hasta la aceptación; el panel distingue “Programado” por la relación con esta tabla.

| Campo | Propósito |
| --- | --- |
| `id uuid`, `message_id`, `user_id` | Identidad estable de la confirmación; propietario validado contra el mensaje. |
| `scheduled_at timestamptz` | Instante UTC autoritativo para el ejecutor. |
| `time_zone text`, `local_datetime timestamp`, `utc_offset_minutes smallint` | Zona IANA elegida y fecha/hora/offset que revisó el usuario. |
| `message_updated_at timestamptz`, `asset_id uuid nullable` | Versión confirmada y archivo privado exacto protegido. El texto/destinatario permanecen en el mensaje, bloqueado. |
| `version bigint` | Comparación optimista al cambiar/cancelar; empieza en 1. |
| `state text` | `scheduled`, `blocked`, `dispatching`, `finished`, `cancelled`. |
| `attempt_id uuid nullable unique`, `started_at`, `cancelled_at` | Transferencia única al intento y evidencia del límite para cancelar. |
| `created_at`, `updated_at`, `last_error_code nullable` | Seguimiento sin registrar textos, emails ni secretos en logs. |

`scheduled` y `blocked` reservan un cupo sin intentar enviar. `blocked` requiere intervención antes de comenzar (configuración inválida o atraso fuera del margen aprobado). `dispatching` ya tiene un intento vinculado: su resultado, incluyendo `uncertain`, se obtiene del intento. `finished` refleja un resultado confirmado; no sustituye estados como `accepted`, `delivered`, `bounced` o `failed`. Un webhook puede actualizar ese resultado sin cambiar la identidad. `cancelled` no tiene intento y libera la reserva.

Una programación activa por mensaje: índice único parcial para `scheduled/blocked/dispatching`; índice por `(scheduled_at,id)` para pendientes; restricción de coherencia entre estado, `attempt_id` y `started_at`. FK a mensajes con borrado en cascada para permitir eliminar posteriormente un borrador cancelado; ningún envío existente pierde su protección por FK. No borrar programaciones activas para liberar cuota.

## Fecha, zona y confirmación

- Entrada: fecha/hora local y zona IANA visible, por ejemplo `America/Argentina/Buenos_Aires`. Sugerir la zona del navegador, pero pedir confirmación; no asumir zona del destinatario ni usar la zona del servidor.
- Convertir y validar en servidor con una biblioteca con soporte IANA/DST; no usar `new Date(datetime-local)` como interpretación implícita. Mostrar “15/11/2026, 10:00 — America/Argentina/Buenos_Aires (UTC−03:00)” antes de confirmar; equivale a `2026-11-15T13:00:00Z`.
- Rechazar zonas inválidas y horas inexistentes por horario de verano. Para horas repetidas, recomendar pedir qué ocurrencia/offset se desea; nunca elegir silenciosamente.
- Guardar UTC y la intención local. UTC determina la ejecución; mostrar siempre en la zona elegida, no cambiarla al viajar. Si cambian reglas horarias y el instante ya no representa la hora local confirmada, marcar para revisión en lugar de moverlo silenciosamente.
- “Guardar borrador” no programa. Recorrido: guardar → elegir enviar ahora/programar → revisar destinatario, contenido, archivo, fecha, zona y cupo → confirmar. Reprogramar requiere nueva revisión y confirmación. Cancelar requiere confirmar que conservará el borrador. Programar confirma programación, nunca aceptación del proveedor.
- El cierre de un envío inmediato sigue exigiendo `state === 'accepted'`. No reutilizar esa condición para presentar una programación como enviada. Conservar recuperación y protección al salir con cambios; no rediseñar CSS.

## Cuota, bloqueos y concurrencia

**Regla de reserva aprobada; fórmula técnica propuesta:** `ocupados = intentos no failed + programaciones scheduled/blocked`. El límite sigue siendo tres, compartido entre formatos y modos. Una programación no crea dos consumos: al comenzar, la reserva se transforma en un intento dentro de la misma transacción. Cancelar libera una sola reserva; reprogramar no libera ni toma otra. Un rechazo confirmado conserva la política existente de liberar el intento; aceptación, rebote posterior e incertidumbre conservan cupo. Agotar cuota no impide crear/editar/guardar otros borradores.

Orden común de locks para confirmar, enviar ahora, reprogramar, cancelar e iniciar ejecución: **cuenta → mensaje → programación → intento**. Seleccionar candidatos sin locks previos que inviertan ese orden; al tomar los locks volver a comprobar fecha, versión, propietario y estado. Procesar lotes pequeños, no mantener una transacción abierta durante la llamada a Resend.

- Confirmar programación comprueba sesión/email confirmado, `expectedUpdatedAt`, contenido y asset `ready`, y disponibilidad de cupo. Usa UUID estable: repetir la misma confirmación devuelve el registro, no consume otro cupo; un payload distinto con ese UUID responde conflicto.
- Mientras está programado, bloquear edición de contenido, reemplazo/eliminación de archivo y borrado del mensaje. Cambiar sólo fecha/zona mediante RPC. Para editar contenido, exigir cancelar → editar/guardar → volver a revisar/programar; el cupo puede ser ocupado mientras tanto, sin prometer una reserva que ya se liberó.
- Cancelar/reprogramar exige `expectedVersion`; una versión obsoleta responde 409 y obliga a releer. Un doble cancelar devuelve cancelado sin liberar dos veces. Pasar la hora no significa que empezó: manda el estado persistido.
- **Inicio aprobado:** transacción que cambia a `dispatching`, fija `started_at`, crea/vincula un único intento `prepared` y transfiere cuota. Desde ese commit ya no se permite cancelar/reprogramar, aunque la llamada externa todavía no haya salido. La UI lo explica como “El envío comenzó; ya no podemos cambiarlo”. Cancelación e inicio simultáneos: gana la primera transacción; la otra relee y no aplica una acción incompatible.
- Enviar ahora no ignora una programación activa: responde conflicto. Ofrecer primero cancelarla y después revisar el envío inmediato. La reserva inmediata debe contar las reservas programadas; de lo contrario podría producir un cuarto envío.

## Ejecutor y fallos

**Comprobado el 12/10 por CLI:** equipo `team_ctpZ4vwZUSI6J55UhpLFkhbQ`, plan Vercel `hobby`, activo. No hay `vercel.json` de Cron en el checkout.

[Vercel Cron](https://vercel.com/docs/cron-jobs/usage-and-pricing) en Hobby admite una ejecución diaria, con disparo dentro de la hora prevista. No satisface una programación por hora con margen de minutos. Pro permite intervalo de un minuto, pero ese plan no está contratado/verificado para este proyecto. No distribuir muchos crons diarios para simular frecuencia ni depender de una pestaña abierta o de localhost.

**Alternativa recomendada condicionada:** Supabase Cron → solicitud HTTP autenticada → ejecutor Node en el proyecto Vercel existente. [Supabase documenta Cron y solicitudes HTTP](https://supabase.com/docs/guides/cron), y [pg_cron + pg_net con secretos en Vault](https://supabase.com/docs/guides/functions/schedule-functions). La evidencia SQL del 13/10 reportada arriba confirma disponibilidad de `pg_cron` y `pg_net`, todavía no instaladas, y Vault instalada. Siguen pendientes permisos, habilitación autorizada, cuotas, continuidad y costo/capacidad para una invocación por minuto. Si no está disponible, evaluar Vercel Pro con aprobación de Sebastián; no cambiar ningún plan ahora.

El reloj autoritativo es Postgres. Cada tick busca `scheduled_at <= now()`, no igualdad exacta; así recupera disparos omitidos. Lotes y presupuesto de ejecución se fijarán tras medir límites reales. El ejecutor usa secreto propio `SCHEDULE_RUNNER_SECRET`, sin sesión de usuario ni dependencia del Origin del navegador; la ruta de usuario mantiene Auth y Origin. No llamar por HTTP a `/send` simulando un usuario: extraer su adaptador server-only y reutilizar `sendMessage()` con dependencias autorizadas.

- Antes de iniciar, si `now() - scheduled_at > interval '15 minutes'`, pasar a `blocked` para revisión, conservar cupo y no enviar automáticamente. El umbral exacto de 15 minutos no activa esta regla de atraso superior; tampoco constituye garantía de ejecución.
- Validar configuración antes de transferir la reserva; si no es válida, pasar a `blocked`, conservar cupo y permitir cancelar/reprogramar.
- Persistir payload antes de invocar al proveedor, conservar clave y snapshot. El modo automático sólo reclama intentos `prepared`; **no** usa la rama actual de replay para `sending/uncertain`. Una caída antes de obtener la claim puede retomarse sobre el mismo intento; después de `sending`, lease vencida significa resultado incierto, no permiso para reenviar automáticamente.
- Un cron duplicado no repite la llamada: claim atómica por intento. [Vercel documenta ejecuciones omitidas/duplicadas y concurrencia](https://vercel.com/docs/cron-jobs/manage-cron-jobs); no prometer entrega exactamente una vez sólo por usar Cron.
- Timeout, caída tras aceptación externa o falla al persistir resultado: mantener `uncertain`, copia bloqueada y cupo. Resolver por webhook firmado o revisión del proveedor. Cualquier reintento manual autorizado conserva payload/clave, ventana conservadora de 23 horas y confirmación explícita. Nunca crear otro intento para esquivar incertidumbre; fuera de ventana no reenviar por ausencia de evidencia.
- Rechazo confirmado: mostrar fallo, detener automatismo y conservar texto como borrador editable según la política actual. Webhooks tardíos no pueden degradar aceptación ni alterar un intento diferente.

## Migración preparada — no ejecutada

Una migración nueva posterior a 003, sin repetir anteriores:

1. Crear `message_schedules`, constraints, índices y RLS de lectura propia. Sólo RPC server-side puede escribir programación, estado y reserva; sin permisos directos de escritura para el navegador. Funciones privilegiadas con `search_path` fijo y permisos mínimos.
2. RPC para confirmar, reprogramar, cancelar e iniciar/obtener intento. Validar propiedad y versión bajo locks. No aceptar el usuario o la cuota como autoridad desde el cliente.
3. Extender `reserve_message_send()` para contar reservas; la transferencia de un cupo sólo mediante una programación válida bloqueada, no con un booleano que saltee límite. Mantener validaciones, snapshots y límite actual. Cambiar la claim sólo para ofrecer modo inicial del worker, sin abrir replays automáticos.
4. Extender `message_locked()`, guards de edición/borrado y las RPC de multimedia/limpieza para proteger programaciones y asset referenciado. La transferencia elimina la reserva activa y crea el intento atómicamente. Evitar que borrar/archive/cleanup pase entre comprobar y bloquear. Las escrituras directas del SDK también deben usar un guard con comprobación vigente después de esperar el lock del mensaje; una SELECT previa o una función STABLE con snapshot anterior no alcanza. Probar esta carrera explícitamente. Alinear el orden de locks con `finish_message_send()`, que hoy toma intento antes de actualizar mensaje, para evitar deadlocks con las nuevas operaciones.
5. Sin backfill de programaciones ni cambio de estados históricos. Probar migración en base aislada antes de cualquier autorización remota.

## Archivos previstos para implementación futura

| Archivos | Cambio propuesto |
| --- | --- |
| `components/messages/MessagesPanel.tsx` | Controles de fecha/zona, revisión, estado y acciones; mantener layout aprobado. |
| `lib/messages/scheduling.ts` (nuevo) | Validación temporal/conversión y orquestación de programación. |
| `lib/messages/send-server.ts` (nuevo), `lib/messages/send.ts`, `app/api/messages/[id]/send/route.ts` | Extraer adaptador reutilizable; reserva/claim diferenciadas; conservar envío inmediato. |
| `app/api/messages/[id]/schedule/route.ts` (nuevo) | Confirmar, reprogramar y cancelar con Auth, Origin y versión. |
| `app/api/scheduled-messages/run/route.ts` (nuevo) | Tick privado, ejecución acotada y sin replay automático. |
| `app/api/messages/route.ts`, `app/api/messages/[id]/route.ts`, ruta `[id]/media`, `lib/media/storage.ts` | Lectura de programación/cupo reservado y coherencia de protección de borrado/archivos. |
| `utils/supabase/database.types.ts`, nueva migración y pruebas SQL | Tabla/RPC tipadas, permisos, locks e invariantes. |
| `tests/message-scheduling.test.ts` (nuevo), tests existentes | Reloj/proveedor/DB simulados; regresión del envío inmediato. |
| Configuración del ejecutor seleccionado y documentación | Job/Vault si Supabase; `vercel.json` sólo si se aprueba un plan compatible. Ninguno se crea en este paso. |

`PRD.md`, landing, CSS y recuperación local no requieren cambios para este bloque. La vista de destinatario, formato del email y multimedia privada se conservan. El webhook actual sigue como evidencia; comprobar su configuración antes de activar programación.

## Configuración necesaria, pendiente

Verificar Production sin copiar `.env.local`: `APP_URL`, remitente verificado, Resend API, service role y secreto de destinatarios existentes. Verificar `RESEND_WEBHOOK_SECRET` y eventos firmados: su ausencia local/antecedente no prueba su estado actual en Production. Habilitar programación automática sólo después de validar reconciliación y monitoreo. Secret del ejecutor fuera del repo, guardado en Vault si lo invoca Supabase. Verificar endpoint accesible para ese ejecutor sin debilitar protección; observar última ejecución, atraso y pendientes/inciertos sin datos privados. Una invocación HTTP aceptada por el scheduler no demuestra que el envío terminó.

## Criterios de aceptación — cobertura simulada parcial, SQL pendiente

1. Confirmación repetida reserva un cupo; combinación de inmediatos/programados jamás supera tres. Tres ocupados permiten nuevos borradores, edición y guardado. Reprogramar conserva cupo; cancelar libera exactamente uno y conserva contenido/archivo.
2. Conversión Buenos Aires→UTC, viaje del navegador, zona inválida, DST inexistente/repetido, hora pasada y límite mínimo. Revisión y listado muestran misma fecha/zona/offset.
3. Cancelar vs tick, reprogramar vs tick, enviar ahora vs programar y dos workers: una transición ganadora; versión obsoleta 409; como máximo una llamada inicial al proveedor por intento.
4. Payload idéntico al contenido confirmado; un programado no puede editarse/borrarse ni perder su asset por limpieza. Cancelarlo permite retomar el mismo mensaje, sin sobrescribir otro borrador.
5. Caída antes de claim, después de claim, tras aceptación y antes de escritura; timeout, cron duplicado/omitido y webhook tardío. Ningún resultado incierto provoca replay automático ni libera cuota.
6. Pruebas pgTAP futuras en base aislada para locks/RLS/transferencia; pruebas de React con adapters y reloj virtual para revisión, cancelación y conservación. Sin cuentas, emails o filas reales. Mantener regresión de cierre sólo ante `accepted` y guardado sin envío/programación implícita.

## Primer bloque de implementación local propuesto

**Objetivo:** preparar persistencia, reglas y gestión de programación con validaciones simuladas, y extraer el adaptador de envío existente para su reutilización posterior. No activar ejecución automática ni presentar un mensaje como enviado por confirmar su programación. Este bloque se implementó localmente el 13/10: código y pruebas simuladas, migración y pruebas SQL preparadas sin ejecutar. No se habilitó un ejecutor.

| Archivos concretos | Alcance del primer bloque |
| --- | --- |
| `supabase/migrations/202610130004_message_schedules.sql` (nuevo, sólo preparar) | Tabla, índices, RLS y RPC de confirmar/reprogramar/cancelar; reserva compartida con envío inmediato, mínimo de 5 minutos validado bajo locks y protección de contenido/archivo. Preparar transición de inicio y transferencia atómica con el instante de inicio aprobado. Sin instalar extensiones, jobs ni ejecutar SQL. |
| `utils/supabase/database.types.ts` | Tipos de programación y RPC, sin cambiar estados históricos del proveedor. |
| `lib/messages/scheduling.ts` (nuevo) | Conversión IANA/UTC, validación de fechas, versión e identidad de confirmación; política de atraso superior a 15 minutos con reloj inyectable. Elegir biblioteca compatible tras revisar dependencias existentes. |
| `app/api/messages/[id]/schedule/route.ts` (nuevo) | Confirmar, reprogramar y cancelar con Auth, Origin, revisión de versión y respuestas de conflicto; nunca llamar a Resend. |
| `app/api/messages/route.ts`, `lib/messages/panel.ts`, `components/messages/MessagesPanel.tsx` | Lectura de programación y cupo; fecha/zona, revisión explícita, cancelar/reprogramar y bloqueo de edición; conservar responsive y borradores existentes. |
| `app/api/messages/[id]/route.ts`, `app/api/messages/[id]/media/route.ts`, `lib/media/storage.ts` | Coherencia de edición, borrado y limpieza con las protecciones SQL; conservar archivos al cancelar. |
| `lib/messages/send-server.ts` (nuevo), `app/api/messages/[id]/send/route.ts`, `lib/messages/send.ts` | Extraer las dependencias server-only actuales hacia un adaptador reutilizable manteniendo Auth/Origin en la ruta inmediata; conservar `sendMessage()`, payload persistido, snapshot, clave de idempotencia y cierre sólo ante `accepted`. Preparar contratos para un intento programado ya reservado, sin doble cuota ni replay automático de `sending/uncertain`. |
| `tests/message-scheduling.test.ts` (nuevo), `tests/message-features.test.ts`, `tests/messages-http.test.ts`, `supabase/tests/message_scheduling.test.sql` (nuevo) | Preparar casos simulados para 5 minutos, atraso >15 minutos, reserva/cancelación/reprogramación, conflictos, zonas y regresión inmediata; preparar SQL de RLS/concurrencia para base aislada futura, sin ejecutarlo en Production. |

Criterio de revisión del bloque: confirmación idempotente, máximo tres cupos entre ambos modos, cancelación que conserva contenido y libera una sola reserva, reprogramación sin nueva reserva, protección consistente de archivos y ausencia de llamadas al proveedor desde las acciones de programación. Las pruebas de locks y RLS requieren posteriormente una base aislada autorizada; mocks no acreditan esas garantías.

**Dependencia del webhook:** preparar la tabla, las RPC, la UI y la extracción del adaptador no requiere un webhook operativo. Habilitar el ejecutor y permitir envíos automáticos sí queda bloqueado hasta verificar el endpoint Production registrado, los eventos `email.sent`, `email.delivered`, `email.bounced`, `email.failed`, `email.suppressed` y evidencia de firma validada en una entrega histórica, junto con reconciliación del intento correcto. Una respuesta HTTP 2xx sola no demuestra actualización del intento. Un resultado `uncertain` conserva cupo y bloqueos; sin evidencia firmada o revisión del proveedor no puede resolverse ni reenviarse automáticamente.

Quedan fuera del primer bloque `app/api/scheduled-messages/run/route.ts`, la activación de Cron/pg_net, jobs, secretos/Vault, configuración remota y cambios de plan. La ruta del ejecutor se prepara en un bloque posterior, tras verificar webhook y autorizar infraestructura. Revisar las guías locales de Next.js antes de escribir código en esa ejecución futura.

## Decisiones técnicas y verificaciones pendientes

| Caso concreto | Pendiente |
| --- | --- |
| Instante exacto de comienzo del envío | Aprobado: `dispatching` + creación/vinculación del intento en una misma transacción. Cancelación/reprogramación compiten con los mismos locks y versión; gana la primera transacción confirmada. |
| Cron/pg_net disponibles pero no instaladas | Verificar permisos, plan, consumo y continuidad; habilitación y creación de job requieren autorización futura separada. No dar por elegida ni operativa la infraestructura. |
| Horas ambiguas y reglas horarias cambiadas | Confirmar propuesta de offset/ocurrencia explícita y revisión ante discrepancias; UTC fijo como diseño propuesto. |
| Atraso superior a 15 minutos | El bloqueo sin envío automático está aprobado; definir quién revisa y cómo se retoma mediante nueva revisión/confirmación, sin desbloqueo automático. |
| Resultado incierto y webhook | Verificar configuración y firma operativa; definir responsable de incidentes antes de habilitar automatismo. No pedir secretos por chat. |

Reserva, liberación al cancelar, cancelación previa a editar, posibilidad de cancelar/reprogramar hasta el inicio y umbrales indicados son reglas aprobadas. El resto del diseño técnico sigue propuesto. El bloque local fue autorizado e implementado; esta ejecución no autoriza cambios de infraestructura ni aplicación de migraciones.

## Evidencia del bloque local — 13/10/2026

- `lib/messages/scheduling.ts`: conversión con la base IANA de `Intl.DateTimeFormat`, sin dependencias nuevas ni interpretación de la zona del servidor; horas inexistentes rechazadas y repetidas requieren offset explícito. Postgres revalida instante/zona/offset y el mínimo de 5 minutos bajo locks.
- API de programación y lecturas del panel: esquema ausente informa indisponibilidad; no produce confirmación local optimista. La UI mantiene revisión y confirmación, conservación del borrador y cierre inmediato sólo ante `accepted`. Advierte que el automatismo aún no está habilitado.
- `202610130004_message_schedules.sql`: reserva compartida, transición de inicio, versiones, protecciones de contenido/media y orden cuenta → mensaje → programación → intento. `finish_message_send()` sigue ese orden. Un atraso >15 minutos bloquea sin crear intento. Las escrituras directas de assets usan lock de mensaje NOWAIT para rechazar inversión de locks, sin prometer éxito de esa operación concurrente.
- Se conserva `sendMessage()` y la ruta inmediata; no fue necesario extraer `send-server.ts` en ausencia de ejecutor. El futuro ejecutor debe reutilizar ese envío con claim inicial sin replay automático; no está implementado en este bloque.
- Comprobaciones locales completadas: `npm test`, `npx tsc --noEmit --incremental false` y `git diff --check`. Pruebas TypeScript con Auth, transporte y hooks simulados; incluye fechas/DST, cuota calculada, indisponibilidad, permisos de API, conservación/cancelación y regresión inmediata. No equivalen a verificación visual en navegador ni de PostgreSQL.
- Pruebas SQL pgTAP preparadas en `supabase/tests/message_scheduling.test.sql` y carreras de cancelación/inicio en `supabase/tests/isolation/message_schedule.spec`. No ejecutadas: permisos reales, locks, constraints, rollback y transferencia requieren una base aislada con 001–004 y luego autorización separada para Production.
- Webhook Production, habilitación de extensiones, jobs, permisos operativos, presupuesto y continuidad siguen pendientes. Ningún servicio remoto fue usado por las pruebas.
