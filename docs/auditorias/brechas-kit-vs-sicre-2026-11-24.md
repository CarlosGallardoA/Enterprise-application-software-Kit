# Brechas del kit frente a SICRE (2026-11-24)

Revisión de solo lectura de `C:\Users\cgallardo\source\repos\SICRE` contra este kit, en cuatro dimensiones: seguridad, arquitectura/mantenimiento, rendimiento/datos/operación, y pruebas/frontend/UX. Cada hallazgo indica la evidencia en SICRE (rutas relativas a la raíz de SICRE; `web/` = `src/sicre-web/`), el estado en el kit (FALTA, DÉBIL o CONTRADICE) y el archivo del kit que debe recibir la regla. Rutas del kit relativas a `skills/`.

Los hallazgos duplicados entre dimensiones se fusionaron.

---

## 1. Contradicciones: corregir primero

| # | Tema | Kit dice | SICRE hace | Acción |
|---|------|----------|------------|--------|
| K1 | Configuración en el artefacto de la API | `production-release-and-migrations/references/ci-cd-and-server-checklist.md` §1 incluye `web.config`/config del host en `app-api` | `azure-pipelines-backend.yml:128-150` y `azure-pipelines.yml:75-87` eliminan `appsettings*.json` y `web.config` del artefacto y fallan si queda alguno; `tools/quality/publish-api.ps1:61-69` rechaza `*.local.json`, `secrets.json`, `.env` y claves de secreto con valor | Reescribir §1: el artefacto no lleva configuración por ambiente ni secretos; el pipeline lo verifica. **Ojo:** `docs/operacion/deployment.md:266` de SICRE dice "publicar web.config"; SICRE es inconsistente consigo mismo. Decidir. |
| K2 | Compresión dinámica | Checklist §3 pide compresión dinámica en el servidor | `deployment.md:267` la prohíbe en IIS para la API; la API comprime en la aplicación (`src/Sicre.Api/Compression/ResponseCompressionExtensions.cs:15-24`) | Ver regla R-ALTA-11. |
| K3 | i18n sin hash con `no-cache` | Release SKILL y artefacto `app-web` | SICRE importa traducciones con `import()` como chunks con hash e `immutable` (`deployment.md:237`, PF08) | Actualizar el kit al modelo con hash. |
| K4 | Tickets de sesión en memoria (ley 5) | Asume memoria y un solo worker | Tickets y llaves de DataProtection persistidos en SQL para sobrevivir reciclados (`deployment.md:168`) | Exigir persistencia de tickets y llaves. |
| K5 | `totalCount` siempre | `enterprise-app-blueprint/references/api-contracts-and-data-model.md` §4 | Conteos acotados `Take(limit).CountAsync()` (`Persistence/EfNotificationReader.cs:79-89`) y total cacheado ≥10 000 filas (`EfAuditLogReader.cs:20-21`) | Ver R-ALTA-13. |
| K6 | Forma 2 "exclusivamente CRUD" | `hexagonal-vertical-slices/references/backend-slice-anatomy.md:10-12` | `docs/arquitectura/backend-architecture.md:87` la usa en `Incidents/SendClaimFormNotification/` | Criterio: "misma entidad o agregado + mismo puerto compartido". |
| K7 | "Api sin ORM" sin excepciones | `hexagonal-vertical-slices/SKILL.md:48`, pero `api-contracts-and-data-model.md:45` recomienda handlers que referencian excepciones del ORM | `backend-architecture.md:42` documenta la excepción (health checks y exception handlers) | Añadir excepción acotada y documentada. |
| K8 | E2E siempre contra BD real | `layered-testing-strategy/SKILL.md:47` | 29 de 60 specs usan `page.route`; los gemelos `-real` persisten sobre LocalDB (`AGENTS.md:59-60`) | Ver R-ALTA-20. |
| K9 | SICRE citado como ejemplo conforme de i18n | `institutional-design-system-ux/SKILL.md:53,94` cita `key-resolution.spec.ts` | `web/src/app/core/i18n/key-resolution.spec.ts:7-10` solo protege 3 claves; no hay compuerta de paridad es/en en SICRE | Dejar de citarlo como conforme (es candado parcial). |
| K10 | Excepciones de vulnerabilidad en Markdown | `security-and-auditability/references/technology-security-policy.md:8` | `tools/quality/dependency-exceptions.json` leído por la compuerta (`check-dependencies.ps1:31-41`), falla sin `owner`/`expiresOn` | JSON legible por la compuerta; Markdown solo evidencia. |
| K11 | Migraciones como artefacto CI / niveles 2-3 del migrador | Kit exige `reviewed-migrations`, `--target-database`, `--reviewed-sha256`, `--backup-ticket` | `azure-pipelines.yml:5-6` "Las migraciones no viajan en el pipeline", pero `docs/operacion/db-migrator.md:34` dice lo contrario; los flags no existen en `tools/Sicre.DbMigrator` | El kit va más allá de SICRE: mantener, pero no citar SICRE como referencia. Decidir el modelo. |
| K12 | SDK con versión exacta | Checklist :10 (`10.0.403`) | `global.json:4` `"rollForward": "latestPatch"` | Decidir si se permite roll-forward de parches de seguridad y documentarlo. |
| K13 | `Assert.SkipUnless` de xUnit v3 | `layered-testing-strategy/references/test-integrity-and-triage.md:28` | xunit 2.9.3; la suite de integración falla en voz alta si falta la variable (`SqlServerTestDatabase.cs:44-46`) | Preferir fallo explícito + aislamiento por paso de CI. |
| K14 | Fin de línea | `.editorconfig.template` fuerza `lf` | Prettier `endOfLine: auto` | Decidir y alinear. |

