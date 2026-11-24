---
name: enterprise-app-blueprint
description: >-
  Úsala al iniciar una aplicación nueva desde cero, estructurar la gobernanza
  documental de un repositorio (AGENTS.md, docs/, changelog), definir contratos
  estándar de API y errores tipados, o diseñar el modelo base de datos auditable,
  concurrencia optimista y paginación. Activators: nuevo proyecto, estructura base,
  blueprint empresarial, gobierno de repositorio, AGENTS.md, contrato de errores,
  auditoría de entidades, project bootstrap, enterprise architecture setup.
---

# Plano Maestro de Aplicación Empresarial (`enterprise-app-blueprint`)

Establece los cimientos estructurales, documentales y de contratos que sostienen una aplicación empresarial o institucional de alta confiabilidad, 100 % independiente del lenguaje o framework elegido.

## Cuándo activar esta skill

- Al crear un repositorio o aplicación nueva y definir su estructura inicial.
- Al estandarizar un proyecto existente para dotarlo de documentación viva, reglas claras para agentes/desarrolladores y contratos uniformes.
- Al diseñar las convenciones transversales de errores HTTP, concurrencia optimista, paginación, normalización de búsquedas o auditoría de entidades.

## Decisiones fundacionales no negociables

1. **`AGENTS.md` corto como punto de entrada, nunca enciclopedia**: la raíz del repositorio contiene un `AGENTS.md` breve que resume la arquitectura, enlaza a `docs/` por responsabilidad, lista los comandos exactos de verificación y registra las pruebas E2E activas. El detalle normativo vive en `docs/` sin duplicarse.
2. **Organización estricta de `docs/` y `changelog.md` congelado**:
   - Ningún archivo suelto (`.md`, imágenes ni ningún otro) vive en la raíz de `docs/` (la única excepción es `docs/AGENTS.md`), incluso cuando una instrucción pida solo «crear un `.md`» sin ruta: siempre se ubica en la subcarpeta que corresponda, revisando antes si ya existe un documento del tema para actualizarlo en vez de duplicarlo.
   - **5 subcarpetas obligatorias** (`arquitectura/`, `reglas/`, `estandares/`, `operacion/`, `historial/`), que el validador exige, y **5 opcionales canónicas** (`requisitos/`, `guias/`, `decisiones/`, `auditorias/`, `planes/`) que el scaffold crea y se usan en cuanto exista contenido de ese tipo. Solo si ninguna de las 10 encaja se crea una subcarpeta nueva con nombre descriptivo en español. `auditorias/` es opcional como carpeta pero necesaria en la práctica, porque aloja el informe de la decisión 10.
   - `docs/historial/changelog.md` es **obligatorio, `append-only` y congelado**: cada tarea agrega arriba una entrada numerada correlativa `### AAAA-MM-DD (N)` detallando alcance, decisiones y verificación honesta (qué se corrió y qué límites quedaron pendientes), sin reescribir entradas pasadas. Ver [project-governance-and-docs.md](./references/project-governance-and-docs.md).
