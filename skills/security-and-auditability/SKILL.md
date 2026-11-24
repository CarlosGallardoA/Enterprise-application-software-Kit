---
name: security-and-auditability
description: "Seguridad: vulnerabilidades, CVE, Node.js, PHP, Brotli y demás tecnologías; soporte, parches, dependencias y cadena de suministro. Autenticación, cookies y sesiones revocables, autorización denegada por defecto, anti-IDOR, contraseñas, rate limiting, proxies de confianza, AES-256-GCM/AAD, CSP, Trusted Types, CSRF/CORS, cabeceras HTTP, integraciones salientes (SSRF) y logs sin PII, en IIS o Docker."
---

# Seguridad Defensiva en Profundidad y Trazabilidad (`security-and-auditability`)

Integra controles de seguridad de nivel institucional desde el diseño de la arquitectura hasta los encabezados HTTP, la criptografía en reposo y los registros operativos, de forma 100 % independiente de lenguaje o framework y de la forma de hospedaje (Windows/IIS o Linux/Docker detrás de un proxy inverso).

## Cuándo activar esta skill

- Al implementar inicio/cierre de sesión, federación SSO, recuperación de credenciales o administración de usuarios/roles.
- Al proteger endpoints, consultas y mutaciones con permisos y alcance organizacional.
- Al manejar carga, validación, visualización o cifrado de archivos y plantillas documentales.
- Al configurar cabeceras HTTP, políticas CORS/CSRF, compresión, proxies inversos o registro de logs y errores del navegador.
- Al integrar un servicio externo por HTTP, correo o API de terceros.
- Antes de elegir, instalar, actualizar o ejecutar cualquier tecnología, o aprobar una entrega con runtimes, dependencias, bibliotecas nativas o imágenes.

## Regla obligatoria de versiones y vulnerabilidades

- Cargar y cumplir [technology-security-policy.md](./references/technology-security-policy.md) antes de seleccionar versiones o declarar un cambio listo: usar ramas con soporte y parches vigentes verificados contra avisos oficiales durante la tarea.
- Bloquear versiones con vulnerabilidades conocidas aplicables de **cualquier severidad**, tecnologías sin soporte y verificaciones incompletas. Actualizar, sustituir o retirar el componente; una mitigación no autoriza conservar una versión afectada salvo excepción controlada con responsable, control compensatorio y vencimiento, registrada en un archivo que la compuerta de CI lee y rechaza si falta responsable o vencimiento, o si ya venció.
- Cubrir runtime, dependencias directas/transitivas/de desarrollo, bibliotecas nativas, CI, SO y artefacto final. Un `npm audit` o `composer audit` limpio no verifica todo el stack.
- Proteger la cadena de suministro: fuentes de paquetes explícitas (`nuget.config` con `<clear/>`, registro único en `.npmrc`), versiones centralizadas, herramientas descargadas en CI fijadas por versión y SHA-256, escaneo de secretos como compuerta y manifiesto SHA-256 de cada artefacto verificado antes de publicar (ver punto 11 de la política).
- Entregar evidencia por versión, entorno, artefacto y fecha con estado `APROBADO` o `BLOQUEADO`; no prometer ausencia de vulnerabilidades desconocidas.

## Implementación Defensiva vs. Auditoría Adversarial (`security-audit`)

- **Esta skill (`security-and-auditability`)** rige **cómo diseñar, codificar y remediar** controles defensivos en la aplicación.
- **Cuando el usuario solicita una auditoría de seguridad, pen test o revisión formal**, es **obligatorio** activar la skill oficial **`security-audit`** de Cloudflare (`cloudflare/security-audit-skill`) coordinada por [`audit-and-skill-orchestration`](../audit-and-skill-orchestration/SKILL.md):
  - En **auditorías completas (`Full audit mode`)**: ejecutar las 6 fases completas, mantener el repositorio en **estricto solo lectura** (sin tocar cambios locales sin commitear), escribir artefactos fuera del repositorio (`~/security-audit-skill/<repo>/run-<N>`), separar `confirmed` / `needs_validation` / `rejected` sin inventar puntajes y no ejecutar código objetivo salvo sandbox de SO verificado.
  - En **revisiones focalizadas o validación de remediaciones (`Guidance mode`)**: combinar el análisis ofensivo de `security-audit` con los 6 controles estructurales de esta skill y pruebas reales que bloqueen regresiones sin debilitar jamás tests existentes.

