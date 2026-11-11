# Ciclo de Vida de Bases de Datos Desechables y Pruebas E2E

## 1. Regla absoluta de aislamiento de datos

Las pruebas de integración SQL y las pruebas E2E de navegador **jamás** se conectan a bases compartidas de QA, PreProducción, Producción ni a la base local de trabajo diario del desarrollador.

### Blindaje del host de prueba contra la base del desarrollador

Los secretos locales de usuario (user-secrets, `.env` locales, perfiles del IDE) suelen apuntar a QA o a la base de depuración diaria, y el host de prueba los carga igual que la aplicación real. Sin blindaje explícito, una prueba HTTP "en memoria" puede escribir en una base compartida.

1. **Cadena inalcanzable forzada en cada host de prueba**: un helper único (p. ej. `UseUnreachableDatabase()`) fija la conexión a un servidor inexistente (`Server=unused.invalid;Database=Unused;`) mediante el mecanismo que el framework aplica **antes** de registrar servicios (`builder.UseSetting(...)` en .NET minimal hosting; `ConfigureAppConfiguration` llega tarde y no basta). Solo las suites de integración reemplazan esa cadena por la de la base desechable de la corrida, recibida por variable de entorno de la sesión.
2. **Prueba guardiana**: un test resuelve el contexto de datos del host de prueba y afirma que su cadena es la inalcanzable (o la desechable), nunca la de los secretos del desarrollador (en SICRE: `The_test_host_database_context_never_uses_the_developer_connection_string`).
3. **Segunda barrera en la corrida local**: el script o perfil que ejecuta la suite exporta además la variable de conexión apuntando al servidor inexistente, para que nada caiga en la conexión de los secretos aunque un host nuevo olvide el helper.
4. **Advertencia obligatoria al delegar**: toda instrucción que delega escribir o correr pruebas en un agente o subagente declara por escrito este riesgo y la regla (solo base local desechable o servicios simulados; prohibido usar la conexión de los secretos de usuario o de un ambiente compartido).

### Protocolo en 4 pasos (Local y CI)

1. **Creación aislada**:
   - Generar un nombre único por corrida o fixture (`<App>_E2E_<YYYYMMDD_HHMMSS_RAND>` o instancia efímera dedicada por job de CI `<App>_CI_<BuildId>_<JobId>_<Attempt>`).
   - Configurar la cadena de conexión exclusivamente por **variable de entorno de la sesión** del proceso de prueba (nunca escribiendo en archivos de configuración versionados ni en almacenes permanentes de secretos de usuario).
   - Apuntar el directorio de almacenamiento de archivos/documentos a una carpeta temporal exclusiva de esa corrida.

2. **Migración y semilla reproducible**:
   - Ejecutar la herramienta migradora oficial contra la base efímera para crear el esquema exacto desde cero y cargar datos de referencia.
   - Provisionar los perfiles de prueba con roles y alcances conocidos desde helpers compartidos (`e2e/support/auth`).

3. **Ejecución determinista**:
   - Usar siempre **aserciones eventuales con reintento automático** sobre el estado visible o respuestas HTTP; prohibido usar pausas fijas arbitrarias.
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

### Registro E2E sincronizado

El registro de specs de `AGENTS.md` (viñetas ``- `<flujo>` — alcance``) es la lista viva de flujos cubiertos y debe coincidir exactamente con los archivos de la carpeta E2E: un spec sin registrar es cobertura invisible y una entrada sin archivo es cobertura falsa. Verificarlo en cada corrida con `check-docs-governance.mjs --e2e-dir <carpeta-e2e>` (de [`enterprise-app-blueprint`](../../enterprise-app-blueprint/SKILL.md)), que compara ambos sentidos; agregar, renombrar o borrar un spec actualiza el registro en el mismo cambio.

---

## 2. Perfil E2E de endurecimiento de seguridad sobre build productivo

Además de los flujos funcionales contra backend real efímero, mantener un perfil ligero de navegador que sirva el **artefacto compilado con configuración de producción/QA** (con cabeceras CSP, Trusted Types, anti-framing y sin herramientas de depuración) contra respuestas API simuladas para verificar en cada integración continua:
- Cero violaciones de `Content-Security-Policy` y `Trusted Types` al iniciar sesión, abrir modales y previsualizar documentos.
- Rechazo de URLs de retorno maliciosas (`//sitio-externo`, esquemas `javascript:`, barras invertidas y caracteres de control) tras el login.

Ese perfil vive en su propia configuración (p. ej. `playwright.security.config.ts`), que fija una variable como `SECURITY_PREVIEW=true` y sirve el build. Los specs que lo requieren se saltan condicionalmente fuera de él (`test.skip(process.env.SECURITY_PREVIEW !== 'true', 'Requiere playwright.security.config.ts y el build QA')`): es el salto legítimo descrito en [test-integrity-and-triage.md](./test-integrity-and-triage.md), válido solo porque CI ejecuta ese perfil en cada integración.
