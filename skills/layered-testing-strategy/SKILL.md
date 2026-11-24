---
name: layered-testing-strategy
description: >-
  Úsala al diseñar, escribir o depurar pruebas unitarias, de componentes/UI, de
  integración contra base de datos real o pruebas end-to-end (E2E): uso de fakes
  escritos a mano en vez de mocks frágiles, fixtures completas, traducciones reales
  en tests y bases de datos efímeras con limpieza obligatoria. Activators: tests,
  testing, pruebas unitarias, tests de integración, pruebas e2e, fakes en memoria,
  fixtures, cobertura, test strategy, disposable database.
---

# Estrategia de Pruebas por Capa y Datos Desechables (`layered-testing-strategy`)

Asegura que cada regla de negocio, contrato de integración y flujo real de usuario se pruebe en la capa más barata y honesta posible, con cero falsos positivos, cero mocks acoplados a detalles internos y cero bases de datos contaminadas.

## Cuándo activar esta skill

- Al implementar cualquier entidad de dominio, caso de uso, adaptador con lógica, componente/store o flujo entre pantallas (las pruebas son parte de la misma tarea, nunca trabajo diferido).
- Al diseñar o depurar suites de integración de base de datos o suites E2E de navegador.
- Siempre que una prueba existente o recién escrita falle durante el desarrollo o la refactorización.

## Ley Cero: Integridad Inquebrantable de las Pruebas (Prohibido Alterar Tests Solo para Pasar)

Antes de ejecutar las suites o aprobar su entorno, cumplir [la política de seguridad de tecnologías](../security-and-auditability/references/technology-security-policy.md), incluidas dependencias de desarrollo, navegadores, bases de datos efímeras e imágenes de prueba. Bloquear versiones afectadas de cualquier severidad y verificaciones incompletas; una suite en verde no demuestra que el stack esté parcheado.

> **REGLA FATAL — NUNCA MAQUILLAR UN TEST PARA FORZAR EL VERDE**:
> Queda **terminantemente prohibido** modificar, debilitar, relajar, saltar (`skip`), borrar o acomodar las expectativas de una prueba simplemente para que pase cuando falla. Un test que falla puede estar señalando un **defecto real en el código de producción**; alterar el test para que coincida con la salida defectuosa oculta el bug y lo certifica falsamente hacia producción.

1. **Presunción obligatoria**: cuando un test falla (sea de regresión o recién escrito a partir del requerimiento), **asumir primero que el código de producción tiene un bug** e investigar la causa raíz contra la regla de negocio y el contrato arquitectónico.
2. **Prohibido escribir tests tautológicos**: al crear pruebas nuevas, derivar las aserciones de la especificación y los invariantes del dominio, **jamás** copiando a ciegas el valor que la implementación actual devuelve tras una corrida fallida.
3. **Prohibido debilitar aserciones o puentear controles**: nunca cambiar una comparación exacta por `toBeTruthy()`/`not null`, nunca desactivar filtros de seguridad/antiforgery, nunca mockear el colaborador que evidenció el error ni cambiar los datos del fixture para esquivar un caso borde real (tildes, espacios, límites, concurrencia).
4. **Única excepción válida para editar la expectativa de un test**: haber comprobado que el requerimiento de negocio cambió explícitamente en la tarea actual (o un error objetivo de infraestructura del propio arnés sin relación con la regla probada), manteniendo una aserción igual de estricta. Ante cualquier duda sobre si el test protegía una invariante real, **detenerse y consultar al usuario** antes de tocar el test.
5. **Suite que exige infraestructura: fallar en voz alta, no saltar**: una suite de integración que necesita un motor real (base de datos, cola, almacenamiento) lanza un error explícito y legible si falta su variable de conexión (`SQL_TEST_CONNECTION debe estar configurada…`) y se aísla en su propio proyecto o paso de CI. Es preferible a un `skip` condicional, porque una suite que se salta en silencio puede quedar meses sin correr.
6. **Salto condicional legítimo (no es manipulación)**: una prueba que exige un entorno o perfil que la corrida actual no provee puede saltarse solo si la condición se evalúa en código contra una variable/perfil explícito, el motivo va escrito en la propia llamada y existe una configuración versionada que fija esa condición y la ejecuta en CI (p. ej. `test.skip(process.env.SECURITY_PREVIEW !== 'true', 'Requiere playwright.security.config.ts y el build QA')`, con la variable fijada por esa configuración). Un `skip` incondicional, sin motivo, sin perfil que lo ejecute o agregado tras ver el fallo sigue siendo manipulación.
7. Ver el catálogo completo de anti-patrones de manipulación, la política anti-flaky y el protocolo de triaje en [test-integrity-and-triage.md](./references/test-integrity-and-triage.md).

