#!/usr/bin/env node
// Validador de paridad de diccionarios i18n (Node.js soportado y parcheado, cero dependencias).
// Soporta simultáneamente diccionarios raíz (<dir>/es.json, <dir>/en.json) y scopes anidados
// (<dir>/<scope>/es.json, <dir>/<scope>/en.json).
//
// Comprueba:
//   1. Existencia de todos los idiomas requeridos en cada scope.
//   2. Sintaxis JSON válida.
//   3. Paridad exacta de árbol de claves entre idiomas (cero claves faltantes o huérfanas).
//   4. Ausencia de traducciones vacías o de solo espacios.
//   5. Paridad exacta de variables interpoladas (`{{param}}` y `{param}`).
//   6. (Opcional, --check-usage <dirs>) Claves literales usadas en el código que no existen en los diccionarios.
//      Una clave `<scope>.<resto>` se busca en `<dir>/<scope>/<lang>.json` como `<resto>` y, si no resuelve ahí, en el
//      diccionario raíz como clave completa; si la llamada declara `{ scope: 'x' }`, también se prueba `x.<clave>`.
//      Los literales que son argumento de otro pipe (`v | yesNo: 'scope.prefijo' | transloco`) no se evalúan.
//      Solo se evalúan claves literales: las construidas en tiempo de ejecución
//      (`${scope}.${key}`, variables) quedan fuera y deben cubrirse con pruebas. Patrones por defecto:
//      `'clave' | transloco|translate`, `translate('clave')`, `translateLoaded(svc, 'clave')`, `selectTranslate('clave')`,
//      `translateSignal('clave')`, `instant('clave')` y `t('clave')`. Patrones propios: --usage-pattern '<regex>'
//      (repetible; el grupo nombrado `key` o, si no existe, el último grupo capturado es la clave).
//
// Uso:
//   node check-i18n-parity.mjs [--root .] [--i18n public/i18n] [--langs es,en]
//     [--check-usage src/app[,otra/ruta]] [--usage-pattern '<regex>']

import fs from 'node:fs';
import path from 'node:path';

const USAGE =
  'Uso: node check-i18n-parity.mjs [--root .] [--i18n public/i18n] [--langs es,en] [--check-usage src/app[,otra]] [--usage-pattern <regex>]';

const KEY_SOURCE = String.raw`([A-Za-z][\w-]*(?:\.[\w-]+)*)`;
const KEY_SHAPE_RX = /^[A-Za-z][\w-]*(?:\.[\w-]+)*$/;
const DEFAULT_USAGE_PATTERNS = [
  // Plantillas: 'clave' | transloco  /  'clave' | translate. Se excluye el literal que es argumento de otro pipe
  // (`valor | prefijoPipe: 'scope.prefijo' | transloco`), porque ahí el pipe previo compone la clave final.
  String.raw`(?<!:\s*)(['"])` + KEY_SOURCE + String.raw`\1\s*\|\s*(?:transloco|translate)\b`,
  // Llamadas imperativas: translate('clave'), translateLoaded(servicio, 'clave'), t('clave')...
  String.raw`\b(?:translate|translateLoaded|selectTranslate|translateSignal|instant|t)\(\s*(?:[\w.$]+\s*,\s*)?(['"])` +
    KEY_SOURCE +
    String.raw`\1\s*[,)]`
];

function parseArgs(argv) {
  const args = { root: process.cwd(), i18n: 'public/i18n', langs: ['es', 'en'], usageDirs: [], usagePatterns: [] };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--root' && argv[i + 1]) args.root = argv[++i];
    else if (argv[i] === '--i18n' && argv[i + 1]) args.i18n = argv[++i];
    else if (argv[i] === '--langs' && argv[i + 1]) {
      args.langs = argv[++i]
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    } else if (argv[i] === '--check-usage' && argv[i + 1]) {
      args.usageDirs.push(
        ...argv[++i]
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      );
    } else if (argv[i] === '--usage-pattern' && argv[i + 1]) {
      args.usagePatterns.push(argv[++i]);
    } else if (argv[i] === '--help' || argv[i] === '-h') {
      console.log(USAGE);
      process.exit(0);
    }
  }
  return args;
}

