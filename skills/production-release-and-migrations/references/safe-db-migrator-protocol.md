# Protocolo del Migrador Seguro (`DbMigrator`), Bootstrap y Soporte SQL

## 1. Responsabilidades y blindaje de `DbMigrator`

- Es un ejecutable de consola independiente que **jamás** es referenciado por el proyecto de la API.
- Embebe los archivos SQL de semilla como recursos compilados dentro del binario (nunca busca archivos subiendo directorios relativos en el servidor).
- Imprime únicamente servidor/base saneados, cantidad de migraciones pendientes, checksum verificado, `RunId`, ticket y código de salida (`0` o `1` + tipo de excepción), **sin imprimir jamás cadenas de conexión, contraseñas ni sentencias SQL completas con datos**.
- La cadena de conexión con permisos `DDL` se inyecta desde el almacén autorizado de secretos solo durante la ejecución (variable de entorno del proceso o *secret* del contenedor efímero), nunca como argumento de línea de comandos, y se retira del entorno al terminar. La cadena del sitio web nunca tiene permisos `DDL`.
- Corre igual en ambos perfiles de hospedaje: como proceso en el servidor de release (Windows) o como contenedor efímero (`docker run --rm` con la misma imagen versionada del migrador).

### Modos del migrador

| Modo | Efecto | Uso |
| --- | --- | --- |
| `--dry-run` | Abre la conexión en solo lectura (`ApplicationIntent=ReadOnly` o equivalente), lista las migraciones pendientes y el estado de las semillas, y termina sin modificar nada. | Primer paso de todo release y diagnóstico. |
| `--script-only <archivo>` | Genera el SQL idempotente **sin conectar a la base** y su `manifest.json` (`RunId` + `SHA-256` del SQL, del migrador y de la infraestructura). Falla si el archivo o su manifiesto ya existen, salvo `--overwrite`. | CI (artefacto de revisión) y revisión del DBA. |
| (por defecto) | Aplica migraciones pendientes y semillas dentro de transacciones explícitas. | Release aprobado. |

## 2. Guardas escalonadas según el destino

El migrador decide su nivel de exigencia **antes de abrir conexión**, a partir del ambiente declarado (`--environment` o variable de ambiente del proceso) y del host de la cadena de conexión. **Falla cerrada**: ambiente ausente o desconocido se trata como Producción; host no reconocible como loopback se trata como remoto.

| Nivel | Destino | Exige | Aborta antes de conectar si |
| --- | --- | --- | --- |
| 1 | Desarrollo **y** host loopback (`localhost`, `127.0.0.1`, `::1`, instancia local embebida o desechable) | Nada adicional: migración directa + semillas | El ambiente no es Desarrollo o el host no es loopback (sube de nivel) |
| 2 | Cualquier host no loopback (QA, servidores compartidos) | `--target-database <NombreExacto>` | Falta el argumento o no coincide exactamente con la base de la cadena |
| 3 | PreProd y Producción | Nivel 2 + respaldo con restauración comprobada y aprobación del entorno de CD. **Opcionales y recomendados**: `--reviewed-script`, `--reviewed-sha256`, `--backup-ticket` | Si se pasó alguno de los opcionales: cualquier valor falta, el `SHA-256` recalculado difiere o el manifiesto no corresponde a los binarios en ejecución |

- **Por qué el nivel 2 en todo destino remoto**: el fallo más común no es un script malicioso, sino una cadena de conexión equivocada (secretos locales que apuntan a QA, variables heredadas por un agente). Escribir el nombre exacto de la base convierte ese error en un aborto inmediato y barato.
- **Los argumentos no acreditan la aprobación**: la aprobación y el respaldo se demuestran con las aprobaciones del entorno de CD y la evidencia del respaldo. Pasar `--backup-ticket` sin un respaldo real no lo sustituye.
- Las pruebas del migrador cubren cada transición: Desarrollo con host remoto exige nivel 2; ambiente sin declarar exige nivel 3; nombre de base distinto aborta sin abrir conexión; `--reviewed-sha256` distinto aborta sin abrir conexión; `--dry-run` no escribe.

### Flujo del nivel 3 (modelo híbrido)

