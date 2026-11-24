#!/usr/bin/env node
// Validador estático del Sistema de Diseño e Internacionalización (Node.js soportado y parcheado, cero dependencias).
// Verifica:
//   1. [no-hex-color]         Cero colores hex literales fuera del archivo de tokens.
//   2. [no-primitive-token]   Cero consumo directo de primitivos (por defecto --brand-*) fuera del archivo de tokens.
//   3. [no-transition-all]    Prohibido `transition: all`.
//   4. [focus-visible-parity] Cada `outline: none` / `outline: 0` se evalúa por regla y selector: debe declararse en una
//                             regla de foco con indicador visible, o tener una regla compañera `<selector>:focus-visible`
//                             (o un contenedor `:focus-within`) con indicador en la misma hoja.
//   5. [focus-ring-token]     En reglas de foco, el anillo sale de --focus-ring*: ni sombras `0 0 0 Npx` literales ni
//                             `outline` visible sin justificar (los controles nativos checkbox/radio se documentan con marcador).
//   6. [focus-forced-colors]  (opcional, --require-forced-colors-focus) Una regla de foco que elimina el outline y dibuja el
//                             foco solo con box-shadow desaparece en Alto Contraste: usar `outline: 2px solid transparent`
//                             junto al anillo o declarar un bloque `@media (forced-colors: active)` en la misma hoja.
//   7. [no-hardcoded-ui-text] Detecta textos literales sin traducir en plantillas HTML (nodos de texto, interpolaciones
//                             con literal y atributos aria-label/title/placeholder/alt). Desactivable con --skip-i18n.
//   8. [unused-allow-marker]  Falla si un comentario `design-system-allow` ya no suprime ninguna regla real.
//   9. [font-scale]           `font-size` (y el tamaño dentro del atajo `font:`) solo consume var(--text-*).
//  10. [leading-scale]        `line-height` numérico (con o sin unidad, también tras `/` en `font:`) en vez de var(--leading-*).
//  11. [font-weight-scale]    `font-weight` numérico o bold/bolder/lighter en vez de var(--font-weight-*). Los descriptores
//                             @font-face no se evalúan (exigen un número literal).
//  12. [flat-at-rest]         Tarjetas, paneles, franjas, mosaicos, filas, chips y superficies sin estado interactivo no
//                             declaran sombra en reposo (solo none, var(--shadow-card) o var(--shadow-floating)).
//                             Configurable con --card-selector-pattern <regex> y --flat-at-rest-values a,b.
//  13. [shadow-literal]       Una sombra que repite literalmente el valor de un token --shadow-* del archivo de tokens.
//  14. [shadow-ring-literal]  Un halo `0 0 0 Npx color-mix(...)` escrito fuera de tokens (fuera de reglas de foco, que ya
//                             cubre focus-ring-token): extraerlo como --shadow-ring-*.
//  15. [no-toast-literal]     Un toast armado con un string literal en código de producción en vez de texto traducido.
//                             Prefijo de llamada configurable con --toast-pattern <regex> (por defecto toast.error|success|info|warning).
//                             Se desactiva junto con --skip-i18n.
//
// Cualquier check puede desactivarse temporalmente con --skip-checks a,b (documentar el motivo en el script de lint).
//
// Excepciones auditables junto al código:
//   CSS/JS: /* design-system-allow: <check> — razón técnica */
//   HTML:   <!-- design-system-allow: <check> — razón técnica -->
//   Archivo completo: design-system-allow-file: <check> — razón técnica
//   El marcador cubre su línea y la siguiente (en HTML, desde la línea anterior a la etiqueta).
//
// Alias de marcadores: un proyecto con su propio checker puede conservar sus nombres (hex-literal, primitive-leak,
// transition-all, focus-visible, focus-ring, hardcoded-string, hardcoded-text). Los alias suprimen el hallazgo
// equivalente, pero no se reportan como obsoletos: su vigencia la juzga el checker del proyecto, cuya granularidad
// puede diferir. Los marcadores de checks que este script no implementa se ignoran.
// Alias adicionales: --marker-alias nombre-proyecto=check-del-script[,otro=check].
//
// Uso:
//   node check-design-system.mjs --root . --styles src/styles --app src/app --tokens src/styles/tokens.css \
//     [--primitive-prefix --brand-,--acme-] [--marker-alias foo=no-hex-color] [--allow-literals ACME,N/A] \
//     [--require-forced-colors-focus] [--skip-i18n] [--skip-checks a,b] \
//     [--card-selector-pattern '<regex>'] [--flat-at-rest-values none,var(--shadow-card)] [--toast-pattern '<regex>']

import fs from 'node:fs';
import path from 'node:path';