function collectScopeDirs(dir, langs, buckets = []) {
  if (!fs.existsSync(dir)) return buckets;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const hasAnyLangFile = entries.some((e) => e.isFile() && langs.some((l) => e.name === `${l}.json`));
  if (hasAnyLangFile) buckets.push(dir);

  for (const entry of entries) {
    if (entry.isDirectory()) collectScopeDirs(path.join(dir, entry.name), langs, buckets);
  }
  return buckets;
}

function flattenEntries(obj, prefix = '', out = new Map()) {
  if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) {
    out.set(prefix, obj);
    return out;
  }
  for (const [k, v] of Object.entries(obj)) {
    const nextKey = prefix ? `${prefix}.${k}` : k;
    if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
      flattenEntries(v, nextKey, out);
    } else {
      out.set(nextKey, v);
    }
  }
  return out;
}

function extractPlaceholders(text) {
  const set = new Set();
  for (const m of text.matchAll(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}|\{\s*([a-zA-Z0-9_.-]+)\s*\}/g)) {
    set.add(m[1] ?? m[2]);
  }
  return [...set].sort();
}

function walkSources(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', 'dist', 'build', '.git', 'coverage'].includes(e.name)) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walkSources(full, acc);
    else if (/\.(?:html|ts|tsx|js|jsx|mjs|vue|svelte)$/.test(e.name) && !/\.(?:spec|test)\.[^.]+$/.test(e.name)) {
      acc.push(full);
    }
  }
  return acc;
}

