# Gobierno del Repositorio y Organización Documental

## Filosofía: un único punto de verdad por tema

Un proyecto empresarial degrada rápido cuando las reglas se dispersan en conversaciones, comentarios de código o documentos contradictorios. Para evitarlo:

1. **`AGENTS.md` en la raíz es un mapa corto (objetivo 80–120 líneas; `check-docs-governance.mjs` falla por encima de 120, ajustable con `--max-agents-lines` solo con justificación)**:
   - Explica en un párrafo qué resuelve el sistema.
   - Resume las capas de arquitectura en 5–6 viñetas.
   - Muestra una tabla `"Qué buscas → Dónde vive"` apuntando a `docs/` y `DESIGN.md`.
   - Lista los comandos exactos de verificación (compilar, probar, lint, formato).
   - Mantiene el registro vivo de especificaciones E2E (nombre del archivo + flujo que cubre).
   - **Nunca** se agregan reglas detalladas de vuelta en `AGENTS.md`: toda regla nueva va al archivo específico de `docs/reglas/` o `docs/estandares/`.

2. **Taxonomía de `docs/`** (obligatorias para el validador: `arquitectura/`, `reglas/`, `estandares/`, `operacion/`, `historial/`; opcionales canónicas: `guias/`, `decisiones/`, `auditorias/`, `planes/`, `requisitos/`):

| Carpeta | Qué contiene | Ejemplo |
| --- | --- | --- |
| `arquitectura/` | Capas, límites de dependencia, mecanismos transversales (Outbox, sondeo). | `principios-generales.md`, `backend-architecture.md` |
| `reglas/` | Reglas vinculantes de gobierno y proceso independientes del stack. | `reglas-generales.md` |
| `estandares/` | Convenciones de código e implementación por capa/tecnología. | `estandares-backend.md`, `estandares-frontend.md` |
| `guias/` | Recetas prácticas paso a paso para desarrolladores nuevos y descripción de flujos. | `backend-guide.md`, `frontend-guide.md` |
| `operacion/` | Despliegue, migraciones, logs y runbooks de soporte en producción. | `deployment.md`, `logs.md`, `outbox-runbook.md` |
| `decisiones/` | Justificación técnica puntual (ADR ligero) de por qué se eligió X sobre Y. | `logging-format.md` |
| `auditorias/` | Informes de seguridad, calidad, consistencia visual y matrices de remediación. | `auditoria-seguridad.md` |
| `planes/` | Planes de trabajo por fases, rediseños o mejoras de rendimiento. | `plan-remediacion.md` |
| `requisitos/` | Especificaciones funcionales originales del dominio. | `especificacion-requerimientos.md` |
| `historial/` | Registro histórico congelado (`append-only`) de cada tarea completada, fase por fase. | `changelog.md` |

   - **Cero archivos sueltos en la raíz de `docs/`** (ni `.md` ni imágenes, diagramas o exportaciones): incluso cuando el usuario pide simplemente «crea un `.md`» sin especificar ruta, el archivo se ubica en la subcarpeta de `docs/` que corresponda a su propósito, y un diagrama vive junto al documento que lo usa. `docs/AGENTS.md` es el **único** archivo permitido en la raíz de `docs/`.
   - **Actualizar antes que duplicar**: antes de crear un `.md` nuevo, verificar si ya existe uno del mismo tema en `docs/` y actualizarlo. Si ningún directorio encaja, crear una subcarpeta descriptiva en español. Los archivos estructurales de raíz (`AGENTS.md`, `DESIGN.md`, `README.md`) permanecen siempre en la raíz.
   - **`PRODUCT.md` (opcional, raíz)**: contexto de producto para agentes de diseño/UX (plataforma, usuarios, tono, objetivos); también permanece en la raíz junto a `DESIGN.md`, sin duplicar reglas de `docs/`.

3. **Documentos de arquitectura con secciones obligatorias**: `docs/arquitectura/backend-architecture.md` y `frontend-architecture.md` nacen de las plantillas [backend-architecture.template.md](../resources/backend-architecture.template.md) y [frontend-architecture.template.md](../resources/frontend-architecture.template.md), y conservan estas secciones aunque alguna diga "no aplica todavía":
   - Modelo mental en un párrafo y tabla de proyectos/paquetes con su responsabilidad y sus referencias permitidas.
   - Anatomía de un vertical slice y tabla **"¿Dónde va cada cosa?"** (validación, autorización, mapeo, consultas, eventos, jobs).
   - Ejemplo de punta a punta de un caso de uso real del proyecto.
   - Raíces de composición, decoradores/cachés y registro de dependencias.
   - Convenciones de nombrado, build y toolchain, estrategia de pruebas y contrato de errores.
   - **Registros vivos** (ver regla de proceso 3) y anti-patrones prohibidos.
   - `docs/guias/<stack>-guide.md` (desde [stack-guide.template.md](../resources/stack-guide.template.md)) contiene la receta paso a paso para agregar un caso de uso y la **checklist de PR** que todo cambio debe cumplir.

4. **`docs/operacion/deployment.md` declara el perfil de hospedaje** de cada ambiente (Windows + IIS o Linux + Docker) desde [deployment.template.md](../resources/deployment.template.md), con dónde vive la configuración, cómo se reverifica el artefacto y el runbook de diagnóstico.

