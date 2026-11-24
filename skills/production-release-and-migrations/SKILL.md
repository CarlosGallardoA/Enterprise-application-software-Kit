---
name: production-release-and-migrations
description: >-
  Úsala al diseñar o ejecutar herramientas de migración de base de datos,
  separación de privilegios SQL, pipelines de CI/CD con compuertas de calidad y
  seguridad, empaquetado de artefactos o despliegues a servidores productivos
  (QA, PreProducción, Producción). Activators: despliegue, deployment, CI/CD,
  pipeline, migraciones de base de datos, DbMigrator, scripts SQL revisados,
  health checks, secretos en servidor, checklist post-deploy, IIS, Docker,
  Linux, contenedores, reverse proxy, nginx, producción.
---

# Migraciones Seguras, Pipelines CI/CD y Despliegue a Producción (`production-release-and-migrations`)

Garantiza que ningún cambio llegue a QA, PreProducción o Producción sin pasar por compuertas verificables de calidad y seguridad, sin auto-migraciones accidentales al reiniciar el servidor y con separación real de privilegios.

## Cuándo activar esta skill

- Al crear o modificar el pipeline de integración continua (CI) o entrega (CD).
- Al diseñar cómo se aplican migraciones de esquema, semillas iniciales, bootstrap del primer administrador o scripts de soporte de emergencia.
- Al preparar configuración por entorno, cabeceras de caché HTTP, variables de servidor o listas de verificación post-despliegue.
- Al verificar versiones soportadas, parches de runtimes, dependencias, bibliotecas nativas, herramientas de CI e imágenes antes de publicar.

## Compuerta obligatoria de seguridad de tecnologías

Aplicar [technology-security-policy.md](../security-and-auditability/references/technology-security-policy.md) a desarrollo, CI y producción. Bloquear la publicación ante vulnerabilidades conocidas aplicables de cualquier severidad, ramas sin soporte o evidencia incompleta; comprobar tanto dependencias como runtimes, bibliotecas nativas, SO y artefactos finales. Las versiones de ejemplos históricos nunca sustituyen los avisos oficiales vigentes.

## Perfiles de hospedaje soportados

El kit admite dos perfiles y toda regla operativa declara su variante para cada uno. El proyecto declara en `docs/operacion/deployment.md` qué perfil usa cada ambiente.

| Tema | Windows + IIS | Linux + Docker |
| --- | --- | --- |
| Configuración por ambiente | `appsettings.{Ambiente}.json`, `web.config` y variables del App Pool viven **en el servidor**, se crean una vez por ambiente y el release nunca los sobrescribe (copia con exclusiones). | Variables de entorno, `env_file` fuera del repositorio o *Docker secrets*. La imagen nunca contiene `appsettings.{Ambiente}.json`, `.env`, `secrets.json` ni valores de ambiente. |
| Artefacto de la API | Salida de `publish` **sin** `appsettings*.json` ni `web.config`; el pipeline falla si queda alguno. | Imagen multi-etapa con usuario no root; puede llevar `appsettings.json` base sin secretos ni valores de ambiente. Se publica y despliega por *digest*. |
| Proxy delante de la API | IIS + ANCM (in-process) y, si existe, el balanceador institucional. | nginx/Traefik como *reverse proxy* con TLS. |
| Disponibilidad del proceso | `Preload Enabled`, `Start Mode = AlwaysRunning`, `Idle Timeout = 0`, reciclado periódico desactivado o a una hora fija de madrugada. | `restart: unless-stopped` (o política del orquestador) y `healthcheck` contra `/health/ready`. |
| Llaves y datos persistentes | Carpetas externas a la publicación con ACL de la identidad del App Pool. | Volúmenes nombrados o almacenamiento externo, nunca la capa escribible del contenedor. |

## Las 5 leyes operativas de despliegue

1. **La API jamás migra el esquema ni crea administradores al arrancar**:
   - Un reinicio o reciclado de proceso en producción nunca debe disparar `DDL` ni alterar cuentas privilegiadas.
   - Existe una **única herramienta CLI independiente (`DbMigrator`)** autorizada para migrar esquemas, sembrar catálogos cerrados o ejecutar mantenimiento criptográfico offline.
2. **Identidades de base de datos separadas**:
   - En todo entorno no local, la identidad `runtime` (API) solo tiene lectura/escritura de datos (`DML`) y bloqueos transaccionales de aplicación; **cero permisos DDL**, cero `db_owner`/`sysadmin`.
   - **Recomendado para Producción** (y PreProd si la replica): tres identidades separadas, sumando `migrator` (permisos `DDL` inyectados únicamente durante la ejecución aprobada del migrador; jamás instalados en el servidor web) y `break_glass` (rol auditado otorgado temporalmente por el DBA bajo ticket para scripts transaccionales de emergencia que exigen motivo, usuario activo responsable y registro obligatorio en bitácora).