const KNOWN_CHECKS = new Set([
  'no-hex-color',
  'no-primitive-token',
  'no-transition-all',
  'focus-visible-parity',
  'focus-ring-token',
  'focus-forced-colors',
  'no-hardcoded-ui-text',
  'font-scale',
  'leading-scale',
  'font-weight-scale',
  'flat-at-rest',
  'shadow-literal',
  'shadow-ring-literal',
  'no-toast-literal'
]);

// Último segmento del selector con letra/dígito alrededor del nombre: ".indicator-card--teal" sí, ".arrow" no.
const DEFAULT_CARD_SELECTOR_PATTERN = String.raw`(?:^|[^a-zA-Z0-9])(?:card|panel|strip|tile|row|chip|surface)s?(?![a-zA-Z0-9])`;
// Estado interactivo o de selección: no es "reposo".
const INTERACTIVE_STATE_RX =
  /(:hover|:focus|:active|:checked|\[open\]|\[aria-(?:selected|expanded|current|pressed|checked)|\.is-|--(?:checked|selected|active|expanded|current|dragging|dragover)\b)/i;
const DEFAULT_FLAT_AT_REST_VALUES = ['none', 'var(--shadow-card)', 'var(--shadow-floating)'];
const DEFAULT_TOAST_PATTERN = String.raw`\btoast\.(?:error|success|info|warning)\(`;

const DEFAULT_MARKER_ALIASES = {
  'hex-literal': 'no-hex-color',
  'primitive-leak': 'no-primitive-token',
  'transition-all': 'no-transition-all',
  'focus-visible': 'focus-visible-parity',
  'focus-ring': 'focus-ring-token',
  'hardcoded-string': 'no-hardcoded-ui-text',
  'hardcoded-text': 'no-hardcoded-ui-text'
};

const USAGE =
  'Uso: node check-design-system.mjs [--root .] [--styles src/styles] [--app src/app] [--tokens src/styles/tokens.css]\n' +
  '       [--primitive-prefix --brand-[,--otro-]] [--marker-alias alias=check[,alias=check]]\n' +
  '       [--allow-literals A,B] [--require-forced-colors-focus] [--skip-i18n] [--skip-checks a,b]\n' +
  "       [--card-selector-pattern '<regex>'] [--flat-at-rest-values none,var(--shadow-card)] [--toast-pattern '<regex>']";

function compileRegex(source, flags, flag) {
  try {
    return new RegExp(source, flags);
  } catch (error) {
    console.error(`✗ ${flag} no es una expresión regular válida: ${error.message}`);
    process.exit(2);
  }
}

function parseArgs(argv) {
  const args = {
    root: process.cwd(),
    styles: 'src/styles',
    app: 'src/app',
    tokens: 'src/styles/tokens.css',
    primitivePrefixes: ['--brand-'],
    markerAliases: { ...DEFAULT_MARKER_ALIASES },
    requireForcedColorsFocus: false,
    skipI18n: false,
    skipChecks: new Set(),
    cardSelectorPattern: DEFAULT_CARD_SELECTOR_PATTERN,
    flatAtRestValues: [...DEFAULT_FLAT_AT_REST_VALUES],
    toastPattern: DEFAULT_TOAST_PATTERN,
    allowedLiterals: ['ID', 'Esc', 'OK', 'PDF', 'CSV', 'JSON', 'UTC']
  };
  const list = (value) =>
    value
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  for (let i = 2; i < argv.length; i++) {
    const flag = argv[i];
    const hasValue = argv[i + 1] !== undefined;
    if (flag === '--root' && hasValue) args.root = argv[++i];
    else if (flag === '--styles' && hasValue) args.styles = argv[++i];
    else if (flag === '--app' && hasValue) args.app = argv[++i];
    else if (flag === '--tokens' && hasValue) args.tokens = argv[++i];
    else if (flag === '--primitive-prefix' && hasValue) args.primitivePrefixes = list(argv[++i]);
    else if (flag === '--marker-alias' && hasValue) {
      for (const pair of list(argv[++i])) {
        const [alias, check] = pair.split('=').map((s) => s.trim());
        if (!alias || !KNOWN_CHECKS.has(check)) {
          console.error(`✗ --marker-alias inválido "${pair}": usa alias=check con un check de [${[...KNOWN_CHECKS].join(', ')}].`);
          process.exit(2);
        }
        args.markerAliases[alias] = check;
      }
    } else if (flag === '--require-forced-colors-focus') args.requireForcedColorsFocus = true;
    else if (flag === '--skip-i18n') args.skipI18n = true;
    else if (flag === '--allow-literals' && hasValue) args.allowedLiterals.push(...list(argv[++i]));
    else if (flag === '--skip-checks' && hasValue) {
      for (const check of list(argv[++i])) {
        if (!KNOWN_CHECKS.has(check)) {
          console.error(`✗ --skip-checks: check desconocido "${check}". Usa uno de [${[...KNOWN_CHECKS].join(', ')}].`);
          process.exit(2);
        }
        args.skipChecks.add(check);
      }
    } else if (flag === '--card-selector-pattern' && hasValue) args.cardSelectorPattern = argv[++i];
    else if (flag === '--flat-at-rest-values' && hasValue) args.flatAtRestValues = list(argv[++i]);
    else if (flag === '--toast-pattern' && hasValue) args.toastPattern = argv[++i];
    else if (flag === '--help' || flag === '-h') {
      console.log(USAGE);
      process.exit(0);
    }
  }
  if (args.primitivePrefixes.length === 0) {
    console.error('✗ --primitive-prefix requiere al menos un prefijo (ej. --brand-).');
    process.exit(2);
  }
  if (args.skipI18n) {
    args.skipChecks.add('no-hardcoded-ui-text');
    args.skipChecks.add('no-toast-literal');
  }
  args.cardSelectorRx = compileRegex(args.cardSelectorPattern, 'i', '--card-selector-pattern');
  args.toastRx = compileRegex(`${args.toastPattern}\\s*(['"\`])`, 'g', '--toast-pattern');
  return args;
}

const MARKER_RX = /design-system-allow(-file)?:\s*([\w-]+)\s*(?:—|--|:)\s*\S+/g;
const FOCUS_PSEUDO_RX = /:focus(?:-visible|-within)?\b/;
const LETTERS_RX = /[A-Za-zÀ-ÿ]{2,}/;

function toPosix(p) {
  return p.split(path.sep).join('/');
}

function walk(dir, pred, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', 'dist', 'build', '.git', 'coverage'].includes(e.name)) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, pred, acc);
    else if (pred(full)) acc.push(full);
  }
  return acc;
}