## Los 6 controles estructurales obligatorios

### 1. Sesiones revocables en servidor y validación de versión en cada petición
- Vincular identidades externas (OIDC/Entra/SAML) siempre por su identificador inmutable (`oid` / `sub`), jamás solo por email. Validar emisor(es), audiencia(s), vigencia y *scope* delegado exacto de cada token del IdP, sin mapeo implícito de claims; una configuración del IdP a medias **falla al arrancar**.
- El token del IdP se canjea **una sola vez** por una sesión de servidor y nunca viaja en cada petición. En el cliente, la caché del SDK de identidad (p. ej. MSAL) vive en `sessionStorage`, jamás en `localStorage`.
- Almacenar las sesiones activas en un almacén revocable del servidor (para que cerrar sesión invalide también una cookie copiada) con vencimiento absoluto acotado: p. ej. 14 días con «Recordarme» y 8 h sin él, además de la inactividad de 30 min. El sello de inicio se valida en cada petición y se rechaza si está en el futuro o vencido.
- **Persistir el almacén de sesiones y el llavero de protección de datos** para que sobrevivan reciclados, reinicios y despliegues: en IIS, base de datos o carpeta fuera del publish con ACL solo para la identidad del App Pool; en Docker, base de datos o volumen montado con permisos del usuario del contenedor, **nunca el sistema de archivos efímero del contenedor**.
- **Rotar la sesión al iniciar sesión** (local o federada): revocar en el servidor la sesión que traiga el navegador y emitir un identificador nuevo (contra fijación de sesión).
- **Cookies de sesión y antiforgery** con prefijo `__Host-`, `Secure` siempre fuera de Desarrollo, `HttpOnly`, `SameSite=Lax` (o `Strict`), `Path=/` explícito y sin `Domain`.
- Verificar en cada petición un **sello/versión de seguridad** calculado sobre usuario activo + hash de credencial + roles + permisos: cualquier revocación o cambio de contraseña invalida la sesión al instante. Si se cachea el sello, TTL ≤ 30 s con invalidación por generación (ver referencia).
- Nunca confiar en los claims guardados dentro de la cookie/JWT como fuente definitiva de permisos: revalidar permisos en servidor contra la base de datos.
- Contraseñas locales de mínimo 12 caracteres, con la política aplicada en el servidor y su incumplimiento devuelto en `details`.

### 2. Autorización denegada por defecto + permisos + alcance organizacional (cero IDOR)
- **Política de autorización por defecto** que exige sesión autenticada en todo endpoint (.NET: `SetFallbackPolicy(new AuthorizationPolicyBuilder().RequireAuthenticatedUser().Build())`; Express/Nest: guard global). El acceso anónimo es excepción explícita (`[AllowAnonymous]` o equivalente), inventariada en la documentación de seguridad y verificada por una prueba que enumera los endpoints anónimos y falla ante uno nuevo no registrado.
- Toda ruta de lectura o escritura valida dos ejes independientes en el servidor:
  1. **Permiso funcional** (`modulo.recurso.accion`), separado en constantes con namespace de puntos. Para áreas críticas (gestión de usuarios/roles), exigir además rol administrativo explícito.
  2. **Alcance de objeto / jerarquía organizacional** (región → sede → expediente): comprobar que el recurso solicitado pertenezca al alcance vigente del actor usando GUIDs no secuenciales.