3. **Guardas escalonadas del migrador según el destino** (falla cerrada: si el ambiente no está declarado, se trata como Producción):
   - **Desarrollo + loopback** (`localhost`, `127.0.0.1`, `::1`, instancia local embebida): migración directa.
   - **Cualquier destino no loopback** (QA, servidores compartidos): exige `--target-database <NombreExacto>` idéntico a la base de la cadena de conexión y aborta **antes de conectar** si falta o difiere. Es la guarda barata contra una cadena de conexión equivocada heredada de secretos locales o variables del agente.
   - **Ambientes compartidos (QA, PreProd, Producción) — modelo híbrido**: el pipeline compila el migrador y genera `--script-only migrations.sql` idempotente + `manifest.json` (hashes `SHA-256` del SQL y de los binarios) como **artefacto de revisión que no despliega nada**. El release aplica las migraciones con el migrador y la identidad `migrator` solo después de un respaldo con restauración comprobada. `--reviewed-script`, `--reviewed-sha256` y `--backup-ticket` son **opcionales y recomendados** en PreProd/Producción: cuando se pasan, el migrador aborta ante cualquier diferencia. La aprobación y el respaldo se acreditan con las aprobaciones del entorno de CD y la evidencia del respaldo, nunca solo por pasar argumentos al migrador.
   - `--dry-run` de solo lectura (`ApplicationIntent=ReadOnly` o equivalente) lista las migraciones pendientes sin modificar nada; es el primer paso de cada release.
4. **Validación *Fail-Fast* en el arranque y triple aislamiento físico en disco**:
   - **Configuración validada al iniciar (`ValidateOnStart`)**: toda sección de configuración (conexiones, orígenes HTTPS, URLs de integraciones, proxies conocidos, presupuestos de memoria `> 0`, plazos Outbox y llaves criptográficas) se valida en el arranque del proceso; si falta un valor crítico (p. ej. la llave de cifrado documental) o la configuración está a medias, la API **se niega a arrancar de inmediato** en lugar de degradarse en silencio a texto plano o fallar a mitad de una petición. Un logger de arranque a consola registra la falla como `Fatal` y vacía el buffer antes de salir (IIS la lleva al Visor de eventos vía ANCM; Docker, a `docker logs`).
   - **La configuración por ambiente no viaja en el artefacto**: vive en el host según el perfil de hospedaje (tabla de arriba). El pipeline verifica que el artefacto no contenga archivos de configuración local (`*.local.json`, `secrets.json`, `.env`) ni claves de secreto con valor.
   - **Triple separación en servidor**:
     1. *Carpeta de publicación o imagen* (reemplazada en cada deploy): jamás almacena secretos, logs ni documentos subidos por usuarios.
     2. *Directorio documental (`RootPath`)*: carpeta persistente externa (IIS) o volumen nombrado (Docker) con permisos exclusivos del proceso para los archivos cifrados.
     3. *Llave maestra `AES-256-GCM` y anillo de claves*: resguardados y respaldados **fuera del directorio documental** (guardar la llave junto a los archivos cifrados anula la protección ante copia de carpeta, y perderla vuelve ilegible el histórico).
5. **Coherencia entre estado del proceso y topología del servidor**:
   - Si el sistema usa workers en segundo plano (Outbox, barridos SLA), el proceso nunca se suspende: IIS con `Preload Enabled`, *AlwaysRunning*, *Idle Timeout = 0* y reciclado periódico desactivado o fijado a una hora de madrugada; Docker con política de reinicio y `healthcheck`.
   - **Persistir tickets de sesión y anillo de llaves de protección de datos** (p. ej. Data Protection de ASP.NET Core) en un almacén compartido y durable (tabla SQL, o volumen compartido con permisos restringidos) para que sobrevivan reciclados, reinicios de contenedor y múltiples instancias. Solo si el proyecto aún guarda tickets o cachés de autorización en memoria local se fija **1 único worker / 1 réplica**, documentado como deuda hasta persistirlos.
   - Registrar un servicio de calentamiento en segundo plano que construya el modelo del ORM y abra la primera conexión al arrancar; si falla solo deja un `Warning`. La sonda `ready` no responde `200` hasta que el proceso puede atender.

