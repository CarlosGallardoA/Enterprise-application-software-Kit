# Patrones de UX Operativa, Tablas, Líneas de Tiempo e i18n Segura

## 1. Estándar de Vistas Operativas y Expedientes

- **Cabeceras de página consistentes (`PageHeader`)**:
  - Pantallas de primer nivel (listados, panel principal): usan **eyebrow** superior + `<h1 class="page-title">` (con el contador dentro del `h1`, nunca suelto al lado).
  - Pantallas alcanzadas desde otra (detalle de expediente, alta/edición): usan **migas de pan (`breadcrumbs`)** con área interactiva mínima de `44 × 44 px`.
  - Nunca combinar eyebrow y breadcrumbs a la vez, ni dejar una vista huérfana sin ninguno. Máximo 1 botón primario y 1 secundario en la cabecera; bajo `48rem` ocupan el ancho disponible.
- **Expediente completo**:
  - Ficha contextual lateral a la izquierda (apilada arriba en móvil) + área principal de pestañas/secciones a la derecha.
  - Resúmenes contextuales preceden a las secciones numeradas ocupando todo el ancho útil, con orden visual idéntico al orden del DOM.
- **Secciones numeradas**:
  - Cada tarjeta numerada abarca su encabezado a todo lo ancho y agrupa en su cuerpo descripción, campos, validación y acciones. Nunca anidar una tarjeta numerada dentro del encabezado de otra.
- **Controles binarios Sí/No uniformes**:
  - Grupo segmentado (`segmented-choice`) con botones de `44 px` dentro de marco de `46 px`, ancho/altura intrínseca (sin estirarse con la fila de la rejilla), conservando estado «sin responder», navegación por teclado y textos largos en cualquier idioma.

## 2. Listados, Tablas Documentales y Árboles Jerárquicos

- **Listados operativos y administrativos unificados**:
  - Reutilizar una única composición de filtros + tabla en todos los módulos.
  - Bajo `48rem` (`768px`), las tablas se transforman en **tarjetas verticales apiladas** conservando absolutamente todas las columnas, etiquetas y acciones (prohibido ocultar datos o truncar identificadores con `...` para fingir que caben).
  - **Ordenar en móvil**: si la tabla permite ordenar, al pasar a tarjetas el control de orden no desaparece con los `<th>`: un bloque de orden móvil reutiliza el mismo componente de cabecera ordenable, visible antes de las tarjetas. En escritorio el botón vive en el `<th>` con `aria-sort` reflejando el estado.
  - En búsquedas con botón junto al campo de texto, ambos comparten la fila del control; el mensaje de error inferior nunca empuja ni desalinea el botón.
- **Tablas documentales**:
  - En escritorio las celdas mantienen `display: table-cell` real; cualquier contenedor `flex` para alinear insignia de extensión + nombre vive en un wrapper interno dentro de la celda para no romper bordes ni alineación vertical de filas.
  - Separar siempre el permiso de **previsualizar en memoria** (`view`) del permiso de **descargar a disco** (`download`). Cuando `canDownload = false`, el visor modal suprime controles de descarga y atajos de guardado/impresión.
- **Árboles administrativos**:
  - Mantener la paginación fuera del elemento `role="table"`, botones de expansión con `aria-expanded` real, texto accesible que indique el nivel jerárquico y formularios inline ocupando una fila completa cuando aplique.

## 3. Estados de Carga, Error y Vacío, Esqueletos e Indicador de Guardado

### Un único componente de estado de listado
Todo listado, búsqueda o panel que depende de una petición delega sus ramas en **un solo componente compartido** (p. ej. `<app-list-state>`), en lugar de repetir en cada vista el mismo bloque de condicionales:
- **Orden de precedencia fijo**: error → carga → vacío → datos. Una petición fallida muestra el error con su acción de reintento y **nunca** presenta a la vez el estado vacío (un fallo no equivale a «no hay resultados»).
- **Contrato mínimo**: entradas `loading`, `empty` y error (preferiblemente como **clave de traducción**, resuelta por el propio componente para que funcione con scopes diferidos); etiqueta accesible de carga obligatoria; ranuras proyectadas para las acciones de recuperación (`errorActions`) y las del estado vacío (`emptyActions`), separadas de la alerta con `--space-3`.
- **Vacío útil**: ícono decorativo con `aria-hidden`, título y ayuda traducidos y, cuando el permiso lo permite, la acción que resuelve el vacío (crear, limpiar filtros).
- **Sin duplicación**: una vista que necesite un estado distinto amplía el componente con una entrada nueva y su prueba; no copia las ramas localmente. El componente envuelve el contenido real (`<ng-content>` o `children`), así que la tabla o el formulario siguen siendo de la feature.

