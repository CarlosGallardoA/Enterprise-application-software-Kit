# Tokens Semánticos, Escalas Cerradas, Foco y Movimiento

## 1. Arquitectura de dos capas en `tokens.css`

- **Primitivos (`--brand-*`)**: reflejan 1:1 la identidad cromática de la organización. Si un tono puro de marca (como un teal medio o un gris medio) no alcanza contraste WCAG AA sobre blanco, nunca se usa directo como texto: en la capa semántica se deriva una mezcla oscura (`color-mix(in srgb, var(--brand-accent), black 30%)`) verificada a `>= 4.5:1` para texto y `>= 3:1` para bordes.
- **Semánticos (`--color-*`)**: nombran la **función** (`--color-primary`, `--color-ink`, `--color-ink-muted`, `--color-surface`, `--color-surface-muted`, `--color-border`, `--color-danger`, `--color-warning`, `--color-status-positive`).

### Auditoría de contraste sobre superficie efectiva
En fichas oscuras o paneles laterales coloreados (ej. ficha azul de contexto de un expediente):
- Ningún campo descendiente recibe fondo claro de tarjeta; mantienen fondo transparente.
- Los títulos de sección, etiquetas secundarias y valores usan tokens dedicados verificados matemáticamente contra el azul de fondo real (nunca asumiendo blanco detrás).

### Documentar y comprobar cada razón de contraste
- Cada token semántico usado como texto, borde o indicador lleva junto a su declaración la razón calculada y el fondo contra el que se midió (`--color-ink-muted: ...; /* 5.41:1 sobre --color-surface, 4.62:1 sobre --color-surface-muted */`). Una mezcla `color-mix` sin cifra es una suposición, no una auditoría.
- `DESIGN.md` nombra la herramienta con la que se comprueban esas cifras: el analizador de contraste de las herramientas de desarrollo del navegador, axe-core dentro de las pruebas E2E sobre los selectores reales, o un script del proyecto que calcule la luminancia relativa de pares de tokens. Los validadores de esta skill no miden contraste.
- Al cambiar un primitivo o una mezcla, se recalculan y actualizan todas las cifras que dependen de él en el mismo cambio.

## 2. Escalas cerradas

- **Tipografía (6 pasos + 1 display fluido)**:
  - `--text-xs` (`0.75rem`), `--text-sm` (`0.875rem`), `--text-base` (`1rem`), `--text-md` (`1.125rem`), `--text-lg` (`1.25rem`), `--text-xl` (`1.5rem`), más `--text-display-fluid` (`clamp(1.5rem, 4vw, 2.1rem)` exclusivo para `.page-title`).
- **Pesos formales (4 valores, consumidos siempre como `--font-weight-*`)**: `400` (cuerpo), `600` (énfasis secundario/sub-etiquetas sin competir con títulos), `700` (títulos de sección), `800` (display). Solo los descriptores `@font-face` declaran pesos numéricos.
- **Verificación**: `check-design-system.mjs` rechaza `font-size` fuera de `var(--text-*)` (`font-scale`), `line-height` numérico fuera de `var(--leading-*)` (`leading-scale`) y `font-weight` numérico o `bold` fuera de `var(--font-weight-*)` (`font-weight-scale`), también dentro del atajo `font:`. Una excepción real (texto de un componente de terceros, impresión) lleva marcador `design-system-allow` con motivo.
- **Interlineado (4 pasos)**: `--leading-none` (`1`), `--leading-tight` (`1.2`), `--leading-snug` (`1.35`), `--leading-normal` (`1.5`).
- **Espaciado (6 pasos)**: `--space-1` (`0.25rem`), `--space-2` (`0.5rem`), `--space-3` (`0.75rem`), `--space-4` (`1rem`), `--space-5` (`1.5rem`), `--space-6` (`2.5rem`).
  - **Excepción de detalle fino (`1–2px`)**: grosores de borde, `outline-offset`, separadores de un píxel y ajustes ópticos mínimos (centrar un ícono, compensar un borde) pueden declararse en `px` literales porque no son espaciado de composición. Cualquier margen, relleno, `gap` o desplazamiento mayor usa `--space-*`; si un valor estructural propio se repite (sangría de árbol, ancho de columna de acciones), se nombra como token en `tokens.css` (`--tree-indent`) en lugar de quedar como literal.
- **Sombras (plano en reposo + 4 pasos de elevación, compuestos con `color-mix`, nunca `rgba` arbitrarios)**:
  - Reposo: `--shadow-card: none` (con `--shadow-card-hover` apuntando a `--shadow-md`).
  - Elevación: `--shadow-sm`, `--shadow-md` (hover puntual), `--shadow-lg` (elementos destacados), `--shadow-floating` (diálogos/popovers).
