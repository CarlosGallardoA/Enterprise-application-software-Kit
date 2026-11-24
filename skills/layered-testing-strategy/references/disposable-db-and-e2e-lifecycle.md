# Ciclo de Vida de Bases de Datos Desechables y Pruebas E2E

## 1. Regla absoluta de aislamiento de datos

Las pruebas de integración SQL y las pruebas E2E de navegador **jamás** se conectan a bases compartidas de QA, PreProducción, Producción ni a la base local de trabajo diario del desarrollador.

### Blindaje del host de prueba contra la base del desarrollador

Los secretos locales de usuario (user-secrets, `.env` locales, perfiles del IDE) suelen apuntar a QA o a la base de depuración diaria, y el host de prueba los carga igual que la aplicación real. Sin blindaje explícito, una prueba HTTP "en memoria" puede escribir en una base compartida.

1. **Cadena inalcanzable forzada en cada host de prueba**: un helper único (p. ej. `UseUnreachableDatabase()`) fija la conexión a un servidor inexistente (`Server=unused.invalid;Database=Unused;`) mediante el mecanismo que el framework aplica **antes** de registrar servicios (`builder.UseSetting(...)` en .NET minimal hosting; `ConfigureAppConfiguration` llega tarde y no basta). Solo las suites de integración reemplazan esa cadena por la de la base desechable de la corrida, recibida por variable de entorno de la sesión.
2. **Prueba guardiana**: un test resuelve el contexto de datos del host de prueba y afirma que su cadena es la inalcanzable (o la desechable), nunca la de los secretos del desarrollador (p. ej. `The_test_host_database_context_never_uses_the_developer_connection_string`).
3. **Segunda barrera en la corrida local**: el script o perfil que ejecuta la suite exporta además la variable de conexión apuntando al servidor inexistente, para que nada caiga en la conexión de los secretos aunque un host nuevo olvide el helper.
4. **Advertencia obligatoria al delegar**: toda instrucción que delega escribir o correr pruebas en un agente o subagente declara por escrito este riesgo y la regla (solo base local desechable o servicios simulados; prohibido usar la conexión de los secretos de usuario o de un ambiente compartido).

### Motor desechable según la plataforma

El kit corre igual en agentes Windows (IIS) y Linux (Docker); el motor de la base efímera es siempre **el mismo producto y versión mayor que producción**, cambia solo cómo se levanta:

| Plataforma | Opción recomendada |
| --- | --- |
| Windows local o agente Windows | SQL Server LocalDB / Developer, o el contenedor del motor si Docker está disponible. |
| Linux local o agente Linux | Contenedor del motor (`mcr.microsoft.com/mssql/server`, `postgres:<versión>`) vía Testcontainers o `docker compose`, con imagen fijada por versión y verificada según la política de tecnologías. |
| Servicio administrado en CI | Contenedor de servicio del job (`services:` del pipeline), destruido con el job. |

La cadena de conexión siempre llega por variable de entorno de la sesión; el código de prueba no sabe cuál de las tres opciones se usó.

### Base por clase de prueba (integración)

Para suites de integración de adaptadores (no E2E), cada clase o fixture de prueba crea su propia base:

1. Nombre único: `<App>IntegrationTests_<guid-sin-guiones>` sobre el servidor recibido por variable.
2. Esquema con **las migraciones reales** de la aplicación (nunca `EnsureCreated` ni un script paralelo): así cada corrida prueba también las migraciones.
3. Borrado garantizado en el `Dispose`/`DisposeAsync` del fixture (`EnsureDeletedAsync()` o `DROP DATABASE`); si la migración falla, borrar antes de relanzar la excepción.
4. Timeouts de conexión generosos y documentados para la primera conexión a una base recién creada (`Connect Timeout`, `ConnectRetryCount`), nunca reintentos de la prueba.

### Contar viajes a la base (N+1 y conteos de más)

Un lector que hace una consulta por fila o un `COUNT` extra pasa todas las aserciones de datos. Para atraparlo:

