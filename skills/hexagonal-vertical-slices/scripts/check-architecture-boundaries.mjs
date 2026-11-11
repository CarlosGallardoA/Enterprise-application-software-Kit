#!/usr/bin/env node
/**
 * Validador universal y agnóstico de fronteras arquitectónicas (Hexagonal + Vertical Slices).
 * Sin dependencias externas (Node.js soportado y parcheado). Soporta JS/TS, Python, Go, C#, Java/Kotlin y Rust.
 *
 * Resuelve imports relativos y alias de `tsconfig` (`compilerOptions.paths`) a rutas reales antes de
 * clasificar feature y capa, así un alias propio (`@claims/*`) o un `../../otra-feature/...` no escapa.
 *
 * Uso:
 *   node check-architecture-boundaries.mjs --config ./boundaries.config.json [--root .]
 */

import fs from 'node:fs';
import path from 'node:path';

function parseArgs(argv) {
  const args = { config: 'boundaries.config.json', configExplicit: false, root: process.cwd() };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--config' && argv[i + 1]) {
      args.config = argv[++i];
      args.configExplicit = true;
    } else if (argv[i] === '--root' && argv[i + 1]) args.root = argv[++i];
    else if (argv[i] === '--help' || argv[i] === '-h') {
      console.log('Uso: node check-architecture-boundaries.mjs --config <archivo.json> [--root <directorio>]');
      process.exit(0);
    }
  }
  return args;
}

const DEFAULT_CONFIG = {
  scanRoots: ['src'],
  extensions: ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.py', '.go', '.cs', '.java', '.kt', '.rs'],
  ignorePatterns: [
    '\\.spec\\.',
    '\\.test\\.',
    '_test\\.go$',
    'Tests?\\.cs$',
    '/node_modules/',
    '/dist/',
    '/build/',
    '/bin/',
    '/obj/',
    '/target/',
    '/\\.angular/',
    '/coverage/'
  ],
  tsconfigFiles: ['tsconfig.json'],
  featuresSegment: '/features/',
  coreSegments: ['/core/', '/common/'],
  compositionSegments: ['/composition/'],
  layers: ['domain', 'application', 'infrastructure', 'ui', 'api'],
  allowedUiInfrastructureRegex: '(?:^|/|\\.)composition(?:/|\\.)[^/]+tokens',
  // Vacío = cero imports entre features. Un backend con contratos compartidos por su feature dueña
  // (`<feature>/shared/ports`) puede habilitar '(?:^|/)shared(?:/|$)'.
  allowedCrossFeatureTargetRegex: '',
  featureImportPrefixes: ['@features/', '@app/features/', 'features/', 'features.'],
  compositionImportPrefixes: ['@app/composition/', 'composition/', 'composition.'],
  forbidDeepRelativeImports: true,
  forbidLateImportsInJsTs: true
};

const JS_TS_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'];

function toPosix(p) {
  return p.split(path.sep).join('/');
}

// Ruta relativa a la raíz con "/" inicial: las reglas no dependen de dónde esté clonado el repositorio.
function repoPath(rootDir, absolute) {
  return '/' + toPosix(path.relative(rootDir, absolute));
}

function walkFiles(dir, rootDir, extensions, ignoreRegexes, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    const posix = repoPath(rootDir, full) + (entry.isDirectory() ? '/' : '');
    if (ignoreRegexes.some((rx) => rx.test(posix))) continue;
    if (entry.isDirectory()) {
      walkFiles(full, rootDir, extensions, ignoreRegexes, acc);
    } else if (extensions.some((ext) => entry.name.endsWith(ext))) {
      acc.push(full);
    }
  }
  return acc;
}

function stripCommentsKeepLines(content, ext) {
  let cleaned = content;
  if (ext === '.py') {
    cleaned = cleaned.replace(/^[ \t]*#.*$/gm, (m) => ' '.repeat(m.length));
  } else {
    cleaned = cleaned.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));
    cleaned = cleaned.replace(/^[ \t]*\/\/.*$/gm, (m) => ' '.repeat(m.length));
  }
  return cleaned;
}

