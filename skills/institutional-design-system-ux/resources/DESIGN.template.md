---
name: <NOMBRE_PROYECTO>
description: <Descripción en una línea del sistema y de la organización a la que sirve>
colors:
  primario: "<HEX_PRIMARIO>"
  primario-strong: "color-mix(in srgb, <HEX_PRIMARIO>, black 15%)"
  secundario: "<HEX_SECUNDARIO>"
  acento: "<HEX_ACENTO>"
  acento-deep: "color-mix(in srgb, <HEX_ACENTO>, black 30%)"
  tinta: "<HEX_TINTA>"
  gris-medio: "<HEX_GRIS_MEDIO>"
  gris-claro: "<HEX_GRIS_CLARO>"
  blanco: "#ffffff"
  peligro: "<HEX_PELIGRO>"
  advertencia: "<HEX_ADVERTENCIA>"
typography:
  display:
    fontFamily: "<FUENTE_DISPLAY>, Arial, sans-serif"
    fontSize: "clamp(1.5rem, 4vw, 2.1rem)"
    fontWeight: 800
    lineHeight: 1.2
  title:
    fontFamily: "<FUENTE_DISPLAY>, Arial, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 700
    lineHeight: 1.2
  body:
    fontFamily: "<FUENTE_CUERPO>, Arial, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "<FUENTE_CUERPO>, Arial, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "<TRACKING_ETIQUETA>"
rounded:
  xs: "0.25rem"
  control: "0.35rem"
  sm: "0.5rem"
  md: "0.75rem"
  lg: "1rem"
  pill: "999px"
spacing:
  1: "0.25rem"
  2: "0.5rem"
  3: "0.75rem"
  4: "1rem"
  5: "1.5rem"
  6: "2.5rem"
motion:
  fast: "150ms"
  base: "220ms"
  slow: "320ms"
  ease: "cubic-bezier(0.16, 1, 0.3, 1)"
components:
  button-primary:
    backgroundColor: "{colors.primario}"
    textColor: "{colors.blanco}"
    rounded: "{rounded.sm}"
    padding: "0.75rem 1rem"
  button-primary-hover:
    backgroundColor: "{colors.primario-strong}"
  button-outline:
    backgroundColor: "{colors.blanco}"
    textColor: "{colors.primario}"
    rounded: "{rounded.sm}"
    padding: "0.75rem 1rem"
  button-danger:
    backgroundColor: "{colors.blanco}"
    textColor: "{colors.peligro}"
    rounded: "{rounded.sm}"
    padding: "0.75rem 1rem"
  card:
    backgroundColor: "{colors.blanco}"
    rounded: "{rounded.md}"
    padding: "1.5rem"
  status-badge:
    backgroundColor: "color-mix(in srgb, {colors.acento} 15%, white)"
    textColor: "{colors.acento-deep}"
    rounded: "{rounded.pill}"
    padding: "0.25rem 0.75rem"
  input:
    backgroundColor: "{colors.blanco}"
    textColor: "{colors.tinta}"
    rounded: "{rounded.control}"
    padding: "0.75rem"
---

# Sistema de Diseño: <NOMBRE_PROYECTO>

> El frontmatter es la fuente legible por herramientas; `tokens.css` es la fuente ejecutable. Ambos se actualizan en el mismo cambio y nunca se contradicen. Sustituir cada `<MARCADOR>` por el valor real del proyecto y borrar las secciones de componentes que no existan.

## Estrella Polar Visual

**Creative North Star: «<FRASE_RECTORA>»**

`<NOMBRE_PROYECTO>` comunica confianza institucional, claridad operativa y trazabilidad. La interfaz nunca compite por atención con el dato que muestra: jerarquía por tipografía y espaciado antes que por decoración, superficies planas en reposo y color de estado reservado exclusivamente a estatus, alertas y decisiones reales.

<Párrafo sobre la firma visual de la marca (por ejemplo, un degradado que hace eco del logotipo) y las pocas superficies permanentes donde aparece.>

**Características clave:**

- Plano en reposo; la elevación responde a interacción o a jerarquía deliberada, nunca es un tratamiento por defecto.
- Un solo acento de marca con degradado, reservado a superficies permanentes de identidad; el resto usa el color primario como acción y el acento como estado positivo o progreso.
- Escalas cerradas y auditadas de tipografía y espaciado (6 pasos cada una).
- Accesible por diseño: cada token de color documenta su razón de contraste junto a la declaración.
- Mobile-first: tablas que se convierten en tarjetas y líneas de tiempo que pasan a vertical antes que cualquier composición decorativa.

## Reglas Nombradas

