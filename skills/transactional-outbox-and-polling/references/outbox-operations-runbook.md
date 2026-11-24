# Runbook Operativo del Outbox Transaccional

Plantilla de procedimientos de soporte para operar el Outbox en producción sin requerir una pantalla administrativa dedicada.

## 1. Lectura de Salud (`Health Checks`)

- **`GET /health/live`**: público; comprueba únicamente que el proceso responde (no toca base de datos).
- **`GET /health/ready`**: público agregado y con límite de tasa por IP (es anónimo y toca la base de datos); verifica conectividad a base de datos y que el procesador Outbox no esté degradado, sin filtrar conteos internos.
- **`GET /health/details`** *(exige autenticación con permiso o rol de administración, además del límite de tasa)*: expone el número de mensajes pendientes, la antigüedad del pendiente más viejo en segundos, el número de mensajes en dead-letter, las vueltas consecutivas fallidas del procesador y la última vuelta. Los nombres de campo los fija cada proyecto (p. ej. `pendingCount`, `oldestPendingAgeSeconds`, `deadLetterCount`, `consecutiveFailures`, `lastRunUtc` en SICRE); documentarlos en el runbook del proyecto.
  - Si la antigüedad del pendiente más viejo crece de forma sostenida con cero fallos consecutivos, verificar que el proceso del servidor no esté entrando en suspensión por inactividad (*Idle Timeout*).

## 2. Diagnóstico de mensajes en `Dead-Letter`

Consultar sin exponer `payloadJson` en terminales compartidas cuando pueda contener datos sensibles:

```sql
SELECT id, message_type, aggregate_type, aggregate_id, attempt_count,
       occurred_at_utc, dead_lettered_at_utc, last_error, correlation_id
FROM outbox_messages
WHERE dead_lettered_at_utc IS NOT NULL
ORDER BY dead_lettered_at_utc DESC;
```

Cruzar `correlation_id` e `id` (`OutboxMessageId`) en los archivos de log estructurado para inspeccionar la causa exacta.

## 3. Reencolado manual seguro (Checklist previo obligatorio)

**Antes de reencolar un mensaje cuyo consumidor dispara un efecto externo (ej. correo o notificación a terceros)**:
1. Verificar en la tabla de intentos/despachos o en el buzón/sistema externo si el efecto **ya salió** antes del fallo que impidió marcar `processed_at_utc`.
2. Si el efecto ya ocurrió y no debe repetirse, resolver el estado de negocio manualmente según el procedimiento auditado y no reencolar a ciegas.
3. Si se confirma seguro reejecutarlo, reencolar dentro de una transacción explícita acotada por `id`:

```sql
UPDATE outbox_messages
SET dead_lettered_at_utc = NULL,
    locked_by = NULL,
    locked_until_utc = NULL,
    attempt_count = 0,
    available_at_utc = CURRENT_TIMESTAMP,
    last_error = NULL
WHERE id = :messageId
  AND dead_lettered_at_utc IS NOT NULL;
```

## 4. Pausa operativa de emergencia

Para detener temporalmente el despacho (por ejemplo, caída prolongada del proveedor de correo o mantenimiento externo) sin perder ningún evento nuevo:
1. Configurar la variable de entorno del servicio `Outbox__Enabled = false` y reciclar el proceso.
2. Las transacciones de negocio seguirán confirmando y almacenando filas en `outbox_messages` con normalidad.
3. Al restablecer `Outbox__Enabled = true`, el procesador drenará el backlog acumulado en orden cronológico respetando `batchSize`.

### Pausar un único mensaje

Para retener un mensaje concreto (p. ej. un envío sospechoso o un destinatario por confirmar) sin detener el resto, enviarlo a dead-letter a mano con una sentencia acotada por `id` que no toque mensajes en curso ni ya resueltos; luego se reencola con el procedimiento de la sección 3:

```sql
UPDATE outbox_messages
SET dead_lettered_at_utc = CURRENT_TIMESTAMP,
    last_error = 'ManualHold',
    locked_by = NULL,
    locked_until_utc = NULL
WHERE id = :messageId
  AND processed_at_utc IS NULL
  AND dead_lettered_at_utc IS NULL
  AND (locked_until_utc IS NULL OR locked_until_utc <= CURRENT_TIMESTAMP);
```

Si afecta `0` filas, el mensaje ya se procesó, ya estaba retenido o un worker lo tiene en curso: revisar su estado antes de repetir.

## 5. Diagnóstico de bloqueos (claim o barridos que no avanzan)

Si el worker reporta claims vacíos con backlog visible, o un barrido excede su duración habitual, revisar bloqueos antes de reciclar el proceso. Versionar en `scripts/` un script de **solo lectura** que liste las sesiones bloqueadas y bloqueadoras con su sentencia y espera:

- **SQL Server**: consultar `sys.dm_exec_requests` (columna `blocking_session_id`), `sys.dm_exec_sessions` y `sys.dm_exec_sql_text`. Requiere solo el permiso `VIEW SERVER STATE` (o `VIEW DATABASE STATE` en Azure SQL), nunca `sysadmin`.
- **PostgreSQL**: consultar `pg_stat_activity` junto con `pg_blocking_pids(pid)`.

El script no ejecuta `KILL` ni `pg_terminate_backend`: terminar una sesión es una decisión humana documentada en el registro del incidente. El script está cubierto por una prueba de integración que lo ejecuta contra la base desechable para que no se rompa al cambiar el motor o la versión.
