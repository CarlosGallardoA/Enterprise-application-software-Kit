# Plantilla de Pipeline CI/CD, Artefactos y Checklist de Servidor

Cada sección declara su variante para los dos perfiles de hospedaje del kit: **Windows + IIS** y **Linux + Docker** (ver la tabla de perfiles en [SKILL.md](../SKILL.md)).

## Compuerta de versiones y vulnerabilidades antes de compilar o publicar

Cumplir [technology-security-policy.md](../../security-and-auditability/references/technology-security-policy.md). Instalar en el proyecto una compuerta obligatoria que cubra runtimes y soporte, dependencias directas/transitivas/de desarrollo, bibliotecas nativas, herramientas de CI, SO e imagen/binario final. Auditar todas las severidades y bloquear también cuando falle una consulta, falte cobertura o quede un aviso pendiente. Verificar que un hallazgo y un fallo de consulta impiden publicar; prohibido `continue-on-error`, `|| true` o excepciones genéricas de CVE.

Conservar el informe fechado en `docs/auditorias/seguridad-tecnologias.md`, con inventario real, avisos oficiales y hashes/digests. Revalidar tras actualizar componentes y antes de publicar; inspeccionar después los procesos realmente activos. `npm audit` y `composer audit` cubren sus paquetes, no sustituyen la revisión del runtime ni de sus bibliotecas integradas.

### Excepciones legibles por la compuerta
- Toda excepción temporal de vulnerabilidad vive en un archivo versionado que la compuerta lee (p. ej. `tools/quality/dependency-exceptions.json`) con identificador del aviso, paquete, motivo, `owner` y `expiresOn`. La compuerta falla si falta responsable o vencimiento, o si la fecha ya pasó. El Markdown de auditoría solo conserva la evidencia; nunca es la fuente que decide.

### Herramientas de CI fijadas e inmutables
- Fijar cada acción/tarea de CI por **SHA completo** cuando la plataforma lo admite (`uses: owner/action@<sha40> # vX.Y.Z`); donde solo se acepta versión, usar la más específica permitida, nunca etiquetas móviles (`@main`, `@latest`) ni solo la mayor si existe una forma más exacta. Fijar imágenes base y de agentes por digest.
- **SDK .NET** por `global.json` con versión base, `rollForward: latestPatch` y `allowPrerelease: false`: admite parches de seguridad sin cambiar de banda de características; la compuerta registra la versión efectiva usada. **Node** por `.node-version`/`.nvmrc` con versión exacta y verificación en `preinstall`.
- **Herramientas descargadas en CI** (escáner de secretos, generador de SBOM, CLI de terceros): fijar la versión, contrastar el `SHA-256` del binario descargado contra el valor publicado en el release oficial, descargar sin seguir redirecciones no verificadas y fallar si el hash difiere.
- **Fuentes de paquetes cerradas**: `nuget.config` con `<clear/>` y fuentes explícitas (o *package source mapping*), versiones centralizadas en `Directory.Packages.props`, *lockfiles* versionados y `npm ci` (nunca `npm install`) en CI. Ver [build-and-toolchain-baseline.md](../../enterprise-app-blueprint/references/build-and-toolchain-baseline.md).
- Revisar las actualizaciones de esas identidades como cualquier otra dependencia (changelog, avisos, nuevo SHA verificado) y repetir la compuerta tras cambiarlas.

### Escaneo del artefacto final y del sistema operativo
- Además de los manifiestos de paquetes, escanear el **artefacto exacto que se publica** (salida de `publish`, bundle web, imagen) generando su inventario (SBOM `CycloneDX`/`SPDX` o equivalente) y contrastándolo con avisos vigentes: detecta bibliotecas nativas y runtimes empaquetados que `npm audit` o la auditoría de NuGet no ven.
- Escanear el SO o la imagen base de los agentes de build y de los servidores destino (parches del SO, servidor web, runtime de hosting); un servidor no inspeccionado se reporta como `BLOQUEADO`, nunca como parcheado.

