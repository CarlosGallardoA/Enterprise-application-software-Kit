# Guía de Desarrollo <STACK> — <NOMBRE_PROYECTO>

Receta práctica para agregar funcionalidad sin romper la arquitectura. Las reglas normativas viven en `docs/arquitectura/` y `docs/estandares/`; esta guía las aplica paso a paso.

## 1. Preparar el entorno

<Versiones requeridas (enlazar a `global.json` / `.node-version`), comandos de restauración, base local desechable.>

## 2. Agregar un caso de uso nuevo

1. Identificar la feature y la forma del slice.
2. Definir el contrato de entrada con su validación de formato y largo máximo igual a la columna.
3. Escribir la prueba del caso de uso con fakes del puerto.
4. Implementar el caso de uso y su resultado tipado (`Outcome` + `FailureReason`).
5. Implementar el adaptador y su prueba de integración contra la base desechable.
6. Exponer el endpoint/ruta y registrarlo explícitamente en la raíz de composición.
7. Documentar el endpoint en el catálogo `.http` y, si es un flujo de usuario, agregar su E2E y registrarlo en `AGENTS.md`.

## 3. Comandos de verificación

<build, test, lint, format:check, validadores del kit.>

## 4. Checklist de PR

- [ ] La feature respeta las capas y el validador de fronteras pasa.
- [ ] Todo texto de entrada declara el mismo largo máximo que su columna y su formulario.
- [ ] Las fallas de negocio devuelven `reason` estable y están declaradas en el endpoint.
- [ ] La autorización se verifica en el servidor, incluida la propiedad del recurso.
- [ ] Las consultas de lectura no usan tracking, proyectan solo lo necesario y paginan con desempate por clave primaria.
- [ ] No hay datos sensibles en logs ni valores sensibles en la bitácora.
- [ ] Las pruebas nuevas pasan y ninguna existente se debilitó.
- [ ] Textos nuevos en todos los idiomas, sin claves faltantes.
- [ ] El catálogo de endpoints, los registros vivos y `docs/historial/changelog.md` están actualizados.
- [ ] `0 warnings, 0 errors` y formateadores en modo verificación sin cambios.