- Registrar en el contexto de datos de la prueba un **interceptor contador de comandos** (en EF Core, un `DbCommandInterceptor` que incrementa un contador en `ReaderExecuting`/`ScalarExecuting`/`NonQueryExecuting`; en otros ORM, el hook equivalente o el log de comandos del driver).
- Los lectores paginados, los que cachean un total y los barridos por lote afirman el **número exacto** de comandos junto al resultado (`Assert.Equal((4, 2), (page.TotalCount, commandCount))`). Una regresión de rendimiento rompe la prueba igual que un dato incorrecto.
- Para cachés, afirmar también la segunda llamada (cero comandos si el valor está vigente).

### Protocolo en 4 pasos (Local y CI)

1. **Creación aislada**:
   - Generar un nombre único por corrida o fixture (`<App>_E2E_<YYYYMMDD_HHMMSS_RAND>` o instancia efímera dedicada por job de CI `<App>_CI_<BuildId>_<JobId>_<Attempt>`).
   - Configurar la cadena de conexión exclusivamente por **variable de entorno de la sesión** del proceso de prueba (nunca escribiendo en archivos de configuración versionados ni en almacenes permanentes de secretos de usuario).
   - Apuntar el directorio de almacenamiento de archivos/documentos a una carpeta temporal exclusiva de esa corrida.

2. **Migración y semilla reproducible**:
   - Ejecutar la herramienta migradora oficial contra la base efímera para crear el esquema exacto desde cero y cargar datos de referencia.
   - Provisionar los perfiles de prueba con roles y alcances conocidos desde helpers compartidos (`e2e/support/auth`).
   - **Reutilizar la sesión por usuario**: el helper de autenticación inicia sesión una vez por usuario de prueba y guarda sus cookies (`storageState`) para los specs siguientes. El rate limiter del servidor **nunca** se desactiva para E2E; si responde 429, el helper respeta `Retry-After` en lugar de apagarlo.

3. **Ejecución determinista**:
   - Usar siempre **aserciones eventuales con reintento automático** sobre el estado visible o respuestas HTTP; prohibido usar pausas fijas arbitrarias (`waitForTimeout`), vigilado por lint (`playwright/no-wait-for-timeout`).
   - Las precondiciones de entorno de un spec `-real` (usuario con un permiso concreto, catálogo sembrado) se validan al inicio con un mensaje explícito (`expect(valor, 'El usuario E2E_ADMIN debe tener rol Administrador').toBeTruthy()`), para que un entorno mal preparado falle con causa clara y no como un selector ausente.
   - Cubrir en suites E2E no solo el camino feliz, sino también:
     - Rechazo del servidor con conservación de los datos ingresados en el formulario.
     - Fallo de lectura posterior a una escritura exitosa (ofreciendo recargar sin reenviar el comando).
     - Navegación completa con teclado (`Tab`, flechas, `Escape`, retorno de foco al cerrar modales).
     - Contraste efectivo calculado componiendo las superficies reales apiladas en el navegador y adaptación móvil sin desborde horizontal.
     - Cambio de idioma en caliente y redirección a Acceso Denegado al carecer de permiso.

4. **Limpieza obligatoria (`finally` / `always()`)**:
   - Pasen, fallen o se cancelen las pruebas:
     1. Detener el proceso de la API levantado para la corrida.
     2. Forzar cierre de conexiones activas y eliminar la base efímera (`DROP DATABASE`).
     3. Verificar en el sistema de archivos que no queden archivos de datos/transacciones huérfanos ni la carpeta temporal de documentos.
   - En CI, el script de limpieza valida que la instancia efímera contenga únicamente bases con el prefijo esperado de pruebas antes de borrarlas (nunca hacer borrados globales ciegos en servidores compartidos). Si cualquier verificación falla o queda un residuo local, reportar el nombre exacto de la base y la ruta en disco al cerrar la tarea.

### Dos niveles de E2E

No todo spec de navegador necesita la base real, pero todo flujo que persiste datos sí:

