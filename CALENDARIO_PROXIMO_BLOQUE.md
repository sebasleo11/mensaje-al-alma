# Calendario: próximo bloque mínimo propuesto — 16/10/2026

Este documento prepara trabajo futuro; no implementa ni autoriza todavía funciones, SQL o infraestructura. Complementa `PRD.md` y `AMPLIACION_PROGRAMACION_NOVIEMBRE.md` sin reemplazar reglas aprobadas.

## Estado cotejado sólo donde hace falta

- Local: UI en `components/messages/MessagesPanel.tsx`, ruta `app/api/messages/[id]/schedule/route.ts`, conversión/validación en `lib/messages/scheduling.ts` y migración 004 preparada. La ruta de programación exige usuario verificado, email confirmado, Origin y versión; confirmar programación no envía correo.
- Production A conserva el panel/API anteriores sin el bloque local de programación ni la lectura nueva de créditos. Eso no permite inferir el esquema remoto. Aplicación de 004 y 005, saldo real y permisos efectivos: no consultados/no confirmados.
- `reserve_message_send_internal()` en 004 rechaza una programación activa `scheduled/blocked/dispatching` antes de recuperar `message_send_attempts`. `/send` llama `reserve_message_send()` sin `p_schedule`: el conflicto conocido de recuperación en `dispatching` sigue presente. No se corrigió.
- `begin_message_schedule()` propuesto bloquea cuenta → mensaje → programación, valida fecha/versión/asset, crea el intento mediante la reserva interna y actualiza a `dispatching` con `attempt_id` y `started_at` dentro de la misma función/transacción. La hora almacenada no equivale al límite de cancelación: el punto de inicio visible es el COMMIT exitoso de la transacción exterior que contiene ambos cambios. No es la hora programada, el SELECT, la asignación de `started_at`, la claim ni la llamada HTTP al proveedor. Este mecanismo está en SQL local; atomicidad, RLS y concurrencia reales no se validaron. Debe cotejarse la transacción/RPC efectiva antes de activarlo.
- Ejecutor automático y adaptador compartido `send-server.ts`: no implementados. `sendMessage()` recibe dependencias; `/send` aún construye el adaptador de reserva/prepare/claim/finish. No activar Cron ni reutilizar automáticamente el replay manual.

## Reglas que deben conservarse

Fecha/hora local y zona IANA explícitas; almacenar instante UTC y la intención local/offset. Rechazar horas DST inexistentes y exigir elección explícita ante horas repetidas. Mínimo 5 minutos validado por reloj autoritativo de Postgres. Confirmar reserva una vez; reprogramar conserva la misma reserva; cancelar antes del inicio la libera una vez y conserva el borrador. Cancelar primero para editar contenido. Atraso estrictamente mayor a 15 minutos: revisión, sin envío automático y conservando la reserva. Un resultado incierto conserva cuota/payload/clave; nunca habilita un nuevo intento o replay automático por el solo vencimiento de una lease.

## Una única recomendación para el siguiente bloque

**Cerrar localmente la recuperación del intento al comenzar un envío programado, sin ejecutor ni cambios remotos.** Primero escribir una regresión simulada que reproduzca `dispatching → /send → message scheduled`; después proponer el ajuste mínimo del adaptador/reserva para recuperar exactamente el intento vinculado, conservando Auth/propiedad, snapshot, idempotencia y versión. Extraer sólo lo indispensable del adaptador server-only si hace falta; no rediseñar UI ni pagos. No permitir enviar ahora por encima de una reserva `scheduled/blocked`. Cotejar en revisión el punto de COMMIT y el orden de locks con cancelar, reprogramar y finish.

Verificación propuesta sin Docker, emails, cuentas reales ni créditos:

1. Tests con reloj fijo, Auth/RPC/proveedor simulados: el intento vinculado se recupera; no se crea otro intento ni otra reserva; `scheduled/blocked` siguen rechazando envío inmediato; `uncertain/sending` no disparan replay automático; revisión/cancelación conservan contenido y reserva según estado.
2. Casos de límites 5 minutos, exactamente 15 minutos y >15 minutos; DST; repetición de confirmación/cancelación; versión obsoleta; fallo al persistir resultado y webhook simulado. Una simulación de intercalados no prueba locks reales.
3. Ejecutar scripts existentes `npm test`, `npx --no-install tsc --noEmit --incremental false` y `git diff --check`; build sólo cuando el cambio lo justifique. Revisar el diff contra la rama B recuperable y mantener CSS/logo idénticos.
4. Preparar casos SQL/pgTAP y de aislamiento, sin ejecutarlos en este bloque. Para validar locks, permisos y RLS de verdad hace falta después PostgreSQL aislado con pgTAP/Supabase Auth/Storage compatibles y varias sesiones. No hay `psql` disponible al preparar este plan. Sin Docker, una instalación nativa o un entorno de prueba separado requiere alcance/autorización nuevos. No sustituir esa prueba con mocks ni usar Production como banco de pruebas.

Salida de ese siguiente bloque: regresión y arreglo local revisables, adaptador mínimo si corresponde, más evidencia simulada y lista explícita de SQL pendiente. No habilita migración 004, automatismo ni publicación. Validación SQL aislada debe preceder a cualquier activación de calendario.

## Pagos futuros: sólo punto de conexión, sin arquitectura nueva

Precios/valores pendientes y derecho de envío con importes diferentes por formato; un crédito comprado no se define como un mensaje universal. Video >45 segundos no está autorizado. No cambiar gratuitos ni créditos administrativos ni diseñar aquí tablas, proveedor, precios o dependencias.

Conectar la futura validación/reserva autoritativa del derecho de envío en el servidor, en el mismo límite transaccional donde hoy se valida/reserva el cupo: confirmación de programación (`change_message_schedule`) y envío inmediato (`reserve_message_send_internal` / su adaptador). El formato y asset deben ser los confirmados, no un importe del cliente. Al comenzar (`begin_message_schedule`) transferir la reserva existente al intento de forma atómica, sin cobrar/reservar de nuevo; reprogramar conserva, cancelar libera según reglas futuras aprobadas. El replay del mismo intento no debe consumir un derecho nuevo, y la incertidumbre mantiene su reserva/consumo hasta evidencia suficiente. El diseño comercial concreto queda pendiente de definición antes de implementarlo.