### Número de build visible
- El pipeline usa un número de build legible y único (p. ej. `$(Date:yyyyMMdd)$(Rev:.r)`), lo estampa en el bundle del cliente y en la versión informativa de la API, y la UI lo muestra (login y barra lateral). Soporte identifica así qué build corre sin acceder al servidor.

## 1. Los 3 Artefactos Inmutables del Build

Un pipeline limpio nunca despliega desde carpetas sucias de compilación intermedia (`bin/` o árbol fuente crudo); publica tres paquetes verificados con destinos separados:

| Artefacto | Contenido verificado antes de publicar | Destino |
| --- | --- | --- |
| `app-api` | Salida completa de `publish` en modo `Release` y manifiestos de runtime. **Sin configuración por ambiente ni secretos.** IIS: sin `appsettings*.json` ni `web.config`. Docker: imagen multi-etapa que solo admite un `appsettings.json` base sin secretos ni valores de ambiente. | Sitio IIS o registro de imágenes (por digest) |
| `app-web` | Bundle estático optimizado con hash de contenido en JS, CSS y chunks de traducción (`import()` dinámico), reglas de reescritura SPA y cabeceras de seguridad/caché. | Sitio estático IIS o contenedor nginx |
| `reviewed-migrations` | Artefacto de **revisión**, no de despliegue: `migrations.sql` idempotente, `migrations.manifest.json` (`SHA-256` del SQL y de los binarios) y binarios del `DbMigrator`. | Revisión del DBA y etapa aprobada de migración |

### Verificación de configuración ausente
- El pipeline elimina del artefacto de la API los archivos de configuración del host (IIS: `appsettings*.json`, `web.config`) y luego **vuelve a listar** el artefacto y falla si queda alguno.
- El script de publicación rechaza `*.local.json`, `secrets.json`, `.env` y cualquier `appsettings` con valor en claves de secreto (`ConnectionStrings`, `*Password*`, `*Secret*`, `*Key*`). En Docker, el `.dockerignore` excluye esos archivos y el escaneo de la imagen confirma que no están en ninguna capa.

### Manifiesto de integridad por artefacto
- Generar un manifiesto `SHA-256` de cada artefacto y publicarlo como evidencia separada (p. ej. `quality-evidence`), fuera del paquete que describe.
- El script de verificación recalcula los hashes del paquete y falla ante cualquier archivo faltante, sobrante o modificado.

### Validación previa de entorno en el build del Frontend
Antes de empaquetar el cliente web para QA/PreProd/Prod, correr un script rápido `check-environment` que falle con `exit 1` si algún campo obligatorio (`apiUrl`, IDs públicos de OIDC) está vacío o conserva valores de `localhost`. Evita publicar silenciosamente un bundle roto.

### Pasos del release

| Paso | Windows + IIS | Linux + Docker |
| --- | --- | --- |
| 1. Obtener | Descargar `app-api` y `quality-evidence` **de la misma ejecución** del pipeline. | Resolver la imagen por **digest** de la misma ejecución, nunca por etiqueta móvil. |
| 2. Verificar | Reverificar el paquete contra el manifiesto de referencia (`-ReferenceManifestPath` o equivalente). | Comparar el digest con el registrado en `quality-evidence`; verificar firma si se firma la imagen. |
| 3. Migrar | `--dry-run`, respaldo con restauración comprobada y migrador (ver [safe-db-migrator-protocol.md](./safe-db-migrator-protocol.md)). | Igual, ejecutando el migrador como contenedor efímero con la cadena `migrator` inyectada solo durante la ejecución. |
| 4. Detener | Detener el **App Pool** (no solo el sitio: `w3wp` retiene las DLL). | `docker compose up -d` reemplaza el contenedor; el `stop_grace_period` permite terminar peticiones y workers. |
| 5. Copiar/levantar | Copiar con exclusiones (`-skip` de `appsettings.*` y `web.config`): **nunca** sobrescribir la configuración del servidor. | `env_file` o *secrets* fuera del repositorio y de la imagen; volúmenes nombrados para llaves y documentos. |
| 6. Confirmar | Iniciar el App Pool y comprobar `/health/ready`. | Esperar `healthy` en el `healthcheck` antes de retirar la versión anterior. |

