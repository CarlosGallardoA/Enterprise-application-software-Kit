# Convenciones de Nombrado

Un mismo identificador recorre interfaz, clase, archivo y carpeta de cada pieza: quien lee el nombre de un endpoint encuentra su caso de uso, su puerto y su adaptador con una sola búsqueda. Los ejemplos usan C# y TypeScript/Angular; en otros stacks se aplica la misma forma con la capitalización idiomática del lenguaje.

## 1. Backend

| Pieza | Forma | Ejemplo |
| --- | --- | --- |
| Carpeta del caso de uso (Forma 1) | `features/<Feature>/<UseCase>/` | `Incidents/CreateIncident/` |
| Archivo del caso de uso | `<UseCase>.cs` (comando, resultado, interfaz y handler juntos) | `CreateIncident.cs` |
| Interfaz del caso de uso | `I<UseCase>` | `ICreateIncident` |
| Handler | `<UseCase>Handler : I<UseCase>` | `CreateIncidentHandler` |
| Comando / consulta | `<UseCase>Command` / `<UseCase>Query` | `CreateIncidentCommand` |
| Resultado y fallas | `<UseCase>Result` + `enum <UseCase>Failure` | `CreateIncidentFailure.LocationNotFound` |
| Puerto | `I<Capacidad>` por capacidad de negocio, nunca por tecnología | `IIncidentRepository`, `IStudentDirectory` |
| Adaptador de persistencia | `Ef<Capacidad>` / `Sql<Capacidad>`, `internal sealed`, que recibe **solo** el contexto de datos (y el reloj si aplica) | `EfIncidentRepository` |
| Adaptador externo | `<Tecnología><Capacidad>`, `internal sealed` | `HttpStudentDirectory`, `GraphMailEmailSender` |
| Decorador | `Cached<Capacidad>`, `Resilient<Capacidad>` | `CachedCatalogStore` |
| Controlador | `<Feature>Controller`, ruta `api/v<n>/<feature-en-kebab>` | `IncidentsController` → `api/v1/incidents` |
| Contratos HTTP | `<Acción><Recurso>Request` / `<Recurso>Response` en `contracts/` | `CreateIncidentRequest` |
| Extensión de composición | `Add<Concern>` sobre `IServiceCollection` | `AddIncidentsFeature`, `AddAcmePersistence` |
| Evento durable | `<HechoEnPasado>V<n>` + `eventType` `<app>.<dominio>.<hecho>.v<n>` | `IncidentCreatedV1` |
| Consumidor de Outbox | Nombre del efecto que ejecuta | `SendPasswordResetEmail` |
| Worker periódico | `<Efecto>BackgroundService` | `SlaSweepBackgroundService` |
| Opciones | `<Concern>Options` con `SectionName` constante | `OutboxOptions` |
| Proyecto de pruebas | `<Proyecto>.Tests` / `<Proyecto>.IntegrationTests` | `Acme.Application.Tests` |
| Prueba | `<Método_o_Escenario>_<Condición>_<Resultado>` en frase legible | `Create_with_inactive_location_returns_LocationNotFound` |

- Los tipos que no se consumen fuera del ensamblado son `internal`; los adaptadores y handlers además `sealed`.
- La versión de la API va en la ruta (`api/v1/...`) desde el primer endpoint; un cambio incompatible crea `v2` sin romper `v1`.

## 2. Frontend

| Pieza | Forma | Ejemplo |
| --- | --- | --- |
| Archivos y carpetas | `kebab-case` con sufijo de rol | `incident-list.component.ts` |
| Puerto | `<x>.port.ts` exporta `XPort` (interfaz o clase abstracta) | `incidents.port.ts` → `IncidentsPort` |
| Caso de uso | `<acción>.use-case.ts` exporta `XUseCase` | `create-incident.use-case.ts` → `CreateIncidentUseCase` |
| Casos de uso triviales agrupados | `<entidad>.use-cases.ts` (plural) | `locations.use-cases.ts` |
| Adaptador HTTP | `http-<x>.adapter.ts` exporta `HttpXAdapter` | `http-incidents.adapter.ts` |
| Tokens de inyección | `SCREAMING_SNAKE` dentro de `<feature>.tokens.ts` | `INCIDENTS_PORT`, `CREATE_INCIDENT_USE_CASE` |
| Store de vista | `<x>.store.ts` exporta `XStore` | `incident-wizard.store.ts` |
| Rutas de la feature | `<feature>.routes.ts` | `incidents.routes.ts` |
| Helpers puros | sufijos `-rule`, `-policy`, `-payload` (ver [frontend-slice-anatomy.md](./frontend-slice-anatomy.md)) | `build-incident-payload.ts` |
| Selector de componente | prefijo del proyecto + `kebab-case` | `app-incident-list` |
| Scopes de traducción | `camelCase` (algunas librerías i18n rompen con guiones) | `incidentForms` |

## 3. Reglas comunes

- Nombrar por **capacidad de negocio en el lenguaje del dominio**, no por patrón (`Manager`, `Helper`, `Util`, `Service` genérico están prohibidos como nombre principal).
- Un nombre por concepto en todo el sistema: si el dominio dice «expediente», backend, frontend, base de datos y traducciones usan ese mismo término.
- Renombrar es un cambio completo: interfaz, clase, archivo, carpeta, registro DI, token y prueba en el mismo commit.
- El documento de arquitectura del proyecto incluye esta tabla adaptada a su stack; un PR que se aparta de ella sin decisión documentada se rechaza.