- **Último administrador activo**: desactivar a un usuario o quitarle el rol administrativo verifica, bajo un bloqueo transaccional exclusivo, que quede otro administrador activo; si no, responde con una falla tipada.
- Proteger contra enumeración de cuentas: ejecutar trabajo criptográfico equivalente para usuarios inexistentes/bloqueados y responder códigos uniformes (`204` o mensaje genérico), dejando el motivo exacto únicamente en la bitácora interna.
- Ver [auth-session-and-idor-controls.md](./references/auth-session-and-idor-controls.md).

### 3. Recuperación de credenciales endurecida
- Hashear códigos de un solo uso con **HMAC-SHA-256** usando clave secreta derivada por propósito, ligada a la identidad del usuario (en la derivación o dentro del mensaje), y comparación en tiempo constante (jamás SHA-256 plano sobre códigos cortos enumerables offline).
- Serializar generación, conteo de intentos (máx. 5) y consumo mediante un **bloqueo transaccional exclusivo por usuario** en la base de datos.
- Proteger el código con cifrado autenticado antes de encolarlo en el Outbox y descartar eventos vencidos sin enviarlos.
- Cualquier endpoint que exponga un código o enlace para pruebas existe solo en Desarrollo, exige además *loopback* y responde `404` en otro caso.

### 4. Seguridad documental: inspección previa + `AES-256-GCM` con AAD
- **Antes de almacenar o abrir transacción**: validar lista blanca estricta de extensiones y MIME derivado por el servidor, cuotas individuales y acumuladas, contención estricta de rutas contra *path traversal*, límites de decodificación de imágenes e inspección estructural de plantillas PDF (rechazando cifrado, acciones automáticas, JavaScript, archivos embebidos, XFA y referencias externas).
- **Análisis antimalware tras un puerto** con estados `Clean`/`Rejected`/`ScanError`: un rechazo o error bloquea compresión, persistencia y entrega (falla cerrado). La validación de firma de contenido nunca se presenta como veredicto antimalware.
- **En reposo**: cifrar cada archivo con `AES-256-GCM`, nonce criptográfico único por archivo, encabezado versionado con `keyId` y **datos autenticados adicionales (`AAD`) ligados a la clave/ruta de almacenamiento** (impidiendo intercambiar archivos cifrados entre expedientes). Fallar en el arranque si falta la llave de cifrado. Un formato heredado sin `AAD` tiene fecha de retiro y herramienta de re-encriptación; después se rechaza.
- **Capacidad**: tope global de cuerpo repetido en cada capa que recibe la petición (servidor de aplicación, IIS in-process o proxy inverso), límite explícito por endpoint de carga, reserva de memoria por carga y capacidad acumulada por expediente serializada con un bloqueo de aplicación.
- Ver [document-crypto-and-upload-safety.md](./references/document-crypto-and-upload-safety.md).

