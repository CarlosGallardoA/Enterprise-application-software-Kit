# Reglas generales del proyecto

Reglas vinculantes de proceso y gobierno para todo trabajo en el repositorio, independientes de la capa o lenguaje.

## Contrato de errores

- Toda falla de negocio controlada (400/401/403/404/409/412/422) devuelve `{ reason, details? }`, donde `reason` es el nombre simbólico estable de una falla de `Application` o un literal estándar (`"NotFound"`, `"CodeAlreadyExists"`, `"NameAlreadyExists"`). Nunca devolver mensajes en prosa libre desde el backend: el frontend traduce `reason` en el idioma activo.
- Las excepciones no controladas (500) nunca incluyen `reason` ni detalles internos; adjuntan únicamente `traceId` correlacionado con el log del servidor.

## Autenticación, autorización y secretos

- Validar identidad, vigencia de sesión, permisos y alcance organizacional siempre en el servidor; nunca confiar en controles exclusivos del cliente ni en claims obsoletos de cookies/tokens para permisos revocables.
- Mantener cadenas de conexión, claves criptográficas, contraseñas y tokens fuera del control de versiones. Nunca hardcodear credenciales reales ni siquiera en scripts temporales de prueba.
- La configuración por ambiente vive en el host, nunca en el artefacto: en Windows + IIS, `appsettings.{Ambiente}.json`/`web.config`/variables del App Pool creados una vez en el servidor y nunca sobrescritos por el release; en Linux + Docker, variables de entorno, `env_file` fuera del repositorio o *Docker secrets*, nunca dentro de la imagen.
- Las integraciones de servicio a servicio se autentican con **identidad administrada** o **certificado**. Un *client secret* solo se admite como transición, con fecha de retiro registrada en `docs/operacion/deployment.md`.
- La conexión a la base de datos va cifrada con validación de certificado; `TrustServerCertificate=true` (o equivalente) solo se admite en desarrollo local.
- Antes de seleccionar, instalar, actualizar o ejecutar tecnologías y de cerrar una entrega, cumplir [seguridad-de-tecnologias.md](./seguridad-de-tecnologias.md): usar versiones soportadas y parcheadas verificadas contra avisos oficiales vigentes; cubrir runtimes, dependencias directas/transitivas/de desarrollo, bibliotecas nativas, CI, SO e imágenes. Bloquear ante vulnerabilidades conocidas aplicables de cualquier severidad o evidencia incompleta, sin silenciar errores ni aceptar mitigaciones como corrección.

## Estilo de trabajo

- Mantener respuestas breves, directas y sin relleno.
- Actualizar [`docs/historial/changelog.md`](../historial/changelog.md) al cerrar cualquier tarea.
- Documentar todo endpoint HTTP nuevo o modificado dentro de la colección ejecutable del repositorio en la misma tarea.
- Respetar estrictamente la arquitectura hexagonal + vertical slicing sin atajos entre capas ni lógica de negocio en controladores, componentes UI o guards.
- Incluir las pruebas unitarias, de integración y E2E que correspondan como parte de la misma tarea, nunca como deuda posterior.
- **Integridad inquebrantable de las pruebas**: queda terminantemente prohibido alterar, debilitar, relajar, saltar (`skip`) o borrar una prueba simplemente para que pase cuando falla. Un test fallido puede estar delatando un error real en el código de producción; siempre se investiga y repara primero la causa raíz en producción contra la especificación, y jamás se acomoda la aserción a una salida defectuosa.
- **Salto condicional legítimo (no es manipulación)**: solo se admite cuando la prueba exige un entorno o perfil que la corrida actual no provee, la condición se evalúa en código contra una variable o perfil explícito y el motivo queda escrito en la propia llamada (p. ej. `test.skip(process.env.SECURITY_PREVIEW !== 'true', 'Requiere playwright.security.config.ts y el build QA')`, con esa variable fijada por una configuración dedicada que corre en CI). Debe existir al menos un perfil o job versionado donde la prueba sí se ejecuta. Un `skip` sin condición, sin motivo, sin perfil que la ejecute o agregado después de ver el fallo es manipulación.
- Nunca ejecutar comandos de Git que muten el repositorio (`commit`, `push`, `merge`, `rebase`, `reset`, ramas/tags) sin solicitud explícita del usuario para esa tarea puntual.
- Guardar capturas visuales antes/después únicamente en rutas ignoradas por Git (`docs/auditorias/evidencias/`, `test-results/`); versionar solo los informes `.md` y las pruebas automatizadas.

