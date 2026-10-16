# Crédito manual de desarrollo — preparado, no asignado

Autorización de Sebastián: **50 envíos adicionales**, exclusivamente para el usuario existente de Auth con email `cursoiainteligente@gmail.com`. Es una asignación manual de desarrollo, sin compra ni pago. Base 3 + crédito 50 = límite total 53; saldo = 53 − intentos no fallidos − reservas `scheduled/blocked`. `dispatching` se cuenta sólo mediante el intento; cancelación y rechazo confirmado conservan las políticas actuales. No reinicia historial ni consumo.

## SQL exacto para revisión y ejecución futura autorizada

1. Identificación **pendiente**, no se consultó Auth remotamente. Consulta de sólo lectura para comprobar un único usuario confirmado:

```sql
select id, email, email_confirmed_at
from auth.users
where lower(email) = 'cursoiainteligente@gmail.com';
```

2. Revisar/aplicar exclusivamente `supabase/migrations/202610130005_development_send_credit.sql`, sobre 001–003 existentes. No usar `supabase db push`: arrastraría 004 pendiente. 005 prepara tabla y lectura de saldo y adapta sólo el umbral de las RPC existentes, conservando sus cuerpos; aborta si la definición no coincide. No asigna créditos ni crea usuarios. Puede coexistir con 004 si se autoriza en otro paso.
3. Ejecutar separadamente el SQL exacto de `supabase/admin/assign_sebastian_development_credit.sql` con privilegios administrativos. Resuelve el UUID de Auth sin inventarlo; exige un único usuario confirmado, usa el lock de cuenta existente y una clave única global. Repetirlo conserva los mismos 50. Si el email pasa a otro UUID, aborta en lugar de mover/repetir el crédito.
4. El código del panel debe publicarse posteriormente con autorización. La migración sola cambia cuota servidor pero el frontend publicado anterior seguiría bloqueando en tres. El código nuevo sin 005 conserva la cuota antigua de tres; no anuncia créditos inexistentes.

La aplicación puede consultar sólo su propio saldo con `get_message_quota()`, sin parámetros de identidad. No tiene permiso para asignar créditos; tampoco la clave service_role puede escribir en la tabla. No hay endpoint de asignación. 004 preparada respeta el límite de 005 si se aplica después; sin 005 conserva tres.

## Validación

Comprobaciones realizadas: `npm test`, `npx tsc --noEmit --incremental false` y `git diff --check`, correctas. Pruebas locales con transporte/hooks simulados y validación de tipos. SQL pgTAP preparado en `supabase/tests/message_development_credit.test.sql`, no ejecutado: permisos reales, asignación idempotente, límite 53, reservas compartidas y concurrencia siguen requiriendo PostgreSQL aislado. No se invocó Resend, no se usaron mensajes ni usuarios reales. Ninguna escritura remota ni despliegue en este paso.