function lineNumberAt(text, index) {
  let line = 1;
  for (let i = 0; i < index; i++) {
    if (text.charCodeAt(i) === 10) line++;
  }
  return line;
}

function extractImports(rawContent, ext) {
  const cleaned = stripCommentsKeepLines(rawContent, ext);
  const results = [];

  if (['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'].includes(ext)) {
    const staticRx = /\b(?:import|export)\s+(?:type\s+)?(?:[\s\S]*?\s+from\s+)?['"]([^'"]+)['"]/g;
    const dynamicRx = /\b(?:import|require)\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
    for (const m of cleaned.matchAll(staticRx)) {
      results.push({ specifier: m[1], line: lineNumberAt(cleaned, m.index), kind: 'static', index: m.index });
    }
    for (const m of cleaned.matchAll(dynamicRx)) {
      results.push({ specifier: m[1], line: lineNumberAt(cleaned, m.index), kind: 'dynamic', index: m.index });
    }
  } else if (ext === '.py') {
    const pyRx = /^[ \t]*(?:from\s+([A-Za-z0-9_.]+)\s+import|import\s+([A-Za-z0-9_.]+))/gm;
    for (const m of cleaned.matchAll(pyRx)) {
      results.push({ specifier: m[1] || m[2], line: lineNumberAt(cleaned, m.index), kind: 'static', index: m.index });
    }
  } else if (ext === '.cs') {
    const csRx = /^[ \t]*using\s+(?:static\s+)?(?:[A-Za-z0-9_]+\s*=\s*)?([A-Za-z0-9_.]+)\s*;/gm;
    for (const m of cleaned.matchAll(csRx)) {
      results.push({ specifier: m[1], line: lineNumberAt(cleaned, m.index), kind: 'static', index: m.index });
    }
  } else if (ext === '.java' || ext === '.kt') {
    const jvmRx = /^[ \t]*import\s+(?:static\s+)?([A-Za-z0-9_.*]+)\s*;?/gm;
    for (const m of cleaned.matchAll(jvmRx)) {
      results.push({ specifier: m[1], line: lineNumberAt(cleaned, m.index), kind: 'static', index: m.index });
    }
  } else if (ext === '.go') {
    const singleRx = /\bimport\s+"([^"]+)"/g;
    const blockRx = /\bimport\s*\(([\s\S]*?)\)/g;
    for (const m of cleaned.matchAll(singleRx)) {
      results.push({ specifier: m[1], line: lineNumberAt(cleaned, m.index), kind: 'static', index: m.index });
    }
    for (const block of cleaned.matchAll(blockRx)) {
      const strRx = /"([^"]+)"/g;
      for (const s of block[1].matchAll(strRx)) {
        results.push({
          specifier: s[1],
          line: lineNumberAt(cleaned, block.index + s.index),
          kind: 'static',
          index: block.index + s.index
        });
      }
    }
  } else if (ext === '.rs') {
    const rsRx = /^[ \t]*use\s+([A-Za-z0-9_:{}*,\s]+);/gm;
    for (const m of cleaned.matchAll(rsRx)) {
      results.push({ specifier: m[1].trim(), line: lineNumberAt(cleaned, m.index), kind: 'static', index: m.index });
    }
  }

  return { cleaned, imports: results };
}

// tsconfig admite comentarios y comas finales (JSONC); se limpian respetando el contenido de las cadenas.
function parseJsonc(text) {
  let out = '';
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      let j = i + 1;
      while (j < text.length && text[j] !== '"') j += text[j] === '\\' ? 2 : 1;
      out += text.slice(i, j + 1);
      i = j;
    } else if (ch === '/' && text[i + 1] === '/') {
      while (i < text.length && text[i] !== '\n') i++;
      out += '\n';
    } else if (ch === '/' && text[i + 1] === '*') {
      i = text.indexOf('*/', i + 2);
      if (i === -1) break;
      i++;
    } else {
      out += ch;
    }
  }
  return JSON.parse(out.replace(/,(\s*[}\]])/g, '$1'));
}