---

## 2. Política de Caché HTTP y Mismo Origen en el Servidor Web

- **Mismo origen (`/api` o `/apex` bajo el mismo dominio HTTPS)**: elimina fricciones de cookies `SameSite`, simplifica `CSP connect-src` y evita preflights CORS innecesarios. Asegurar que la regla de reescritura SPA (`fallback -> index.html`) **excluya explícitamente el prefijo de la API**; de lo contrario las llamadas REST devolverán HTML `200 OK`.
  - IIS: la API es una aplicación hija del sitio de la SPA y **hereda su `web.config`**. Las reglas *outbound* de caché de la SPA excluyen el prefijo de la API y filtran sobre `{URL}` (ruta sin *query string*), nunca sobre `{REQUEST_URI}`.
  - nginx: `location /api/ { proxy_pass ...; }` separado del `location / { try_files $uri $uri/ /index.html; }`; las cabeceras de caché de la SPA (`add_header Cache-Control ...`) solo se declaran en los `location` estáticos.
- **Encabezados `Cache-Control` diferenciados**:
  - `index.html` y rutas profundas de la SPA: `Cache-Control: no-cache` (revalidación obligatoria para que un deploy nuevo nunca sirva código viejo).
  - Bundles `.js`, `.css`, fuentes y **chunks de traducción** con hash de contenido en el nombre: `Cache-Control: public, max-age=31536000, immutable`. Importar las traducciones con `import()` dinámico para que el bundler les asigne hash; solo si un proyecto heredado aún sirve `i18n/*.json` sin hash, esos archivos van con `no-cache`.
  - **API**: `Cache-Control: no-store` por defecto en toda respuesta. Solo los catálogos de referencia autenticados pueden declarar `private, max-age=600`; nunca los datos vivos ni las respuestas con datos de sesión.

---

## 3. Endurecimiento del Host

| Control | Windows + IIS | Linux + Docker |
| --- | --- | --- |
| Ocultar identidad del servidor | `removeServerHeader="true"` en `requestFiltering`; quitar `X-Powered-By` en `customHeaders`; Kestrel `AddServerHeader = false`. | nginx `server_tokens off;`, `proxy_hide_header X-Powered-By;`; Kestrel `AddServerHeader = false`. |
| Límites de cabeceras y URL | `requestLimits maxUrl="4096" maxQueryString="2048"`; Kestrel `RequestHeadersTimeout = 15s`. | `large_client_header_buffers`, `client_header_timeout 15s`; Kestrel `RequestHeadersTimeout = 15s`. |
| Tamaño de cuerpo | `maxAllowedContentLength` igual al mayor límite por endpoint + tope global también en `IISServerOptions` (in-process). | `client_max_body_size` igual al mayor límite por endpoint + tope global en Kestrel. |
| Compresión | Estática para assets del sitio SPA; **dinámica desactivada** (`doDynamicCompression="false"`) para la API, que comprime JSON en la propia aplicación. | `gzip`/`brotli` en los `location` estáticos; **sin** compresión del proxy en `/api/`, que ya llega comprimida desde la aplicación. |
| Proxies conocidos | Declarar por ambiente la IP/CIDR exacta del balanceador que conecta directo al servidor (`KnownProxies`/`KnownNetworks`, `ForwardLimit = 1`). | Declarar la red del contenedor del *reverse proxy* como `KnownNetworks`; el proxy fija `X-Forwarded-For`/`X-Forwarded-Proto`. |
| Disponibilidad | `Preload Enabled = True`, `Start Mode = AlwaysRunning`, `Idle Timeout = 0`, `Regular Time Interval = 0` o reciclado a hora fija de madrugada. | `restart: unless-stopped`, `healthcheck` contra `/health/ready`, `stop_grace_period` suficiente para los workers. |
| Usuario del proceso | Identidad dedicada del App Pool con ACL mínimas. | Usuario no root en la imagen; sistema de archivos de solo lectura salvo volúmenes declarados. |

