# Anatomía de un Vertical Slice en Backend

## Capas como proyectos compilados (el compilador hace cumplir la dirección)

Cada capa es un **proyecto o paquete propio** (`<App>.Domain`, `<App>.Application`, `<App>.Infrastructure`, `<App>.Api`; en JVM módulos Gradle/Maven, en Node paquetes de workspace, en Python paquetes con import-linter). Una carpeta no basta: el compilador debe impedir la dependencia prohibida antes que cualquier linter.

Grafo de referencias acíclico obligatorio:

| Proyecto | Puede referenciar | Paquetes externos admitidos |
| --- | --- | --- |
| `Domain` | Nada | Ninguno (solo la librería base del lenguaje). |
| `Application` | `Domain` | Abstracciones puras (`Microsoft.Extensions.Logging.Abstractions`, `TimeProvider`); nunca ORM, ASP.NET Core ni clientes HTTP. |
| `Infrastructure` | `Domain`, `Application` | ORM, SDKs, clientes HTTP, cifrado. |
| `Api` (host) | Todos | Framework web; compone todo en su raíz de composición. |
| Herramientas (`<App>.DbMigrator`, workers separados) | `Infrastructure` + `Application` | Las de su función. |

**Pruebas espejo**: un proyecto de pruebas por proyecto de `src` (`<App>.Domain.Tests`, `<App>.Application.Tests`, `<App>.Infrastructure.IntegrationTests`, `<App>.Api.Tests`), que referencia **solo** el proyecto que prueba y sus dependencias legítimas. Así el compilador impide que una prueba de caso de uso toque el ORM o el host: las pruebas de `Application` usan fakes de los puertos, nunca adaptadores reales.

**Excepción acotada del host (`Api`)**: el host puede referenciar tipos del ORM o de infraestructura **solo** en su raíz de composición, en los *health checks* de base de datos y en los manejadores globales de excepciones que traducen errores de concurrencia o de unicidad del ORM a `ProblemDetails`. Ningún controlador ni filtro de feature accede a la base de datos o al contexto del ORM. Documentar esta excepción en el doc de arquitectura del proyecto.

## Las 3 formas válidas de organizar `features/` (nunca mezclar 1 y 2 en la misma carpeta)

1. **Forma 1 — Carpeta por caso de uso (por defecto)**:
   - Ruta: `features/<feature>/<use-case>/<use-case>.<ext>` + `<use-case>/ports/`.
   - El comando/consulta, el resultado tipado, la interfaz del caso de uso y su manejador conviven en **un único archivo** cohesivo (no partir 4 tipos acoplados en 4 archivos artificiales).
   - Usar siempre que el caso de uso tenga lógica de negocio propia o puertos específicos.

2. **Forma 2 — Agrupada plana por entidad/sub-feature**:
   - Ruta: `features/<feature>/<sub-feature>/create-x.<ext>`, `update-x.<ext>`, `list-x.<ext>` + un único `<sub-feature>/ports/` compartido (y, si aplica, `<sub-feature>/events/`).
   - **Criterio**: todas las operaciones de la carpeta actúan sobre **la misma entidad o agregado** y comparten **exactamente el mismo puerto**. El caso típico es un catálogo CRUD, pero también aplica a un flujo cohesivo no CRUD (p. ej. enviar, reenviar y resolver la misma notificación) cuyos casos de uso comparten puerto y eventos.
   - Si una operación necesita un puerto propio o lógica que no comparte, pasa a la Forma 1.

3. **Forma 3 — Puerto o DTO compartido**:
   - Dentro de una misma feature (o consumido por otra feature cuando el contrato sigue teniendo dueña clara): `features/<feature>/shared/` y `features/<feature>/shared/ports/`.
   - Entre 2+ features independientes **sin una feature dueña razonable** (ej. reloj, usuario actual, bitácora transversal, escritor de Outbox, emisor de correo): `common/<concern>/`. Nunca convertir `common/` en un cajón de sastre.

**Registro vivo de formas no predeterminadas**: el documento de arquitectura del backend mantiene una tabla con cada feature o sub-feature que usa la Forma 2 o la Forma 3 (y cada excepción aprobada a estas reglas), con el motivo. Si la tabla se puede derivar del código, documentar el comando que la regenera. Un revisor rechaza una Forma 2/3 nueva que no figure en el registro.

## Categorías explícitas que NO son casos de uso estándar

No forzar todo contrato a parecer un comando de usuario:
- **Consumidores de eventos durables (Outbox)**: implementan `OutboxMessageHandler<TEvent>`, nombrados por el efecto que ejecutan (`SendPasswordResetEmail`), invocados por el procesador de fondo y nunca por un controlador HTTP.
- **Políticas de acceso y lectores de opciones**: servicios reutilizables que proyectan opciones para selectores o validan alcance/permisos (`CheckRecordAccess`, `ListCategoryOptions`), consumidos por controladores u otros casos de uso.
- **Servicios puros de dominio en `application`**: cuando varios casos de uso comparten orquestación de reglas de `domain` sin tocar infraestructura, viven junto a su contrato dentro de la feature sin fingir ser un puerto externo.

## Tabla rápida: ¿dónde va cada pieza?

