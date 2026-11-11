# Plantilla de Pipeline CI/CD, Artefactos y Checklist de Servidor

## Compuerta de versiones y vulnerabilidades antes de compilar o publicar

Cumplir [technology-security-policy.md](../../security-and-auditability/references/technology-security-policy.md). Instalar en el proyecto una compuerta obligatoria que cubra runtimes y soporte, dependencias directas/transitivas/de desarrollo, bibliotecas nativas, herramientas de CI, SO e imagen/binario final. Auditar todas las severidades y bloquear también cuando falle una consulta, falte cobertura o quede un aviso pendiente. Verificar que un hallazgo y un fallo de consulta impiden publicar; prohibido `continue-on-error`, `|| true` o excepciones genéricas de CVE.

Conservar el informe fechado en `docs/auditorias/seguridad-tecnologias.md`, con inventario real, avisos oficiales y hashes/digests. Revalidar tras actualizar componentes y antes de publicar; inspeccionar después los procesos realmente activos. `npm audit` y `composer audit` cubren sus paquetes, no sustituyen la revisión del runtime ni de sus bibliotecas integradas.

### Herramientas de CI fijadas e inmutables
- Fijar cada acción/tarea de CI por **SHA completo** cuando la plataforma lo admite (`uses: owner/action@<sha40> # vX.Y.Z`); donde solo se acepta versión, usar la más específica permitida, nunca etiquetas móviles (`@main`, `@latest`) ni solo la mayor si existe una forma más exacta. Fijar también SDK y runtime por versión exacta (`version: '10.0.403'`, no `10.x`) e imágenes por digest.
- Revisar las actualizaciones de esas identidades como cualquier otra dependencia (changelog, avisos, nuevo SHA verificado) y repetir la compuerta tras cambiarlas.

### Escaneo del artefacto final y del sistema operativo
- Además de los manifiestos de paquetes, escanear el **artefacto exacto que se publica** (salida de `publish`, bundle web, imagen) generando su inventario (SBOM `CycloneDX`/`SPDX` o equivalente) y contrastándolo con avisos vigentes: detecta bibliotecas nativas y runtimes empaquetados que `npm audit` o la auditoría de NuGet no ven.
- Escanear el SO o la imagen base de los agentes de build y de los servidores destino (parches del SO, servidor web, runtime de hosting); un servidor no inspeccionado se reporta como `BLOQUEADO`, nunca como parcheado.

## 1. Los 3 Artefactos Inmutables del Build

Un pipeline limpio nunca despliega desde carpetas sucias de compilación intermedia (`bin/` o árbol fuente crudo); publica tres paquetes verificados con destinos separados:

| Artefacto | Contenido verificado antes de publicar | Destino |
| --- | --- | --- |
| `app-api` | Salida completa de `publish` en modo `Release`, manifiestos de runtime, librerías de logging y archivo de configuración del host/proxy (p. ej. `web.config` o equivalente). | Servicio/sitio del Backend API |
| `app-web` | Bundle estático optimizado, archivos `i18n/` y reglas de reescritura de rutas SPA + cabeceras de seguridad/caché. | Servidor estático del Frontend |
| `reviewed-migrations` | `migrations.sql` idempotente, `migrations.manifest.json` (`SHA-256`) y binarios del `DbMigrator`. | Etapa aprobada de migración de base de datos |

### Validación previa de entorno en el build del Frontend
Antes de empaquetar el cliente web para QA/PreProd/Prod, correr un script rápido `check-environment` que falle con `exit 1` si algún campo obligatorio (`apiUrl`, IDs públicos de OIDC) está vacío o conserva valores de `localhost`. Evita publicar silenciosamente un bundle roto.

---

## 2. Política de Caché HTTP y Mismo Origen en el Servidor Web

- **Mismo origen (`/api` o `/apex` bajo el mismo dominio HTTPS)**: elimina fricciones de cookies `SameSite`, simplifica `CSP connect-src` y evita preflights CORS innecesarios. Asegurar que la regla de reescritura SPA (`fallback -> index.html`) **excluya explícitamente el prefijo de la API**; de lo contrario las llamadas REST devolverán HTML `200 OK`.
- **Encabezados `Cache-Control` diferenciados**:
  - `index.html`, rutas profundas de la SPA y diccionarios `i18n/*.json` (sin hash en el nombre): `Cache-Control: no-cache` (revalidación obligatoria para que un deploy nuevo nunca sirva código nuevo con traducciones viejas ni viceversa).
  - Bundles `.js`, `.css` y fuentes con hash de contenido en el nombre: `Cache-Control: public, max-age=31536000, immutable`.

---

## 3. Checklist Post-Despliegue (Backend + Frontend)

### Backend y Servidor Web
- [ ] Runtimes, bibliotecas nativas, servidor y SO efectivamente activos coinciden con las versiones/revisiones o digests verificados; no quedan procesos antiguos tras el reemplazo o reinicio.
- [ ] **HTTP/2 activo** sobre HTTPS/TLS 1.2+ y **compresión estática/dinámica habilitada** (`br`/`gzip`) verificando tamaño transferido real de los bundles JS/CSS. Antes de habilitar descompresión de entradas o respuestas externas, verificar los parches del decodificador integrado (incluido Brotli); servir contenido comprimido no demuestra por sí solo exposición al fallo del decodificador.
- [ ] Variables de entorno configuradas a nivel de host/servidor (sobreviven futuros deploys sin sobrescribirse) y validadas con *Fail-Fast* (`ValidateOnStart`) al iniciar el proceso.
- [ ] Proceso configurado sin suspensión por inactividad (*AlwaysRunning* / *Idle Timeout = 0*) y con **1 único worker** si existen cachés o sesiones en memoria local.
- [ ] Triple aislamiento verificado: carpetas externas persistentes (anillo de claves, documentos cifrados y logs) fuera de la carpeta de publicación, con llave `AES-256-GCM` única por ambiente almacenada y respaldada por separado del repositorio documental.
- [ ] Adaptadores simulados desactivados (`false`) y HTTPS obligatorio activo.
- [ ] `/health/live` y `/health/ready` responden `200` con estado agregado; `/health/details` exige sesión administrativa (`401` anónimo).
- [ ] Se genera el archivo de log estructurado del día con el evento de inicio y trazas por petición.

### Frontend
- [ ] La raíz `/` y cualquier ruta profunda recargada directamente con F5 resuelven la SPA sin `404`.
- [ ] El cliente apunta al prefijo exacto de la API del entorno y los sondeos periódicos (`/heartbeat`) responden `200`.
- [ ] Consola del navegador libre de errores `CSP` / `Trusted Types` durante login, navegación y apertura de documentos PDF/imágenes.