## Matriz de decisión: ¿cómo se prueba cada capa?

| Capa | Técnica obligatoria | Qué prohibir |
| --- | --- | --- |
| **`domain` / reglas puras** | Pruebas unitarias puras directas sobre constructores, métodos e invariantes, sin contenedor DI ni arnés de UI. | Confiar solo en pruebas indirectas desde controladores. |
| **`application` (casos de uso)** | Pruebas unitarias rápidas usando **fakes en memoria escritos a mano** para los puertos (`new UseCase(fakeRepo, fakeClock)`). Todo caso de uso nuevo lleva al menos 1 test de camino principal (incluidos lectores simples). | Frameworks de mocking pesados acoplados al orden interno de llamadas; levantar base de datos o servidor HTTP para probar un caso de uso. |
| **`application` (delegación pura en cliente)** | Cuando varios casos de uso son simples pasamanos de 1 línea a un puerto sin validación ni ramificación, cubrirlos con **una sola prueba parametrizada por tabla** por feature. En cuanto uno gane lógica propia, pasa a su archivo de test individual. | Multiplicar archivos de boilerplate idénticos o dejarlos sin verificar reenvío de argumentos y propagación de error. |
| **`infrastructure` (adaptadores sin BD)** | Pruebas unitarias directas sobre compresores, cifradores, despachadores de Outbox, interceptores HTTP que traducen errores o validadores de documentos. | Replicar con mocks llamadas triviales 1:1 a un cliente HTTP que no transforman ni deciden nada. |
| **`infrastructure` (persistencia y concurrencia)** | **Suite de integración dedicada contra el motor de base de datos real** usando una base temporal exclusiva por clase de prueba (`<App>IntegrationTests_<guid>`), creada con las migraciones reales y borrada al terminar (transacciones, locks `SKIP LOCKED`/`UPDLOCK`, concurrencia optimista, índices filtrados, colaciones). Los lectores paginados, con caché o con conteos afirman además el **número exacto de comandos SQL** con un interceptor contador. | **Bases en memoria falsas o motores sustitutos** (ej. SQLite en memoria cuando producción usa PostgreSQL/SQL Server): no reproducen bloqueos, concurrencia ni índices reales. Dejar sin vigilar el número de viajes a la base (un N+1 o un `COUNT` de más pasa en verde). |
| **`ui` (componentes, stores, guards)** | Arnés de renderizado/DI del framework + diccionarios reales de traducción cargados desde disco sin HTTP + **fixtures completas tipadas** con overrides puntuales. Ubicados **al lado del archivo fuente** (`foo.spec` junto a `foo`), nunca en un árbol paralelo separado. | Objetos parciales con casteo forzado (`{} as Modelo`) que provocan errores no controlados al renderizar colecciones; copiar textos traducidos a mano en el test; crear tests vacíos para contenedores de puro layout sin ramificación. |
| **API HTTP (seguridad y pipeline)** | Pruebas sobre el servidor en memoria conservando **todos los filtros globales reales** (pidiendo el token CSRF/antiforgery y enviándolo igual que el cliente real), con la cadena de conexión forzada a un servidor inexistente salvo que la suite reciba una base desechable. Las **invariantes transversales** de la API (tope de texto de cada contrato igual a su columna, filtros de capacidad en endpoints de carga, validación antes del caso de uso, forma del contrato de falla) se verifican con **pruebas de convención por reflexión** que enumeran todos los endpoints o contratos y fallan ante uno nuevo que no cumpla. | Desactivar autenticación o antiforgery en el servidor de pruebas para «facilitar» el test; dejar que el host herede la conexión de los secretos de usuario; confiar en revisión manual para invariantes que un endpoint nuevo puede olvidar. |
| **Flujos de usuario (E2E), nivel UI** | Layout, navegación, accesibilidad, responsividad e i18n contra **API simulada** (`page.route`) con fixtures completas y tipadas. Corren rápido y sin base. | Fixtures parciales que esconden ramas; usar este nivel como prueba de persistencia o de permisos reales. |
| **Flujos de usuario (E2E), nivel real** | Persistencia y permisos contra **API real + base de datos + almacenamiento desechables**, en specs con sufijo `-real.e2e-spec`. Todo flujo que escribe datos tiene al menos un spec `-real`. 1 flujo nuevo o modificado = 1 spec en la misma tarea, registrado en `AGENTS.md` con su nivel, con esperas eventuales sobre el DOM/estado. | Pausas fijas (`sleep(2000)`, `waitForTimeout`), correr contra bases de QA/desarrollo compartido, dejar bases temporales huérfanas o declarar cubierto un flujo de escritura solo con API simulada. |

