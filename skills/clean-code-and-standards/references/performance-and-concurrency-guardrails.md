# Guardas de Rendimiento, Consultas y Concurrencia

## 0. Método de medición obligatorio

- **Medir antes y después, nunca estimar**: toda corrección de rendimiento se valida con cifras reales tomadas antes y después del cambio, sobre una base de datos desechable con volumen realista (p. ej. cientos de miles de filas en la tabla principal), y se reportan en el plan o el changelog.
- **Backend**: registrar lecturas lógicas, tiempo de CPU y número de comandos por operación (`SET STATISTICS IO, TIME ON` en SQL Server; `EXPLAIN (ANALYZE, BUFFERS)` en PostgreSQL) y comprobar el plan de ejecución (`INDEX SEEK` frente a `SCAN`).
- **Frontend**: medir con red y CPU limitadas (p. ej. CPU 4x más lenta, 4 Mbps y 150 ms de latencia en las herramientas de desarrollo del navegador) y registrar tamaño de bundle, número de peticiones y tiempo hasta datos útiles.
- Una optimización sin medición previa y posterior no se acepta como cerrada; una que no mejora la cifra medida se revierte.

## 1. Búsqueda de texto segura y eficiente

- **Normalización previa**: pasar siempre el término de entrada por la misma normalización que usa la escritura (`trim`, colapso de controles) antes de decidir si filtrar. Un espacio al final del input de búsqueda no debe vaciar los resultados.
- **Prefijo vs. Fragmento**:
  - **Códigos e identificadores** (expediente, documento, sede, póliza): predicado `STARTS WITH` para habilitar `INDEX SEEK` sobre índices B-tree.
  - **Nombres y texto descriptivo**: predicado `CONTAINS` con colación insensible a tildes y mayúsculas.
