#!/usr/bin/env node
// Validador de gobierno documental para repositorios con AGENTS.md + docs/ (Node.js soportado y parcheado, cero dependencias).
// Comprueba:
//   1. Existencia y concisión de AGENTS.md en la raíz (evita que vuelva a inflarse como enciclopedia) y que enlace
//      los documentos de entrada obligatorios.
//   2. Existencia de docs/AGENTS.md y de las 5 subcarpetas obligatorias (las otras 5 canónicas son opcionales).
//   3. Ningún archivo suelto (de cualquier extensión) en la raíz de docs/, salvo docs/AGENTS.md.
//   4. Política de tecnologías (docs/reglas/seguridad-de-tecnologias.md) e informe (docs/auditorias/seguridad-tecnologias.md)
//      presentes y enlazados desde AGENTS.md / docs/reglas/reglas-generales.md.
//   5. Integridad de los enlaces relativos Markdown en AGENTS.md, DESIGN.md y docs/**/*.md. En changelog.md solo se
//      valida la entrada más reciente: las anteriores son historial congelado y no se reescriben tras mover archivos.
//   6. Todos los encabezados `### AAAA-MM-DD (N)` de docs/historial/changelog.md: sin números duplicados, sin saltos,
//      en orden descendente de arriba hacia abajo y con fechas no crecientes. Un historial heredado puede excluirse
//      con --changelog-from <N> o con el marcador `<!-- governance:changelog-from N -->` dentro del changelog.
//   7. (Opcional, --e2e-dir) Sincronía entre los specs E2E en disco y el registro de specs de AGENTS.md.
//
// Uso:
//   node check-docs-governance.mjs [--root .] [--max-agents-lines 120] [--changelog-from <N>] [--e2e-dir <ruta>]

import fs from 'node:fs';
import path from 'node:path';

const USAGE =
  'Uso: node check-docs-governance.mjs [--root .] [--max-agents-lines 120] [--changelog-from <N>] [--e2e-dir <ruta relativa a root>]';

function parseArgs(argv) {
  const args = { root: process.cwd(), maxAgentsLines: 120, changelogFrom: null, e2eDir: null };
  for (let i = 2; i < argv.length; i++) {
    const flag = argv[i];
    const value = argv[i + 1];
    if (flag === '--help' || flag === '-h') {
      console.log(USAGE);
      process.exit(0);
    } else if (flag === '--root' && value) {
      args.root = value;
      i++;
    } else if (flag === '--max-agents-lines' && value) {
      args.maxAgentsLines = positiveInteger(flag, value);
      i++;
    } else if (flag === '--changelog-from' && value) {
      args.changelogFrom = positiveInteger(flag, value);
      i++;
    } else if (flag === '--e2e-dir' && value) {
      args.e2eDir = value;
      i++;
    } else {
      console.error(`Argumento no reconocido o sin valor: '${flag}'.\n${USAGE}`);
      process.exit(2);
    }
  }
  return args;
}

function positiveInteger(flag, raw) {
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) {
    console.error(`${flag} exige un entero positivo (recibido '${raw}').`);
    process.exit(2);
  }
  return n;
}

const REQUIRED_DOCS_DIRS = ['arquitectura', 'reglas', 'estandares', 'operacion', 'historial'];
const AGENTS_REQUIRED_LINKS = [
  'docs/reglas/reglas-generales.md',
  'docs/reglas/seguridad-de-tecnologias.md',
  'docs/arquitectura/principios-generales.md',
  'docs/historial/changelog.md',
  'DESIGN.md'
];
const TECH_POLICY = 'docs/reglas/seguridad-de-tecnologias.md';
const TECH_REPORT = 'docs/auditorias/seguridad-tecnologias.md';
const RULES_DOC = 'docs/reglas/reglas-generales.md';
const CHANGELOG = 'docs/historial/changelog.md';
const MAX_PRINTED_PER_CODE = 25;

const toPosix = (p) => p.split(path.sep).join('/');

function walkMarkdown(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'evidencias' || entry.name === 'node_modules' || entry.name === '.git') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkMarkdown(full, acc);
    else if (entry.name.endsWith('.md')) acc.push(full);
  }
  return acc;
}