Consulta el detalle completo paso a paso en:
- [safe-db-migrator-protocol.md](./references/safe-db-migrator-protocol.md) — diseño del CLI migrador, `--dry-run`, modelo híbrido de SQL revisado, semillas no destructivas, ventanas para DDL bloqueante, bootstrap federado sin contraseña local y scripts SQL de soporte.
- [ci-cd-and-server-checklist.md](./references/ci-cd-and-server-checklist.md) — etapas del pipeline CI/CD, cadena de suministro, artefactos y manifiestos, pasos de release IIS y Docker, política `Cache-Control`, endurecimiento del host y checklists post-deploy.
- [build-and-toolchain-baseline.md](../enterprise-app-blueprint/references/build-and-toolchain-baseline.md) — `global.json`, `Directory.Build.props`, versiones centralizadas, `nuget.config`, `.gitattributes` e imágenes Docker.

## Compuertas mínimas del Pipeline CI antes de publicar artefactos

1. Checkout limpio (`clean: true`) para no arrastrar residuos entre ejecuciones, con tareas/acciones de CI fijadas por SHA o versión exacta, SDK definido por `global.json` (`rollForward: latestPatch`, `allowPrerelease: false`) y toda herramienta descargada en CI fijada por versión con su `SHA-256` verificado (ver checklist).
2. Escaneo de secretos en el repositorio con salida redactada (cero exposición del secreto en logs si falla).
3. Compuerta obligatoria de seguridad de tecnologías: inventario real, soporte y avisos vigentes de runtimes, dependencias directas/transitivas/de desarrollo, bibliotecas nativas, herramientas de CI, SO e imágenes finales; fallar ante cualquier vulnerabilidad aplicable o verificación incompleta, sin excluir severidades ni silenciar errores. Las excepciones viven en un archivo legible por la compuerta (con responsable y vencimiento), no solo en Markdown.
4. Validación previa de archivos de entorno del cliente (cortando con `exit 1` si falta configurar `apiUrl` u orígenes requeridos).
5. Compilación en modo `Release` con **0 advertencias y 0 errores**, con fuentes de paquetes cerradas (`nuget.config` con `<clear/>`, *lockfiles* de npm) y número de build estampado en el bundle.
6. Ejecución de pruebas unitarias + pruebas de integración contra instancia de base de datos efímera privada del job, seguida de paso de limpieza con condición `always()`.
7. Linters de código, formato en modo verificación (`dotnet format --verify-no-changes`, `prettier --check .` o equivalente), gobierno documental (`check-docs-governance.mjs`), fronteras arquitectónicas (`check-architecture-boundaries.mjs`), higiene (`audit-code-hygiene.mjs`) y sistema de diseño + paridad i18n (`check-design-system.mjs`, `check-i18n-parity.mjs`).
8. Suite E2E de endurecimiento (CSP, Trusted Types, retornos inseguros) sobre el artefacto web compilado.
9. Verificación estructural de los 3 artefactos separados antes de subirlos: `api` (binarios + manifiestos de runtime, **sin configuración por ambiente ni secretos**), `web` (bundle con chunks con hash, incluidas las traducciones, + reglas de reescritura SPA y cabeceras) y `reviewed-migrations` (artefacto de revisión: `migrations.sql` + `manifest.json` + binario migrador), más escaneo de vulnerabilidades del artefacto final y de su imagen/SO base.
10. Manifiesto `SHA-256` de cada artefacto, publicado como evidencia separada del paquete (p. ej. `quality-evidence`) para que el release lo reverifique.

## Verificación antes de dar por cerrado un cambio operativo

- [ ] El informe `docs/auditorias/seguridad-tecnologias.md` identifica versiones, fuentes, fecha y hashes/digests verificados; no quedan vulnerabilidades conocidas aplicables ni comprobaciones pendientes y los procesos desplegados usan los artefactos corregidos.
- [ ] El migrador ofrece `--dry-run` de solo lectura, rechaza ejecutarse contra cualquier base no loopback sin `--target-database` coincidente y, cuando recibe `--reviewed-sha256`/`--backup-ticket`, aborta ante cualquier diferencia; un ambiente sin declarar se trata como Producción.
- [ ] El artefacto de la API (o la imagen) no contiene configuración por ambiente ni secretos, y el release reverificó su `SHA-256` contra el manifiesto de la misma ejecución sin sobrescribir la configuración del servidor.
- [ ] `index.html` se sirve con `Cache-Control: no-cache`, mientras los assets JS/CSS y los chunks de traducción con hash usan `public, max-age=31536000, immutable`; la API responde `no-store` por defecto.
- [ ] La API comprime JSON en la propia aplicación; el servidor web/proxy no aplica compresión dinámica a la API, y la respuesta del token antifalsificación sale sin `Content-Encoding`.
- [ ] `/health/live` y `/health/ready` públicos no filtran detalles internos, y `/health/details` responde `401` sin sesión administrativa.