### Esqueletos de carga
- El esqueleto reproduce la **forma del contenido final** (tabla con N columnas y filas, formulario con N campos y resumen opcional) para que el reemplazo no desplace el layout; su variante se elige desde el componente de estado (`skeleton: 'table' | 'form' | 'none'`).
- Las piezas del esqueleto son decorativas (`aria-hidden="true"`); el contenedor expone `role="status"` con una etiqueta traducida real («Cargando usuarios…»), para que el lector de pantalla anuncie la espera una sola vez.
- El paso de esqueleto a contenido usa `fade-in` en la misma posición (nunca `rise-in`), y el brillo animado respeta `prefers-reduced-motion`.
- No mostrar un esqueleto para respuestas instantáneas recurrentes (refrescos por sondeo): se conserva el contenido anterior mientras llega el nuevo.

### Indicador persistente de guardado
- Componente inline junto a las acciones de borrador con estados `idle` (silencioso), `dirty` (cambios locales sin guardar, ícono de advertencia), `saving` (indicador giratorio + «Guardando…») y `saved` (ícono de verificación en el color de estado positivo profundo).
- Anuncio no obstructivo con `role="status"` y `aria-live="polite"`; el color nunca es la única señal (ícono + texto en cada estado).
- El estado `saved` refleja **la escritura confirmada del intento actual**: una marca de una visita anterior no confirma nada, y un error o conflicto devuelve el estado a `dirty` conservando los datos.
- Convive con el toast único de «Guardar y avanzar»: el indicador inline cubre el guardado sin salir de la pantalla; el toast, el guardado que navega al paso siguiente. Nunca se duplican para la misma acción.

## 4. Historiales y Trazabilidad en Línea de Tiempo Vertical

Quedan prohibidas las listas planas improvisadas para bitácoras de expedientes. Todo historial implementa una línea de tiempo vertical estandarizada con:
- Marcador lateral con ícono semántico y conector continuo.
- Transición explícita de estatus `[• Estado Anterior] → [• Estado Nuevo]` con insignias donde el estado nunca depende únicamente del color (incluye punto o ícono acompañante).
- Metadatos de autor (nombre + rol), marca de tiempo alineada y tarjeta de comentario/justificación cuando exista, todo reactivo al cambio de idioma en tiempo de ejecución.

## 5. Internacionalización Segura fuera de Plantillas (`translateLoaded`)

### El fallo clásico en producción
En librerías de i18n con carga perezosa por ruta, la función imperativa `translate(key)` suele ser **síncrona**: si un interceptor o bloque `catch` dispara un toast antes de que termine la descarga HTTP de `/i18n/<scope>/<lang>.json`, `translate()` devuelve la clave cruda literal (`"auth.sessionExpired"`) o un `load()` mal invocado lanza excepción dentro del manejador global y derriba la pantalla completa.

### Solución obligatoria
1. Crear un único helper asíncrono `translateLoaded(i18n, key, params?)` en `core/i18n/`:
   - Si la traducción ya está cargada en memoria y resuelve distinto de la clave cruda, retorna de inmediato (camino rápido síncrono envuelto).
   - Si aún no cargó, extrae el `<scope>` de la clave, espera de forma segura la carga de `<scope>/<activeLang>` capturando errores de red con fallback legible, y luego traduce.
2. Prohibir mediante regla de linter llamar `toast.*(i18n.translate(...))` directamente en features.
3. Si se convierte un stream reactivo de cambio de idioma en estado reactivo de UI (`signal`), diferir su emisión al microtask/scheduler siguiente para no mutar señales sincrónicamente en medio del renderizado.

## 6. Paleta de Comandos (`Ctrl+K` / `Cmd+K`) y Cero PII en Almacenamiento del Navegador

En sistemas operativos densos, ofrecer una paleta de comandos global activable con `Ctrl+K` / `Cmd+K` acelera la navegación y búsqueda sin levantar las manos del teclado:

1. **Accesibilidad y ergonomía de teclado**:
   - Diálogo modal con `role="combobox"`, `aria-expanded`, `aria-controls` y `aria-activedescendant` sincronizado al navegar con `ArrowUp`/`ArrowDown`, ejecución con `Enter`, cierre con `Escape` y devolución limpia del foco al elemento previo.
2. **Autorización y cancelación de búsquedas en vuelo**:
   - Mostrar únicamente rutas y comandos permitidos por los permisos vigentes de la sesión actual.
   - Delegar las búsquedas remotas (expedientes, colas pendientes) en casos de uso con *debounce* y cancelación inmediata de peticiones anteriores cuando el usuario sigue escribiendo o cierra la paleta.
3. **Higiene estricta de `localStorage` en «Recientes» (Cero PII)**:
   - En la lista de elementos recientes, persistir en `localStorage` **exclusivamente claves o rutas de navegación estáticas** (ej. `"nav.incidents"`, `"/enfermeria"`).
   - **Prohibido** persistir en `localStorage` o `sessionStorage` números de expediente, nombres de personas, descripciones o metadatos devueltos por búsquedas (en equipos institucionales compartidos, otro operador vería rastros sensibles). Al inicializar, purgar o migrar automáticamente cualquier entrada heredada que no cumpla el esquema estricto de solo-navegación.