## Auditorías y skills especializadas

- **Auditorías de seguridad**: usar obligatoriamente la skill oficial `security-audit` de Cloudflare (`Full audit mode` en auditorías integrales o pen tests manteniendo el repositorio en estricto solo lectura y separando `confirmed` / `needs_validation` / `rejected`; `Guidance mode` en revisiones puntuales). En auditorías de otras disciplinas, conservar su rigor de evidencia verificable y modo solo lectura.
- Referenciar las skills por su nombre (y, si hace falta, por su repositorio de origen), nunca por rutas absolutas de una máquina concreta: cada agente o desarrollador las resuelve desde su propia instalación.
- **Diseño, consistencia visual y UX**: el archivo `DESIGN.md` y los tokens semánticos de `tokens.css` son la autoridad suprema; al crear o revisar pantallas, complementar con `design-consistency-auditor`, `ui-ux-pro-max` e `impeccable` sin introducir colores literales ni clases ajenas al sistema de diseño.

## Base de datos para pruebas de integración y E2E

- Ejecutar siempre contra una base de datos local y desechable creada con nombre único para esa corrida, jamás contra ambientes compartidos (QA, PreProd, Prod) ni bases de trabajo diario.
- Garantizar limpieza obligatoria al finalizar (pasen o fallen las pruebas): detener servicios levantados, eliminar la base temporal, verificar que no queden archivos residuales en disco y borrar directorios temporales de almacenamiento documental. Si algo impide la limpieza, reportar explícitamente el recurso pendiente.
- **Protección contra la base del desarrollador**: los secretos locales de usuario (user-secrets, `.env` locales, perfiles del IDE) pueden apuntar a QA o a la base de trabajo diario. Todo host de prueba en memoria fija su cadena de conexión a un servidor **inexistente** (`Server=unused.invalid;...`) mediante el mecanismo que el framework aplica **antes** de registrar servicios (p. ej. `UseSetting(...)` en .NET minimal hosting; `ConfigureAppConfiguration` llega tarde), salvo las suites que reciben explícitamente la base desechable por variable de entorno de la sesión. Una prueba dedicada afirma que el contexto de datos del host de prueba nunca resuelve la cadena del desarrollador, y la corrida local de la suite exporta además la variable de conexión apuntando al servidor inexistente.
- **Al delegar pruebas a un agente o subagente**, sus instrucciones advierten de forma explícita este riesgo: solo base local desechable o servicios simulados; prohibido usar la conexión de los secretos de usuario o de cualquier ambiente compartido.

## Verificación mínima antes de cerrar una tarea

- Informe vigente [`docs/auditorias/seguridad-tecnologias.md`](../auditorias/seguridad-tecnologias.md) con inventario real, soporte, fuentes oficiales, comandos/resultados y hashes/digests; cero vulnerabilidades conocidas aplicables pendientes y ninguna comprobación incompleta. En otro caso, reportar `BLOQUEADO`.
- Compilación limpia con **0 advertencias y 0 errores**.
- Suite de pruebas aplicables en verde.
- Linters de código, fronteras arquitectónicas, sistema de diseño y gobierno documental (`check-docs-governance.mjs`) sin violaciones; formateadores en modo verificación sin cambios pendientes (p. ej. `dotnet format --verify-no-changes`, `prettier --check .`).
- Escaneo de secretos con salida redactada y auditoría de dependencias de toda severidad (p. ej. `npm audit --audit-level=low`) en verde.
