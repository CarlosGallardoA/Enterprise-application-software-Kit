# Especificación Técnica de Tabla Outbox, Claim Atómico y Worker

## 1. Esquema de `OutboxMessages` (entidad técnica, no hereda `AuditableEntity`)

| Columna | Tipo lógico | Propósito |
| --- | --- | --- |
| `id` | UUID (PK) | Identificador único estable del evento (`eventId`). |
| `messageType` | Texto(200) | Nombre estable versionado (`app.dominio.evento.v1`). |
| `schemaVersion` | Entero | Versión entera del esquema del payload (`1`, `2`...). |
| `payloadJson` | Texto largo | Carga útil mínima serializada (secretos cifrados previamente). |
| `aggregateType` | Texto(100) | Nombre lógico del agregado raíz (`Incident`, `User`, `Claim`). |
| `aggregateId` | UUID nullable | Identificador del agregado para trazabilidad operativa. |
| `occurredAtUtc` | Timestamp UTC | Instante exacto del hecho de negocio. |
| `availableAtUtc` | Timestamp UTC | Cuándo puede reclamarse (inmediato al crear; futuro en backoff). |
| `attemptCount` | Entero | Intentos realizados hasta el momento (`0` al encolar). |
| `lockedBy` | UUID nullable | Identificador del worker que posee el lease actual. |
| `lockedUntilUtc` | Timestamp UTC nullable | Vencimiento del lease actual para recuperación ante caídas. |
| `processedAtUtc` | Timestamp UTC nullable | Cuándo terminó con éxito. |
| `deadLetteredAtUtc` | Timestamp UTC nullable | Cuándo agotó intentos o falló por esquema/tipo inválido. |
| `lastError` | Texto(4000) nullable | **Solo el nombre del tipo de excepción/código**, sin stack ni datos sensibles. El store lo trunca a 4000 caracteres antes de escribir para que un mensaje largo no haga fallar la actualización del desenlace. |
| `correlationId` | Texto(100) nullable | `traceId` / correlación de la petición origen. |
| `causationId` | UUID nullable | Evento o comando causante. |
| `actorUserId` | UUID nullable | Usuario autenticado que originó la operación. |

### Índices requeridos
1. **Disponibilidad para claim**: `(processedAtUtc, deadLetteredAtUtc, availableAtUtc)`.
2. **Recuperación de leases vencidos**: `(lockedUntilUtc)`.
3. **Retención/purga**: `(occurredAtUtc)`.
4. **Diagnóstico por expediente**: `(aggregateId)`.

---

## 2. Claim atómico con Lease (cero colisión entre workers)

Nunca hacer `SELECT` en aplicación seguido de `UPDATE` separado: dos instancias o dos procesos solapados durante un reciclado reclamarían el mismo mensaje.

### Patrón SQL atómico
Seleccionar lote elegible (`processedAtUtc IS NULL AND deadLetteredAtUtc IS NULL AND availableAtUtc <= :now AND (lockedUntilUtc IS NULL OR lockedUntilUtc <= :now)`) ordenado por `(availableAtUtc, occurredAtUtc)` usando bloqueo de fila con salto de filas bloqueadas:
- **SQL Server**: CTE con `TOP (@batchSize)` + `WITH (UPDLOCK, READPAST, ROWLOCK)` actualizada con `UPDATE ... OUTPUT INSERTED.*`.
- **PostgreSQL**: CTE con `FOR UPDATE SKIP LOCKED LIMIT :batchSize` actualizada con `UPDATE ... RETURNING *`.

Confirmar el claim de inmediato en una transacción cortísima y **ejecutar los efectos externos fuera de la transacción de base de datos**.