1. **La Regla de las Dos Capas**: ningún componente o estilo fuera de `tokens.css` consume primitivos `--<prefijo-marca>-*` ni valores hexadecimales literales; todo pasa por tokens semánticos (`--color-*`).
2. **La Regla de los 6 Pasos**: escalas cerradas de 6 pasos en tipografía y espaciado, y 4 pasos en interlineado y elevación (más `--shadow-card: none` en reposo). Excepciones permitidas: tokens de display fluido (`clamp()`) para titulares y detalles finos de `1–2px` (bordes, `outline-offset`, separadores).
3. **La Regla de lo Plano en Reposo**: `--shadow-card: none` por defecto; la elevación responde solo a interacción o flotación real (modales, menús), aterrizando siempre en `:active`.
4. **La Regla del Degradado Escaso**: `--gradient-brand-surface` se aplica únicamente en superficies permanentes de marca (navegación lateral, portada de acceso).
5. **El Anillo de Foco Único**: `--focus-ring` para botones y enlaces y `--focus-ring-field` para campos de entrada, siempre acompañados de `outline: 2px solid transparent` para que el foco sobreviva en Alto Contraste, garantizando WCAG 1.4.11 y 2.4.7.

## Colors

Paleta oficial reducida y deliberada: <N> familias cromáticas más una escala de gris. Ningún componente referencia un primitivo ni un hex; solo los roles semánticos de abajo. Cada rol indica su razón de contraste medida y el fondo efectivo.

### Primary

- **<Nombre del primario>** (`<HEX_PRIMARIO>` → `--color-primary`): acción primaria, enlaces de acción, anillo de foco. Variante `-strong` (mezcla 15 % negro) para hover/pressed. Contraste: `<X.XX>:1` sobre `--color-surface`.

### Secondary

- **<Nombre del secundario>** (`<HEX_SECUNDARIO>` → `--color-secondary`): pestañas, series de gráfico y acentos de la misma familia.

### Tertiary / Acento

- **<Nombre del acento>** (`<HEX_ACENTO>` → `--color-accent`): selección, progreso y estado positivo. Si el tono puro no alcanza `4.5:1` como texto, se usa solo la variante `-deep` sobre fondos claros (`<X.XX>:1`).

### Neutral

- **Tinta** (`--color-ink`): texto primario, `<X.XX>:1` sobre blanco.
- **Tinta atenuada** (`--color-ink-muted`): gris medio mezclado hacia tinta; el gris medio puro nunca se usa como texto (`<X.XX>:1` sobre blanco y sobre `--color-surface-muted`).
- **Superficie atenuada** (`--color-surface-muted`): fondos de sección, chips inactivos, estado deshabilitado.
- **Borde** (`--color-border`): mezcla con `>= 3:1` de contorno (WCAG 1.4.11), `<X.XX>:1`.

### Estado (fuera de la paleta de marca, a propósito)

- **Peligro** (`--color-danger`): errores y acciones destructivas.
- **Advertencia** (`--color-warning`): advertencias genéricas, distinta de cualquier ámbar con significado propio.

### Verificación de contraste

Herramienta usada para comprobar cada cifra: `<HERRAMIENTA>` (por ejemplo, axe-core en las pruebas E2E sobre los selectores reales, el analizador de contraste del navegador o un script del proyecto sobre pares de tokens). Al cambiar un primitivo o una mezcla se recalculan todas las cifras que dependen de él en el mismo cambio.

## Typography

**Fuente display:** `<FUENTE_DISPLAY>` — títulos de página, marca y valores grandes de indicador.
**Fuente de cuerpo:** `<FUENTE_CUERPO>` — cuerpo, botones, etiquetas y celdas.
**Carácter:** <por qué esta pareja sirve a densidades altas de datos>. Fuentes auto-hospedadas, sin dependencia de red en tiempo de ejecución.

### Jerarquía

- **Display** (800, `--text-display-fluid`): `.page-title`, único título con `clamp()` propio, fuera de la escala de 6 pasos a propósito.
- **Title** (700, `--text-md`): subtítulos de tarjeta y títulos de sección.
- **Body** (400, `--text-base`): cuerpo, valores de campo y botones.
- **Secundario/Tabla** (400, `--text-sm`): texto secundario, celdas, etiquetas y ayudas.
- **Etiqueta/Eyebrow** (700, `--text-xs`, mayúsculas con tracking): eyebrow de página, insignias de estatus.

### Pesos

`400` cuerpo, `600` (`--font-weight-semibold`) énfasis secundario sin competir con títulos, `700` títulos de sección, `800` display.

### Interlineado

`--leading-none` (`1`) para insignias e íconos, `--leading-tight` (`1.2`) para títulos, `--leading-snug` (`1.35`) para etiquetas y celdas, `--leading-normal` (`1.5`) para cuerpo y ayudas.

## Layout