---

## 4. Checklist Post-Despliegue (Backend + Frontend)

### Backend y Servidor Web
- [ ] Runtimes, bibliotecas nativas, servidor y SO efectivamente activos coinciden con las versiones/revisiones o digests verificados; no quedan procesos ni contenedores antiguos tras el reemplazo o reinicio.
- [ ] **HTTP/2 activo** sobre HTTPS/TLS 1.2+ y compresión verificada con el tamaño transferido real: assets estáticos comprimidos por el servidor; `GET` a un endpoint JSON con `Accept-Encoding: br` responde `Content-Encoding: br` generado por la aplicación; la respuesta del token antifalsificación y las descargas con `Content-Disposition` salen **sin** `Content-Encoding` (mitigación BREACH). Antes de habilitar descompresión de entradas o respuestas externas, verificar los parches del decodificador integrado (incluido Brotli).
- [ ] Configuración por ambiente presente en el host (IIS: `appsettings.{Ambiente}.json`/variables del App Pool; Docker: `env_file`/*secrets*), intacta tras el deploy y validada con *Fail-Fast* (`ValidateOnStart`) al iniciar el proceso.
- [ ] Proceso sin suspensión por inactividad, con calentamiento ejecutado (log de arranque sin `Warning` del *warm-up*) y tickets de sesión + anillo de llaves persistidos en almacén compartido; solo si siguen en memoria local, **1 único worker/réplica**.
- [ ] Triple aislamiento verificado: carpetas externas o volúmenes persistentes (anillo de claves, documentos cifrados y logs) fuera de la carpeta de publicación o imagen, con llave `AES-256-GCM` única por ambiente almacenada y respaldada por separado del repositorio documental.
- [ ] Conexión a la base de datos cifrada con validación de certificado (`Encrypt=True`; `TrustServerCertificate=true` prohibido fuera de desarrollo local) y respaldos cifrados en reposo con restauración comprobada.
- [ ] Integraciones de servicio autenticadas con identidad administrada o certificado; cualquier *client secret* heredado tiene fecha de retiro registrada.
- [ ] El log muestra la IP real del cliente (`ClientIp`) y no la del proxy.
- [ ] Adaptadores simulados desactivados (`false`), Swagger/OpenAPI no registrado y HTTPS obligatorio activo.
- [ ] Cabeceras `Server` y `X-Powered-By` ausentes.
- [ ] `/health/live` y `/health/ready` responden `200` con estado agregado; `/health/details` exige sesión administrativa (`401` anónimo).
- [ ] Se genera el log estructurado del día con el evento de inicio y trazas por petición.

### Frontend
- [ ] La raíz `/` y cualquier ruta profunda recargada directamente con F5 resuelven la SPA sin `404`.
- [ ] El cliente apunta al prefijo exacto de la API del entorno y los sondeos periódicos (`/heartbeat`) responden `200` con `Cache-Control: no-store`.
- [ ] El número de build visible en la UI coincide con el de la ejecución desplegada.
- [ ] Consola del navegador libre de errores `CSP` / `Trusted Types` durante login, navegación y apertura de documentos PDF/imágenes.

### Runbook de diagnóstico
- [ ] `docs/operacion/` incluye un script de solo lectura para diagnosticar sesiones bloqueadas y bloqueos largos en la base de datos (requiere solo `VIEW SERVER STATE` o el permiso equivalente del motor), con instrucciones para interpretarlo sin matar sesiones a ciegas.