### Lease, tope por handler y propiedad del mensaje
- **Tope por intento (`handlerTimeoutSeconds`) menor que el lease**: cada despacho corre con un token cancelado al vencer el tope, y la validación de opciones al arrancar rechaza `handlerTimeoutSeconds <= 0` o `handlerTimeoutSeconds >= leaseSeconds`. Si el cliente externo tiene su propio timeout, el tope del handler debe ser mayor que ese timeout para que actúe primero. Un tope vencido cuenta como fallo del intento (código `TimeoutException`), no como apagado.
- **Renovación del lease por mensaje**: el lease del claim cubre el lote, pero con handlers lentos vencería antes de llegar a los últimos. Renovarlo para cada mensaje justo antes de despacharlo (`UPDATE ... SET locked_until_utc = :now + lease WHERE id = :id AND locked_by = :workerId`); si no afecta filas, otro worker ya lo reclamó y este lo salta. Como el tope del handler es menor que el lease, el despacho cabe en el lease renovado.
- **Desenlaces filtrados por `lockedBy`**: marcar procesado, reprogramar o enviar a dead-letter, y liberar el lease, siempre con `WHERE id = :id AND locked_by = :workerId`. Si devuelve `0` filas, el worker perdió el lease y no pisa el estado del dueño actual; registrarlo como señal de que `leaseSeconds` queda corto para algún handler.
- **Alcance DI por mensaje**: despachar cada mensaje en un alcance (`Scope`) propio con su propia unidad de trabajo, descartado antes de escribir el desenlace, para que un handler que falla o vence con entidades rastreadas no contamine el mensaje siguiente ni las escrituras del store. El desenlace se escribe con el token de apagado del host, no con el token con tope, para que un intento vencido igual quede reprogramado.
- **Contrato inválido**: un `messageType` fuera de la lista blanca o un `schemaVersion`/payload que no deserializa va a dead-letter de inmediato, sin consumir reintentos.

---

## 3. Reintentos, Backoff, Dead-Letter y Purga

- **Fórmula de backoff exponencial**:
  `delay = min(maxRetrySeconds, baseRetrySeconds * 2^(attemptCount - 1))` (estrategia determinista inyectable en tests mediante proveedor de tiempo).
- **Jitter**: obligatorio cuando más de una instancia o worker compite por la misma tabla (granja web, varios procesos, solape durante reciclados prolongados), para que los reintentos de un mismo fallo externo no vuelvan en ráfaga. Con un único worker por base de datos es opcional; documentar la decisión y añadirlo antes de escalar a varias instancias.
- **Valores base recomendados** (validados al iniciar la aplicación):
  - `pollingIntervalSeconds = 2`, `batchSize = 25`, `leaseSeconds = 120`, `handlerTimeoutSeconds = 100` (< `leaseSeconds`), `maxAttempts = 8`, `baseRetrySeconds = 5`, `maxRetrySeconds = 900` (≥ `baseRetrySeconds`), `processedRetentionDays = 30`, `purgeIntervalHours = 24`.
- **Backoff del worker en reposo**: con la cola vacía, duplicar la espera entre vueltas desde `pollingIntervalSeconds` hasta un tope (p. ej. 2 s a 10 s) para reducir consultas en reposo, y volver al intervalo base apenas una vuelta reclame algo. Una vuelta fallida conserva la espera vigente (no es «cola vacía»).
- **Aislamiento de fallos en lote**: si el mensaje #3 del lote lanza excepción, se reprograma o envía a dead-letter individualmente sin abortar los mensajes #4..#25.
- **Regla sagrada de limpieza**: el job de purga borra únicamente filas con `processedAtUtc < now - retentionDays` y `deadLetteredAtUtc IS NULL`. Los mensajes en dead-letter **jamás** se eliminan solos.
- **Purga en lotes**: borrar con un bucle de sentencias acotadas (`DELETE TOP (1000) ...` en SQL Server; `DELETE ... WHERE id IN (SELECT id ... LIMIT 1000)` en PostgreSQL), cada una en su propia transacción corta, hasta que un lote borre menos del tamaño fijado. Un único `DELETE` sobre un backlog grande puede escalar a bloqueo de tabla y detener el claim durante toda la purga.

---

## 4. Cuándo evaluar pasar del Outbox SQL a un Broker Externo

Mantener Outbox SQL + worker integrado mientras el sistema sea un monolito modular. Evaluar un broker externo (Service Bus, RabbitMQ, Kafka) **únicamente** ante evidencia medida de:
1. Múltiples microservicios desplegados independientemente que consumen los mismos hechos.
2. Consumidores externos fuera de la frontera del sistema.
3. Volumen sostenido donde el polling SQL del Outbox sea un cuello de botella medido.
4. Necesidad de aislar en procesos distintos cargas pesadas (escaneo antimalware o inferencia pesada) que no deban compartir memoria/CPU con la API.