Mobile-first con breakpoints compartidos `48rem` (tablas pasan de tarjetas apiladas a filas) y `64rem` (formularios a dos columnas); breakpoints más finos quedan locales al componente que los necesita. Las rejillas de campos usan `repeat(auto-fit, minmax(min(100%, Xrem), 1fr))` y `minmax(0, 1fr)` para adaptarse al contenedor real, no al viewport. Espaciado siempre con `--space-*`, salvo detalles finos de `1–2px`; un valor estructural propio se nombra como token (`--<nombre>`).

## Elevation & Depth

Sistema plano por defecto: tarjetas con `box-shadow: var(--shadow-card)` (`none`) y separación por borde de `1px` en `--color-border`. Vocabulario de elevación de 4 pasos compuesto con `color-mix`:

- **sm**: borde sutil de tarjeta si alguna vez se necesita.
- **md**: hover de botón primario y de tarjeta (`--shadow-card-hover`).
- **lg**: elementos destacados puntuales.
- **floating**: diálogos, menús y popovers.

Los halos de énfasis repetidos (zona de arrastre, paso activo, estado vacío) se nombran como `--shadow-ring-*` / `--shadow-halo-*`; nunca se escriben a mano en un componente.

### El Anillo de Foco

`--focus-ring` (superficie + banda primaria, parametrizado por `--ring-width` y `--ring-width-action`), `--focus-ring-danger` y `--focus-ring-inset` para elementos recortados por `overflow`. Los campos usan `--focus-ring-field` (borde primario de `1px` + `1px` del token = `2px`). Toda regla de foco declara también `outline: 2px solid transparent` (y `outline-offset` si hace falta), porque Alto Contraste elimina `box-shadow` y pinta el contorno con el color del sistema. Cuando un componente necesita otro tratamiento, se añade `@media (forced-colors: active)` con colores del sistema (`Highlight`, `CanvasText`). Checkbox y radio nativos conservan `outline: 2px solid var(--color-primary)` con `outline-offset: 2px`, documentado con marcador de excepción.

## Motion

Vocabulario cerrado de animación y tempo compartido (`--motion-fast`, `--motion-base`, `--motion-slow`, `--motion-ease`, `--motion-ease-emphasized`). Prohibido `transition: all` y los milisegundos o curvas literales.

| Situación | Patrón |
| --- | --- |
| Esqueleto → contenido real, misma posición | `fade-in` |
| Panel, banner o alerta que antes no existía | `rise-in` |
| Popover, menú o paleta de comandos | `scale-in` / `scale-out` |
| Divulgación o submenú | `collapse-in` / `collapse-out` |
| Validación fallida | `shake` suave |
| Cabecera, título, barra de filtros | **ninguna**: el cromo no se anima, solo los datos |

Todo lo que sube en `:hover` aterriza en `:active` (`translateY(0)`). `@media (prefers-reduced-motion: reduce)` colapsa duraciones y desplazamientos.

## Shapes

`--radius-control` para controles interactivos, `--radius-sm` para botones y alertas, `--radius-md`/`--radius-lg` para tarjetas y `--radius-pill` para todo lo que comunica categoría o estado (insignias, chips, pestañas). Bordes de `1px` en `--color-border`; nunca doble borde ni contornos gruesos.

## Components

### Buttons

- **Forma:** `--radius-sm`, relleno `--space-3 --space-4`, objetivo mínimo `44 × 44 px`.
- **Variantes:** primario, contorno, secundario y peligro. No se inventa una cuarta variante de jerarquía.
- **Estados:** hover eleva y `:active` aterriza; deshabilitado baja opacidad sin transformación; `:focus-visible` usa el anillo de foco con contorno transparente.
- **Solo ícono:** exige `aria-label` traducido, nunca solo `title`.

### Chips / Insignias

- **Insignia de estatus:** píldora con punto o ícono del mismo color que el texto; el estado nunca depende solo del color.
- **Chip neutral** y **chip removible** con el mismo molde.

### Cards / Containers

`--radius-md`, fondo `--color-surface`, `--shadow-card` en reposo, borde `1px` `--color-border`, relleno `--space-5` en escritorio y `--space-4` en móvil.

### Inputs / Fields

Borde `1px` `--color-border`, `--radius-control`, altura mínima de `44 px`. Foco: borde primario + `--focus-ring-field` + contorno transparente. Error: borde `--color-danger` y mensaje asociado por `aria-describedby`. Los selectores buscables usan el componente compartido, no `<select>` nativo.

### Cabecera de página

Eyebrow en pantallas de primer nivel; migas de pan en vistas alcanzadas desde otra (nunca ambos, nunca ninguno). Contador dentro del `h1`. Máximo un botón primario y uno secundario; bajo `48rem` ocupan el ancho disponible.

### Navegación

Pestañas con patrón ARIA tablist completo (flechas, Home/End, `tabindex` rotatorio); navegación por rutas como `<nav>`, no como tablist. Menú lateral móvil como diálogo con foco retenido y retorno al disparador.