## Reglas de proceso y flujo de trabajo

### 1. Estándar estricto de `docs/historial/changelog.md` (congelado, numerado y con verificación honesta)
- Al terminar **cualquier** tarea (funcionalidad, corrección, refactorización, endurecimiento, plan o auditoría), se agrega una nueva entrada en la parte superior de `docs/historial/changelog.md` con formato `### AAAA-MM-DD (N)`, incrementando `N` de forma correlativa (`(1)`, `(2)`, `(3)`...).
- **Registro histórico congelado**: las entradas anteriores **jamás se reescriben** aunque semanas después se muevan o renombren archivos; el estado normativo vigente vive en `docs/reglas/`, `docs/estandares/` y `docs/arquitectura/`, no en entradas viejas del historial.
- **Estructura de cada entrada**:
  1. **Alcance y cambios realizados**: qué problema, fase o flujo se resolvió, decisiones clave y enlaces relativos a planes, decisiones o matrices en `docs/`.
  2. **Verificación real y límites explícitos**: detallar con exactitud qué compilaciones, pruebas, linters y validadores se ejecutaron y aprobaron, **y declarar con total honestidad qué NO se ejecutó o qué límite permaneció** (p. ej., si faltaba motor SQL local, IIS o sandbox de ejecución, o si no hubo commit/despliegue). Nunca afirmar verificaciones ni coberturas no corridas.
- Toda narrativa histórica (*"se corrigió el hallazgo X"*, *"a pedido del usuario"*) vive **exclusivamente aquí** o en `docs/decisiones/`, jamás como comentario conversacional en el código fuente.
- **Validación automática**: `check-docs-governance.mjs` revisa **todos** los encabezados (numeración presente, sin duplicados ni saltos, orden descendente y fechas no crecientes). Un historial heredado previo a esta regla no se reescribe: se declara su límite con el marcador `<!-- governance:changelog-from N -->` (o `--changelog-from N`) y se valida desde arriba hasta la entrada `N`; aun así, una entrada con número vigente extraviada en el historial heredado se reporta. Los enlaces solo se validan en la entrada más reciente, porque las anteriores son congeladas.

### 2. Catálogo vivo de endpoints HTTP
- Todo endpoint nuevo o modificado se documenta en la misma tarea dentro del catálogo ejecutable del repositorio (archivo `.http`, colección declarativa o especificación verificada), detallando método, ruta, autenticación requerida, protección CSRF/antiforgery, cuerpo de entrada y códigos de respuesta esperados (`200/201/204` y errores tipados).

### 3. Registros vivos de excepciones y formas no default
- Toda forma, variante o excepción que se aparta del default arquitectónico (una feature que usa la Forma 2 de slice, una entidad exceptuada de `AuditableEntity`, un endpoint anónimo, un pin de dependencia transitiva, un archivo generado) figura **por nombre** en un registro dentro del documento de arquitectura que la gobierna, con el motivo y, si el registro se genera, el **comando exacto que lo regenera**. Lo que no está en el registro sigue el default.

### 4. Los documentos enlazan la configuración, no la copian
- No copiar valores de configuración (versión de SDK, `rollForward`, número de proyectos, límites, puertos, versiones de paquetes) dentro de la prosa de `docs/`: enlazar al archivo fuente (`global.json`, `Directory.Build.props`, `Directory.Packages.props`, `appsettings.json`, `angular.json`). Un valor copiado se desincroniza en el siguiente cambio y el documento termina contradiciendo al código.
- Cuando un número es imprescindible para explicar una regla (p. ej. el tope de 100 elementos por página), el documento nombra la constante o el archivo que lo define.

### 5. Sintaxis moderna por stack
- Cada `docs/estandares/estandares-<stack>.md` incluye una sección **"Sintaxis moderna"** que fija las construcciones obligatorias de la versión del lenguaje adoptada (p. ej. en C#: *namespaces* de archivo, constructores primarios, expresiones de colección, *pattern matching*, `required`/`init`; en TypeScript: `satisfies`, `import type`, *optional chaining*) y sus excepciones conocidas (p. ej. árboles de expresión de LINQ que no admiten ciertas construcciones). Así el código nuevo no mezcla estilos de distintas versiones.

### 6. Seguridad estricta sobre Git y evidencias locales
- **Operaciones mutantes de Git**: un agente nunca ejecuta `commit`, `push`, `merge`, `rebase`, `reset` ni borrado/creación de ramas por iniciativa propia; deja los cambios verificados en el árbol de trabajo y solo usa comandos de lectura (`status`, `diff`, `log`) salvo instrucción explícita para esa tarea puntual.
- **Capturas antes/después y artefactos de agentes fuera de Git**: las capturas de pantalla, galerías HTML, volcados de salida, borradores y archivos intermedios que genera un agente se guardan exclusivamente en rutas ignoradas por Git (`docs/auditorias/evidencias/`, `test-results/` o una carpeta dedicada como `.agent-artifacts/`, todas en `.gitignore`). En el repositorio solo se versionan los informes `.md` y las pruebas automatizadas que las generan.
- **Cero secretos en el árbol de trabajo**: jamás escribir credenciales reales, tokens o llaves en ningún archivo dentro del repositorio, ni siquiera en scripts temporales (una vez en el historial de Git, un borrado posterior no revoca la exposición).