- **SQL parametrizado con `LIKE`**: cuando se construye un patrón `LIKE` manual, escapar explícitamente `\`, `%`, `_` y `[` (en motores tipo T-SQL) declarando `ESCAPE '\'`, y pasar siempre el patrón como parámetro enlazado — jamás interpolar cadenas en SQL.
- **Predicados sargables**: calcular los umbrales temporales y derivados en la aplicación (con el reloj inyectado: `nowUtc - 24 h`) y comparar contra la columna desnuda (`WHERE CreatedAtUtc < @threshold`). Prohibido aplicar funciones sobre la columna indexada (`DATEADD(hour, 24, CreatedAtUtc) < GETUTCDATE()`, `CAST(col AS date)`, `LOWER(col)`): impiden el `INDEX SEEK` y fuerzan un barrido completo.

## 2. Trabajos por lotes y agregaciones

- **Prohibido traer filas para contar en la aplicación**: series temporales, tableros de indicadores y resúmenes usan `GROUP BY` y sumas condicionales (`SUM(CASE WHEN ... THEN 1 ELSE 0 END)`) directamente en la base de datos.
- **Paginación por cursor (`Keyset`) en barridos**: cuando un proceso recorre miles de registros históricos, ordenar por `(occurredAtUtc, id)` y avanzar con `WHERE (occurredAtUtc > :lastTs) OR (occurredAtUtc = :lastTs AND id > :lastId) LIMIT 500`, evitando el costo cuadrático de `OFFSET`.
- **Actualización masiva directa**: para operaciones masivas simples sobre entidades técnicas sin fila de auditoría campo-por-campo ni concurrencia optimista individual (ej. «marcar todas mis notificaciones como leídas»), ejecutar un `UPDATE ... WHERE` directo en lugar de hidratar cientos de objetos en memoria.
- **Barridos por lote sin costo cuadrático del ORM**: cuando un job sí necesita la entidad rastreada (auditoría, invariantes), procesar cada lote así:
  1. Leer los candidatos **sin tracking**, proyectando solo las columnas que usa la decisión.
  2. Precargar en **una sola consulta** los datos relacionados de todo el lote (`WHERE id IN (...)`), nunca una consulta por fila.
  3. Aplicar los cambios, ejecutar **un único `SaveChanges` por lote** y limpiar el rastreador de cambios después (`ChangeTracker.Clear()` o equivalente). Un contexto que acumula miles de entidades rastreadas vuelve cuadrático cada `DetectChanges`.
  - Prohibido una consulta o un `SaveChanges` por fila dentro del bucle del barrido.
- **Conteos acotados en vez de `COUNT` completo**:
  - Los contadores consultados por sondeo (campana de notificaciones, badges) cuentan con tope: `SELECT COUNT(*) FROM (SELECT TOP (n) 1 ...)` / `.Take(n).CountAsync()` con `n` pequeño (p. ej. 100) y la UI muestra `99+`.
  - En tablas append-only grandes (bitácora, historial), no recontar el total en cada página: cuando el total supera un umbral (p. ej. 10 000), reutilizarlo durante una ventana corta (p. ej. 60 s) por combinación de filtros. Documentar en el contrato que `totalCount` puede ser aproximado en ese caso.
- **Paginación offset determinista**: todo orden paginado termina con un desempate por la clave primaria (`ORDER BY SortAtUtc DESC, Id DESC`); sin él, filas con el mismo valor de orden pueden repetirse o desaparecer entre páginas. Normalizar tamaño y número de página en un único objeto de petición (por defecto 10, máximo 100).

## 3. Presupuesto de memoria y límites de recursos en archivos

- **Presupuesto global de subida (`UploadMemoryBudget`)**: reservar los bytes declarados del lote antes de almacenar buffers en memoria y liberarlos en un bloque `finally`. Si el presupuesto global (p. ej. 512 MB) no tiene capacidad dentro de una ventana corta de espera, responder `503` con código `UploadCapacityBusy` y cabecera `Retry-After`. Admitir un lote individual grande únicamente cuando no haya otras cargas en vuelo.
- **Límites al decodificar imágenes/documentos**: fijar topes estrictos de ancho/alto, megapíxeles, memoria, disco temporal y tiempo de CPU en cualquier librería procesadora de imágenes o PDFs para impedir ataques de agotamiento por descompresión (*pixel flood / zip bomb*); ante exceso en optimización opcional, abortar la transformación y conservar o rechazar de forma controlada sin agotar el proceso.
- **Cupo de CPU para trabajo intensivo**: el render de PDF y cualquier generación pesada pasan por un semáforo global con capacidad `max(1, núcleos / 2)` y una espera máxima corta (≤ 10 s). Si no obtiene turno, responder `503` con un `reason` específico (p. ej. `PdfExportCapacityBusy`) y `Retry-After`; nunca encolar sin límite en memoria.
- **Presupuesto propio de descargas**: las descargas que cargan el archivo en memoria (descifrado, ensamblado) reservan bytes de un presupuesto global distinto al de subidas (p. ej. 256 MiB en total, con un máximo reservado por descarga). Saturado, responder `503` + `Retry-After` (p. ej. 30 s) + `reason` específico (`DownloadCapacityBusy`). Preferir el *streaming* cuando el formato lo permita.
- Validar al arrancar que todos los presupuestos y cupos sean positivos y coherentes entre sí (el tope por operación no supera el total).

## 4. Rendimiento Real en Cliente Web, Red HTTP y Bundles

- **Precarga diferida, consciente de permisos y con concurrencia acotada (nunca precarga agresiva al arrancar)**:
  - Prohibido disparar `PreloadAllModules` (o equivalente) inmediatamente al cargar la aplicación: bajo HTTP/1.1 (límite de 6 conexiones por origen) decenas de chunks JS saturan la cola y matan por timeout las llamadas de datos iniciales del panel principal.
  - La estrategia de precarga debe cumplir a la vez:
    1. **Diferida**: no arranca hasta después de la primera navegación autenticada y una espera inicial (`startDelay`, p. ej. 5 s) para no competir con los datos de la pantalla de entrada. El disparador puede ser `requestIdleCallback` (con fallback a `setTimeout`) o una compuerta temporizada; ambos son válidos si respetan el resto de reglas.
    2. **Consciente de permisos**: solo precarga módulos que la sesión actual puede abrir (mismo predicado que usan los guards y el menú), priorizando los visibles en la navegación; sin sesión, vacía la cola.
    3. **Cede la red a la navegación**: pausa la cola al iniciar cada navegación y la retoma tras una espera corta al terminar (`resumeDelay`, p. ej. 2 s); no avanza con la pestaña en segundo plano (`document.visibilityState`).
    4. **Concurrencia acotada**: un máximo bajo de descargas simultáneas (p. ej. 2), dejando el resto de conexiones a las peticiones de la app; un chunk que falla no detiene la cola.
  - Inyectar temporizadores y visibilidad como dependencias para probar la estrategia con reloj falso. Ejemplo de referencia: `PermissionAwarePreloadingStrategy` en SICRE.
- **Interceptor de resiliencia que jamás reintenta `TimeoutError`**:
  - Un `TimeoutError` del cliente bajo congestión indica que la petición sigue encolada; reintentarla solo multiplica el cuello de botella. Reintentar únicamente fallos reales de transporte (`status === 0`) y solo en peticiones idempotentes de lectura (`GET`).
- **Consultas iniciales en paralelo y vistas precalculadas**:
  - Lanzar lecturas independientes de una pantalla con `Promise.all` en lugar de esperarlas en serie.
  - En tablas e historiales, precalcular formatos o etiquetas derivadas con señales/selectores memoizados (`computed()`) en lugar de invocar funciones por cada fila dentro del bucle de la plantilla.
- **Carga bajo demanda (`import()` dinámico) de SDKs pesados de SSO/OIDC**:
  - No cargar ni inicializar SDKs pesados de identidad federada (p. ej. MSAL/OIDC de ~250+ kB) en el bundle de arranque para usuarios que usan credenciales locales. Cargarlos con `import()` dinámico solo al pulsar el botón federado o cuando la pestaña trae un redirect OIDC pendiente.
- **Tipografías auto-hospedadas (`self-hosted fonts`)**:
  - Servir los archivos `.woff2` desde el propio proyecto en lugar de depender de CDNs externos (como Google Fonts) en tiempo de ejecución: elimina latencia DNS/TLS de terceros, simplifica `CSP` y evita descargar hojas para alfabetos no utilizados.
- **Presupuestos de bundle como compuerta**:
  - Declarar presupuestos de **error** (no solo de aviso) para el bundle inicial, para el chunk principal y para el estilo de cada componente (Angular `budgets` en `angular.json`; Vite/webpack `performance.maxEntrypointSize` o un script de tamaño en CI).
  - Fijar los umbrales cerca del tamaño medido (aviso ≈ +10 %, error ≈ +25 %), no con margen holgado: un crecimiento silencioso de decenas de kB debe romper el build.
  - Tras cada reducción, bajar los umbrales al nuevo tamaño. Subirlos exige justificación en el changelog.
- **Compresión de respuestas de la API en la propia aplicación**:
  - Comprimir en la app (Brotli y Gzip, nivel más rápido —`CompressionLevel.Fastest`—) solo los tipos `application/json` y `application/problem+json`, registrando el middleware antes del manejador de excepciones para que también comprima los `ProblemDetails`.
  - **Excluir obligatoriamente**: toda respuesta cuyo cuerpo lleve un token o secreto (token antifalsificación, códigos de un solo uso) por el ataque BREACH, mediante un atributo o marca explícita del endpoint; y toda descarga de archivo (respuestas con `Content-Disposition`), que ya viene comprimida o es binaria.
  - Desactivar la compresión dinámica del servidor o proxy para el prefijo de la API, para no comprimir dos veces ni comprimir el token: en **IIS**, `doDynamicCompression="false"` heredado por la aplicación de la API; en **Linux/Docker detrás de nginx**, `gzip off;` en el `location` de la API. La compresión estática de los assets de la SPA sigue a cargo del servidor web.
  - Verificar con una prueba HTTP que un endpoint normal responde `Content-Encoding: br` con `Accept-Encoding: br` y que el endpoint del token no trae `Content-Encoding`.
- **Política `Cache-Control` de la API**:
  - La API responde `Cache-Control: no-store` por defecto (agregado por middleware solo si el endpoint no fijó otro valor), para que ningún dato de sesión quede en caché del navegador, proxy o *back/forward cache*.
  - Solo los catálogos de referencia autenticados y estables (opciones de selectores) declaran `Cache-Control: private, max-age=600` de forma explícita por endpoint. Nunca datos vivos, listados operativos ni nada que dependa de permisos que cambian.
  - En el cliente, esos mismos catálogos pasan por un servicio de caché con TTL igual a esa ventana (p. ej. 10 min) que deduplica peticiones concurrentes y se vacía al cerrar sesión.

## 5. Escalonamiento de Timeouts SQL y Reintentos Idempotentes

- **Timeouts escalonados (`DB < HTTP cliente`, extendido en `DbMigrator`)**:
  - Configurar el `CommandTimeout` de base de datos en la API (p. ej. `10 s`) **por debajo** del timeout HTTP del frontend (p. ej. `15 s`) para que el servidor corte primero con traza estructurada; en cambio, sobrescribir ese timeout en el CLI `DbMigrator` (p. ej. `5 min`) donde crear o migrar esquemas legítimamente toma más tiempo.
- **Transacciones explícitas bajo `ExecutionStrategy` reintentable**:
  - Al habilitar reintentos automáticos ante fallos transitorios de base de datos (`EnableRetryOnFailure`), envolver toda transacción manual en la estrategia de ejecución del ORM y asegurar idempotencia entre intentos (mediante guardas de estado en la entidad de dominio o limpiando el `ChangeTracker` antes de reintentar).
- **Clientes HTTP salientes con límites explícitos**:
  - Todo cliente de integración se crea con la fábrica de clientes del framework (`IHttpClientFactory` o equivalente; nunca `new HttpClient()` por petición) y declara: timeout explícito (p. ej. 10 s) menor que el tope del handler o de la petición que lo invoca, tope de bytes de respuesta (p. ej. 1 MiB con `MaxResponseContentBufferSize`), redirecciones automáticas desactivadas y URL base HTTPS absoluta validada al arrancar.
  - Las reglas de seguridad (SSRF, escapado de segmentos, identidad sin secreto) viven en [outbound-integrations.md](../../security-and-auditability/references/outbound-integrations.md).

## 6. Diseño de índices guiado por las consultas reales

- **Un índice por patrón de acceso medido**, no por columna: diseñar cada índice a partir de la consulta que lo usa (filtro + orden + columnas proyectadas) y confirmar el `SEEK` en el plan de ejecución (ver §0).
- **Orden por una expresión**: si un listado ordena por una expresión (`COALESCE(OccurredAtUtc, CreatedAtUtc)`), crear una **columna calculada persistida** con esa expresión y un índice `(ColumnaCalculada, Id)`; ordenar por la expresión en línea obliga a un `SORT` sobre toda la tabla.
- **Índices filtrados con el mismo predicado del listado**: si el listado siempre excluye un estado (p. ej. borradores, `Status <> 0`), el índice lleva exactamente ese filtro. Para cada barrido periódico, crear un índice filtrado por sus candidatos pendientes (`WHERE NotifiedAtUtc IS NULL`) para que el job lea solo lo que aún no procesó.
- **Un índice filtrado solo sirve a consultas con su predicado**: si existe otra consulta sobre las mismas columnas sin ese filtro, necesita su propio índice no filtrado.
- **Índices de cobertura**: añadir `INCLUDE (...)` con las columnas proyectadas por los listados y lecturas calientes para evitar búsquedas de clave (*key lookups*); no incluir columnas de texto largo.
- Toda clave foránea consultada en uniones o filtros lleva índice. Toda nueva consulta de listado o barrido se revisa contra los índices existentes antes de cerrar el cambio.
- En PostgreSQL los equivalentes son índices de expresión o columnas `GENERATED ALWAYS AS ... STORED`, índices parciales (`WHERE ...`) e `INCLUDE`.

## 7. Números correlativos y secuencias de negocio

- Generar números correlativos visibles (expediente, folio por año) con un **upsert atómico** sobre una tabla contador por período, dentro de la misma transacción del agregado:
  - **SQL Server**: `MERGE dbo.<Contador> WITH (HOLDLOCK) AS t USING (SELECT @Period AS Period) AS s ON t.Period = s.Period WHEN MATCHED THEN UPDATE SET LastValue = t.LastValue + 1 WHEN NOT MATCHED THEN INSERT (Period, LastValue) VALUES (s.Period, 1) OUTPUT INSERTED.LastValue;`
  - **PostgreSQL**: `INSERT ... ON CONFLICT (period) DO UPDATE SET last_value = <contador>.last_value + 1 RETURNING last_value`.
  - Con EF Core, materializar el resultado con `ToListAsync()` y tomar el primero: `SingleAsync()` intenta componer sobre el `MERGE` y falla.
- Prohibido `SELECT MAX(...) + 1` o leer y luego escribir en dos sentencias: dos transacciones concurrentes obtienen el mismo número.
- **Mantener el bloqueo de numeración lo más corto posible**: resolver destinatarios, catálogos y demás lecturas **antes** de tomar el contador; el upsert va al final, justo antes del `commit`.
- Si el negocio no exige números sin huecos, preferir un objeto `SEQUENCE` de la base de datos, que no serializa transacciones.