// Devuelve los enlaces relativos de un texto Markdown, ignorando bloques de código e inline code (ejemplos ficticios).
function relativeLinks(content) {
  // El inline code se sustituye por un marcador (no por vacío) para que [`texto`](destino) siga contando como enlace.
  const stripped = content.replace(/```[\s\S]*?```/g, '').replace(/`[^`\n]+`/g, 'code');
  const linkRx = /\[[^\]]+\]\((?!https?:\/\/|mailto:|#|file:\/\/)([^)#\s]+)(?:#[^)]+)?\)/g;
  return [...stripped.matchAll(linkRx)].map((m) => {
    try {
      return decodeURI(m[1]);
    } catch {
      return m[1];
    }
  });
}

function linkedTargets(mdFile) {
  if (!fs.existsSync(mdFile)) return new Set();
  const content = fs.readFileSync(mdFile, 'utf8');
  return new Set(relativeLinks(content).map((t) => path.resolve(path.dirname(mdFile), t)));
}

function checkRelativeLinks(mdFile, rootDir, content, violations) {
  const relSource = toPosix(path.relative(rootDir, mdFile));
  for (const targetRel of relativeLinks(content)) {
    // Las evidencias visuales locales están deliberadamente en .gitignore
    if (/(?:^|\/)evidencias\//.test(targetRel)) continue;
    if (!fs.existsSync(path.resolve(path.dirname(mdFile), targetRel))) {
      violations.push(['broken-doc-link', `${relSource} -> enlace roto '${targetRel}'`]);
    }
  }
}

function parseChangelog(changelogPath) {
  const raw = fs.readFileSync(changelogPath, 'utf8');
  const lines = raw.split(/\r?\n/);
  const entryRx = /^###\s+(\d{4}-\d{2}-\d{2})(?:\s+\((\d+)\))?\s*$/;
  const headings = [];
  const invalid = [];
  lines.forEach((line, idx) => {
    if (!line.startsWith('### ')) return;
    const m = line.match(entryRx);
    if (!m) invalid.push({ lineNo: idx + 1, raw: line.trim() });
    else headings.push({ date: m[1], n: m[2] ? Number(m[2]) : null, lineNo: idx + 1, raw: line.trim() });
  });
  const marker = raw.match(/<!--\s*governance:changelog-from\s+(\d+)\s*-->/);
  return { lines, headings, invalid, markerFrom: marker ? Number(marker[1]) : null };
}

function validateChangelog(parsed, from, violations) {
  const where = (h) => `${CHANGELOG}:${h.lineNo}`;
  const { headings, invalid } = parsed;

  if (headings.length === 0) {
    violations.push(['changelog-empty', `${CHANGELOG} -> Debe contener al menos una entrada ### AAAA-MM-DD (1).`]);
    return;
  }

  // Zona vigente: desde arriba hasta la primera entrada (N = ancla), inclusive. Lo de abajo es historial heredado congelado.
  const anchorIdx = headings.findIndex((h) => h.n === from);
  if (anchorIdx < 0 && from > 1) {
    violations.push(['changelog-anchor', `${CHANGELOG} -> El ancla ${from} no corresponde a ninguna entrada '### AAAA-MM-DD (${from})'; se valida todo el archivo.`]);
  }
  const zoneEnd = anchorIdx < 0 ? headings.length : anchorIdx + 1;
  const zone = headings.slice(0, zoneEnd);
  const legacy = headings.slice(zoneEnd);
  const zoneLastLine = legacy.length > 0 ? legacy[0].lineNo : Infinity;

  for (const bad of invalid) {
    if (bad.lineNo < zoneLastLine) {
      violations.push(['changelog-heading', `${CHANGELOG}:${bad.lineNo} -> Encabezado inválido '${bad.raw}'. Usa '### AAAA-MM-DD (N)'.`]);
    }
  }

  for (const h of zone.filter((x) => x.n === null)) {
    violations.push(['changelog-unnumbered', `${where(h)} -> '${h.raw}' debe incluir su número correlativo '### AAAA-MM-DD (N)'.`]);
  }

  const numbered = zone.filter((x) => x.n !== null);
  for (let i = 1; i < numbered.length; i++) {
    const above = numbered[i - 1];
    const current = numbered[i];
    // Un número igual al de arriba se informa como duplicado (más abajo), no también como desorden.
    if (current.n > above.n) {
      violations.push(['changelog-order', `${where(current)} -> (${current.n}) aparece debajo de (${above.n}) en línea ${above.lineNo}; el orden debe ser descendente de arriba hacia abajo.`]);
    } else if (current.n < above.n - 1) {
      violations.push(['changelog-gap', `${where(current)} -> Salto de numeración: tras (${above.n}) en línea ${above.lineNo} se esperaba (${above.n - 1}) y aparece (${current.n}).`]);
    }
    if (current.date > above.date) {
      violations.push(['changelog-date-order', `${where(current)} -> Fecha ${current.date} posterior a ${above.date} de la entrada superior (línea ${above.lineNo}).`]);
    }
  }

  // Duplicados: toda la zona vigente + entradas del historial heredado con número dentro del rango vigente (>= ancla),
  // que suelen ser copias agregadas al final en vez de arriba.
  const seen = new Map();
  for (const h of [...numbered, ...legacy.filter((x) => x.n !== null && x.n >= from)]) {
    if (seen.has(h.n)) {
      violations.push(['changelog-duplicate', `${where(h)} -> Número (${h.n}) duplicado; ya usado en línea ${seen.get(h.n)}.`]);
    } else if (h.lineNo >= zoneLastLine) {
      seen.set(h.n, h.lineNo);
      violations.push(['changelog-misplaced', `${where(h)} -> (${h.n}) quedó dentro del historial heredado; las entradas nuevas se agregan arriba.`]);
    } else {
      seen.set(h.n, h.lineNo);
    }
  }
}