- **Anillos y halos de énfasis (no de foco)**: los halos translúcidos repetidos (zona de arrastre activa, paso actual de una línea de tiempo, ícono de estado vacío, fila seleccionada) se nombran como tokens `--shadow-ring-*` y `--shadow-halo-*` compuestos con `color-mix`. Una sombra `0 0 0 Npx color-mix(...)` escrita a mano en un componente es un halo sin tokenizar. Los anillos de foco son exclusivamente `--focus-ring*`.
- **Verificación de sombras**: `flat-at-rest` rechaza una sombra en reposo (fuera de `none`, `var(--shadow-card)` o `var(--shadow-floating)`) en selectores cuyo elemento final es una tarjeta, panel, franja, mosaico, fila, chip o superficie sin estado interactivo (`:hover`, `:focus`, `:active`, `[open]`, `.is-*`, modificadores `--selected`/`--active`…). `shadow-literal` rechaza una sombra que repite literalmente el valor de un token `--shadow-*` y `shadow-ring-literal` un halo `0 0 0 Npx color-mix(...)` sin token.

## 3. Anillo de foco único y soporte de Alto Contraste

- Botones, enlaces, pestañas y filas interactivas usan un único token sólido de doble halo, parametrizado por anchos:
  `--focus-ring: 0 0 0 var(--ring-width) var(--color-surface), 0 0 0 calc(var(--ring-width) + var(--ring-width-action)) var(--color-primary)` (con `--ring-width: 2px` y `--ring-width-action: 2px` resulta en `0 0 0 2px` superficie + `0 0 0 4px` primario), más `--focus-ring-danger` y `--focus-ring-inset` dentro de contenedores con `overflow` recortado.
- Campos de texto con borde propio usan `--focus-ring-field: 0 0 0 1px var(--color-primary)`: el borde de `1px` ya pasa a `--color-primary` al enfocar y el token añade `1px` más, para un contorno total de `2px` (`>= 3:1` sobre la superficie) sin el halo grueso de los botones (`--focus-ring-field-danger` en error).
- **El anillo nunca viaja solo**: Windows Alto Contraste (`forced-colors: active`) elimina `box-shadow`, de modo que un foco dibujado solo con sombra desaparece. Toda regla de foco conserva un contorno transparente junto al anillo:

  ```css
  .btn:focus-visible {
    outline: 2px solid transparent; /* invisible en modo normal; el sistema lo pinta en Alto Contraste */
    outline-offset: 2px;
    box-shadow: var(--focus-ring);
  }

  @media (forced-colors: active) {
    /* Solo si un componente necesita algo distinto del contorno transparente. */
    .segmented-choice__option--selected { border-color: Highlight; }
  }
  ```

  `outline: none` en una regla de foco solo es válido si otra propiedad que sobrevive en Alto Contraste (borde, contorno de un contenedor `:focus-within`) señala el foco, o si un bloque `@media (forced-colors: active)` de la misma hoja lo restituye con colores del sistema (`Highlight`, `CanvasText`).
- Checkboxes y radios nativos conservan `outline: 2px solid var(--color-primary); outline-offset: 2px` (visible también en modo normal), documentado con un marcador de excepción porque es la única regla de foco que no consume `--focus-ring*`.
- `check-design-system.mjs --require-forced-colors-focus` reporta las reglas de foco que eliminan el contorno y dependen solo de `box-shadow`.

## 4. Vocabulario cerrado de animación

Prohibido `transition: all`. El cromo estructural (cabecera, barra lateral, filtros) **no se anima**; solo se animan las transiciones de datos:

| Situación | Patrón |
| --- | --- |
| Esqueleto de carga → contenido real en el mismo sitio | `fade-in` (un desplazamiento vertical aquí se percibe como salto brusco) |
| Banner, panel o alerta que aparece por primera vez | `rise-in` |
| Menú flotante, diálogo o paleta de comandos | `scale-in` / `scale-out` |
| Acordeón o divulgación progresiva | `collapse-in` / `collapse-out` |
| Rechazo de validación | `shake` suave |

Las duraciones y curvas salen de tokens compartidos para que todo se mueva al mismo tempo: `--motion-fast` (`150ms`, microinteracciones), `--motion-base` (`220ms`, entradas y salidas), `--motion-slow` (`320ms`, paneles y diálogos), `--motion-ease` (desaceleración suave) y `--motion-ease-emphasized` (entradas con énfasis). Ninguna animación declara milisegundos ni `cubic-bezier` literales.

Incluir siempre `@media (prefers-reduced-motion: reduce)` colapsando duraciones y desplazamientos.