function loadPathAliases(rootDir, tsconfigFiles) {
  const aliases = [];
  for (const file of tsconfigFiles || []) {
    const tsconfigPath = path.resolve(rootDir, file);
    if (!fs.existsSync(tsconfigPath)) continue;
    const options = parseJsonc(fs.readFileSync(tsconfigPath, 'utf8')).compilerOptions || {};
    const baseDir = path.resolve(path.dirname(tsconfigPath), options.baseUrl || '.');
    for (const [pattern, targets] of Object.entries(options.paths || {})) {
      if (!Array.isArray(targets) || targets.length === 0) continue;
      const wildcard = pattern.endsWith('*');
      aliases.push({
        prefix: wildcard ? pattern.slice(0, -1) : pattern,
        wildcard,
        target: path.resolve(baseDir, wildcard ? targets[0].replace(/\*$/, '') : targets[0])
      });
    }
  }
  return aliases.sort((a, b) => b.prefix.length - a.prefix.length);
}

// Devuelve la ruta de repositorio del destino de un import JS/TS, o null si es un paquete externo.
function resolveJsTsSpecifier(spec, file, rootDir, aliases) {
  let absolute = null;
  if (spec.startsWith('./') || spec.startsWith('../')) {
    absolute = path.resolve(path.dirname(file), spec);
  } else {
    const alias = aliases.find((a) => (a.wildcard ? spec.startsWith(a.prefix) : spec === a.prefix));
    if (alias) absolute = path.join(alias.target, alias.wildcard ? spec.slice(alias.prefix.length) : '');
  }
  if (!absolute) return null;
  // Un import de carpeta (barrel) apunta a su index: la carpeta cuenta como segmento, no como archivo.
  const isDirectory = fs.existsSync(absolute) && fs.statSync(absolute).isDirectory();
  return repoPath(rootDir, isDirectory ? path.join(absolute, 'index') : absolute);
}

function layerOfSegment(segment, layers) {
  const lower = segment.toLowerCase();
  // Acepta carpetas `domain/` y proyectos con punto como `Acme.Domain/`.
  return layers.find((l) => lower === l || lower.endsWith(`.${l}`)) || null;
}

function detectFileContext(posixFile, cfg) {
  const lowerFile = posixFile.toLowerCase();
  const featuresSegment = cfg.featuresSegment.toLowerCase();
  const featIdx = lowerFile.indexOf(featuresSegment);
  let feature = null;
  let layer = null;
  let remainder = '';

  if (featIdx !== -1) {
    const parts = posixFile.slice(featIdx + featuresSegment.length).split('/');
    if (parts.length > 1) {
      feature = parts[0].toLowerCase();
      if (parts.length > 2 && cfg.layers.includes(parts[1].toLowerCase())) {
        layer = parts[1].toLowerCase();
        remainder = parts.slice(2).join('/');
      } else {
        remainder = parts.slice(1).join('/');
      }
    }
  }

  if (!layer) {
    const segments = posixFile.split('/').slice(0, -1);
    for (let i = 0; i < segments.length; i++) {
      const found = layerOfSegment(segments[i], cfg.layers);
      if (found) {
        layer = found;
        if (!remainder) remainder = posixFile.split('/').slice(i + 1).join('/');
        break;
      }
    }
  }

  const inCore = cfg.coreSegments.some((seg) => lowerFile.includes(seg.toLowerCase()));
  // Raíz de composición = carpeta de composición fuera de toda feature y del kernel compartido;
  // los `infrastructure/**/composition/*.tokens` de una feature pertenecen a esa feature.
  const inComposition =
    !feature && !inCore && (cfg.compositionSegments || []).some((seg) => lowerFile.includes(seg.toLowerCase()));
  return { feature, layer, remainder, inCore, inComposition };
}