### Alertas inline

Borde lateral en el color semántico, fondo tenue con `color-mix` y texto saturado. Cuatro roles (error, éxito, información, advertencia); nunca un quinto color.

### Estados de listado (carga / error / vacío)

Un único componente compartido (`<LIST_STATE_COMPONENT>`) decide qué rama mostrar: esqueleto mientras carga, error con reintento cuando falla (sin mostrar a la vez el vacío) y vacío con su acción cuando la respuesta correcta no trae datos. Las vistas no reimplementan esas ramas.

### Diálogos modales

`--shadow-floating`, `--radius-md`, ancho acotado, trampa de foco, `Escape` y retorno de foco. Durante una escritura: `aria-busy="true"`, sin doble envío y con cancelación bloqueada; ante rechazo se conservan los datos.

### Estado persistente de guardado

Indicador inline (`idle`, `dirty`, `saving`, `saved`) junto a las acciones de borrador, con `role="status"` y `aria-live="polite"`. «Guardar y avanzar» emite un único toast tras confirmar la escritura y completar la navegación.

### Historial en línea de tiempo

Marcador con ícono semántico y conector continuo, transición `[• Estado anterior] → [• Estado nuevo]`, autor con rol, marca de tiempo alineada y comentario opcional. Prohibidas las listas planas improvisadas.

## Componente vs. Clase CSS

Regla: **clase CSS** cuando lo que se repite es apariencia; **componente** cuando lo que se repite es comportamiento o cableado ARIA. Cada componente compartido se vuelve API pública permanente con su propia prueba.

| Necesidad | Veredicto |
| --- | --- |
| Cabecera de página | Componente: tiene lógica condicional (contador, migas o eyebrow). |
| Shell de listado o formulario (rejilla) | Clase CSS: composición pura, sin lógica. |
| Bloque carga/error/vacío/datos | Componente: control repetido con reintento y claves de traducción. |
| Pestañas | Componente: lo que diverge es ARIA y teclado, no el CSS. |
| Error de campo / estado inválido | Directiva + componente: dos anfitriones distintos (campo y mensaje). |
| Tabla de datos genérica | <Veredicto del proyecto y su razón>. |

## Patrones Operativos Obligatorios

- **Cabecera de página**: eyebrow en primer nivel; migas de pan en vistas hijas (nunca ambos, nunca ninguno).
- **Expedientes y formularios**: secciones numeradas coherentes, resumen contextual previo a ancho completo, controles Sí/No segmentados de `44 px` y rejillas adaptadas al contenedor (`auto-fit, minmax(...)`).
- **Listados y tablas**: filtro uniforme, transformación automática a tarjetas apiladas bajo `48rem` sin ocultar columnas ni truncar nombres, estados de carga/error/vacío por el componente compartido y bitácoras en línea de tiempo vertical estándar.
- **Retroalimentación**: indicador inline de guardado (`idle`/`dirty`/`saving`/`saved`), toast único de «Guardar y avanzar» tras completar la navegación y modales con bloqueo `aria-busy` y preservación de datos ante error.

## Do's and Don'ts

### Do:

- **Do** consumir siempre tokens semánticos `--color-*`, `--text-*`, `--space-*`, `--radius-*`, `--shadow-*` y `--motion-*`.
- **Do** mantener las tarjetas planas en reposo y usar sombra solo como respuesta a interacción o jerarquía deliberada.
- **Do** acompañar todo color de estado con una señal no cromática (punto, ícono, texto).
- **Do** declarar `outline: 2px solid transparent` junto a cada anillo de foco.
- **Do** documentar la razón de contraste junto a cada token de color y comprobarla con `<HERRAMIENTA>`.
- **Do** usar `auto-fit` / `minmax` en rejillas de formulario en lugar de columnas fijas con `@media`.

### Don't:

- **Don't** introducir un color, tamaño o espaciado fuera de escala sin excepción documentada (display fluido, detalle de `1–2px`, token estructural con nombre).
- **Don't** usar el acento o el gris medio puros como texto si no alcanzan `4.5:1`; usar sus variantes mezcladas.
- **Don't** dibujar el foco solo con `box-shadow` ni usar `outline: none` sin indicador equivalente.
- **Don't** forzar scroll horizontal en móvil para tablas o líneas de tiempo.
- **Don't** animar el cromo estructural ni usar `transition: all`.

## Verificación

- `check-design-system.mjs` (o el equivalente del proyecto) dentro de `lint`: hex, primitivos, `transition: all`, foco y textos literales.
- `check-i18n-parity.mjs` con `--check-usage` (o una prueba de resolución de claves) para paridad y claves existentes.
- `<HERRAMIENTA>` para las razones de contraste documentadas.