3. **Contrato único de errores de negocio orientados a i18n**: toda falla controlada (400, 401, 403, 404, 409, 412, 422) devuelve `{ reason, details? }` donde `reason` es un código literal estable (jamás prosa libre en un idioma fijo). Las excepciones no controladas (500) **nunca** exponen `reason` ni detalles internos; devuelven únicamente un `traceId` correlacionado con el log estructurado del servidor.
4. **Concurrencia optimista por defecto**: toda entidad con edición concurrente plausible (agregados operativos, usuarios/roles, datos maestros editados desde administración y parámetros clave/valor) expone un token de versión (`rowVersion` / `version` / `ETag`). Actualizar exige presentar la versión leída; un desfase responde `412 Precondition Failed`. Solo los catálogos casi estáticos pueden omitirlo, con la justificación documentada en la arquitectura del backend.
5. **Baja lógica y trazabilidad automática**: en módulos administrativos y operativos, "eliminar" significa desactivar (`isActive = false`). Toda entidad con CRUD hereda o compone el contrato base auditable, salvo que encaje en una de las 5 excepciones documentadas en [api-contracts-and-data-model.md](./references/api-contracts-and-data-model.md).
6. **Paginación en servidor**: toda colección que crece con el uso pagina en el servidor con un único `PageRequest` normalizado (por defecto 10, máximo 100) y orden determinista con desempate por clave primaria. Los contadores de sondeo y las tablas append-only grandes usan conteos acotados o cacheados en vez de `COUNT` completo. Solo los catálogos activos acotados (decenas de filas para selectores de UI) pueden devolverse completos sin paginar.
7. **Reloj inyectado**: queda prohibido leer la hora del sistema de forma estática o directa en dominio, casos de uso o mapeadores. Siempre se inyecta un proveedor de tiempo abstracto.
8. **Integridad inquebrantable de las pruebas (prohibido alterar tests solo para pasar)**: ninguna prueba existente o recién escrita se debilita, modifica para acomodarse al error ni salta (`skip`) para poner el pipeline en verde. Si una prueba falla, se investiga y corrige el defecto real en el código de producción. No es manipulación el **salto condicional legítimo**: condición explícita evaluada contra un entorno/perfil (`test.skip(process.env.X !== 'true', 'motivo')`), motivo escrito en la llamada y una configuración versionada que fija esa condición y sí ejecuta la prueba, p. ej. un perfil de seguridad sobre el build (ver [`layered-testing-strategy`](../layered-testing-strategy/SKILL.md)).
9. **Orquestación limpia con skills de auditoría y diseño**: las auditorías de seguridad delegan obligatoriamente en `security-audit` oficial de Cloudflare (modo solo lectura + evidencia `confirmed`/`needs_validation`), y el trabajo UI/UX combina `DESIGN.md` con `design-consistency-auditor`, `ui-ux-pro-max` e `impeccable` (ver [`audit-and-skill-orchestration`](../audit-and-skill-orchestration/SKILL.md)).
10. **Tecnologías soportadas sin vulnerabilidades conocidas aplicables**: antes de elegir o ejecutar el stack, cumplir [technology-security-policy.md](../security-and-auditability/references/technology-security-policy.md). Verificar avisos oficiales vigentes de runtimes, dependencias y bibliotecas nativas; bloquear ante cualquier severidad, falta de soporte o evidencia incompleta. Extenderlo a CI, SO e imágenes.
11. **Portabilidad de hospedaje (Windows + IIS y Linux + Docker)**: el código y el artefacto son los mismos en ambos perfiles; solo cambia dónde vive la configuración (servidor IIS o variables/`env_file`/*secrets* del contenedor), que **nunca** viaja en el artefacto ni en la imagen. `docs/operacion/deployment.md` declara el perfil de cada ambiente (ver [`production-release-and-migrations`](../production-release-and-migrations/SKILL.md)).
12. **Toolchain centralizado y reproducible**: versiones de SDK, framework, analizadores y paquetes se declaran una sola vez en archivos centrales, con fuentes de paquetes cerradas y finales de línea normalizados. Ver [build-and-toolchain-baseline.md](./references/build-and-toolchain-baseline.md).

## Flujo paso a paso para inicializar o alinear un proyecto

### Paso 1: Estructurar el gobierno documental

1. Generar automáticamente toda la jerarquía inicial ejecutando el script incluido (cero dependencias, Node.js soportado y parcheado según la política de tecnologías):
   ```bash
   node <ruta-skill>/scripts/scaffold-project-docs.mjs --target . --name "NombreProyecto" [--dotnet] [--docker]
   ```
2. Esto crea sin sobrescribir archivos existentes:
   - `./AGENTS.md` (desde [AGENTS.template.md](./resources/AGENTS.template.md)) y `./DESIGN.md`.
   - `./docs/AGENTS.md` (desde [docs-AGENTS.template.md](./resources/docs-AGENTS.template.md)) y las **10 subcarpetas canónicas**: `arquitectura/`, `requisitos/`, `guias/`, `operacion/`, `decisiones/`, `auditorias/`, `planes/`, `reglas/` ([reglas-generales.template.md](./resources/reglas-generales.template.md)), `estandares/` y `historial/` ([changelog.template.md](./resources/changelog.template.md) con su primera entrada `### AAAA-MM-DD (1)`).
   - `docs/arquitectura/backend-architecture.md` y `frontend-architecture.md` con sus **secciones obligatorias** ([backend](./resources/backend-architecture.template.md), [frontend](./resources/frontend-architecture.template.md)), `docs/guias/backend-guide.md` y `frontend-guide.md` con receta y **checklist de PR** ([stack-guide.template.md](./resources/stack-guide.template.md)) y `docs/operacion/deployment.md` con el perfil de hospedaje por ambiente ([deployment.template.md](./resources/deployment.template.md)).
   - [.editorconfig.template](./resources/.editorconfig.template) (UTF-8 sin BOM, LF, analizadores C# como error), [.gitattributes.template](./resources/.gitattributes.template) (`eol=lf`, `crlf` solo para scripts de Windows, binarios) y [.gitignore.template](./resources/.gitignore.template) (secretos `.env.*`, `secrets/`, `secrets.json`, `*.pfx`, `*.pem`, `*.key`; logs de compilación; evidencia local `docs/auditorias/evidencias/`, `test-results/` y artefactos de agentes).
   - Con `--dotnet`: `global.json` (`rollForward: latestPatch`), `Directory.Build.props`, `Directory.Packages.props` y `nuget.config` con `<clear/>`. Con `--docker`: `.dockerignore`. Ver [build-and-toolchain-baseline.md](./references/build-and-toolchain-baseline.md).
   - `./docs/reglas/seguridad-de-tecnologias.md`, copia de la política completa enlazada desde las reglas generales y `AGENTS.md`, y `./docs/auditorias/seguridad-tecnologias.md` (desde [seguridad-tecnologias.template.md](./resources/seguridad-tecnologias.template.md)), informe inicial en estado `BLOQUEADO` hasta la primera corrida real de la compuerta.
3. Copiar el validador de gobierno documental al repositorio (p. ej. `tools/quality/`) e integrarlo en la verificación local y en CI:
   ```bash
   node tools/quality/check-docs-governance.mjs --root . [--e2e-dir <carpeta-e2e>] [--changelog-from <N>]
   ```
   Comprueba que `AGENTS.md` no supere 120 líneas (`--max-agents-lines`) y enlace sus documentos de entrada; que existan `docs/AGENTS.md` y las 5 subcarpetas obligatorias; que no haya archivos sueltos en la raíz de `docs/`; que existan y estén enlazados la política y el informe de seguridad de tecnologías; que **todos** los encabezados `### AAAA-MM-DD (N)` estén numerados, sin duplicados ni saltos, en orden descendente y con fechas no crecientes; y que no haya enlaces relativos rotos en `AGENTS.md`, `DESIGN.md` y `docs/**/*.md`. **Exclusión declarada**: en `changelog.md` solo se validan los enlaces de la entrada más reciente, porque las anteriores son historial congelado. Un historial heredado inconsistente se excluye con `--changelog-from <N>` o el marcador `<!-- governance:changelog-from N -->` (se valida desde arriba hasta la entrada `N`; debajo solo se buscan números vigentes duplicados o extraviados). Con `--e2e-dir` verifica además que cada spec en disco figure en el registro E2E de `AGENTS.md` y viceversa.

### Paso 2: Fijar la topología de módulos y capas

1. Separar el repositorio en unidades con responsabilidades verificables por compilador o linter:
   - **Backend / Core**: `domain` (cero dependencias externas), `application` (casos de uso + puertos por feature), `infrastructure` (persistencia, integraciones, criptografía, jobs), `api` (transporte HTTP y raíces de composición), `migrator` (herramienta CLI independiente para DDL y semillas) y suites separadas para tests unitarios vs integración real.
   - **Cada capa backend es un proyecto/paquete compilado** con grafo acíclico: `Domain` sin referencias; `Application` solo `Domain`; `Infrastructure` `Domain` + `Application`; `Api` compone; `DbMigrator` usa `Infrastructure` y nunca es referenciado por `Api`. **Un proyecto de pruebas por proyecto de `src`**, que referencia solo lo que prueba (las pruebas de `Application` no referencian `Infrastructure` ni `Api`). Así el compilador, y no solo el linter, impide los atajos. Ver [build-and-toolchain-baseline.md](./references/build-and-toolchain-baseline.md).
   - **Frontend / Cliente**: `core` (shared kernel mínimo), `composition` (puentes entre features) y `features/<feature>/{domain,application,infrastructure,ui}`.
2. Activar la skill `hexagonal-vertical-slices` para definir los límites exactos y configurar su script validador de fronteras.

### Paso 3: Establecer los contratos transversales base

Implementar antes de la primera pantalla de negocio las piezas descritas en [api-contracts-and-data-model.md](./references/api-contracts-and-data-model.md):

- Respuesta tipada de falla `{ reason: string, details?: string[] }` + manejador global de excepciones no controladas con `traceId`.
- Mapeador/interceptor en el cliente que traduzca `reason` mediante el sistema de i18n activo, maneje `401` (expiración de sesión) y notifique `412` (conflicto de concurrencia).
- Contrato `PagedRequest` / `PagedResult<T>` reutilizable.
- Utilidad central de normalización de texto (`trim` + colapso opcional) aplicada tanto al persistir como antes de construir filtros de búsqueda.
- Catálogo vivo de endpoints HTTP en el repositorio (colección `.http`, OpenAPI verificada o equivalente) que se actualiza en la misma tarea que cada endpoint.

### Paso 4: Configurar compuertas tempranas de verificación

Antes de escribir funcionalidades de negocio, dejar operativos y en verde:

- Compilación con **tratamiento de advertencias como errores** (`0 warnings, 0 errors`).
- Formateador en **modo verificación** que falla si hay cambios pendientes (`dotnet format --verify-no-changes`, `prettier --check .` o equivalente), linter de código, fronteras arquitectónicas (`hexagonal-vertical-slices`), sistema de diseño (`institutional-design-system-ux`) y gobierno documental.
- **Versión de runtime fijada y comprobada antes de instalar**: `global.json` con `rollForward: latestPatch` y `allowPrerelease: false`, `.node-version`/`.nvmrc` exacto y un script en `preinstall` del gestor de paquetes que aborta si el runtime local no es la versión soportada exigida.
- **Build centralizado**: `Directory.Build.props` (framework, `Nullable`, `TreatWarningsAsErrors`, `EnforceCodeStyleInBuild`), `Directory.Packages.props` con versiones centralizadas y pins transitivos comentados, `nuget.config` con `<clear/>`, *lockfiles* versionados y `.gitattributes` que normaliza finales de línea para Windows y Linux ([build-and-toolchain-baseline.md](./references/build-and-toolchain-baseline.md)).
- Compuerta obligatoria de seguridad del stack completo, de cualquier severidad y con bloqueo ante evidencia incompleta (p. ej. `npm audit --audit-level=low` y la auditoría de paquetes del backend), más **escaneo de secretos con salida redactada** que nunca imprime el valor detectado (`production-release-and-migrations`).
- Perfil E2E de endurecimiento (CSP, Trusted Types, retornos inseguros) que corre sobre el **artefacto compilado** con su propia configuración, no sobre el servidor de desarrollo (`layered-testing-strategy`).

## Verificación antes de cerrar

- [ ] El stack y las herramientas usan versiones soportadas y parcheadas verificadas durante la tarea; `docs/reglas/seguridad-de-tecnologias.md` y el informe `docs/auditorias/seguridad-tecnologias.md` están enlazados y la compuerta de seguridad bloquea vulnerabilidades conocidas aplicables y comprobaciones incompletas.
- [ ] `AGENTS.md` enlaza sin enlaces rotos a `docs/reglas/reglas-generales.md`, `docs/arquitectura/principios-generales.md`, `DESIGN.md` y `docs/historial/changelog.md`.
- [ ] No existen archivos sueltos (de ninguna extensión) en la raíz de `docs/` fuera de `docs/AGENTS.md`, y `check-docs-governance.mjs` pasa en verde (con `--e2e-dir` si hay suite E2E).
- [ ] El contrato de errores devuelve códigos estables `reason` en fallas de negocio y `traceId` sin detalles internos ante errores `500`.
- [ ] `.gitignore` excluye secretos locales, artefactos de compilación y carpetas de capturas de evidencia local; `.gitattributes` normaliza finales de línea.
- [ ] Los documentos de arquitectura conservan sus secciones obligatorias, sus registros vivos y enlazan (no copian) los valores de configuración.
- [ ] El grafo de proyectos backend es acíclico y cada proyecto de pruebas referencia solo lo que prueba.
- [ ] `docs/operacion/deployment.md` declara el perfil de hospedaje de cada ambiente y dónde vive su configuración.
- [ ] `docs/historial/changelog.md` registra la fase inicial con el alcance real verificado.