function normalizeSpecifierToPath(specifier) {
  if (specifier.includes('/')) return specifier;
  return specifier.replace(/::/g, '/').replace(/\./g, '/');
}

function parseTargetFromSpecifier(specifier, cfg) {
  for (const prefix of cfg.featureImportPrefixes) {
    if (specifier.startsWith(prefix)) {
      const rest = normalizeSpecifierToPath(specifier.slice(prefix.length));
      const parts = rest.split('/').filter(Boolean);
      const feature = parts[0] ? parts[0].toLowerCase() : null;
      const maybeLayer = parts[1] ? parts[1].toLowerCase() : null;
      const layer = maybeLayer && cfg.layers.includes(maybeLayer) ? maybeLayer : null;
      const remainder = layer ? parts.slice(2).join('/') : parts.slice(1).join('/');
      return { feature, layer, remainder };
    }
  }

  const norm = '/' + normalizeSpecifierToPath(specifier);
  const featIdx = norm.toLowerCase().indexOf(cfg.featuresSegment.toLowerCase());
  if (featIdx !== -1) {
    const after = norm.slice(featIdx + cfg.featuresSegment.length);
    const parts = after.split('/').filter(Boolean);
    const feature = parts[0] ? parts[0].toLowerCase() : null;
    const maybeLayer = parts[1] ? parts[1].toLowerCase() : null;
    const layer = maybeLayer && cfg.layers.includes(maybeLayer) ? maybeLayer : null;
    const remainder = layer ? parts.slice(2).join('/') : parts.slice(1).join('/');
    return { feature, layer, remainder };
  }

  for (const l of cfg.layers) {
    if (new RegExp(`(?:^|/)${l}(?:/|$)`, 'i').test(norm)) {
      return { feature: null, layer: l, remainder: norm };
    }
  }

  return { feature: null, layer: null, remainder: '' };
}