function blank(text) {
  return text.replace(/[^\n]/g, ' ');
}

function stripBlockCommentsPreserveLines(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, blank);
}

function stripCodeCommentsPreserveLines(text) {
  return stripBlockCommentsPreserveLines(text).replace(/^[ \t]*\/\/.*$/gm, (m) => ' '.repeat(m.length));
}

function stripHtmlCommentsPreserveLines(text) {
  return text.replace(/<!--[\s\S]*?-->/g, blank);
}

function lineAt(text, index) {
  let l = 1;
  for (let i = 0; i < index; i++) {
    if (text.charCodeAt(i) === 10) l++;
  }
  return l;
}

// Separa una lista de selectores por comas de primer nivel (respeta :is(a, b) y [attr="a,b"]).
function splitSelectors(selector) {
  const parts = [];
  let depth = 0;
  let quote = null;
  let current = '';
  for (const ch of selector) {
    if (quote) {
      if (ch === quote) quote = null;
    } else if (ch === '"' || ch === "'") quote = ch;
    else if (ch === '(' || ch === '[') depth++;
    else if (ch === ')' || ch === ']') depth--;
    else if (ch === ',' && depth === 0) {
      parts.push(current.trim());
      current = '';
      continue;
    }
    current += ch;
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

// Devuelve las reglas hoja { selector, body, bodyStart, atRules } con el contexto de @media/@supports que las envuelve.
// Espera el CSS ya sin comentarios.
function parseCssRules(css) {
  const rules = [];
  const stack = [];
  let segStart = 0;
  let quote = null;
  for (let i = 0; i < css.length; i++) {
    const ch = css[i];
    if (quote) {
      if (ch === quote && css[i - 1] !== '\\') quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") quote = ch;
    else if (ch === '{') {
      if (stack.length > 0) stack[stack.length - 1].hasChild = true;
      stack.push({ header: css.slice(segStart, i).trim(), bodyStart: i + 1, hasChild: false });
      segStart = i + 1;
    } else if (ch === '}') {
      const top = stack.pop();
      if (top && !top.hasChild && !top.header.startsWith('@')) {
        rules.push({
          selector: top.header,
          body: css.slice(top.bodyStart, i),
          bodyStart: top.bodyStart,
          atRules: stack.filter((s) => s.header.startsWith('@')).map((s) => s.header)
        });
      }
      segStart = i + 1;
    } else if (ch === ';') segStart = i + 1;
  }
  return rules;
}

function declarations(body) {
  return body
    .split(';')
    .map((d) => {
      const sep = d.indexOf(':');
      if (sep < 0) return null;
      return { property: d.slice(0, sep).trim().toLowerCase(), value: d.slice(sep + 1).trim() };
    })
    .filter(Boolean);
}

function isNoneValue(value) {
  return /^(?:none|0|0px|initial|unset|inherit)(?:\s*!important)?$/i.test(value);
}

function isOutlineProperty(property) {
  return property === 'outline' || property === 'outline-color' || property === 'outline-style' || property === 'outline-width';
}

// Indicador visible: sombra, borde, fondo, trazo, filtro, subrayado o un outline que no sea none/transparente.
function hasVisibleIndicator(body, { ignoreOutline = false } = {}) {
  return declarations(body).some(({ property, value }) => {
    if (!value || isNoneValue(value) || /^transparent$/i.test(value)) return false;
    if (isOutlineProperty(property)) return !ignoreOutline && !/\btransparent\b/i.test(value);
    return /^(?:box-shadow|border(?:-[a-z]+)*|background(?:-color)?|stroke|filter|text-decoration(?:-line)?)$/.test(property);
  });
}

function onlyShadowIndicator(body) {
  return (
    declarations(body).some(({ property, value }) => property === 'box-shadow' && !isNoneValue(value)) &&
    !hasVisibleIndicator(
      body
        .split(';')
        .filter((d) => !/^\s*box-shadow\s*:/i.test(d))
        .join(';'),
      { ignoreOutline: true }
    )
  );
}

function withoutFocusPseudo(selector) {
  return selector
    .replace(/:(?:focus-visible|focus-within|focus)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function isProgrammaticFocus(selector) {
  return /\[tabindex=(["']?)-1\1\]/.test(selector);
}

function insideForcedColors(rule) {
  return rule.atRules.some((a) => /forced-colors\s*:\s*active/i.test(a));
}

const CSS_WIDE_KEYWORD_RX = /^(?:inherit|initial|unset|revert|revert-layer)$/i;
const SCALE_DECLARATION_RX = /(?<![\w-])(font-size|line-height|font-weight|font)\s*:\s*([^;]+)/g;
const NUMERIC_LENGTH_RX = /(?:^|\s)\d*\.?\d+(?:px|rem|em|%|pt|vw|vh|vmin|vmax|ch|ex)?(?=\s|$)/;
const NUMERIC_WEIGHT_RX = /(?:^|\s)(?:[1-9]00|bold|bolder|lighter)(?=\s|$)/i;

function withoutImportant(value) {
  return value.replace(/\s*!important\s*$/i, '').trim();
}

// Quita las llamadas var(...) (con un nivel de paréntesis anidado) para evaluar solo los literales del valor.
function withoutVars(value) {
  return value.replace(/var\((?:[^()]|\([^()]*\))*\)/g, ' ');
}

// Devuelve los hallazgos de escala { check, detail } de una declaración font-size/line-height/font-weight/font.
function scaleFindings(property, rawValue) {
  const value = withoutImportant(rawValue);
  if (CSS_WIDE_KEYWORD_RX.test(value)) return [];
  if (property === 'font-size') {
    return /^var\(\s*--text-/.test(value) ? [] : [{ check: 'font-scale', detail: `font-size: ${value}` }];
  }
  if (property === 'line-height') {
    if (/^normal$/i.test(value) || /^var\(\s*--leading-/.test(value)) return [];
    return /^\d*\.?\d+(?:px|rem|em|%)?$/.test(value) ? [{ check: 'leading-scale', detail: `line-height: ${value}` }] : [];
  }
  if (property === 'font-weight') {
    if (/^normal$/i.test(value) || /^var\(\s*--font-weight-/.test(value)) return [];
    return NUMERIC_WEIGHT_RX.test(value) ? [{ check: 'font-weight-scale', detail: `font-weight: ${value}` }] : [];
  }
  // Atajo font: tamaño, /interlineado y peso literales que quedan tras quitar los var(...).
  const literal = withoutVars(value);
  const [beforeSlash, afterSlash] = literal.split('/');
  const findings = [];
  if (NUMERIC_LENGTH_RX.test(beforeSlash.replace(NUMERIC_WEIGHT_RX, ' '))) findings.push({ check: 'font-scale', detail: `font: ${value}` });
  if (afterSlash !== undefined && /^\s*\d*\.?\d+/.test(afterSlash)) findings.push({ check: 'leading-scale', detail: `font: ${value}` });
  if (NUMERIC_WEIGHT_RX.test(beforeSlash)) findings.push({ check: 'font-weight-scale', detail: `font: ${value}` });
  return findings;
}

// Elemento realmente estilizado: el último compuesto del selector (".a-card .icon" → ".icon").
function targetOf(selector) {
  const parts = selector.trim().split(/\s*[\s>+~]\s*/);
  return parts[parts.length - 1] ?? selector;
}

function normalizeShadow(value) {
  return withoutImportant(value).replace(/\s+/g, '');
}

function main() {
  const args = parseArgs(process.argv);
  const rootDir = path.resolve(args.root);
  const stylesRoot = path.resolve(rootDir, args.styles);
  const appRoot = path.resolve(rootDir, args.app);
  const tokensFile = path.resolve(rootDir, args.tokens);
  const allowedSet = new Set(args.allowedLiterals);
  // Un literal permitido sigue permitido con puntuación o separadores alrededor ("· ID:", "(PDF)").
  const isAllowedLiteral = (text) =>
    allowedSet.has(text) || allowedSet.has(text.replace(/^[\s·•|:()\[\]–—-]+|[\s·•|:()\[\]–—-]+$/g, ''));

  const lineMarkers = new Map();
  const fileMarkers = new Map();
  const rawCache = new Map();
  const errors = [];
  let ignoredForeignMarkers = 0;

  function relPath(file) {
    return toPosix(path.relative(rootDir, file));
  }

  function loadFile(file) {
    if (rawCache.has(file)) return rawCache.get(file);
    const raw = fs.readFileSync(file, 'utf8');
    raw.split('\n').forEach((txt, idx) => {
      for (const m of txt.matchAll(MARKER_RX)) {
        const name = m[2];
        const check = KNOWN_CHECKS.has(name) ? name : args.markerAliases[name];
        if (!check) {
          ignoredForeignMarkers++;
          continue;
        }
        const entry = { rel: relPath(file), line: idx + 1, check, name, aliased: name !== check, used: false };
        if (m[1]) fileMarkers.set(`${file}:${check}`, entry);
        else lineMarkers.set(`${file}:${idx + 1}:${check}`, entry);
      }
    });
    rawCache.set(file, raw);
    return raw;
  }

  function isAllowed(file, check, line, startLine = line) {
    const fm = fileMarkers.get(`${file}:${check}`);
    if (fm) {
      fm.used = true;
      return true;
    }
    for (let c = line; c >= Math.max(1, startLine - 1); c--) {
      const lm = lineMarkers.get(`${file}:${c}:${check}`);
      if (lm) {
        lm.used = true;
        return true;
      }
    }
    return false;
  }

  function report(file, check, line, msg, startLine = line) {
    if (args.skipChecks.has(check)) return;
    if (isAllowed(file, check, line, startLine)) return;
    errors.push(`[${check}] ${relPath(file)}:${line} — ${msg}`);
  }

  const scanRoots = [stylesRoot, appRoot].filter((d, idx, arr) => arr.indexOf(d) === idx && fs.existsSync(d));
  const cssFiles = [];
  const htmlFiles = [];
  const prodCodeFiles = [];

  for (const r of scanRoots) {
    walk(r, (f) => f.endsWith('.css'), cssFiles);
    walk(r, (f) => f.endsWith('.html'), htmlFiles);
    walk(
      r,
      (f) =>
        (f.endsWith('.ts') || f.endsWith('.tsx') || f.endsWith('.js') || f.endsWith('.jsx')) &&
        !/\.(spec|test)\.[^.]+$/.test(f),
      prodCodeFiles
    );
  }

  const hexRx = /#[0-9a-fA-F]{3,8}\b/g;
  const prefixAlternation = args.primitivePrefixes.map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  const primRx = new RegExp(`var\\(\\s*((?:${prefixAlternation})[\\w-]+)`, 'g');

  // Bloques @media (forced-colors: active) con outline: en la propia hoja o, con !important, en cualquier hoja.
  const parsedCss = new Map();
  let globalForcedColorsOutline = false;
  for (const file of cssFiles) {
    const cleaned = stripBlockCommentsPreserveLines(loadFile(file));
    const rules = parseCssRules(cleaned);
    const forcedOutline = rules.some(
      (r) => insideForcedColors(r) && declarations(r.body).some((d) => isOutlineProperty(d.property) && !isNoneValue(d.value))
    );
    if (
      rules.some(
        (r) =>
          insideForcedColors(r) &&
          FOCUS_PSEUDO_RX.test(r.selector) &&
          declarations(r.body).some((d) => d.property === 'outline' && /!important/i.test(d.value))
      )
    ) {
      globalForcedColorsOutline = true;
    }
    parsedCss.set(file, { cleaned, rules, forcedOutline });
  }

  // Valores de los tokens --shadow-* para detectar sombras duplicadas como literal (13).
  const shadowTokens = new Map();
  if (fs.existsSync(tokensFile)) {
    const tokenCss = stripBlockCommentsPreserveLines(fs.readFileSync(tokensFile, 'utf8'));
    for (const m of tokenCss.matchAll(/(--shadow-[\w-]+)\s*:\s*([^;]+);/g)) {
      const normalized = normalizeShadow(m[2]);
      if (!/^(?:none|var\()/i.test(normalized) && !shadowTokens.has(normalized)) shadowTokens.set(normalized, m[1]);
    }
  }
  const flatAtRestValues = new Set(args.flatAtRestValues.map(normalizeShadow));
  const ringLiteralRx = /(?:^|,)\s*0\s+0\s+0\s+\d*\.?\d+px\s+color-mix\(/;

  // 1, 2, 3, 4, 5, 6 y 9 a 14 en CSS
  for (const file of cssFiles) {
    const { cleaned, rules, forcedOutline } = parsedCss.get(file);
    const isTokens = path.resolve(file) === tokensFile;

    if (!isTokens) {
      for (const m of cleaned.matchAll(hexRx)) {
        // Ignorar selectores de ID verificando que el hex esté en posición de valor (tras ":").
        const before = cleaned.slice(Math.max(0, m.index - 30), m.index);
        if (/[:,\s(]$/.test(before) && /:\s*[^;{]*$/.test(before)) {
          report(file, 'no-hex-color', lineAt(cleaned, m.index), `Color hex literal "${m[0]}" fuera de tokens. Usa un token semántico --color-*.`);
        }
      }
      for (const m of cleaned.matchAll(primRx)) {
        report(
          file,
          'no-primitive-token',
          lineAt(cleaned, m.index),
          `Token primitivo "${m[1]}" usado fuera de tokens. Consume únicamente la capa semántica.`
        );
      }
    }

    for (const m of cleaned.matchAll(/transition\s*:\s*all\b/g)) {
      report(
        file,
        'no-transition-all',
        lineAt(cleaned, m.index),
        'Prohibido "transition: all"; especifica únicamente las propiedades animadas y usa tokens.'
      );
    }

    // Compañeras de foco con indicador visible en esta hoja, normalizadas sin la pseudo-clase.
    const focusCompanions = rules
      .filter((r) => FOCUS_PSEUDO_RX.test(r.selector) && hasVisibleIndicator(r.body))
      .flatMap((r) =>
        splitSelectors(r.selector)
          .filter((sub) => FOCUS_PSEUDO_RX.test(sub))
          .map((sub) => ({ normalized: withoutFocusPseudo(sub), within: /:focus-within\b/.test(sub) }))
      );

    const hasCompanionFor = (base) =>
      focusCompanions.some(
        (c) => c.normalized === base || (c.normalized.startsWith(base) && /^[:[]/.test(c.normalized.slice(base.length)))
      );
    const insideFocusWithin = (base) => focusCompanions.some((c) => c.within && base.startsWith(`${c.normalized} `));
    // Un campo dentro de un control compuesto (barra de búsqueda, combobox) puede delegar el indicador en el
    // contenedor :focus-within. El CSS no expresa la relación DOM, así que solo se acepta en reglas de foco
    // cuando la misma hoja declara un contenedor :focus-within con indicador del mismo bloque de nombre
    // (primer segmento de la clase: .tree-search-input ↔ .tree-search, .command-input ↔ .command-search-bar).
    const blockOf = (selector) => (/\.([a-zA-Z][a-zA-Z0-9]*)/.exec(selector) ?? [])[1];
    const withinBlocks = new Set(focusCompanions.filter((c) => c.within).map((c) => blockOf(c.normalized)).filter(Boolean));
    const delegatesToSameBlock = (base) => withinBlocks.has(blockOf(base.split(' ').pop()));

    for (const rule of rules) {
      const subs = splitSelectors(rule.selector);
      const isFocusRule = subs.length > 0 && subs.every((sub) => FOCUS_PSEUDO_RX.test(sub));
      const forcedContext = insideForcedColors(rule);

      // 4. outline: none evaluado por regla y por selector.
      for (const decl of rule.body.matchAll(/\boutline(?:-style|-width)?\s*:\s*(?:none|0(?:px)?)\s*(?:!important\s*)?(?=;|$)/g)) {
        const line = lineAt(cleaned, rule.bodyStart + decl.index);
        const restOfBody = rule.body.slice(0, decl.index) + rule.body.slice(decl.index + decl[0].length);
        const unsatisfied = subs.filter((sub) => {
          if (isProgrammaticFocus(sub)) return false;
          const base = withoutFocusPseudo(sub);
          if (FOCUS_PSEUDO_RX.test(sub)) return !hasVisibleIndicator(restOfBody) && !insideFocusWithin(base) && !delegatesToSameBlock(base);
          return !hasCompanionFor(base) && !insideFocusWithin(base);
        });
        if (unsatisfied.length > 0) {
          report(
            file,
            'focus-visible-parity',
            line,
            `"outline: none" en "${unsatisfied.join(', ')}" sin indicador de foco equivalente en la propia regla ni regla compañera :focus-visible/:focus-within con indicador visible.`
          );
        }

        // 6. Alto Contraste: foco solo por box-shadow tras eliminar el outline.
        if (
          args.requireForcedColorsFocus &&
          isFocusRule &&
          !forcedContext &&
          onlyShadowIndicator(restOfBody) &&
          !forcedOutline &&
          !globalForcedColorsOutline
        ) {
          report(
            file,
            'focus-forced-colors',
            line,
            `"${rule.selector}" elimina el outline y dibuja el foco solo con box-shadow, que desaparece en Alto Contraste; usa "outline: 2px solid transparent" junto al anillo o un bloque @media (forced-colors: active).`
          );
        }
      }

      // 5. Anillo de foco desde tokens en reglas de foco (fuera de bloques forced-colors).
      if (isFocusRule && !forcedContext) {
        for (const decl of rule.body.matchAll(/\b(outline(?:-color)?)\s*:\s*([^;]+)/g)) {
          const value = decl[2].trim();
          if (isNoneValue(value) || /\btransparent\b/i.test(value) || /^(?:auto|currentcolor)$/i.test(value)) continue;
          report(
            file,
            'focus-ring-token',
            lineAt(cleaned, rule.bodyStart + decl.index),
            `Outline visible "${decl[1]}: ${value}" en "${rule.selector}"; usa --focus-ring* con "outline: 2px solid transparent", o justifica el outline nativo (checkbox/radio) con marcador.`
          );
        }
        for (const decl of rule.body.matchAll(/\bbox-shadow\s*:\s*([^;]+)/g)) {
          const value = decl[1].trim();
          if (/\b0\s+0\s+0\s+(?:\d|calc\()/.test(value) && !value.includes('var(--focus-ring')) {
            report(
              file,
              'focus-ring-token',
              lineAt(cleaned, rule.bodyStart + decl.index),
              `Anillo de foco literal en "${rule.selector}"; usa --focus-ring, --focus-ring-danger, --focus-ring-inset o --focus-ring-field.`
            );
          }
        }
      }

      // 9, 10 y 11. Escalas cerradas de tamaño, interlineado y peso.
      for (const decl of rule.body.matchAll(SCALE_DECLARATION_RX)) {
        const line = lineAt(cleaned, rule.bodyStart + decl.index);
        for (const finding of scaleFindings(decl[1].toLowerCase(), decl[2])) {
          const token = { 'font-scale': '--text-*', 'leading-scale': '--leading-*', 'font-weight-scale': '--font-weight-*' }[finding.check];
          report(file, finding.check, line, `"${finding.detail}" fuera de la escala; usa var(${token}).`);
        }
      }

      for (const decl of rule.body.matchAll(/(?<![\w-])box-shadow\s*:\s*([^;]+)/g)) {
        const value = withoutImportant(decl[1]);
        const line = lineAt(cleaned, rule.bodyStart + decl.index);

        // 12. Plano en reposo en tarjetas y superficies sin estado interactivo.
        const cardAtRest = subs.some((sub) => args.cardSelectorRx.test(targetOf(sub)) && !INTERACTIVE_STATE_RX.test(sub));
        if (cardAtRest && !forcedContext && !flatAtRestValues.has(normalizeShadow(value))) {
          report(
            file,
            'flat-at-rest',
            line,
            `"${rule.selector}" declara sombra en reposo ("${value}"); solo :hover/:focus-visible/:active o estados de selección elevan.`
          );
        }

        // 13 y 14. Sombras literales fuera del archivo de tokens.
        if (isTokens || /^(?:none|var\()/i.test(value)) continue;
        const token = shadowTokens.get(normalizeShadow(value));
        if (token) {
          report(file, 'shadow-literal', line, `Sombra que repite el valor de ${token}; usa var(${token}).`);
        } else if (!isFocusRule && ringLiteralRx.test(value)) {
          report(file, 'shadow-ring-literal', line, `Halo literal "${value}"; extráelo como token --shadow-ring-* en tokens.`);
        }
      }
    }
  }

  // Hex y primitivos en HTML y TS/JS de producción
  for (const file of [...htmlFiles, ...prodCodeFiles]) {
    const raw = loadFile(file);
    const cleaned = file.endsWith('.html') ? stripHtmlCommentsPreserveLines(raw) : stripCodeCommentsPreserveLines(raw);

    // 15. Toast con texto literal en código de producción.
    if (!file.endsWith('.html')) {
      for (const m of cleaned.matchAll(args.toastRx)) {
        report(
          file,
          'no-toast-literal',
          lineAt(cleaned, m.index),
          'Toast con texto literal; pasa el texto ya traducido (p. ej. await translateLoaded(i18n, clave)).'
        );
      }
    }

    for (const m of cleaned.matchAll(primRx)) {
      report(file, 'no-primitive-token', lineAt(cleaned, m.index), `Token primitivo "${m[1]}" usado en componente.`);
    }

    const styleHexRx = /(?:color|background|border|fill|stroke)\s*[:=]\s*['"]?(#[0-9a-fA-F]{3,8})\b/gi;
    for (const m of cleaned.matchAll(styleHexRx)) {
      report(file, 'no-hex-color', lineAt(cleaned, m.index), `Color hex literal "${m[1]}" en código o plantilla; usa tokens semánticos.`);
    }
  }

  // 7. Texto literal sin traducir en plantillas HTML
  if (!args.skipI18n) {
    for (const file of htmlFiles) {
      const cleaned = stripHtmlCommentsPreserveLines(loadFile(file)).replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, blank);

      // Interpolaciones con string literal: {{ 'Texto' }} (sin pipe de traducción)
      const interpRx = /\{\{\s*(['"])([^'"]*[A-Za-zÀ-ÿ]{2,}[^'"]*)\1\s*\}\}/g;
      for (const m of cleaned.matchAll(interpRx)) {
        if (!isAllowedLiteral(m[2].trim())) {
          report(
            file,
            'no-hardcoded-ui-text',
            lineAt(cleaned, m.index),
            `Interpolación con texto literal "${m[2].trim()}"; usa clave de internacionalización.`
          );
        }
      }

      // Atributos de texto visible o accesible con literal (los enlazados [title]="..." no coinciden).
      for (const m of cleaned.matchAll(/\s(aria-label|title|placeholder|alt)\s*=\s*(["'])([^"']*)\2/g)) {
        const value = m[3].trim();
        if (!value || value.includes('{{') || !LETTERS_RX.test(value) || isAllowedLiteral(value)) continue;
        report(
          file,
          'no-hardcoded-ui-text',
          lineAt(cleaned, m.index + 1),
          `Atributo "${m[1]}" con texto literal "${value.slice(0, 60)}"; usa el sistema de i18n.`,
          lineAt(cleaned, cleaned.lastIndexOf('<', m.index))
        );
      }

      // Nodos de texto: se blanquean interpolaciones, cabeceras de control de flujo (@if/@for/... con sus
      // condiciones, que pueden contener ">"), @let, etiquetas completas (con ">" dentro de atributos
      // entrecomillados), entidades y llaves. Lo que quede con letras es texto visible literal.
      const tagEnds = [];
      const work = cleaned
        .replace(/\{\{[\s\S]*?\}\}/g, blank)
        .replace(/@(?:if|else\s+if|else|for|empty|switch|case|default|defer|placeholder|loading|error)\b[^{]*\{/g, blank)
        .replace(/@let\s+[^;]*;/g, blank)
        .replace(/<\/?[a-zA-Z][^>"']*(?:(?:"[^"]*"|'[^']*')[^>"']*)*>/g, (m, offset) => {
          tagEnds.push(offset + m.length);
          return blank(m);
        })
        .replace(/&[a-zA-Z#0-9]+;/g, blank)
        .replace(/[{}]/g, ' ');

      let offset = 0;
      let tagCursor = 0;
      work.split('\n').forEach((text, idx) => {
        const lineStart = offset;
        offset += text.length + 1;
        const trimmed = text.trim();
        if (!trimmed || !LETTERS_RX.test(trimmed) || isAllowedLiteral(trimmed)) return;
        const textIndex = lineStart + text.indexOf(trimmed);
        while (tagCursor + 1 < tagEnds.length && tagEnds[tagCursor + 1] <= textIndex) tagCursor++;
        const prevTagEnd = tagEnds[tagCursor] !== undefined && tagEnds[tagCursor] <= textIndex ? tagEnds[tagCursor] : textIndex;
        report(
          file,
          'no-hardcoded-ui-text',
          idx + 1,
          `Texto visible sin traducir "${trimmed.slice(0, 60)}"; usa el sistema de i18n.`,
          lineAt(cleaned, Math.max(0, prevTagEnd - 1))
        );
      });
    }
  }

  // 8. Marcadores obsoletos que ya no suprimen nada (los alias de proyecto los valida su propio checker).
  let aliasedMarkers = 0;
  for (const entry of [...lineMarkers.values(), ...fileMarkers.values()]) {
    if (entry.aliased) {
      aliasedMarkers++;
      continue;
    }
    if (args.skipChecks.has(entry.check)) continue;
    if (!entry.used) {
      errors.push(
        `[unused-allow-marker] ${entry.rel}:${entry.line} — El marcador design-system-allow para "${entry.check}" no suprimió ninguna violación; elimínalo.`
      );
    }
  }

  const markerNote =
    aliasedMarkers + ignoredForeignMarkers > 0
      ? ` Marcadores con alias: ${aliasedMarkers}; de checks ajenos ignorados: ${ignoredForeignMarkers}.`
      : '';

  if (errors.length > 0) {
    console.error(`Se detectaron ${errors.length} violaciones del sistema de diseño:\n`);
    for (const err of errors) console.error(`  ✗ ${err}`);
    if (markerNote) console.error(`\n${markerNote.trim()}`);
    process.exit(1);
  }

  console.log(
    `✓ Sistema de diseño verificado sin violaciones (${cssFiles.length} CSS, ${htmlFiles.length} HTML, ${prodCodeFiles.length} archivos de código).${markerNote}`
  );
}

main();