---

## 2. Prioridad ALTA

### Seguridad

**A1. Autorización denegada por defecto** — FALTA. `src/Sicre.Api/Authorization/MicrosoftEntraAuthorizationExtensions.cs:14` `SetFallbackPolicy(RequireAuthenticatedUser)`; solo 6 endpoints `[AllowAnonymous]`.
Regla (`security-and-auditability/SKILL.md` §2): Configurar una política de autorización por defecto que exija sesión autenticada en todo endpoint. El acceso anónimo es excepción explícita, inventariada en la documentación y verificada por una prueba que liste los endpoints anónimos.

**A2. Atributos de cookies de sesión y antiforgery** — FALTA. `src/Sicre.Api/Program.cs:56-63,118-122`.
Regla (SKILL §1): Prefijo `__Host-`, `Secure` fuera de Desarrollo, `HttpOnly`, `SameSite=Lax` o `Strict`, `Path=/` explícito (IIS con `PathBase` descarta la cookie `__Host-` sin él) y sin `Domain`.

**A3. Proxies de confianza para la IP real** — FALTA. `src/Sicre.Api/Security/ForwardedHeadersConfiguration.cs:7-10`, `Program.cs:153`, `deployment.md:185-197`.
Regla (SKILL §5 y checklist): Aceptar `X-Forwarded-For`/`-Proto` solo de `KnownProxies`/`KnownNetworks` declarados por entorno, validados al arrancar, con `ForwardLimit` acotado, como primer middleware. Sin esto el rate limit anónimo comparte una sola partición. Verificar `ClientIp` en el log.

**A4. Rotación de sesión al iniciar sesión (fijación de sesión)** — FALTA. `src/Sicre.Api/Authentication/SessionRotationMiddleware.cs:11-16`.
Regla (`references/auth-session-and-idor-controls.md` §1): Todo login (local o federado) revoca en el servidor la sesión entrante y emite un identificador nuevo. Probarlo con una cookie previa copiada.

**A5. Validación del token del IdP y canje por sesión de servidor** — DÉBIL. `src/Sicre.Infrastructure/Authentication/MicrosoftEntraAuthenticationExtensions.cs:19-24,34-50`, `EntraScopeAuthorization.cs:11-14`, `AuthenticationController.cs:81-84`, MSAL `cacheLocation: 'sessionStorage'`.
Regla (AUTH §1): Validar emisores, audiencias, vigencia y `scp` exacto; `MapInboundClaims = false`; configuración parcial = fallo de arranque. El token del IdP se canjea una vez por sesión de servidor y no viaja en cada petición. Caché del SDK cliente en `sessionStorage`, nunca `localStorage`.

