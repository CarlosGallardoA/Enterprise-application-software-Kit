# Arquitectura Frontend — <NOMBRE_PROYECTO>

> Secciones obligatorias. Si una aún no aplica, escribir "No aplica todavía" y el motivo; no borrarla.
> Los valores de configuración (versiones, presupuestos de bundle, flags de TypeScript) se enlazan a su archivo fuente, nunca se copian.

## 1. Modelo mental

<Un párrafo: features autónomas con hexagonal + vertical slicing sobre un `core/` mínimo.>

## 2. Estructura y dependencias permitidas

| Carpeta | Responsabilidad | Puede importar |
| --- | --- | --- |
| `core/` | Shared kernel mínimo: HTTP, i18n, reloj, formato, componentes base. | Solo `core/` |
| `composition/` | Puentes entre features. | Features y `core/` |
| `features/<feature>/domain` | Reglas y tipos puros. | Nada externo |
| `features/<feature>/application` | Casos de uso y puertos. | `domain` |
| `features/<feature>/infrastructure` | Adaptadores HTTP y almacenamiento. | `application`, `domain`, `core/` |
| `features/<feature>/ui` | Componentes y rutas. | `application`, `core/` |

Configuración: ver `tsconfig.json`, la configuración de ESLint y los presupuestos de bundle del proyecto (enlazar con ruta relativa cuando existan).

## 3. Anatomía de una feature

<Árbol de carpetas de una feature y cuándo se divide en subcarpetas por flujo de usuario.>

## 4. ¿Dónde va cada cosa?

| Necesito… | Va en… |
| --- | --- |
| Llamar a la API | Adaptador en `infrastructure` que implementa un puerto |
| Traducir `reason` a un mensaje | Mapeador central de errores en `core/` |
| Formatear fecha, número o moneda | Helper/pipe único de `core/formatting` |
| Leer la hora | Token de reloj inyectado |
| Proteger una ruta | Guard que delega en un caso de uso |
| Cachear un catálogo | Caché TTL de `core/` |

## 5. Ejemplo de punta a punta

<Un flujo real: componente → caso de uso → puerto → adaptador HTTP → manejo de fallas tipadas e i18n.>

## 6. Composición e inyección

<Proveedores por feature, tokens de inyección en `<feature>.tokens.ts`, interceptores globales.>

## 7. Convenciones de nombrado

<kebab-case en archivos, `<x>.port.ts`/`XPort`, `<x>.use-case.ts`/`XUseCase`, tokens en SCREAMING_SNAKE.>

## 8. Rendimiento

<Rutas diferidas, presupuestos de bundle y cómo se ajustan, estrategia de caché.>

## 9. Estrategia de pruebas

<Unitarias, componentes, E2E con API simulada y E2E `-real`.>

## 10. Registros vivos

| Registro | Contenido | Cómo se regenera |
| --- | --- | --- |
| Archivos generados | <archivo — generador> | <comando> |
| Features con forma no default | <feature — forma — motivo> | Manual |

## 11. Anti-patrones prohibidos

- Lógica de negocio en componentes, guards o interceptores.
- Imports relativos ascendentes entre features.
- `innerHTML` interpolado o APIs que desactivan la sanitización.
- Colores, sombras o tipografías literales fuera de los tokens del sistema de diseño.
