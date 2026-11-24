# Arquitectura Backend — <NOMBRE_PROYECTO>

> Secciones obligatorias. Si una aún no aplica, escribir "No aplica todavía" y el motivo; no borrarla.
> Los valores de configuración (versiones, límites, cantidad de proyectos) se enlazan a su archivo fuente, nunca se copian.

## 1. Modelo mental

<Un párrafo: qué resuelve el backend, hexagonal + vertical slicing, dependencias siempre hacia adentro.>

## 2. Proyectos y referencias permitidas

| Proyecto | Responsabilidad | Referencias permitidas |
| --- | --- | --- |
| `<App>.Domain` | Entidades, invariantes, valores. | Ninguna |
| `<App>.Application` | Casos de uso y puertos por feature. | `Domain` |
| `<App>.Infrastructure` | Persistencia, integraciones, criptografía, jobs. | `Domain`, `Application` |
| `<App>.Api` | Transporte HTTP y raíz de composición. | Todos |
| `<App>.DbMigrator` | Migraciones, semillas y mantenimiento offline. | `Infrastructure` |

Pruebas: un proyecto de pruebas por proyecto de `src`, que referencia solo lo que prueba. Configuración del build: ver `Directory.Build.props` y `Directory.Packages.props` en la raíz (enlazar con ruta relativa cuando existan).

## 3. Anatomía de un vertical slice

<Árbol de carpetas de una feature en cada proyecto, con la forma por defecto y cuándo se admite otra forma.>

## 4. ¿Dónde va cada cosa?

| Necesito… | Va en… |
| --- | --- |
| Validar formato y largo de la entrada | Contrato HTTP en `Api` (responde `400` antes del caso de uso) |
| Validar una regla de negocio | `Domain` o el caso de uso en `Application` |
| Autorizar por permiso y alcance | <filtro/política + verificación de propiedad en el caso de uso> |
| Leer datos para una pantalla | <lector de solo lectura sin tracking en `Infrastructure`> |
| Publicar un evento durable | <Outbox en la misma transacción> |
| Ejecutar un trabajo periódico | <worker en `Infrastructure`, registrado en la raíz de composición> |
| Registrar en la bitácora | <interceptor central o puerto `AuditLogWriter`> |

## 5. Ejemplo de punta a punta

<Un caso de uso real del proyecto: controlador → interfaz del caso de uso → handler → puerto → adaptador → respuesta y fallas tipadas.>

## 6. Raíces de composición y registro de dependencias

<Dónde se registra cada caso de uso (registro explícito), extensiones `Add<Concern>`, decoradores y cachés.>

## 7. Convenciones de nombrado

<Tabla: interfaz/clase/archivo del caso de uso, adaptadores, controladores y rutas `api/v<n>/<feature>`, eventos versionados.>

## 8. Contrato de errores

<Enlace a las reglas generales y lista de manejadores de excepción dedicados. Excepción acotada: solo los manejadores de excepción y los health checks de `Api` referencian tipos del ORM.>

## 9. Estrategia de pruebas

<Capas de prueba, base desechable, pruebas de convención por reflexión.>

## 10. Registros vivos

| Registro | Contenido | Cómo se regenera |
| --- | --- | --- |
| Features con forma no default | <feature — forma — motivo> | Manual |
| Entidades exceptuadas de `AuditableEntity` | <entidad — categoría — mecanismo que la audita> | Manual |
| Endpoints anónimos | <ruta — motivo> | <prueba que los lista> |

## 11. Anti-patrones prohibidos

- Lógica de negocio en controladores o filtros.
- Acceso a datos desde `Api` fuera de la excepción declarada.
- Mediadores, mapeadores automáticos o registro de dependencias por escaneo de ensamblados.
- Una consulta o un `SaveChanges` por fila dentro de un barrido.
