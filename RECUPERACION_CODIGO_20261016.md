# Recuperación del código de Mensaje al Alma — 16/10/2026

## Dos estados independientes

**A — Production verificada en este bloque.** El alias `https://mensaje-al-alma.vercel.app` se consultó con la CLI existente y resolvió a `dpl_HsiL55unCrpPNFoSKjW6WwiJrBZV`, Ready, URL inmutable `https://mensaje-al-alma-au7lgbx4p-sebastians-projects-d19f34ca.vercel.app`. Las 61 fuentes ya recuperadas de la publicación anterior se cotejaron, archivo por archivo, con el inventario remoto de ese deployment. No se descargaron de nuevo. Este cotejo respalda código, no el estado de Supabase.

- Commit de fuentes A: `8252cef6f2ebdf849e16c4dd9198b0bd5d629d57`.
- Rama: `backup/production-20261016-111910`.
- Etiqueta anotada: `recovery/production-20261016-111910`.
- Copia separada: `/home/sebastian/Escritorio/respaldos-mensaje-al-alma/20261016-111910/production-sources`.
- Inventario y procedencia: `/home/sebastian/Escritorio/respaldos-mensaje-al-alma/20261016-111910/production-provenance.json`.
- Este commit es una instantánea Git nueva de fuentes publicadas; no es un commit atribuido por Vercel al despliegue original.

**B — Trabajo local con programación incompleta.** Partió de `main` / `origin/main` local en `757aa4f2e39c34e7bbe68eab02bc504c1cdef184`, con modificaciones y archivos nuevos que no estaban en ese commit. Conserva tipografía y logo aprobados y agrega el trabajo local de programación, créditos administrativos preparados, pruebas y documentación. No se equipara a A ni acredita que 004/005 estén aplicadas.

- Rama de respaldo: `backup/local-20261016-111910`.
- Etiqueta anotada: `recovery/local-20261016-111910`.
- El commit exacto B se resuelve con `git rev-parse 'recovery/local-20261016-111910^{commit}'` y queda registrado también en `VERIFICACION.json` del respaldo externo al proyecto.
- Se mantiene `main` en `757aa4f2e39c34e7bbe68eab02bc504c1cdef184`. El checkout queda en la rama de respaldo, con el contenido previo preservado.

## Respaldo adicional y exclusiones

Bundle autosuficiente: `/home/sebastian/Escritorio/respaldos-mensaje-al-alma/20261016-111910/mensaje-al-alma-20261016-111910.bundle`. Incluye ambas ramas y sus etiquetas; el commit local conserva también sus ancestros. Las referencias internas de herramientas no se exportan.

Se inspeccionaron las rutas antes de agregar. No se incluyen `.env.local`, credenciales, `.vercel`, carpetas de herramientas personales, `node_modules`, `.next` ni `*.tsbuildinfo`. Se excluye de la instantánea actual incluso `.env.example`: su contenido local permanece en el directorio original sin alterarse. El historial anterior conserva el ejemplo que ya estaba versionado; la búsqueda de patrones no encontró credenciales reales en ese historial. Una búsqueda por patrones no demuestra ausencia absoluta de secretos.

El remoto `sebasleo11/mensaje-al-alma` se comprobó público, con permiso ADMIN. Por la condición de respaldo privado no se hizo push, no se cambió su visibilidad y no se creó otro remoto. **No hay copia privada externa confirmada.** La carpeta de respaldos está fuera del proyecto pero en la misma computadora/disco: no protege de su pérdida o falla. Tras este bloque, guardar el bundle en un soporte físico separado o almacenamiento privado requiere una acción adicional autorizada.

## Abrir una recuperación sin pisar el proyecto

Elegí destinos NUEVOS que no existan. Estos comandos sólo crean otras copias; no ejecutarlos sobre el directorio original:

```sh
git bundle verify '/home/sebastian/Escritorio/respaldos-mensaje-al-alma/20261016-111910/mensaje-al-alma-20261016-111910.bundle'
git clone --branch 'backup/local-20261016-111910' '/home/sebastian/Escritorio/respaldos-mensaje-al-alma/20261016-111910/mensaje-al-alma-20261016-111910.bundle' /tmp/mensaje-al-alma-local-recuperado-20261016-111910
git clone --branch 'backup/production-20261016-111910' '/home/sebastian/Escritorio/respaldos-mensaje-al-alma/20261016-111910/mensaje-al-alma-20261016-111910.bundle' /tmp/mensaje-al-alma-production-recuperado-20261016-111910
git -C /tmp/mensaje-al-alma-local-recuperado-20261016-111910 rev-parse HEAD
git -C /tmp/mensaje-al-alma-production-recuperado-20261016-111910 rev-parse HEAD
```

Cotejá los commits con las etiquetas y `VERIFICACION.json`. En la prueba de recuperación de este bloque se usan destinos `verificacion-local` y `verificacion-production` dentro de la carpeta de respaldos. No requieren instalar dependencias. A se verifica contra las 61 rutas/digests del inventario remoto; B contra el contenido de las fuentes seleccionadas antes del commit. Se comprueba que el CSS y `BrandMark.tsx` de ambas referencias coincidan. Los digests corresponden a código, nunca a secretos.

Para iniciar una app recuperada hacen falta dependencias y configuración provisionadas por separado. Este bloque no copia archivos de entorno, instala herramientas ni ejecuta la app recuperada. No dar por verificado SQL, correo, navegador o funcionamiento autenticado por recuperar Git.

## Restaurar un deployment: sólo procedimiento, NO ejecutado

Restaurar archivos no cambia Production. Primero inspeccionar qué deployment está activo, que la referencia elegida pertenezca al proyecto `prj_LItyP5bJWuouJQjCBTKyiXmOU9wu` del equipo `team_ctpZ4vwZUSI6J55UhpLFkhbQ`, que siga disponible y que sea compatible con el esquema y la configuración vigentes. Con autorización explícita nueva se podría restaurar/promover el deployment anterior desde Vercel, o reconstruir una copia A con la configuración existente. Identificar el ID exacto antes de actuar; no promover B ni usar `main` como sustituto de A. El rollback no revierte base de datos ni operaciones externas. Ninguna de esas acciones está autorizada en este bloque.

## Lo que Git no recupera

No es un backup de la base de datos, Auth/usuarios/sesiones, Storage, borradores de `localStorage`, emails, datos de Resend, variables/secretos de entorno, dominios/DNS, Cron/jobs/Vault, configuración externa, cuotas consumidas ni compras. Los SQL versionados son archivos de código y pruebas, no una copia de los datos ni prueba de su aplicación. Tampoco conserva los objetos de las imágenes externas o Google Fonts.

## Verificación y próximo paso

Los resultados finales (commits, referencias del bundle, pruebas de clonación, integridad y preservación del checkout) quedan en `/home/sebastian/Escritorio/respaldos-mensaje-al-alma/20261016-111910/VERIFICACION.json`. Consultá `CALENDARIO_PROXIMO_BLOQUE.md` para el siguiente alcance. No hubo migraciones, deploys, envíos, cambios de datos ni modificaciones de logo o tipografía.
