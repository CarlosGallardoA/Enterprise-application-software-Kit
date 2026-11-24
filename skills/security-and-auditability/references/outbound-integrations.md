# Integraciones Salientes: Clientes HTTP Endurecidos, SSRF e Identidad de Servicio

Toda llamada desde el servidor hacia otro sistema (directorios institucionales, APIs de terceros, correo, almacenamiento, IdP) es una superficie de ataque y un punto de degradación. Un cliente mal configurado permite SSRF, filtra credenciales en redirecciones, se queda colgado sin *timeout* o carga respuestas sin límite en memoria.

## 1. Endpoint fijo validado al arrancar

1. La URL base de cada integración viene de configuración por entorno y se valida con el patrón de opciones al arrancar (.NET: `AddOptions<T>().Validate(...).ValidateOnStart()`): absoluta, esquema `https`, sin *userinfo* (`usuario:clave@`), sin *query* ni *fragment*. Una URL inválida detiene el arranque fuera de Desarrollo.
2. El host de destino **nunca** proviene de datos del usuario. Si el caso de uso necesita varios destinos, se elige de una lista cerrada de configuración por un identificador lógico, nunca por URL recibida.
3. Los datos del usuario solo entran en la URL como segmento de ruta o parámetro **escapado** (`Uri.EscapeDataString`, `encodeURIComponent`) y **previamente validado por formato** en `application` (p. ej. un identificador numérico de longitud fija). Nunca concatenar texto libre.

## 2. Cliente HTTP con límites explícitos

Registrar cada integración con la fábrica de clientes del framework (.NET: `IHttpClientFactory` con cliente tipado; Node: una instancia de cliente por integración), nunca `new HttpClient()` por petición.

- **Timeout explícito** por integración (p. ej. 10 s), menor que el *timeout* de la petición entrante que lo origina, y propagación del `CancellationToken` / `AbortSignal` de esa petición.
- **Tope de respuesta**: limitar los bytes que se aceptan (.NET: `MaxResponseContentBufferSize = 1_048_576`; en *streaming*, contar bytes y abortar al superar el tope).
- **Redirecciones desactivadas** (`AllowAutoRedirect = false` en `HttpClientHandler`/`SocketsHttpHandler`; `redirect: 'manual'` en `fetch`). Una redirección se trata como error de integración: seguirla permitiría saltar a un host interno o reenviar credenciales a otro origen.
- **Sin desactivar TLS**: prohibido aceptar certificados inválidos (`ServerCertificateCustomValidationCallback` que devuelve `true`, `rejectUnauthorized: false`) fuera de pruebas locales explícitas.
- **Errores tipados**: un *timeout*, un código no exitoso o una respuesta que excede el tope se traducen en una falla tipada de integración en `application` (p. ej. `ExternalServiceUnavailable`), con el `reason` estable en el contrato de error, nunca en el mensaje crudo del servidor remoto.
- **Cuota propia**: las operaciones que disparan consultas externas tienen su propia cuota de *rate limiting* (ver referencia de autenticación, sección 4), para que un usuario no convierta la API en un amplificador contra el tercero.

## 3. Identidad de servicio y secretos

1. **Orden de preferencia de credenciales**: identidad administrada de la plataforma (Azure Managed Identity, IAM role) → certificado con clave privada en el almacén del host → *client secret*. El *client secret* solo se admite como transición, con fecha de retiro documentada en la guía de despliegue.
2. **Ubicación del certificado o secreto según hospedaje**:
   - **IIS / Windows**: certificado en el almacén de la máquina o del usuario del App Pool (activar *Load User Profile* si se usa `CurrentUser/My`), con permisos de lectura de la clave privada solo para esa identidad.
   - **Docker / Linux**: certificado o secreto montado como *Docker secret* o volumen de solo lectura, o inyectado por el gestor de secretos de la plataforma; nunca copiado en la imagen ni pasado en argumentos de línea de comandos.
3. **Permisos mínimos en el tercero**: restringir el permiso de aplicación al recurso concreto (p. ej. envío de correo solo desde el buzón institucional mediante RBAC de la aplicación) y verificar que no queden permisos globales que amplíen el alcance. Probar un acceso permitido y uno denegado.

## 4. Correo saliente

- Validar los correos de destinatario contra un formato estricto y rechazar `CR`/`LF` y separadores múltiples, para impedir inyección de encabezados.
- El contenido HTML del correo se construye con plantillas que codifican los valores del usuario; nunca concatenar HTML con datos de entrada.
- Los envíos pasan por el Outbox transaccional (ver `transactional-outbox-and-polling`), nunca dentro de la petición HTTP.

## 5. Observabilidad sin fuga de datos

- Registrar el nombre lógico de la integración, método, código de estado, duración y `traceId`; nunca la URL completa con *query*, encabezados de autorización ni el cuerpo de la respuesta.
- Un fallo de integración en un health check de *readiness* solo se incluye si la aplicación no puede operar sin ese tercero; en caso contrario, se reporta como degradación sin sacar la instancia del balanceador.

## 6. Pruebas obligatorias

- Prueba de configuración: URL HTTP, con *userinfo* o relativa hace fallar el arranque.
- Prueba del adaptador con un servidor HTTP falso: *timeout*, respuesta mayor al tope y `302` producen la falla tipada esperada.
- Prueba de invariantes: un identificador con caracteres fuera de formato se rechaza antes de llegar al adaptador.