Consulta los patrones detallados en:
- [fakes-and-fixtures-patterns.md](./references/fakes-and-fixtures-patterns.md) — cómo escribir fakes limpios, relojes deterministas, fixtures completas, pruebas de tabla para delegaciones y pruebas de convención por reflexión.
- [disposable-db-and-e2e-lifecycle.md](./references/disposable-db-and-e2e-lifecycle.md) — ciclo completo de bases efímeras locales/CI (Windows y Linux/Docker), base por clase de prueba, conteo de comandos SQL, los dos niveles E2E, limpieza garantizada y pruebas E2E de accesibilidad, contraste efectivo y seguridad.
- [test-integrity-and-triage.md](./references/test-integrity-and-triage.md) — anti-manipulación, saltos legítimos y política anti-flaky (sin reintentos).

## Convenciones clave

1. **Nombrado autoexplicativo de pruebas**: expresar resultado esperado + condición (`Returns_NotFound_when_record_does_not_exist` o equivalente idiomático), sin depender de comentarios explicativos encima del test.
2. **No escribir conteos fijos de tests en documentación permanente**: envejecen en el siguiente cambio; documentar en su lugar el comando exacto que lista y ejecuta la suite.
3. **Visibilidad interna para pruebas de integración**: mantener los adaptadores de infraestructura con visibilidad interna al módulo y habilitar visibilidad explícita únicamente hacia el ensamblado/paquete de pruebas correspondiente; nunca hacerlos públicos a toda la aplicación solo para probarlos.
4. **Un proyecto de pruebas por proyecto de código**: cada proyecto/paquete de `src` tiene su proyecto de pruebas, que referencia solo lo que prueba (las pruebas de `application` no referencian `infrastructure` ni `api`). Así el compilador impide que una prueba de caso de uso toque la base o el servidor HTTP.
5. **Cero reintentos, cero pausas fijas**: `retries: 0` en el runner E2E y en el de unidad; ningún `waitForTimeout`/`sleep` (vigilado por lint, p. ej. `playwright/no-wait-for-timeout` sobre `e2e/`). Un timeout de infraestructura se sube con la justificación escrita junto a la configuración. Ver la política completa en [test-integrity-and-triage.md](./references/test-integrity-and-triage.md#política-anti-flaky-sin-reintentos).
6. **Tiempo inyectado**: ningún código bajo prueba lee el reloj del sistema directamente; recibe un proveedor de tiempo (`TimeProvider`/`FakeTimeProvider` en .NET, token `CLOCK` en el cliente) que la prueba controla.
7. **Declarar en `AGENTS.md` qué corre en CI**: qué suites (unidad, integración, E2E UI, E2E `-real`, perfil de seguridad) corre cada pipeline y cuáles se ejecutan solo en local, con el comando exacto de cada una.

## Checklist antes de cerrar cualquier tarea con código

- [ ] **Integridad verificada**: ningún test preexistente o nuevo fue debilitado, acomodado al error, saltado (`skip`) ni borrado para lograr que la suite pase; todo fallo detectado se resolvió corrigiendo el defecto real en el código de producción. Cada `skip` restante es condicional, con motivo escrito y un perfil versionado que sí lo ejecuta.
- [ ] Ningún host de prueba puede resolver la conexión del desarrollador (cadena inexistente forzada + prueba que lo afirma), y toda delegación de pruebas a un agente lo advirtió por escrito.
- [ ] Cada regla nueva de `domain` tiene su prueba unitaria directa.
- [ ] Cada caso de uso nuevo o modificado tiene prueba con fakes en memoria (camino feliz + cada `FailureReason`).
- [ ] Ningún test usa casteos parciales inseguros para modelos consumidos por plantillas.
- [ ] Si se tocaron consultas complejas, bloqueos, migraciones o concurrencia, pasan las pruebas contra motor de BD real efímero; los lectores paginados o con caché afirman su número exacto de comandos SQL.
- [ ] Si se agregó o cambió un contrato de entrada o un endpoint, las pruebas de convención por reflexión siguen en verde (tope de texto = columna, filtros de capacidad, validación antes del caso de uso).
- [ ] Si cambió un flujo real de usuario entre pantallas, existe su spec E2E registrado en `AGENTS.md` con su nivel (UI simulada o `-real`); todo flujo que escribe datos tiene al menos un spec `-real`, y se verificó la eliminación total de la base y archivos temporales tras la corrida.
- [ ] Ninguna configuración de runner tiene `retries > 0` ni se agregaron pausas fijas.