## 7. Estructura Navegable: Enlace de Salto, Foco y Título de Página

1. **Enlace de salto**: el shell empieza con un enlace `<a class="skip-link" href="#main-content">` traducido, visible al recibir foco, que lleva a `<main id="main-content" tabindex="-1">`. El `tabindex="-1"` permite enfocarlo por código sin agregarlo al orden de tabulación (su `outline: none` es la excepción de foco programático que el validador ya reconoce).
2. **Foco tras navegar**: al navegar desde un menú que se oculta (menú lateral móvil, paleta de comandos), mover el foco a `<main>` cuando la navegación termina, para que el lector de pantalla y el teclado empiecen en el contenido nuevo. Si el menú se cierra **sin** navegar (`Escape`, clic fuera), el foco vuelve al botón que lo abrió.
3. **Título por ruta (WCAG 2.4.2)**: cada ruta declara una clave de título (`data: { titleKey: 'incidents.title' }`) y una estrategia global de títulos (`TitleStrategy` en Angular, un hook de router en otros frameworks) compone `<Título traducido> · <Marca>`, o solo la marca si la ruta no declara clave. La estrategia se suscribe al cambio de idioma y reescribe el título sin navegar.
4. **Idioma del documento**: `<html lang>` refleja el idioma activo (ver regla 6 de la skill).

## 8. Formularios: Validación Accesible, Topes y Máscaras

1. **Una directiva de estado de campo**: una sola directiva (aplicada a cada control) enlaza la clase `invalid`, `aria-invalid="true"` y `aria-describedby="<id-del-mensaje>"` **solo** cuando el control es inválido y su error debe mostrarse. Con el campo válido ambos atributos desaparecen (un `aria-invalid="false"` permanente o un `describedby` hacia un mensaje vacío generan ruido en el lector de pantalla). El componente de mensaje de error es el otro anfitrión y lleva el `id` que la directiva referencia.
2. **Cuándo mostrar el error**: tras `500 ms` sin escribir (validación instantánea con *debounce*, sin necesidad de marcar el campo como tocado) o al salir del campo, lo que ocurra primero. Nunca en cada pulsación ni solo al enviar.
3. **Enviar un formulario inválido**: marcar todos los controles, desplazar la vista hasta el **primer** campo inválido en orden del DOM y enfocarlo. Un helper compartido (`focusFirstInvalidField(form, host)`) lo resuelve para todos los formularios; ninguna vista lo reimplementa.
4. **Topes simétricos con el backend**: cada campo de texto libre declara `maxlength` igual al tope del contrato de entrada (`[StringLength(N)]`), que a su vez es igual a la columna (`HasMaxLength(N)`). El usuario no puede escribir algo que el servidor rechazará por largo, y el servidor nunca trunca en silencio.
5. **Máscaras compartidas**: teléfonos, códigos postales y otros formatos fijos usan una máscara de entrada compartida (p. ej. `(000) 000-0000`). El valor enviado al backend no lleva caracteres de formato, y la validación del servidor sigue siendo la autoridad.

## 9. Fechas, Horas y Zona Horaria

Las fechas son la fuente más frecuente de errores de «un día menos» en sistemas institucionales. Reglas:

1. **Un único formateador**: un pipe/helper compartido (`appDateTime`, `appDate`) aplica el formato institucional fijo (p. ej. `MM/dd/yyyy h:mm a.m./p.m.`), independiente del idioma de la interfaz si así lo exige la organización. Ninguna vista llama a un formateador genérico con su propio patrón.
2. **Fechas de calendario en hora local**: el valor de un `<input type="date">`, su `[max]`/`[min]` y cualquier «hoy» se calculan con los componentes locales del reloj inyectado (`getFullYear()`, `getMonth()`, `getDate()`), **nunca** con `toISOString()`, que convierte a UTC y en zonas con desfase negativo adelanta la fecha después de cierta hora de la noche.
3. **Filtros de rango**: los bordes «desde el inicio del día local» y «hasta el fin del día local» se convierten a instantes UTC usando la zona horaria oficial de la organización (configurada una vez, p. ej. `America/Puerto_Rico`, UTC−4 sin horario de verano), no la del navegador.
4. **Payload**: los instantes viajan en UTC ISO-8601 en propiedades con sufijo `Utc` (`occurredAtUtc`); las fechas de calendario sin hora viajan como `yyyy-MM-dd` sin zona. `toISOString()` solo se usa para los campos `*Utc`.
5. **Reloj inyectado**: todo cálculo de «ahora» o «hoy» lee el token `CLOCK`, para que las pruebas fijen la fecha y la hora (ver [`layered-testing-strategy`](../../layered-testing-strategy/references/fakes-and-fixtures-patterns.md)).