| Nivel | Qué cubre | Backend | Convención |
| --- | --- | --- | --- |
| **UI** | Layout, navegación, teclado, foco, contraste, responsividad, i18n, estados de carga/error/vacío. | API simulada con `page.route('**/api/v1/**', …)` y **fixtures completas y tipadas** (las mismas fábricas de la capa UI). | `<flujo>.e2e-spec.ts` |
| **Real** | Persistencia, concurrencia optimista, permisos efectivos, bitácora, archivos. | API real + base + almacenamiento desechables (protocolo de arriba). | `<flujo>-real.e2e-spec.ts` |

Reglas:

- Todo flujo que escribe datos tiene **al menos un** spec `-real`; un spec de nivel UI nunca se presenta como cobertura de persistencia o de permisos.
- Una ruta simulada responde con la forma exacta del contrato (fixture completa, códigos y `ProblemDetails` reales); una simulación que devuelve `{}` esconde ramas igual que un casteo parcial.
- `AGENTS.md` registra cada spec con su nivel y declara qué niveles ejecuta cada pipeline de CI y cuáles solo se corren en local (con su comando).

### Registro E2E sincronizado

El registro de specs de `AGENTS.md` (viñetas ``- `<flujo>` — alcance``, indicando «API simulada» o «API real») es la lista viva de flujos cubiertos y debe coincidir exactamente con los archivos de la carpeta E2E: un spec sin registrar es cobertura invisible y una entrada sin archivo es cobertura falsa. Verificarlo en cada corrida con `check-docs-governance.mjs --e2e-dir <carpeta-e2e>` (de [`enterprise-app-blueprint`](../../enterprise-app-blueprint/SKILL.md)), que compara ambos sentidos; agregar, renombrar o borrar un spec actualiza el registro en el mismo cambio.

---

## 2. Perfil E2E de endurecimiento de seguridad sobre build productivo

Además de los flujos funcionales contra backend real efímero, mantener un perfil ligero de navegador que sirva el **artefacto compilado con configuración de producción/QA** (con cabeceras CSP, Trusted Types, anti-framing y sin herramientas de depuración) contra respuestas API simuladas para verificar en cada integración continua:
- Cero violaciones de `Content-Security-Policy` y `Trusted Types` al iniciar sesión, abrir modales y previsualizar documentos.
- Rechazo de URLs de retorno maliciosas (`//sitio-externo`, esquemas `javascript:`, barras invertidas y caracteres de control) tras el login.

Ese perfil vive en su propia configuración (p. ej. `playwright.security.config.ts`), que fija una variable como `SECURITY_PREVIEW=true` y sirve el build. Los specs que lo requieren se saltan condicionalmente fuera de él (`test.skip(process.env.SECURITY_PREVIEW !== 'true', 'Requiere playwright.security.config.ts y el build QA')`): es el salto legítimo descrito en [test-integrity-and-triage.md](./test-integrity-and-triage.md), válido solo porque CI ejecuta ese perfil en cada integración.

---

## 3. Accesibilidad y responsividad medidas en el navegador

Cada vista nueva o rediseñada tiene un spec (normalmente de nivel UI) que verifica en el navegador lo que los validadores estáticos no pueden ver:

1. **Matriz de anchos**: recorrer `360`, `768` y `1280 px` y afirmar que no hay desborde horizontal (`document.documentElement.scrollWidth <= clientWidth`) y que las tablas pasan a tarjetas bajo `48rem` sin perder columnas.
2. **Alto Contraste y movimiento reducido**: `page.emulateMedia({ forcedColors: 'active', reducedMotion: 'reduce' })` y comprobar que el foco sigue visible (contorno pintado por el sistema) y que ninguna animación bloquea la interacción.
3. **Contraste efectivo tras estabilizar**: esperar a que terminen las animaciones (`settleAnimations()`: `document.getAnimations()` resueltas) antes de medir; calcular el contraste componiendo las superficies reales apiladas y **fallar con error explícito** si el fondo es un degradado, una imagen o tiene opacidad, en lugar de medir contra un color supuesto.
4. **Teclado y foco**: el enlace de salto lleva a `<main>`, los diálogos devuelven el foco al disparador y el primer campo inválido recibe foco al enviar un formulario con errores.
5. **Título y lenguaje**: `document.title` y `<html lang>` cambian al navegar y al cambiar de idioma.
