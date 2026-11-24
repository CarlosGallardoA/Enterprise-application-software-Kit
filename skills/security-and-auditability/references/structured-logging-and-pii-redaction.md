# Logs Estructurados, Correlación `traceId` y Redacción de PII

## 1. Qué se registra y dónde

Distinguir siempre dos canales con propósitos distintos:
1. **Auditoría de negocio (en base de datos)**: quién creó, editó, consultó evidencia sensible o cambió estatus de un expediente. Participa en la transacción SQL.
2. **Log operativo estructurado (archivos JSON por línea / CLEF)**:
   - Cada petición HTTP: método, ruta **sin query string**, código de estado, duración en ms, `RequestId`, IP cliente y `UserId` autenticado. Sondeos frecuentes (`/health/*`, `/heartbeat`, colas) se registran en nivel `Debug` para no saturar disco.
   - Excepciones no controladas (`500`): registran el evento `Error` con el mismo `RequestId` que el usuario recibe como `traceId`.
   - Eventos de seguridad en controladores de acceso: inicios/cierres de sesión e intentos fallidos (las trazas operativas de negocio viven en casos de uso o infraestructura, no en controladores).
   - Procesamiento de Outbox y jobs de fondo: IDs de mensaje, tipo, intento, duración y resultado. Cuando falla:
     - En consola/stdout, herramientas CLI, columnas persistidas como `lastError` y todo lo que se devuelve a un cliente, **únicamente el nombre del tipo de excepción** o un código estable.
     - En el log estructurado del servidor, con acceso restringido, se admite la excepción completa con stack para diagnosticar jobs de fondo, siempre que los mensajes de excepción propios no se construyan con PII, secretos ni payloads y que la redacción del sink se aplique igual a esas propiedades.
   - Destino según hospedaje:
     - **IIS / Windows**: archivos con rotación diaria + tope de tamaño por archivo (ej. 100 MB), retención acotada (ej. 31 archivos) y apertura en modo compartido (`shared`) para no perder líneas durante reciclados solapados del App Pool, en una carpeta fuera del publish con ACL solo para la identidad del App Pool.
     - **Docker / Linux**: JSON por línea a `stdout`; la rotación y retención las aplica el *logging driver* del motor (`max-size`, `max-file`) o el colector de la plataforma. No escribir archivos de log dentro del sistema de archivos efímero del contenedor; si se exigen archivos, usar un volumen montado.

### Configuración del proveedor de logging

1. **Logger de arranque**: crear un logger mínimo a consola antes de construir el host, para que una falla de configuración, de inyección de dependencias o de validación de opciones al arrancar quede registrada con nivel `Fatal` y se cierre con `flush` (.NET/Serilog: `Log.Logger = new LoggerConfiguration().WriteTo.Console().CreateBootstrapLogger()`, `try { … } catch (Exception ex) { Log.Fatal(ex, …); } finally { Log.CloseAndFlush(); }`). En IIS, el módulo ANCM lleva la consola al Visor de eventos; en Docker, la consola es el log del contenedor.
2. **Enriquecimiento**: cada línea lleva aplicación, entorno y máquina/contenedor (`Application`, `Environment`, `MachineName`) además de `traceId`/`spanId`.
3. **Niveles por categoría**: subir a `Warning` las categorías ruidosas del framework, del ORM y del cliente HTTP (p. ej. `Microsoft.AspNetCore`, `Microsoft.EntityFrameworkCore`, `System.Net.Http.HttpClient`) para que el nivel `Information` quede para eventos de la aplicación.
4. **Desacoplamiento**: el código de `application` e `infrastructure` depende solo de la abstracción de logging del lenguaje (`ILogger<T>` en .NET). El proveedor concreto (Serilog, NLog, pino) se configura únicamente en la raíz de composición. Los mensajes son plantillas tipadas generadas en compilación (.NET: `[LoggerMessage]`), nunca cadenas interpoladas.
5. **Controladores**: solo registran eventos de seguridad (inicio/cierre de sesión, intentos fallidos, rechazos de autorización relevantes); las trazas de negocio viven en casos de uso o infraestructura.

## 2. Lista negra absoluta (lo que NUNCA entra a un log)

- Contraseñas, hashes o secretos de cliente.
- Códigos de recuperación o verificación de un solo uso.
- Tokens de acceso/refresco, encabezados `Authorization`, cookies o claves criptográficas.
- Cuerpos crudos de `request` o `response` y cadenas de consulta (`query strings`).
- `payloadJson` completo de mensajes Outbox ni contenido clínico, personal o documental.
- URLs de integraciones salientes con su query string o con datos del usuario en la ruta; registrar solo el nombre lógico de la integración, el método, el código de estado y la duración.

## 2.1 Redacción en la bitácora de negocio

La bitácora de negocio guarda el antes/después de cada cambio, pero no debe convertirse en una segunda copia de datos sensibles:

- Clasificar los campos sensibles (salud, notas clínicas, identidad, datos de menores, secretos, hashes de credencial) en una lista única mantenida en `infrastructure` junto al generador del diff de auditoría.
- Para esos campos, la bitácora registra que el campo cambió y escribe `[REDACTED]` en lugar del valor anterior y del nuevo.
- Una prueba recorre la lista y verifica que cada propiedad existe en el modelo y sale redactada; agregar una columna sensible nueva sin incluirla en la lista es un defecto de revisión.

## 3. Ingesta segura de errores no controlados del navegador

Para diagnosticar fallos reales del cliente sin herramientas invasivas de terceros:
1. El manejador global de errores del frontend envía `POST /api/v1/diagnostics/client-errors` con mensaje, stack recortado, ruta **sin query ni hash**, versión de compilación y `traceId` del `500` asociado si existe.
2. **Protecciones en cliente**: ignorar caídas de red, deduplicar el mismo error en la misma ruta y fijar un tope estricto (p. ej. máx. 10 reportes por carga de página).
3. **Protecciones en servidor**: endpoint anónimo que acepta solo JSON con tamaño acotado, *rate limit* estricto por IP (p. ej. 30/min), truncado de cada campo y **redacción previa** con expresiones regulares seguras sin backtracking (`NonBacktracking` + timeout) que reemplazan query strings, correos electrónicos, secuencias numéricas largas y tokens reconocibles antes de escribir en el log estructurado.
