# Informe de seguridad de tecnologías — <NOMBRE_PROYECTO>

Informe vigente de la compuerta obligatoria definida en [`docs/reglas/seguridad-de-tecnologias.md`](../reglas/seguridad-de-tecnologias.md). Se reemplaza con cada revalidación (tras actualizar componentes, antes de publicar y ante un aviso nuevo); el historial de corridas queda en [`docs/historial/changelog.md`](../historial/changelog.md). Nunca persistir secretos ni volcados completos de variables de entorno.

## Estado

**BLOQUEADO** — informe inicial generado por el scaffold; todavía no se ejecutó la compuerta sobre un inventario real. Reemplazar por `APROBADO` o `BLOQUEADO` con su motivo verificable.

## Alcance de la corrida

| Campo | Valor |
| --- | --- |
| Fecha/hora UTC | `<AAAA-MM-DDTHH:MM:SSZ>` |
| Commit evaluado | `<sha completo>` |
| Entornos / artefactos inspeccionados | `<desarrollo, CI, imagen/servidor, artefacto exacto>` |
| Hashes / digests evaluados | `<SHA-256 de artefactos, digest de imágenes>` |

## Inventario y soporte

| Componente | Tipo (runtime, dependencia directa/transitiva/dev, biblioteca nativa, herramienta CI, SO, imagen) | Versión exacta | Soporte vigente (fuente oficial) | Avisos aplicables | Estado |
| --- | --- | --- | --- | --- | --- |
| `<componente>` | `<tipo>` | `<x.y.z>` | `<URL oficial + fecha de fin de soporte>` | `<CVE/GHSA o "ninguno">` | `<APROBADO/BLOQUEADO>` |

## Herramientas, comandos y resultados

| Herramienta (fecha de su base de avisos) | Comando ejecutado | Código de salida | Resultado |
| --- | --- | --- | --- |
| `<escáner>` | `<comando exacto>` | `<0/1>` | `<resumen sin secretos>` |

## Hallazgos y resoluciones

- `<CVE/GHSA>` — `<componente y versión>` — `<actualizado/sustituido/retirado>` — `<verificación posterior>`.

## Limitaciones y comprobaciones pendientes

- `<qué no se pudo inspeccionar y por qué>`. Cualquier punto aquí mantiene el estado en `BLOQUEADO`.