// Scope explícito pasado en la misma llamada (p. ej. translateSignal('status.active', {}, { scope: 'adminForms' })):
// la clave se resuelve relativa a ese scope. Recorre la llamada con paréntesis balanceados.
function explicitScope(text, index) {
  const open = text.indexOf('(', index);
  if (open < 0) return null;
  let depth = 0;
  for (let i = open; i < Math.min(text.length, open + 600); i++) {
    if (text[i] === '(') depth++;
    else if (text[i] === ')' && --depth === 0) {
      const m = /\bscope\s*:\s*(['"])([\w-]+)\1/.exec(text.slice(open, i));
      return m ? m[2] : null;
    }
  }
  return null;
}

function lineAt(text, index) {
  let l = 1;
  for (let i = 0; i < index; i++) if (text.charCodeAt(i) === 10) l++;
  return l;
}

// Claves literales usadas en el código que no resuelven en el idioma base (la paridad cubre los demás idiomas).
function checkKeyUsage(args, rootDir, i18nDir, violations) {
  const baseLang = args.langs[0];
  const dictCache = new Map();
  const loadDict = (file) => {
    if (!dictCache.has(file)) {
      let flat = null;
      try {
        flat = fs.existsSync(file) ? flattenEntries(JSON.parse(fs.readFileSync(file, 'utf8'))) : null;
      } catch {
        flat = null; // El JSON inválido ya se reporta en la verificación de paridad.
      }
      dictCache.set(file, flat);
    }
    return dictCache.get(file);
  };
  const rootDict = loadDict(path.join(i18nDir, `${baseLang}.json`));
  const resolves = (key) => {
    const [scope, ...rest] = key.split('.');
    const scopeDict = rest.length > 0 ? loadDict(path.join(i18nDir, scope, `${baseLang}.json`)) : null;
    if (scopeDict && scopeDict.has(rest.join('.'))) return true;
    return Boolean(rootDict && rootDict.has(key));
  };

  const patterns = [...DEFAULT_USAGE_PATTERNS, ...args.usagePatterns].map((source) => {
    try {
      return new RegExp(source, 'g');
    } catch (err) {
      console.error(`✗ --usage-pattern inválido "${source}": ${err.message}`);
      process.exit(2);
    }
  });

  let filesScanned = 0;
  let keysChecked = 0;
  for (const dir of args.usageDirs) {
    for (const file of walkSources(path.resolve(rootDir, dir))) {
      filesScanned++;
      const text = fs.readFileSync(file, 'utf8');
      const relFile = path.relative(rootDir, file).split(path.sep).join('/');
      const seen = new Set();
      for (const rx of patterns) {
        for (const m of text.matchAll(rx)) {
          const key = m.groups?.key ?? m.slice(1).filter((g) => g !== undefined).pop();
          if (!key || !KEY_SHAPE_RX.test(key)) continue;
          const line = lineAt(text, m.index);
          if (seen.has(`${line}:${key}`)) continue;
          seen.add(`${line}:${key}`);
          keysChecked++;
          const scope = m[0].includes('(') ? explicitScope(text, m.index) : null;
          if (!resolves(key) && !(scope && resolves(`${scope}.${key}`))) {
            violations.push(
              `[unknown-i18n-key] ${relFile}:${line} -> La clave '${key}' no existe en el diccionario '${baseLang}' (ni en su scope ni en la raíz).`
            );
          }
        }
      }
    }
  }
  return { filesScanned, keysChecked };
}

function main() {
  const args = parseArgs(process.argv);
  const rootDir = path.resolve(args.root);
  const i18nDir = path.resolve(rootDir, args.i18n);

  if (!fs.existsSync(i18nDir)) {
    console.error(`✗ No existe el directorio i18n: ${i18nDir}`);
    process.exit(1);
  }
  if (args.langs.length < 2) {
    console.error('✗ Especifica al menos 2 idiomas en --langs (ej. es,en).');
    process.exit(1);
  }

  const buckets = collectScopeDirs(i18nDir, args.langs);
  if (buckets.length === 0) {
    console.error(`✗ No se encontraron archivos JSON para [${args.langs.join(', ')}] en ${i18nDir}`);
    process.exit(1);
  }

  const violations = [];
  const baseLang = args.langs[0];

  for (const bucketDir of buckets) {
    const relBucket = path.relative(rootDir, bucketDir).split(path.sep).join('/') || '.';
    const parsedByLang = new Map();

    for (const lang of args.langs) {
      const file = path.join(bucketDir, `${lang}.json`);
      const relFile = path.relative(rootDir, file).split(path.sep).join('/');
      if (!fs.existsSync(file)) {
        violations.push(`[missing-lang-file] ${relBucket} -> Falta el archivo '${lang}.json'.`);
        continue;
      }
      try {
        const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
        const flat = flattenEntries(raw);
        for (const [k, v] of flat.entries()) {
          if (typeof v === 'string' && v.trim().length === 0) {
            violations.push(`[empty-translation] ${relFile} -> La clave '${k}' está vacía.`);
          }
        }
        parsedByLang.set(lang, { relFile, flat });
      } catch (err) {
        violations.push(`[invalid-json] ${relFile} -> JSON inválido: ${err.message}`);
      }
    }

    const baseData = parsedByLang.get(baseLang);
    if (!baseData) continue;

    for (const lang of args.langs.slice(1)) {
      const targetData = parsedByLang.get(lang);
      if (!targetData) continue;

      for (const [key, baseVal] of baseData.flat.entries()) {
        if (!targetData.flat.has(key)) {
          violations.push(`[missing-i18n-key] ${targetData.relFile} -> Falta la clave '${key}' (definida en ${baseData.relFile}).`);
          continue;
        }
        const targetVal = targetData.flat.get(key);
        if (typeof baseVal !== typeof targetVal) {
          violations.push(`[type-mismatch] ${targetData.relFile} -> Tipo distinto en '${key}' respecto a ${baseLang}.`);
          continue;
        }
        if (typeof baseVal === 'string' && typeof targetVal === 'string') {
          const basePh = extractPlaceholders(baseVal);
          const targetPh = extractPlaceholders(targetVal);
          if (basePh.join(',') !== targetPh.join(',')) {
            violations.push(
              `[placeholder-mismatch] ${targetData.relFile} -> Variables distintas en '${key}': ${baseLang}=[${basePh.join(', ')}] vs ${lang}=[${targetPh.join(', ')}].`
            );
          }
        }
      }

      for (const key of targetData.flat.keys()) {
        if (!baseData.flat.has(key)) {
          violations.push(`[extra-i18n-key] ${targetData.relFile} -> Clave huérfana '${key}' no existe en ${baseData.relFile}.`);
        }
      }
    }
  }

  const usage = args.usageDirs.length > 0 ? checkKeyUsage(args, rootDir, i18nDir, violations) : null;
  const usageNote = usage ? ` Uso en código: ${usage.keysChecked} claves literales en ${usage.filesScanned} archivos.` : '';

  if (violations.length > 0) {
    console.error(`Se detectaron ${violations.length} errores de paridad i18n:\n`);
    for (const v of violations) console.error(`  ✗ ${v}`);
    process.exit(1);
  }

  console.log(`✓ Paridad i18n verificada en ${buckets.length} scopes para [${args.langs.join(', ')}].${usageNote}`);
}

main();
