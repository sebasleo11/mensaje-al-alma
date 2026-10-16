# Recuperación de borradores — 4 de octubre de 2026

## Comportamiento actual — 12 de octubre de 2026

La recuperación mantiene IDs, filtros de propietario, bloqueo ante errores y respaldos locales. “Continuar en Mis mensajes” guarda primero el texto visible; con sesión abre el mismo ID en el editor completo. Un fallo de guardado impide la transición. Sin sesión, conserva `alma-draft` en el mismo navegador/origen y no lo importa automáticamente a una cuenta; se recupera volviendo al editor rápido sin sesión. Los archivos seleccionados allí no se guardan: deben elegirse de nuevo en Mis mensajes.

Guardar no envía ni programa; en el editor completo el recorrido es Guardar borrador → Revisar envío → Confirmar envío ahora. Se conserva la protección al salir con cambios.

Sebastián confirmó migraciones aplicadas, mensajes visibles en producción y envíos funcionales de texto, foto y video. No repetir migraciones ni reiniciar los diagnósticos resueltos. La recuperación del borrador original y el aislamiento real no quedan demostrados por esas confirmaciones.

## Verificación del bloque de coherencia y legibilidad

TypeScript y compilación webpack pasaron. La prueba del hook con adaptadores simulados comprobó guardado con ID estable para la transición, bloqueo ante recuperación fallida, cambios pendientes y conservación del borrador anónimo sin escritura en una cuenta. No creó datos reales ni envió correos.

Se ajustaron tamaños mínimos y reglas responsive en código. No hay navegador disponible en esta sesión: quedan pendientes la revisión visual en 320, 375, 390 y 760 px, zoom al 200 % y el recorrido autenticado con un borrador existente. Estos cambios no se desplegaron.

## Evidencia y límites (antecedentes del 4 de octubre)

El proyecto configurado es `lwlbulzmqvovipayswrr`; su URL coincide con la referencia de la clave anon. Auth respondió 200. La comprobación de la API REST, sin filas (`limit=0`), volvió a responder 404/PGRST205 para `public.messages`. Esto confirma que PostgREST no encuentra la tabla en su caché; no demuestra que la tabla falte físicamente. No hay conexión administrativa, CLI de Supabase, credenciales de base ni navegador conectado para comprobar el catálogo o el borrador original.

El 522 anterior ocurrió en GET `/rest/v1/messages`, con selección de las columnas previstas, filtros de texto/borrador y `limit=0`; no en Auth. Es un timeout remoto independiente del PGRST205. No se determinó la causa interna del timeout.

## Comprobar el esquema sin tocar datos (procedimiento histórico)

No ejecutar este procedimiento para repetir migraciones ya confirmadas. Los errores y carencias siguientes corresponden al diagnóstico anterior, no al estado actual.

1. Abrí el panel del proyecto Supabase y contrastá su referencia con `lwlbulzmqvovipayswrr`. Si no es el proyecto donde guardaste el mensaje, primero identificá el proyecto original. No reemplaces URL/clave por valores supuestos.
2. Ejecutá en SQL Editor **solamente** `supabase/tests/messages_schema_diagnostic.sql`. No consulta contenido privado ni modifica datos.
3. Si `messages_table` es NULL, revisá si hay una tabla original en otro esquema/proyecto. Si confirmás que este es el proyecto previsto y que falta la tabla, revisá y ejecutá el archivo existente `supabase/migrations/202610030001_create_messages.sql`. Su transacción crea la tabla y RLS; falla si ya existe y no debe adaptarse con DROP o desactivando RLS. Crear la tabla no recupera mensajes locales ni datos de otro proyecto.
4. Si existe `public.messages`, compará columnas, permisos y políticas con la migración. No vuelvas a ejecutar CREATE TABLE. Comprobá en la configuración de Data API que `public` esté expuesto. Con el esquema correcto, podés refrescar la caché en SQL Editor: `NOTIFY pgrst, 'reload schema';`. No alteres permisos sin diagnosticar una discrepancia concreta.
5. Repetí la apertura del editor con sesión; PGRST205 no debe persistir. La consola ahora informa sólo etapa, código y estado, sin contenido ni credenciales.

La migración y el diagnóstico remoto **no fueron ejecutados** en esta sesión.

## Localizar el contenido anterior