### 5. Endurecimiento Web y HTTP
- **Proxies de confianza**: aceptar `X-Forwarded-For`/`X-Forwarded-Proto` solo de proxies o redes declarados por configuración de cada entorno (IP/CIDR exactos), validados al arrancar (un valor inválido detiene el arranque), con `ForwardLimit` acotado y como **primer middleware**. En IIS, declarar el balanceador o proxy institucional que conecta directo al servidor; en Docker, la IP o red del proxy inverso (nginx, Traefik) en la red de contenedores. Sin esto, el *rate limiting* por IP colapsa en una sola partición. Comprobar la IP real del cliente en el log tras desplegar.
- **API**: CORS base vacío con orígenes HTTPS explícitos por entorno; cada origen es exactamente esquema + host + puerto (rechazando ruta, *query*, *fragment*, *userinfo*, HTTP y `localhost` fuera de desarrollo) y métodos, encabezados y *exposed headers* en lista blanca explícita, sin comodines. Rechazo en el arranque de adaptadores simulados (*fakes*) fuera de desarrollo, protección CSRF/antiforgery en todas las mutaciones con cookie, límites de tasa (*rate limiting*) por usuario autenticado o IP real con cuotas por operación costosa (ver referencia de autenticación), `HSTS` (365 días), `COOP`/`CORP` y `Permissions-Policy`.
- **Cabeceras de toda respuesta de la API**: `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, CSP propia (`default-src 'self'; frame-ancestors 'none'; base-uri 'self'`) y `Cache-Control: no-store` por defecto, para que ningún dato de sesión quede en caché del navegador, proxies ni *back/forward cache*. Solo catálogos de referencia autenticados pueden declarar `private, max-age=600`; nunca datos vivos.
- **Compresión sin BREACH**: excluir de la compresión dinámica toda respuesta cuyo cuerpo lleve un token o secreto (p. ej. el endpoint del token antifalsificación) y toda descarga con `Content-Disposition`, con una prueba que verifique la ausencia de `Content-Encoding` en esas respuestas.
- **Superficie de desarrollo**: Swagger/OpenAPI y cualquier endpoint de diagnóstico o de pruebas solo se registran en Desarrollo (no basta con ocultarlos); los de depuración exigen además *loopback* y responden `404` en otro caso.
- **Endurecimiento del host**: quitar `Server` y `X-Powered-By`, acotar el *timeout* de encabezados (p. ej. 15 s), el largo de URL (p. ej. 4096) y de *query string* (p. ej. 2048). En IIS: `removeServerHeader`, `requestFiltering` en `web.config` del servidor. En Docker: `server_tokens off`, `client_header_timeout` y `large_client_header_buffers` en nginx (o equivalentes en Traefik), y `AddServerHeader = false` en Kestrel.
- **Integraciones salientes**: endpoints HTTPS fijos validados al arrancar, *timeout*, tope de respuesta y redirecciones desactivadas; ver [outbound-integrations.md](./references/outbound-integrations.md).
- **Llavero de protección de datos** (cookies, antiforgery, payloads protegidos): persistir el anillo de claves en una ubicación durable y compartida por las instancias, protegido en reposo (DPAPI de máquina o certificado X.509 en IIS; certificado X.509 o KMS en Docker, ya que DPAPI no existe en Linux), y **fallar al arrancar fuera de Desarrollo** si falta la ubicación o su protección; un anillo efímero en memoria o en el sistema de archivos del contenedor invalida todas las sesiones y los secretos protegidos en cada reciclado o recreación.
- **Secretos e identidades de servicio**: las integraciones de servicio usan identidad administrada o certificado; un *client secret* solo se admite como transición con fecha de retiro documentada. La conexión a la base de datos usa cifrado con validación de certificado (prohibido `TrustServerCertificate=true` fuera de local) y los respaldos se cifran.
- **Cliente Web (SPA)**: `Content-Security-Policy` sin scripts inline + `Trusted Types` con `require-trusted-types-for 'script'` y **lista explícita de nombres de política permitidos** propia del proyecto (p. ej. en SICRE `trusted-types angular angular#bundler angular#unsafe-bypass`; nunca `'allow-duplicates'` ni comodines sin justificar). La CSP incluye además `object-src 'none'`, `base-uri 'self'`, `form-action 'self'` y `connect-src` limitado a la API y al IdP. `style-src 'unsafe-inline'` solo se admite como excepción documentada y justificada (p. ej. estilos inline que el framework inyecta en tiempo de ejecución), con su motivo y revisión en la documentación de seguridad; jamás extenderla a `script-src`. `X-Frame-Options: DENY` / `frame-ancestors 'none'`, desactivación de `inlineCritical` que inyecte manejadores inline, validación estricta de `returnUrl` (rechazando `//`, `\`, esquemas y controles) y visor documental que jamás construye URLs confiables sobre HTML disfrazado.
- **Sanitización del cliente**: una regla de lint en error prohíbe las APIs que desactivan la sanitización del framework (Angular `bypassSecurityTrust*`, React `dangerouslySetInnerHTML`, Vue `v-html`); cada excepción lleva justificación local. Resaltar coincidencias de búsqueda por segmentos de texto, nunca interpolando HTML.
- **Credenciales solo al origen de la API**: un interceptor central adjunta cookies (`withCredentials`) o encabezados de credenciales solo a peticiones cuyo origen coincide exactamente con el de la API.