| Qué agregas | Ubicación | Regla clave |
| --- | --- | --- |
| Invariante sobre una entidad | `domain/<agregado>/` | Guard dentro del método de negocio de la entidad; nunca suelto en el controlador. |
| Caso de uso nuevo | `application/features/<feature>/<use-case>/` | Recibe puertos por constructor; libre de tipos HTTP o de base de datos. |
| Puerto nuevo | `.../ports/` del caso de uso o `shared/ports/` | Interfaz nombrada por capacidad de negocio. |
| Adaptador de persistencia | `infrastructure/persistence/` | Visibilidad interna al módulo; implementa el puerto 1:1. |
| Integración externa (correo, IDP, pagos) | `infrastructure/<concern>/` | Aísla SDKs externos, timeouts, reintentos de red y mapeos de protocolo. |
| Controlador / Endpoint HTTP | `api/features/<feature>/` | Delgado: valida transporte, invoca 1 caso de uso y mapea respuesta/error. |
| Contratos de entrada/salida HTTP | `api/features/<feature>/contracts/` | Separados de los modelos internos para evolucionar sin romper clientes. |
| Políticas de autorización | `api/authorization/` | Revalidan permisos contra lectura viva en servidor (o caché corta invalidable), nunca confiando a ciegas en claims estáticos de sesión. |
| Enlace DI (wiring) | Raíces de composición dedicadas | Una extensión para adaptadores (`infrastructure`), otra para casos de uso (`api/composition`), y un archivo de arranque lineal sin `if` de negocio. |

## Composición explícita: sin mediador, sin mapeo automático, sin escaneo

- El controlador inyecta **la interfaz del caso de uso** (`ICreateIncident`) y la invoca directamente. Prohibido un mediador en proceso (MediatR o equivalente) entre controlador y caso de uso: oculta la dependencia real, impide navegar del endpoint al handler y añade *pipeline behaviors* implícitos.
- Cada caso de uso se registra **explícitamente**, una línea por caso de uso, en la extensión de composición de su feature (`services.AddScoped<ICreateIncident, CreateIncidentHandler>()`). Prohibido el registro por escaneo de ensamblados o convención (Scrutor, `AsImplementedInterfaces` masivo, reflexión): un registro faltante o duplicado debe ser visible en el diff.
- Prohibidos los mapeadores automáticos (AutoMapper o equivalentes) entre entidades, resultados y contratos HTTP: el mapeo es código explícito (constructor, método estático `From(...)` o proyección `Select`), verificable por el compilador y por el buscador de referencias.
- Validación de entrada con anotaciones del contrato (`[Required]`, `[StringLength]`) o validadores explícitos invocados por el caso de uso; nunca una librería que se engancha por reflexión a todos los tipos sin registro visible.
- Las opciones de configuración se enlazan con validación al arrancar (`ValidateDataAnnotations().ValidateOnStart()` o un `IValidateOptions<T>` propio); una configuración incompleta detiene el arranque.

## Patrón Decorator para preocupaciones transversales (caché, logging, resiliencia)

Nunca ensuciar un caso de uso ni un repositorio SQL con lógica de caché o métricas. Envolver el puerto en `infrastructure`:

```text
CasoDeUso ──► PuertoLectura (interfaz)
                   ▲
         DecoradorConCache (revisa caché; delega a inner)
                   │
         AdaptadorBaseDatos (consulta real sin tracking)
```

### Regla de oro para cachear catálogos en memoria sin condiciones de carrera
Usar un **contador de generación por catálogo**:
1. Antes de ir a la base de datos, el lector captura la generación actual `gen = store.getGeneration(catalog)` y almacena el resultado inmutable (`AsNoTracking` / solo lectura) bajo la clave `catalog:v{gen}`.
2. Al completar exitosamente una escritura (`add`/`saveChanges`) sobre ese mismo repositorio decorado, se incrementa atómicamente `store.incrementGeneration(catalog)`.
3. Así, un lector lento que leyó antes del commit escribe en `v1` y jamás pisa `v2` con datos obsoletos.
4. **Restricción**: nunca mutar ni adjuntar al ORM instancias devueltas desde una caché compartida entre peticiones; para editar un registro por ID, leerlo directo de la base sin pasar por la caché de listado. Documentar siempre si la caché es local al proceso (exige 1 worker o invalidación distribuida al escalar horizontalmente).
5. **TTL absoluto como red de seguridad**: además de la generación, cada entrada vence a un tiempo absoluto corto (p. ej. 5 min), para que un cambio hecho fuera de la aplicación (script SQL, otra instancia) se refleje sin reiniciar.
6. **Recarga con *single-flight* por llave**: al vencer o invalidarse una entrada, solo **una** petición consulta la base para la llave `catalog:v{gen}`; las peticiones concurrentes esperan ese mismo resultado (`Lazy<Task<T>>`, `SemaphoreSlim` por llave o equivalente) en lugar de lanzar N consultas idénticas (*cache stampede*). Si la carga falla, la llave se libera para que el siguiente intento reintente.

### Caché de verificaciones de seguridad por petición

Las lecturas que se repiten en cada petición autenticada (sello o versión de seguridad del usuario, permisos efectivos) pueden decorarse con caché corta (p. ej. 30 s para el sello de sesión, 2 min para permisos) **solo** si toda mutación hecha desde la aplicación (cambio de rol, contraseña, desactivación, inicio o cierre de sesión) invalida la entrada del usuario por generación. Documentar el desfase máximo que aceptan los cambios hechos fuera de la aplicación (igual al TTL). Las reglas de sesión viven en [`security-and-auditability`](../../security-and-auditability/SKILL.md).