`alma-draft` pertenece al origen exacto del navegador: protocolo, dominio y puerto. `localhost:3000`, `127.0.0.1:3000`, la URL publicada y cada URL de preview tienen almacenamientos distintos. Revisá cada origen donde escribiste usando el navegador y perfil originales. Un navegador distinto vacío no prueba pérdida de datos.

En Herramientas de desarrollo → Almacenamiento → Almacenamiento local, buscá únicamente `alma-draft`. Para comprobar su presencia sin mostrar contenido ni tokens, podés ejecutar:

```js
(() => {
  const raw = localStorage.getItem('alma-draft');
  if (raw === null) return { origen: location.origin, existe: false };
  try {
    const value = JSON.parse(raw);
    return { origen: location.origin, existe: true, caracteres: typeof value?.message === 'string' ? value.message.length : null };
  } catch { return { origen: location.origin, existe: true, formatoLegible: false }; }
})()
```

Si existe, conservá una copia privada del valor de esa única clave antes de cualquier edición manual. No compartas tokens ni el mensaje en logs. Para abrirlo con el flujo actual, cerrá sesión **en ese mismo origen** y abrí el editor: se recupera localmente. Al guardar un formato antiguo, se conserva una copia de destinatario/texto en `alma-draft-backup` (o una clave de respaldo adicional si ya existe otra copia). No se borra almacenamiento ni se trunca el texto recuperado.

Una cuenta autenticada consulta sólo su borrador remoto `content_type=text`, `status=draft`, ordenado por creación e ID. No se importa el borrador local a una cuenta. Si no hay borrador remoto y hay uno local, se informa cómo revisarlo cerrando sesión. Si la consulta falla, se mantiene el bloqueo; no se presenta un borrador vacío como una recuperación exitosa. No se ampliaron filtros a `saved` o `sent` sin evidencia de que deban editarse.

## Aplicar y verificar en Vercel (procedimiento histórico)

1. Resolvé primero el esquema de Supabase con el diagnóstico anterior. Vercel no ejecuta esta migración automáticamente.
2. En el proyecto Vercel existente → Settings → Environment Variables, contrastá `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY` con el mismo proyecto Supabase, para el entorno que vas a usar. Conservá anon/publishable; nunca service_role. No cambies Resend para solucionar borradores.
3. Revisá el diff incluyendo tus cambios locales. Ejecutá `npm test`, `npm run typecheck` y `npm run build`. Desplegá una preview cuando autorices la publicación; las variables públicas se incorporan al build, por lo que requieren una nueva compilación. Esta sesión no publicó ni modificó producción.
4. En la preview, con una cuenta de prueba del mismo entorno, recuperá un borrador conocido, editá una palabra, guardá y verificá que el ID no cambie. Recargá y reabrí. Probá una cuenta sin borrador y comprobá que otra cuenta no vea el texto de la primera. Repetí después de un fallo temporal de red. Conservar el ID y los filtros no sustituye verificar RLS remoto.
5. La preview no puede leer `alma-draft` de producción o localhost. Para recuperar un borrador local anterior, volvé a su origen original. Para comprobar el mensaje real remoto, usá su cuenta y proyecto correspondientes.
6. Publicá en producción sólo después de tu confirmación y de verificar el flujo en preview; repetí recuperación/edición/persistencia en el origen publicado sin exponer mensajes.

## Verificación realizada (4 de octubre; no validación actual)

Pruebas con SDK real y HTTP simulado: recuperación, edición y guardado con ID estable, reapertura, error PGRST205 sin escritura, reintento, cuenta sin borrador, filtros de propietario y espera limitada. Pruebas del hook real con primitivas React y adaptadores controlados: estados de recuperación, bloqueo, guardado, reapertura, timeout de sesión, reintento, respuesta obsoleta tras cambio de cuenta y recuperación local al cerrar sesión. No son pruebas visuales ni de RLS real. Esbuild ya estaba instalado por tsx; no se añadieron dependencias.

`npm test`, `npm run typecheck`, `npm run build` y `git diff --check` pasaron. Los bloques de landing y sus estilos no se modificaron.

No se localizó ni recuperó el mensaje original. Quedan pendientes el catálogo remoto, la migración si corresponde, el navegador original y la prueba real de persistencia/aislamiento.

Referencias: [errores de PostgREST](https://postgrest.org/en/latest/references/errors.html), [recargar caché en Supabase](https://supabase.com/docs/guides/troubleshooting/refresh-postgrest-schema), [variables de entorno en Vercel](https://vercel.com/docs/environment-variables/managing-environment-variables).