function checkLateJsTsImports(cleaned, ext, relFile, errors) {
  if (!['.ts', '.tsx', '.js', '.jsx', '.mjs'].includes(ext)) return;
  const lines = cleaned.split('\n');
  let seenCode = false;
  let inMultilineImport = false;

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (!trimmed) continue;

    if (inMultilineImport) {
      if (/from\s+['"][^'"]+['"]\s*;?$/.test(trimmed) || trimmed.endsWith(';')) {
        inMultilineImport = false;
      }
      continue;
    }

    if (/^import\b/.test(trimmed) && !/^import\s*\(/.test(trimmed)) {
      if (seenCode) {
        errors.push(`[late-import] ${relFile}:${i + 1} — Todos los imports estáticos deben ubicarse en la cabecera del archivo.`);
      }
      if (!/['"][^'"]+['"]/.test(trimmed)) {
        inMultilineImport = true;
      }
    } else if (!/^['"]use strict['"]/.test(trimmed)) {
      seenCode = true;
    }
  }
}

function main() {
  const args = parseArgs(process.argv);
  const rootDir = path.resolve(args.root);
  const configPath = path.resolve(rootDir, args.config);

  let userCfg = {};
  if (fs.existsSync(configPath)) {
    userCfg = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } else if (args.configExplicit) {
    // Un --config mal escrito no debe degradar a la configuración por defecto y reportar verde.
    console.error(`No existe el archivo de configuración: ${configPath}`);
    process.exit(2);
  }
  const cfg = { ...DEFAULT_CONFIG, ...userCfg };
  const ignoreRegexes = cfg.ignorePatterns.map((p) => new RegExp(p));
  const allowedUiInfraRx = new RegExp(cfg.allowedUiInfrastructureRegex);
  const allowedCrossFeatureRx = cfg.allowedCrossFeatureTargetRegex
    ? new RegExp(cfg.allowedCrossFeatureTargetRegex, 'i')
    : null;
  const aliases = loadPathAliases(rootDir, cfg.tsconfigFiles);

  const files = [];
  for (const scanRoot of cfg.scanRoots) {
    walkFiles(path.resolve(rootDir, scanRoot), rootDir, cfg.extensions, ignoreRegexes, files);
  }

  const errors = [];

  for (const file of files) {
    const posixFile = repoPath(rootDir, file);
    const relFile = posixFile.slice(1);
    const ext = path.extname(file);
    const raw = fs.readFileSync(file, 'utf8');
    const { cleaned, imports } = extractImports(raw, ext);
    const ctx = detectFileContext(posixFile, cfg);

    if (cfg.forbidLateImportsInJsTs) {
      checkLateJsTsImports(cleaned, ext, relFile, errors);
    }

    for (const imp of imports) {
      const spec = imp.specifier;

      if (
        cfg.forbidDeepRelativeImports &&
        JS_TS_EXTENSIONS.includes(ext) &&
        (spec.startsWith('../') || /^\.\/[^/]+\//.test(spec))
      ) {
        errors.push(
          `[relative-import] ${relFile}:${imp.line} — Import relativo "${spec}" no permitido entre carpetas; usa alias de módulo y reserva "./sibling" al mismo directorio.`
        );
      }

      const resolved = JS_TS_EXTENSIONS.includes(ext) ? resolveJsTsSpecifier(spec, file, rootDir, aliases) : null;
      const target = resolved ? detectFileContext(resolved, cfg) : parseTargetFromSpecifier(spec, cfg);
      const importsCompositionRoot = resolved
        ? target.inComposition
        : cfg.compositionImportPrefixes.some((p) => spec.startsWith(p));

      if ((ctx.inCore || ctx.feature) && !ctx.inComposition && importsCompositionRoot) {
        errors.push(
          `[composition-leak] ${relFile}:${imp.line} — La raíz de composición ("${spec}") no puede importarse desde core/common ni desde features.`
        );
      }

      if (ctx.inCore && target.feature) {
        errors.push(
          `[core-to-feature] ${relFile}:${imp.line} — El kernel compartido (core/common) no puede importar la feature "${target.feature}" ("${spec}").`
        );
      }

      if (
        ctx.feature &&
        target.feature &&
        ctx.feature !== target.feature &&
        !(allowedCrossFeatureRx && allowedCrossFeatureRx.test(target.remainder))
      ) {
        errors.push(
          `[cross-feature] ${relFile}:${imp.line} — La feature "${ctx.feature}" no puede importar otra feature "${target.feature}" ("${spec}").`
        );
      }

      const sameScopeOrLayerCheck = !target.feature || target.feature === ctx.feature;
      if (ctx.layer && target.layer && sameScopeOrLayerCheck) {
        if (ctx.layer === 'domain' && target.layer !== 'domain') {
          errors.push(
            `[domain-isolation] ${relFile}:${imp.line} — La capa domain no puede depender de "${target.layer}" ("${spec}").`
          );
        } else if (
          ctx.layer === 'application' &&
          ['infrastructure', 'ui', 'api'].includes(target.layer)
        ) {
          errors.push(
            `[application-isolation] ${relFile}:${imp.line} — La capa application no puede depender de "${target.layer}" ("${spec}").`
          );
        } else if (
          ctx.layer === 'ui' &&
          target.layer === 'infrastructure' &&
          !allowedUiInfraRx.test(target.remainder || spec)
        ) {
          errors.push(
            `[ui-to-adapter] ${relFile}:${imp.line} — La capa ui no puede importar adaptadores concretos de infrastructure ("${spec}"); inyecta únicamente tokens de composición y casos de uso.`
          );
        }
      }
    }
  }

  if (errors.length > 0) {
    console.error(`Se detectaron ${errors.length} violaciones de fronteras arquitectónicas:\n`);
    for (const err of errors) console.error(`  ✗ ${err}`);
    process.exit(1);
  }

  console.log(`✓ Fronteras arquitectónicas verificadas sin violaciones (${files.length} archivos inspeccionados).`);
}

main();
