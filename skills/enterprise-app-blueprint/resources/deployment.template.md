# Despliegue y Migraciones — <NOMBRE_PROYECTO>

Procedimiento operativo por ambiente. Reglas completas en la skill `production-release-and-migrations`.

## 1. Perfil de hospedaje por ambiente

| Ambiente | Perfil | Servidor/host | Base de datos |
| --- | --- | --- | --- |
| QA | <Windows + IIS / Linux + Docker> | <host> | <servidor/base> |
| PreProd | <...> | <...> | <...> |
| Producción | <...> | <...> | <...> |

## 2. Dónde vive la configuración

- **Windows + IIS**: `appsettings.{Ambiente}.json`, `web.config` y variables del App Pool, creados una vez en el servidor. El release copia excluyendo esos archivos y nunca los sobrescribe.
- **Linux + Docker**: variables de entorno, `env_file` fuera del repositorio o *Docker secrets*. La imagen no contiene configuración por ambiente.
- Secretos de integraciones: identidad administrada o certificado; registrar aquí la fecha de retiro de cualquier *client secret* heredado.

## 3. Artefactos y verificación

<Nombre de los artefactos, manifiesto `SHA-256`, comando de reverificación en el release.>

## 4. Migraciones

1. `--dry-run` contra el destino.
2. Respaldo con restauración comprobada.
3. Revisión del `migrations.sql` del artefacto de revisión cuando el DBA lo pide.
4. Migrador con `--target-database` (y los argumentos opcionales que el ambiente adopte).
5. Verificación del historial de migraciones, semillas y `/health/ready`.

Migraciones con DDL bloqueante: <lista con duración medida y ventana acordada>.

## 5. Pasos del release

<Pasos concretos del perfil del ambiente: detener App Pool / reemplazar contenedor, copiar con exclusiones / levantar por digest, confirmar salud.>

## 6. Verificación post-despliegue

<Copiar el checklist post-despliegue aplicable y marcarlo en cada release.>

## 7. Runbook de diagnóstico

- Bloqueos en la base de datos: <ruta del script de solo lectura y cómo interpretarlo>.
- Logs: ver [logs.md](./logs.md).