1. **Generación determinista en CI (`--script-only`) como artefacto de revisión**:
   - Compilar `DbMigrator` en `Release` y generar `migrations.sql` idempotente sin abrir conexión real.
   - Emitir `migrations.manifest.json` junto al script registrando `RunId` y el `SHA-256` de `migrations.sql` y de los binarios del migrador e infraestructura.
   - El artefacto **no despliega nada**: sirve para que el DBA revise exactamente lo que se aplicará. **Prohibido regenerar el SQL después de revisarlo**: si cambia, se revisa el nuevo artefacto.
2. **Bootstrap del primer administrador sin contraseñas locales**:
   - En entornos remotos, el bootstrap vincula el correo institucional y el identificador inmutable del proveedor de identidad federado (`oid` / `sub`), exigiendo MFA en el proveedor externo y rechazando crear contraseñas locales iniciales.
   - El proceso hijo limpia de su entorno cualquier variable temporal de bootstrap antes de terminar.
3. **Ejecución en Release**:
   - `--dry-run` contra el destino para confirmar las migraciones pendientes esperadas.
   - Respaldo con restauración comprobada y aprobación del entorno de CD.
   - Inyectar la cadena `MigrationDatabase` exclusiva de release, con la identidad `migrator` (los permisos `DDL` existen solo durante esta ejecución).
   - Ejecutar con `--target-database <NombreExacto>` y, cuando el ambiente lo adopta, `--backup-ticket <TicketAprobado> --reviewed-script migrations.sql --reviewed-sha256 <HashAprobado>`. Con esos argumentos, antes de abrir transacción el migrador comprueba que el manifiesto corresponda a los binarios en ejecución y recalcula el `SHA-256` del archivo en disco; si cualquiera difiere, aborta antes de conectar.
4. **Verificación posterior**: historial de migraciones aplicado (p. ej. `__EFMigrationsHistory`), bootstrap y semillas presentes, y `/health/ready` de la API en `200`.

## 3. Semillas no destructivas

- **Catálogos cerrados de sistema** (códigos de permiso, enumerados espejo `*Lookup`): la semilla puede insertar y actualizar porque nadie los edita en producción.
- **Catálogos editables desde administración**: la semilla **solo inserta** lo que falta (`MERGE ... WHEN NOT MATCHED THEN INSERT` o `INSERT ... ON CONFLICT DO NOTHING`) y **nunca sobrescribe** las ediciones administrativas.
- Toda semilla es idempotente: ejecutarla dos veces deja el mismo estado.

## 4. Duración y bloqueo de cada migración

- Medir cada migración sobre una base desechable con **volumen representativo** de producción antes de aprobarla, y anotar la duración en la descripción del cambio.
- Si la migración reescribe filas, altera columnas de tablas grandes o crea índices sin `ONLINE` (o el equivalente no bloqueante del motor), marcarla como **DDL bloqueante** y exigir una ventana de bajo uso comunicada antes del release.
- Una migración de datos voluminosa se divide en lotes acotados y reanudables, nunca en una única transacción gigante.

## 5. Scripts SQL de Soporte Excepcional (`Break-Glass`)

Para correcciones operativas extraordinarias que no tienen pantalla por diseño (p. ej. anular un registro huérfano bajo autorización formal):
- El script exige parámetros obligatorios: identificador del registro, `actorUserId` activo responsable, motivo detallado y número de ticket.
- Verifica al inicio que la sesión SQL pertenezca al rol `break_glass` o `sysadmin` (rol que la cuenta de la API jamás posee) y rechaza operar si existen dependencias financieras/legales activas.
- Ejecuta el cambio y la inserción en la bitácora de auditoría (incluyendo el login SQL original del operador) dentro de **una única transacción explícita**.
- **Versionado y bajo prueba**: los scripts de soporte viven en el repositorio (p. ej. `scripts/`) y una prueba de integración los ejecuta contra la base desechable, verificando la guarda de rol, la transacción y la fila de auditoría. Un script que no se prueba se rompe en silencio con la siguiente migración.

## 6. Scripts de diagnóstico de solo lectura

- Incluir en el runbook un script de diagnóstico de bloqueos (sesiones bloqueadas, cadena de bloqueo, sentencia y tiempo de espera) que solo lee vistas del sistema y requiere únicamente `VIEW SERVER STATE` o el permiso equivalente del motor.
- Estos scripts nunca modifican datos ni terminan sesiones; la decisión de intervenir queda documentada en el runbook.
