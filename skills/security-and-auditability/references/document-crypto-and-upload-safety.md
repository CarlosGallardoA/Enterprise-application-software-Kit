# Criptografía Documental (`AES-256-GCM` con AAD), Rotación e Inspección de Cargas

## 1. Formato de Sobre Cifrado Versionado (con `keyId` y `AAD`)

Nunca escribir evidencia sensible en texto plano en disco ni cifrar sin autenticar el contexto del archivo. El orden de los campos lo decide el proyecto; lo obligatorio es que el sobre contenga:

- **Magic + versión de formato** (p. ej. 4 bytes) para reconocer el sobre y su versión sin adivinar.
- **`keyId`** con longitud explícita, para descifrar con la clave correcta del anillo.
- **Nonce único** por escritura y **tag de autenticación** completo (16 bytes).
- **`AAD` ligado al `storageKey`**, recalculado al leer (no se almacena en el sobre).

Ejemplos válidos: `[Magic "DOC2"][KeyId Len 1B][KeyId][Nonce 12B][Tag 16B][Ciphertext]` o, como en SICRE, `[Magic "SCE2"][KeyId Len 1B][KeyId][Nonce 12B][Ciphertext][Tag 16B]`.

- **Algoritmo**: `AES-256-GCM` con nonce aleatorio criptográfico de 96 bits (12 bytes) generado nuevo en cada escritura.
- **AAD (Additional Authenticated Data)**: construirlo con un prefijo de dominio versionado, el `keyId` y el `storageKey` relativo canónico (p. ej. `<app>.Document.v2|<keyId>|<storageKey>`), normalizando antes los separadores de ruta (`\` a `/`) para que el mismo archivo autentique igual en cualquier SO. Si alguien copia el archivo cifrado `expediente-A/doc1.bin` sobre `expediente-B/doc2.bin` en el disco, la verificación del tag GCM falla aunque conozca o comparta la misma llave maestra.
- **Rechazo de texto plano por defecto**: cualquier archivo sin cabecera criptográfica válida falla al leerse salvo ventana explícita y temporal de migración offline.
- **Retiro de formatos heredados**: un formato anterior sin `AAD` (o sin `keyId`) solo se acepta en lectura con fecha límite documentada y una herramienta de re-encriptación al formato vigente; cumplida la fecha, el lector lo rechaza como a cualquier archivo inválido. Nunca escribir en un formato heredado.
- **Descarga segura en memoria**: GCM exige verificar el tag de integridad completo antes de entregar un solo byte de texto plano al cliente; descifrar *in-place* sobre un único buffer para no duplicar el consumo de RAM por petición.

## 2. Rotación de Claves sin Romper Respaldos

- Configurar un anillo de claves indexado por identificador (`Keys:v1`, `Keys:v2`...) y un puntero `CurrentKeyId = v2` para escrituras nuevas.
- **Jamás sobrescribir ni borrar `v1`** mientras existan archivos históricos o respaldos cifrados con ella, o si de `v1` se derivan claves HMAC históricas.
- Ejecutar la re-encriptación desde la herramienta CLI de mantenimiento con la API detenida: verifica autenticidad con la clave origen, ignora enlaces simbólicos (*symlinks*), impone tope de tamaño por archivo y reemplaza atómicamente mediante archivo temporal en el mismo directorio.

## 3. Inspección y Contención Previa al Almacenamiento

1. **Rutas canónicas contenidas**: construir claves relativas limpias, resolver la ruta completa y comprobar que empiece estrictamente por `rootPath + separador` (rechazando raíz, `..`, barras mixtas y nombres reservados).
2. **Firma de contenido por tipo**: comprobar los bytes iniciales contra la extensión declarada. En HEIC/HEIF no basta encontrar `ftyp` en el offset 4: validar además que la marca mayor (o una compatible) sea de la familia HEIF (`heic`, `heix`, `heim`, `heis`, `mif1`, `msf1`...), porque `ftyp` también encabeza MP4, MOV y otros contenedores ISO BMFF.
3. **Inspección estricta de plantillas PDF**: analizar la estructura interna con límites de tamaño/objetos antes de guardar y rechazar documentos cifrados, con acciones de apertura (`OpenAction`/`AA`), JavaScript, archivos incrustados, formularios dinámicos XFA o referencias externas.
4. **Separación de permisos `ver` vs. `descargar`**: el endpoint exige poseer al menos uno de los dos permisos (OR) y registra en auditoría la intención declarada; en el cliente, la ausencia de `descargar` suprime controles de guardado en el visor en memoria y valida coherencia real del MIME (`application/pdf` o imagen permitida) antes de crear cualquier `Blob URL`.
5. **Puerto antimalware que falla cerrado**: definir en `application` un puerto de análisis (`IMalwareScanner` o equivalente) cuyo resultado es `Clean`, `Rejected` o `ScanError`. Un `Rejected` o un `ScanError` impide compresión, cifrado, persistencia y entrega, y responde con una falla tipada sin revelar la firma detectada. El adaptador real (antivirus del host, ICAP, servicio CDR) se configura por entorno; fuera de Desarrollo, el adaptador simulado que siempre devuelve `Clean` hace fallar el arranque. La validación de firma de contenido (punto 2) y la inspección de PDF (punto 3) son controles de formato: nunca se presentan como veredicto antimalware.

## 4. Control de Capacidad de Cargas

Validar el contenido no basta: una ráfaga de cargas válidas también puede agotar memoria, disco o el expediente.

1. **Tope global de cuerpo + tope por endpoint**: fijar en el servidor (y en el host/proxy que lo atiende) un máximo global pequeño (p. ej. 1 MB) y elevarlo solo en los endpoints de carga con su propio límite explícito (`RequestSizeLimit` o equivalente), dimensionado al máximo real de ese endpoint más el margen del multipart. Repetir el tope global en **cada capa** que recibe la petición, porque cada una aplica el suyo:
   - **IIS in-process (ASP.NET Core)**: `ConfigureKestrel` no aplica; fijar `IISServerOptions.MaxRequestBodySize` además de `KestrelServerOptions.Limits.MaxRequestBodySize`. El `maxAllowedContentLength` de `requestFiltering` en el `web.config` del servidor es el techo exterior y debe ser igual al mayor límite por endpoint, no mayor.
   - **Docker / Linux**: `KestrelServerOptions.Limits.MaxRequestBodySize` en la aplicación y `client_max_body_size` en nginx (o el *middleware* `buffering.maxRequestBodyBytes` en Traefik) igual al mayor límite por endpoint, aplicado solo a las rutas de carga si el proxy lo permite.
2. **Reserva de memoria por carga**: antes de leer el cuerpo, reservar de un presupuesto global del proceso el `Content-Length` declarado (o el tope del endpoint si no viene) multiplicado por el pico real de procesamiento (originales, compresión, copia cifrada). Si no hay cupo dentro de un tiempo corto, responder `503` + `Retry-After` sin recibir el cuerpo; un cuerpo mayor al tope responde `413`. Liberar la reserva al terminar la respuesta.
3. **Capacidad acumulada por expediente serializada**: tomar un bloqueo de aplicación exclusivo ligado a la transacción (`sp_getapplock`, `pg_advisory_xact_lock` o equivalente) sobre la clave del expediente antes de sumar lo ya almacenado y aceptar la carga nueva, para que dos cargas paralelas no superen juntas el tope. Si el bloqueo no se obtiene a tiempo, fallar explícitamente.
4. **Tope por expediente**: además del tope por archivo, imponer un máximo acumulado por registro (p. ej. 250 MB por expediente en SICRE) validado en `application` dentro de esa transacción.