// Texto de la entrada más reciente (para validar sus enlaces sin tocar el historial congelado).
function latestEntryText(parsed) {
  const [first, second] = parsed.headings;
  if (!first) return '';
  const end = second ? second.lineNo - 1 : parsed.lines.length;
  return parsed.lines.slice(first.lineNo - 1, end).join('\n');
}

function e2eRegistry(agentsContent) {
  const names = new Set();
  let inSection = false;
  for (const line of agentsContent.split(/\r?\n/)) {
    if (/^##\s/.test(line)) inSection = /e2e/i.test(line);
    else if (inSection) {
      const m = line.match(/^\s*[-*]\s+`([^`]+)`/);
      if (m) names.add(m[1].trim());
    }
  }
  return names;
}

function checkE2eRegistry(rootDir, e2eDirArg, agentsContent, violations) {
  const e2eDir = path.resolve(rootDir, e2eDirArg);
  if (!fs.existsSync(e2eDir)) {
    violations.push(['e2e-dir-missing', `No existe el directorio E2E '${e2eDirArg}'.`]);
    return;
  }
  const specRx = /^(.+?)\.(?:e2e-spec|e2e|spec|test)\.[cm]?[jt]sx?$/;
  const onDisk = new Set(
    fs.readdirSync(e2eDir, { withFileTypes: true })
      .filter((e) => e.isFile() && specRx.test(e.name))
      .map((e) => e.name.match(specRx)[1])
  );
  const registered = e2eRegistry(agentsContent);
  if (registered.size === 0) {
    violations.push(['e2e-registry-empty', 'AGENTS.md no tiene una sección "## ... e2e" con viñetas `- \`nombre\` — alcance`.']);
  }
  for (const name of onDisk) {
    if (!registered.has(name)) violations.push(['e2e-unregistered', `${toPosix(path.join(e2eDirArg, name))} existe en disco pero no está en el registro de specs de AGENTS.md.`]);
  }
  for (const name of registered) {
    if (!onDisk.has(name)) violations.push(['e2e-stale-registry', `AGENTS.md registra \`${name}\` pero no existe su spec en ${e2eDirArg}.`]);
  }
}

function main() {
  const args = parseArgs(process.argv);
  const rootDir = path.resolve(args.root);
  const abs = (rel) => path.join(rootDir, ...rel.split('/'));
  const violations = [];
  let inspected = 0;

  const rootAgents = abs('AGENTS.md');
  const agentsContent = fs.existsSync(rootAgents) ? fs.readFileSync(rootAgents, 'utf8') : null;
  if (agentsContent === null) {
    violations.push(['missing-root-agents', 'Falta AGENTS.md en la raíz del proyecto.']);
  } else {
    const lineCount = agentsContent.replace(/\r?\n$/, '').split(/\r?\n/).length;
    if (lineCount > args.maxAgentsLines) {
      violations.push(['agents-bloated', `AGENTS.md tiene ${lineCount} líneas (máx. ${args.maxAgentsLines}). Mueve el detalle normativo a docs/reglas/ o docs/estandares/.`]);
    }
    const targets = linkedTargets(rootAgents);
    for (const rel of AGENTS_REQUIRED_LINKS) {
      if (!targets.has(abs(rel))) violations.push(['agents-missing-link', `AGENTS.md no enlaza '${rel}'.`]);
    }
  }

  const docsDir = abs('docs');
  if (!fs.existsSync(abs('docs/AGENTS.md'))) {
    violations.push(['missing-docs-agents', 'Falta docs/AGENTS.md para gobernar la organización de docs/.']);
  }

  if (fs.existsSync(docsDir)) {
    for (const entry of fs.readdirSync(docsDir, { withFileTypes: true })) {
      if (entry.isFile() && entry.name !== 'AGENTS.md') {
        violations.push(['loose-file-in-docs-root', `docs/${entry.name} -> Prohibido dejar archivos sueltos en la raíz de docs/; ubícalo en su subcarpeta (imágenes junto al documento que las usa).`]);
      }
    }
    for (const reqSub of REQUIRED_DOCS_DIRS) {
      if (!fs.existsSync(path.join(docsDir, reqSub))) {
        violations.push(['missing-docs-subdir', `Falta la subcarpeta obligatoria docs/${reqSub}/.`]);
      }
    }
  }

  if (!fs.existsSync(abs(TECH_POLICY))) {
    violations.push(['missing-tech-policy', `Falta ${TECH_POLICY} (política de versiones soportadas y vulnerabilidades).`]);
  }
  if (!fs.existsSync(abs(TECH_REPORT))) {
    violations.push(['missing-tech-report', `Falta ${TECH_REPORT} (informe vigente de la compuerta de seguridad de tecnologías).`]);
  }
  if (fs.existsSync(abs(RULES_DOC))) {
    const ruleTargets = linkedTargets(abs(RULES_DOC));
    for (const rel of [TECH_POLICY, TECH_REPORT]) {
      if (!ruleTargets.has(abs(rel))) violations.push(['rules-missing-link', `${RULES_DOC} no enlaza '${rel}'.`]);
    }
  } else {
    violations.push(['missing-rules-doc', `Falta ${RULES_DOC}.`]);
  }

  const changelogPath = abs(CHANGELOG);
  let parsedChangelog = null;
  if (!fs.existsSync(changelogPath)) {
    violations.push(['missing-changelog', `Falta ${CHANGELOG}.`]);
  } else {
    parsedChangelog = parseChangelog(changelogPath);
    const from = args.changelogFrom ?? parsedChangelog.markerFrom ?? 1;
    validateChangelog(parsedChangelog, from, violations);
  }

  const mdFilesToCheck = [];
  if (agentsContent !== null) mdFilesToCheck.push(rootAgents);
  if (fs.existsSync(abs('DESIGN.md'))) mdFilesToCheck.push(abs('DESIGN.md'));
  walkMarkdown(docsDir, mdFilesToCheck);
  for (const md of mdFilesToCheck) {
    const content = md === changelogPath ? latestEntryText(parsedChangelog) : fs.readFileSync(md, 'utf8');
    checkRelativeLinks(md, rootDir, content, violations);
    inspected++;
  }

  if (args.e2eDir && agentsContent !== null) {
    checkE2eRegistry(rootDir, args.e2eDir, agentsContent, violations);
  }

  if (violations.length > 0) {
    console.error(`Se detectaron ${violations.length} incumplimientos de gobierno documental:\n`);
    const printed = new Map();
    for (const [code, message] of violations) {
      const count = (printed.get(code) ?? 0) + 1;
      printed.set(code, count);
      if (count <= MAX_PRINTED_PER_CODE) console.error(`  ✗ [${code}] ${message}`);
    }
    for (const [code, count] of printed) {
      if (count > MAX_PRINTED_PER_CODE) console.error(`  … [${code}] ${count - MAX_PRINTED_PER_CODE} más sin mostrar.`);
    }
    process.exit(1);
  }

  console.log(`✓ Gobierno documental (AGENTS.md, docs/ y changelog.md) verificado sin errores (${inspected} documentos inspeccionados).`);
}

main();