### 6. Separación entre Bitácora de Negocio y Logs Estructurados libres de PII
- **Bitácora de negocio**: persistida en base de datos dentro de la misma transacción del cambio (`quién`, `qué`, `antes/después`, `cuándo`). Los campos clasificados como sensibles (salud, identidad, notas clínicas, secretos) registran **que** cambiaron con valor `[REDACTED]`, nunca su contenido; mantener la lista de campos redactados en un único lugar con una prueba que la verifique.
- **Logs operativos**: líneas JSON estructuradas (p. ej. CLEF) con correlación W3C (`traceId`/`spanId`), compilados sin interpolación costosa y **con prohibición absoluta de registrar contraseñas, códigos OTP, tokens, cookies, llaves, cuerpos HTTP, `payloadJson` de Outbox o query strings**. Para identificar a un actor basta su `userId`.
- Ver [structured-logging-and-pii-redaction.md](./references/structured-logging-and-pii-redaction.md).

## Checklist de verificación de seguridad

- [ ] La política de tecnologías está verificada en todo el alcance: inventario real, soporte vigente, avisos oficiales consultados y cero vulnerabilidades conocidas aplicables pendientes, de cualquier severidad; incertidumbre implica `BLOQUEADO`.
- [ ] Las excepciones de vulnerabilidad viven en un archivo que la compuerta de CI valida (responsable, vencimiento); las herramientas descargadas en CI están fijadas por versión y SHA-256.
- [ ] Todo endpoint exige sesión salvo los anónimos inventariados; una prueba falla ante un anónimo nuevo.
- [ ] Cerrar sesión revoca el ticket en el servidor (una copia previa de la cookie deja de funcionar de inmediato) e iniciar sesión con una cookie previa copiada emite un identificador nuevo.
- [ ] Las cookies de sesión y antiforgery usan `__Host-`, `Secure`, `HttpOnly`, `SameSite` y `Path=/`.
- [ ] Revocar un permiso o desactivar al usuario bloquea la siguiente petición sin esperar al vencimiento de la cookie; no se puede desactivar al último administrador activo.
- [ ] Las sesiones y el llavero sobreviven un reciclado del App Pool o la recreación del contenedor.
- [ ] El servidor falla explícitamente al arrancar fuera de Desarrollo si algún adaptador simulado sigue activo, falta la clave documental, el llavero de protección de datos no está persistido y protegido, la configuración del IdP está incompleta o los proxies de confianza son inválidos.
- [ ] Fuera de Desarrollo no responde Swagger/OpenAPI ni ningún endpoint de depuración.
- [ ] Toda respuesta de la API trae `nosniff`, `Referrer-Policy`, CSP y `Cache-Control: no-store` (salvo catálogos declarados); el token antifalsificación y las descargas salen sin `Content-Encoding`.
- [ ] El log muestra la IP real del cliente detrás del proxy (IIS o Docker).
- [ ] Ningún log ni columna `lastError` persiste payloads, correos completos innecesarios, secretos ni mensajes crudos de excepción con PII; la bitácora muestra `[REDACTED]` en los campos sensibles.
- [ ] La suite E2E de seguridad pasa con `CSP` + `Trusted Types` activos y rechaza redirecciones abiertas en login; el lint rechaza `bypassSecurityTrust*` / `dangerouslySetInnerHTML` / `v-html`.