**A6. Encabezados de seguridad de la API** — FALTA. `src/Sicre.Api/Security/SecurityHeadersMiddleware.cs:14-28`.
Regla (SKILL §5): Toda respuesta de la API lleva `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, CSP propia (`default-src 'self'; frame-ancestors 'none'; base-uri 'self'`) y `Cache-Control: no-store` por defecto.

**A7. Valores sensibles redactados en la bitácora** — FALTA (el kit pide antes/después sin excepción). `src/Sicre.Infrastructure/Persistence/AuditFieldChangeBuilder.cs:27-28`.
Regla (SKILL §6 y `api-contracts-and-data-model.md` §3): Clasificar campos sensibles; el diff registra que cambió con valor `[REDACTED]`. Lista viva con prueba.

**A8. Proteger al último administrador activo** — FALTA. `src/Sicre.Infrastructure/Persistence/EfAdministrationUserRepository.cs:97-107` (`sp_getapplock`).
Regla (AUTH §2): Desactivar o quitar el rol administrativo verifica, bajo bloqueo transaccional exclusivo, que queda otro administrador activo; si no, falla tipada. Prueba concurrente.

**A9. Clientes HTTP salientes endurecidos (SSRF)** — FALTA. `src/Sicre.Infrastructure/DependencyInjection.cs:201-213`, `HttpStudentDirectory.cs:117`.
Regla (nueva `security-and-auditability/references/outbound-integrations.md` + `performance-and-concurrency-guardrails.md` §5): Fábrica de clientes; URL HTTPS absoluta sin userinfo validada con `ValidateOnStart`; timeout explícito (10 s); tope de respuesta (1 MiB); `AllowAutoRedirect = false`; datos de usuario solo como segmento escapado y validado por formato.

**A10. Lint contra bypass del sanitizador** — FALTA. `web/eslint.config.js:45-66`, `core/formatting/highlight-match.pipe.ts:10`.
Regla (SKILL §5 cliente): Prohibir por lint `bypassSecurityTrust*`, `dangerouslySetInnerHTML`, `v-html`. Resaltar coincidencias por segmentos de texto, nunca `innerHTML`.

**A11. Compresión en la aplicación y exclusión BREACH** — FALTA. `ResponseCompressionExtensions.cs:15-24,44-47`, `DisableResponseCompressionAttribute.cs:3-5`, prueba en `ControllerHttpContractTests.cs:704`.
Regla (guardrails §4, SKILL §5, checklist §3): Comprimir JSON en la app (Brotli/Gzip, `Fastest`), solo `application/json` y `application/problem+json`. Excluir toda respuesta con token o secreto y toda descarga con `Content-Disposition`. Prueba que verifique `Content-Encoding: br` en un endpoint normal y su ausencia en el token.

**A12. Cadena de suministro** — DÉBIL. `tools/quality/check-secrets.ps1:6-8,19,32` (Gitleaks 8.30.1 con SHA-256), `check-dependencies.ps1:31-41`, `nuget.config` `<clear/>`, `Directory.Packages.props`, `verify-artifact-manifest.ps1`.
Reglas (checklist y TECH): Herramientas descargadas en CI fijadas por versión y SHA-256. Excepciones en archivo legible por la compuerta (owner + expiresOn). `nuget.config` con `<clear/>` y fuentes explícitas. Manifiesto SHA-256 de cada artefacto, reverificado en el release contra el manifiesto guardado fuera del paquete en la misma ejecución.

### Arquitectura y mantenimiento

**A13. Capas como proyectos compilados** — DÉBIL. Csproj de `Sicre.Domain`/`Sicre.Application`; `backend-architecture.md:36`; `estandares-backend.md:53`.
Regla (`backend-slice-anatomy.md` + blueprint Paso 2): Cada capa es un proyecto con grafo acíclico (Domain sin referencias; Application solo Domain; Infrastructure Domain+Application; Api compone). Un proyecto de pruebas por proyecto de `src` que referencia solo lo que prueba.

**A14. Build centralizado .NET** — FALTA. `Directory.Build.props:6-9,14`, `Directory.Packages.props:4,15-17`, `nuget.config`.
Regla (nueva `enterprise-app-blueprint/references/build-and-toolchain-baseline.md` + plantillas en `resources/`): TFM, `Nullable`, `TreatWarningsAsErrors` una vez en `Directory.Build.props`. Versiones solo en `Directory.Packages.props`. Cada pin transitivo comentado con motivo y condición de retiro.

**A15. Línea base de strictness TypeScript/lint** — FALTA. `web/tsconfig.json:4-11,28-29`, `web/eslint.config.js:27,39,43`.
Regla (nueva `clean-code-and-standards/references/toolchain-strictness.md` + plantillas): `strict`, `noUncheckedIndexedAccess`, `noImplicitOverride`, `noPropertyAccessFromIndexSignature`, `noImplicitReturns`, `noFallthroughCasesInSwitch`, templates estrictos. Lint en error: imports relativos ascendentes, `consistent-type-imports`, prefijo de selector.

**A16. Convenciones de nombrado** — DÉBIL. `docs/guias/backend-guide.md:884-895`, `docs/arquitectura/frontend-architecture.md:289-295`.
Regla (nueva `hexagonal-vertical-slices/references/naming-conventions.md`): `<UseCase>Handler : I<UseCase>`; adaptadores `Ef<Thing>` `internal sealed` que solo reciben el DbContext; `<Feature>Controller` en `api/v<n>/<feature>`; extensiones DI `Add<Concern>`; eventos `<Hecho>V<n>`; frontend kebab-case, `<x>.port.ts`, `<x>.use-case.ts`, tokens SCREAMING_SNAKE en `<feature>.tokens.ts`.

**A17. Esqueleto de docs de arquitectura** — DÉBIL. `backend-architecture.md` (modelo mental, tabla de proyectos, anatomía, "¿dónde va cada cosa?", ejemplo punta a punta, composition roots, decoradores, nombrado, build, testing, contrato de errores, anti-patrones), `backend-guide.md:930-943` (checklist PR). Kit: `scaffold-project-docs.mjs:108-117` genera docs de una línea.
Regla: plantillas `backend-architecture`, `frontend-architecture` y `guias/<stack>-guide.md` con esas secciones y checklist de PR; actualizar el scaffold.

### Rendimiento y datos

**A18. Diseño de índices** — FALTA. `src/Sicre.Infrastructure/Persistence/SicreDbContext.cs:722-725,737-746,1004-1005`; `docs/planes/plan-rendimiento-2026-11-03.md` PF01/PF05 (76 484 a 190 lecturas).
Regla (nueva §6 en guardrails): Orden por expresión requiere columna calculada persistida + índice `(columna, Id)` filtrado por el mismo predicado. Índice filtrado por candidatos pendientes (`marca IS NULL`) para cada barrido. `INCLUDE` para cubrir proyecciones. Índice no filtrado si existe una consulta sin ese predicado.

**A19. Barridos por lote sin costo cuadrático del ORM** — DÉBIL. `Persistence/EfIncidentFlagRepository.cs:51-55` (PF01: 19,7 M a 85 899 lecturas).
Regla (outbox SKILL §B y guardrails §2): Precargar relacionados en una consulta (`WHERE id IN (...)`), candidatos sin tracking con proyección, un `SaveChanges` por lote y `ChangeTracker.Clear()`. Prohibido una consulta o `SaveChanges` por fila.

**A20. Contar viajes a SQL en pruebas** — FALTA. `tests/Sicre.Infrastructure.IntegrationTests/SqlCommandCounter.cs:6`, `Readers/EfAuditLogReaderTests.cs:95-96`.
Regla (`disposable-db-and-e2e-lifecycle.md`): Lectores paginados o con caché afirman el número exacto de comandos SQL con un `DbCommandInterceptor` sobre BD real.

**A21. Tope de texto simétrico contrato = columna = entidad = formulario** — FALTA. `docs/estandares/estandares-backend.md:31`, `tests/Sicre.Api.Tests/RequestTextLengthContractTests.cs:10-14,164`, 245 `maxlength` en plantillas, `SecurityInvariantTests.cs:14`.
Regla (`api-contracts-and-data-model.md` §4, testing SKILL fila API, UX): Todo texto de entrada declara el mismo máximo que su columna, su Guard y su `maxlength`; responde 400 antes del caso de uso. Prueba por reflexión que falla ante un `string` sin tope o con tope distinto. Correos usados en mensajería se validan contra CR/LF.

**A22. Dos niveles de E2E** — CONTRADICE (ver K8). `web/e2e/admin-forms.e2e-spec.ts:72`, `AGENTS.md:59-60`, `azure-pipelines-frontend.yml:105`.
Regla (testing SKILL matriz + `disposable-db-and-e2e-lifecycle.md`): (a) UI/layout/a11y con API simulada (`page.route`) y fixtures completas; (b) persistencia/permisos con API real sobre BD desechable, sufijo `-real.e2e-spec`, precondiciones por variable de entorno con `expect(..., 'motivo')`. Todo flujo que escribe necesita al menos un `-real`. `AGENTS.md` declara qué nivel corre en CI.

### Frontend, UX, accesibilidad

**A23. Checker de design system incompleto** — DÉBIL. `web/scripts/check-design-system.js:157,220,329-336,368,389`; kit `institutional-design-system-ux/scripts/check-design-system.mjs:28` admite que `font-scale` no existe.
Acción: portar `font-scale`, `leading-scale`, `font-weight-scale`, `flat-at-rest`, `shadow-literal`, `shadow-ring-literal`, toast con literal; listarlos en SKILL §Verificación.

**A24. Lint de accesibilidad de plantillas** — FALTA. `web/eslint.config.js:92` (`templateAccessibility`).
Regla (UX SKILL regla 5): Activar el preset a11y del framework (`angular-eslint` templateAccessibility, `eslint-plugin-jsx-a11y`, `vuejs-accessibility`) sin supresiones.

**A25. `<html lang>` e idioma antes del primer render** — FALTA. `web/src/app/core/i18n/persisted-language.initializer.ts:12-16`.
Regla (regla 6): Sincronizar `lang` en cada cambio de idioma; aplicar el idioma guardado en un inicializador antes del primer render; guardar solo el código.

**A26. Enlace de salto y gestión de foco** — FALTA. `web/src/app/features/shell/ui/shell.component.html:2,22`, `shell.component.ts:196-198`.
Regla (`operational-ux-and-feedback-patterns.md`): Skip link traducido a `<main tabindex="-1">`; tras navegar desde menú que se oculta, foco a `<main>`; al cerrar sin navegar, foco al botón que lo abrió.

**A27. Validación de formularios accesible** — DÉBIL. `core/ui/field-error/field-state.directive.ts:16-18`, `core/forms/instant-validation.ts:6`, `core/forms/form-focus.util.ts:10`.
Regla: Una directiva traduce "inválido" a `aria-invalid` + `aria-describedby` (solo con error). Error tras 500 ms sin escribir o al salir del campo. Al enviar inválido, enfocar el primer campo inválido.

**A28. Fechas, horas y zona horaria** — FALTA. `web/src/app/core/formatting/app-date-time.ts:3-4,20-23,33-35`.
Regla (nueva sección en `operational-ux-and-feedback-patterns.md`): Un único helper/pipe de fecha-hora con formato institucional. `<input type="date">` y `[max]` en hora local del reloj inyectado, nunca `toISOString()`. Bordes de filtros de rango convertidos a UTC con la zona oficial. Instantes del payload en UTC con sufijo `Utc`.

---

## 3. Prioridad MEDIA

**M1. Política de contraseñas** — `DependencyInjection.cs:127-131`. Mínimo 12 caracteres con complejidad, aplicada en el servidor, incumplimiento en `details`. (AUTH §1)

**M2. Duración absoluta de sesión no persistente** — `CookieSessionPolicy.cs:8` (8 h), `Program.cs:81-84`. Máximo absoluto además de inactividad; sello de inicio validado en cada petición. (AUTH)

**M3. Diseño del rate limiting** — `RateLimiting/AuthenticationRateLimitingExtensions.cs:18-27,76-78`, `AccountRateLimitFilter.cs:18,184-185`. Concurrencia global por usuario/IP, cuotas por operación costosa, 429 + `Retry-After` + `reason`, claves por cuenta como hash SHA-256 con tope de claves, contar solo fallos. Nunca desactivar el limitador en E2E (`web/e2e/support/auth.ts:40,52-54`). (AUTH §3)

**M4. OpenAPI y endpoints de diagnóstico solo en Desarrollo** — `OpenApi/SwaggerConfigurationExtensions.cs:11`, `PasswordResetController.cs:76`, VULN-001 en `docs/auditorias/auditoria-seguridad-sicre.md:28`. Endpoints de depuración exigen además loopback y responden 404. (SKILL §5)

**M5. Identidad de cargas de trabajo sin secreto** — `GraphMailEmailSender.cs:30-40`, `deployment.md:263`. Identidad administrada o certificado; client secret solo como transición con fecha de retiro. (`reglas-generales.template.md`)

**M6. TLS hacia la BD** — `deployment.md:269`. Cifrado con validación de certificado; prohibido `TrustServerCertificate=true` fuera de local; backups cifrados. (checklist §3)

**M7. Credenciales solo al origen de la API** — `web/src/app/core/http/credentials.interceptor.ts:7`. Interceptor adjunta credenciales solo si el origen coincide exactamente.

**M8. Puerto antimalware que falla cerrado** — `docs/planes/plan-mejora-seguridad-2026-11-18.md:397-404`. Estados `Clean`/`Rejected`/`ScanError`; rechazo o error bloquea persistencia y entrega; la validación de firma nunca se presenta como veredicto antimalware. (`document-crypto-and-upload-safety.md` §3)

**M9. Caché de verificación de sesión/autorización** — `CachedSessionSecurityReader.cs:12` (30 s), `CachedAuthorizationReader.cs:19` (2 min), `deployment.md:166-168`. TTL corto con invalidación por generación; documentar desfase máximo de cambios hechos fuera de la app. (AUTH)

**M10. Caché de catálogos con TTL absoluto y single-flight** — `CachedCatalogStore.cs:25,29`. (`backend-slice-anatomy.md`)

**M11. Política `Cache-Control`** — `SecurityHeadersMiddleware.cs:27`, `Caching/CatalogOptionsCacheAttribute.cs:10-14`, `web/.../ttl-cache.service.ts:6`. `no-store` por defecto; solo catálogos autenticados `private, max-age=600`; cliente con caché TTL de la misma ventana.

**M12. Cupos de CPU y descarga** — `deployment.md:203-207`, `Composition/PdfExportServiceCollectionExtensions.cs:9-10`. Semáforo `núcleos/2` con espera ≤10 s para PDF; presupuesto propio de descargas; saturado = 503 + `Retry-After` + `reason`. (guardrails §3)

**M13. Correlativos con upsert atómico** — `Persistence/SqlIncidentSequenceGenerator.cs:14-21`. `MERGE ... WITH (HOLDLOCK) OUTPUT` / `ON CONFLICT ... RETURNING` en tabla contador por período; lecturas antes de tomar el lock. (guardrails §7, outbox §A.1)

**M14. Predicados sargables** — plan PF17. Umbrales temporales calculados en la app; nunca función sobre columna indexada.

**M15. Paginación determinista** — `EfIncidentSearchReader.cs:89-92`, `src/Sicre.Application/Common/PagedResult.cs:7-11`. Desempate por PK; `PageRequest` normalizado (10 por defecto, 100 máximo). (api-contracts §4)

**M16. Hosting: precarga, reciclado, calentamiento** — `deployment.md:152-157`, `BackgroundJobs/DatabaseWarmUpBackgroundService.cs:9-12`. `Preload Enabled`, reciclado periódico desactivado o a hora fija de madrugada, servicio de warm-up del ORM (si falla, solo warning). (release ley 5)

**M17. Logging de arranque y desacoplado** — `Program.cs:21,187-195`, `Logging/LoggingExtensions.cs:26-28`, `estandares-backend.md:37`. Logger bootstrap a consola con `Fatal` + `CloseAndFlush`; enriquecer con aplicación/entorno/máquina; framework/ORM/HttpClient en `Warning`; código depende solo de la abstracción; `[LoggerMessage]`; controladores solo registran eventos de seguridad. (`structured-logging-and-pii-redaction.md` §1)

**M18. Tope de cuerpo con IIS in-process** — `Program.cs:141-145`. Repetir el tope en `IISServerOptions`; techo de `web.config` = mayor límite por endpoint. (`document-crypto-and-upload-safety.md`)

**M19. Reglas outbound de la SPA** — `web/public/web.config`. Excluir el prefijo de la API y filtrar sobre `{URL}`, no `{REQUEST_URI}`. (checklist §2)

**M20. Ventana para DDL bloqueante** — plan, línea 82 (17,8 s sin `ONLINE`). Medir cada migración sobre volumen representativo; anotar duración; ventana de bajo uso si bloquea. (`safe-db-migrator-protocol.md`)

**M21. Presupuestos de bundle** — `web/angular.json:67-82`, `frontend-architecture.md:262-264`. Aviso/error cercanos al tamaño real; subirlos exige justificación en el changelog. (guardrails §4)

**M22. Método de medición de rendimiento** — plan, líneas 5-8. Antes/después sobre BD desechable con volumen realista (`STATISTICS IO/TIME`) y frontend con CPU 4x, 4 Mbps, 150 ms. Reportar cifras. (guardrails, encabezado)

**M23. Pruebas de convención por reflexión** — `tests/Sicre.Api.Tests/ControllerHttpContractTests.cs:795-822,1210-1223`. Cada invariante transversal de la API se verifica enumerando endpoints por reflexión. (testing SKILL)

**M24. Registro DI explícito, sin mediador** — `src/Sicre.Api/Composition/ApplicationServicesExtensions.cs`. Sin MediatR, AutoMapper, Scrutor. (`backend-slice-anatomy.md`)

**M25. `.editorconfig` C#** — SICRE `.editorconfig:3-7` (IDE0005, IDE0001, IDE0065 `outside_namespace`). Añadir sección `[*.cs]` al template.

**M26. Política anti-flaky** — `web/playwright.config.ts:9-11` (`retries: 0`, `workers: 1`), `vitest-base.config.mts:9-10`, `xunit.runner.json`. Prohibido `retries > 0`; timeouts de infraestructura justificados junto a la config; suites con estado compartido en serie y documentado. Usar `trace: 'retain-on-failure'`. (`test-integrity-and-triage.md`)

**M27. Lint contra pausas fijas en E2E** — `web/e2e/admin-catalogs.e2e-spec.ts:8` y otros. Activar `playwright/no-wait-for-timeout`; única excepción: ventana real de rate limit, con motivo.

**M28. BD por clase de prueba** — `SqlServerTestDatabase.cs:49,131-134`. `<App>IntegrationTests_<guid>`, migración real, `EnsureDeletedAsync` en `DisposeAsync`.

**M29. E2E de Alto Contraste, movimiento reducido y anchos** — `web/e2e/dashboard-redesign.e2e-spec.ts:274`, `responsive-listings.e2e-spec.ts:17-21`, `support/settle-animations.ts`, `rendered-contrast.ts:32-33`. 360/768/1280 px sin desborde, `forcedColors:'active'`, `reducedMotion:'reduce'`, contraste tras `settleAnimations()`.

**M30. Título de página por ruta** — `web/src/app/core/navigation/sicre-title-strategy.ts:31,38`. `titleKey` por ruta, `<Título> · <Marca>`, reactivo al idioma (WCAG 2.4.2).

**M31. Ordenar en móvil cuando la tabla pasa a tarjetas** — `DESIGN.md:410`.

**M32. Un rediseño conserva el contenido** — `DESIGN.md:113`. No añade ni quita campos, acciones, permisos ni métricas.

**M33. Extender `check-architecture-boundaries.mjs`** — Dejar de ignorar specs (eximirlos solo de `*-isolation`, como `web/eslint-rules/feature-boundaries.cjs:60`); `forbiddenPackagesByLayer` (EF/AspNetCore/HttpClient/Angular en domain/application); detectar FQN en C#; autotest con `node:test` y fixtures (SICRE `feature-boundaries.test.cjs`, 19 casos).

---

## 4. Prioridad BAJA

- **B1.** Endurecimiento del host: quitar `Server`/`X-Powered-By`, `RequestHeadersTimeout = 15s`, `maxUrl="4096"`, `maxQueryString="2048"` (`Program.cs:136-137`, `src/Sicre.Api/web.config:5-6`, `web/public/web.config:68`).
- **B2.** CORS estricto: origen = esquema+host+puerto exacto; métodos, encabezados y exposed headers en lista blanca (`Security/CorsConfiguration.cs:12-23`).
- **B3.** CSP de la SPA completa: `object-src 'none'`, `base-uri 'self'`, `form-action 'self'`, `connect-src` limitado a API e IdP (`web/public/web.config:72`).
- **B4.** Migrador con `--dry-run` de solo lectura (`ApplicationIntent=ReadOnly`) y semilla de catálogos que solo inserta (`db-migrator.md:14-19`).
- **B5.** Número de build estampado en el bundle y visible en la UI (`azure-pipelines.yml:12-13`, `set-build-number.js`).
- **B6.** Workers con `PeriodicTimer` y primera vuelta inmediata (`SlaSweepBackgroundService.cs:31-35`).
- **B7.** Script de diagnóstico de bloqueos en el runbook (`scripts/check-blocking-sessions.sql`).
- **B8.** Truncar `lastError` del outbox a 4000 caracteres (`Outbox/SqlOutboxStore.cs:15-18`).
- **B9.** Reloj determinista: completar la §5 prometida en `fakes-and-fixtures-patterns.md` (`FakeTimeProvider`, token `CLOCK` en `web/src/app/core/time/clock.ts`).
- **B10.** Reutilizar sesión E2E por usuario entre specs.
- **B11.** Máscaras compartidas para teléfono y formatos fijos; el valor enviado no lleva formato.
- **B12.** Scopes de Transloco en camelCase (la librería rompe los que llevan guion).
- **B13.** `skills-lock.json` con hash de cada skill compañera (`audit-and-skill-orchestration`).
- **B14.** Registros vivos de formas/excepciones no default con su comando de regeneración.
- **B15.** Sección "sintaxis moderna" obligatoria en `estandares-<stack>.md`.
- **B16.** Scripts SQL de soporte versionados y ejecutados en pruebas de integración (`MaintenanceScriptAuditTests.cs:13`).
- **B17.** No copiar valores de configuración en docs; enlazar al archivo fuente (SICRE tiene deriva: `backend-architecture.md:208` vs `global.json`).
- **B18.** `[duplicate-import]` por valor/tipo en el checker de fronteras.

---

## 5. No importar de SICRE

- Commits sin convención.
- Ausencia de plantilla ADR, de `ValidateOnBuild`/`ValidateScopes`, de pruebas tipo NetArchTest y de `dotnet format --verify-no-changes` en CI. El kit es más estricto; mantenerlo.
- Ausencia de umbral de cobertura, OpenTelemetry, Polly/circuit breaker, feature flags, ETag y keyset: no hay evidencia en SICRE; no son brechas heredadas (evaluar por separado si se quieren en el kit).
