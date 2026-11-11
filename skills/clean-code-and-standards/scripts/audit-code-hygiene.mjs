#!/usr/bin/env node
/**
 * Auditor ligero de higiene de código (agnóstico de lenguaje, Node.js soportado y parcheado, cero dependencias).
 * Detecta:
 *   1. Narrativa histórica/conversacional en comentarios ("hallazgo de revisión", "a pedido del usuario", etc.).
 *   2. Supresiones evasivas de compilador/linter sin justificación en la misma línea.
 *   3. Uso directo de relojes estáticos del sistema en código de producción.
 *   4. Bloques sospechosos de código comentado consecutivo.
 *   5. Pruebas deshabilitadas o saltadas (`skip`, `xit`, `Fact(Skip=...)`, `@Disabled`, `@pytest.mark.skip`) sin justificación explícita (prevención de Test Tampering).
 *      Un salto condicional atado al entorno y con motivo (`test.skip(process.env.X !== 'true', 'motivo')`,
 *      `SkipUnless`/`SkipWhen` de xUnit v3, `skipif(..., reason=...)`) no se reporta.
 *
 * Uso:
 *   node audit-code-hygiene.mjs [--root .] [--scan src]
 */

import fs from 'node:fs';
import path from 'node:path';

function parseArgs(argv) {
  const args = { root: process.cwd(), scan: ['src'] };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--root' && argv[i + 1]) args.root = argv[++i];
    else if (argv[i] === '--scan' && argv[i + 1]) args.scan = argv[++i].split(',').map((s) => s.trim());
    else if (argv[i] === '--help' || argv[i] === '-h') {
      console.log('Uso: node audit-code-hygiene.mjs [--root .] [--scan src,backend]');
      process.exit(0);
    }
  }
  return args;
}

const CODE_EXTENSIONS = ['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs', '.cs', '.py', '.go', '.java', '.kt', '.rs'];
// Carpetas generadas (cachés de build, cobertura, reportes de pruebas) y migraciones autogeneradas.
const IGNORE_DIRS = new Set([
  'node_modules', 'dist', 'build', 'bin', 'obj', 'target', 'out', '.git', '.venv', '.angular', '.next', '.nuxt',
  'coverage', 'test-results', 'playwright-report', 'Migrations', 'migrations'
]);
const GENERATED_FILE_RX = /\.(?:g|g\.i|designer|generated)\.[^.]+$|\.min\.js$/i;

const NARRATIVE_PATTERNS = [
  /hallazgo\s+de\s+(revisi[oó]n|auditor[ií]a)/i,
  /a\s+pedido\s+del\s+(usuario|cliente)/i,
  /bug\s+real\s+(reportado|corregido)/i,
  /\bver\s+change\s*log\b/i,
  /\bfixed\s+in\s+review\b/i,
  /\bper\s+user\s+request\b/i,
  /\bel\s+sistema\s+deber[aá]\b/i
];

// La justificación va en la misma línea y no puede quedar vacía (`-- motivo`, `— motivo`, `// motivo`).
const SUPPRESSION_PATTERNS = [
  /@ts-ignore\b/,
  /@ts-expect-error\b(?!.*(?:—|--|:)\s*\S)/,
  /#pragma\s+warning\s+disable\b(?!.*\/\/\s*\S)/,
  /\beslint-disable(?:-next-line|-line)?\b(?!.*(?:—|--)\s*\S)/,
  /#\s*type:\s*ignore\b(?!\[)/,
  /@SuppressWarnings\b/
];

const SYSTEM_CLOCK_PATTERNS = [
  /\bDateTime\.UtcNow\b/,
  /\bDateTime\.Now\b/,
  /\bDateTimeOffset\.UtcNow\b/,
  /\bDateTimeOffset\.Now\b/,
  /\bDate\.now\s*\(/,
  /\bnew\s+Date\s*\(\s*\)/,
  /\bdatetime\.now\s*\(/,
  /\bdatetime\.utcnow\s*\(/,
  /\bInstant\.now\s*\(/,
  /\bLocalDateTime\.now\s*\(/,
  /\btime\.Now\s*\(/
];

const COMMENTED_CODE_RX = /^[ \t]*(?:\/\/|#)\s*(?:if\s*\(|for\s*\(|while\s*\(|return\s+[^;]+;|const\s+\w+\s*=|let\s+\w+\s*=|public\s+(?:class|void|async)|private\s+(?:readonly|void|async)|def\s+\w+\s*\(|func\s+\w+\s*\()/;

// `Skip\s*=(?![=>])` evita propiedades como `public int Skip => ...`; `\bSkip` evita `AttributesToSkip`.
const SKIPPED_TEST_PATTERNS = [
  { rx: /\b(?:it|test|describe)\.skip\s*\(/, conditional: isConditionalJsSkip },
  { rx: /\b(?:xit|xtest|xdescribe)\s*\(/ },
  { rx: /\[\s*(?:Fact|Theory)\s*\([^)]*\bSkip\s*=(?![=>])/, conditional: (line) => /\bSkip(?:Unless|When)\s*=/.test(line) },
  { rx: /@(?:Disabled|Ignore)\b/ },
  { rx: /@pytest\.mark\.skip\b/ },
  { rx: /@pytest\.mark\.skipif\b(?!.*\breason\s*=\s*['"][^'"\s])/ },
  { rx: /\bt\.Skip(?:f|Now)?\s*\(/, conditional: (line, ctx) => /^\s*(?:if\b|\}\s*else\b)/.test(ctx.prevLine) && /\bt\.Skipf?\s*\(\s*["`][^"`\s]/.test(line) }
];

// `test.skip(condición, 'motivo')` (Playwright) salta según el entorno; `test.skip('título', fn)` o
// `test.skip()` sin motivo deshabilitan el caso y siguen reportándose.
function isConditionalJsSkip(_line, ctx) {
  const args = callArguments(ctx.source, ctx.openParen);
  if (!args || args.length < 2) return false;
  const [condition, reason] = args;
  return !/^['"`]/.test(condition) && !/^(?:true|!0|1)$/.test(condition) && /^(['"`])\s*\S[\s\S]*\1$/.test(reason);
}

// Argumentos de primer nivel de la llamada que abre en `openParen`; admite llamadas en varias líneas.
function callArguments(source, openParen) {
  const args = [];
  let depth = 0;
  let current = '';
  for (let i = openParen; i < source.length && i < openParen + 2000; i++) {
    const ch = source[i];
    if (ch === '"' || ch === "'" || ch === '`') {
      let j = i + 1;
      while (j < source.length && source[j] !== ch) j += source[j] === '\\' ? 2 : 1;
      if (depth >= 1) current += source.slice(i, j + 1);
      i = j;
      continue;
    }
    if ('([{'.includes(ch)) {
      depth++;
      if (depth === 1) continue;
    } else if (')]}'.includes(ch)) {
      depth--;
      if (depth === 0) {
        if (current.trim()) args.push(current.trim());
        return args;
      }
    } else if (ch === ',' && depth === 1) {
      args.push(current.trim());
      current = '';
      continue;
    }
    if (depth >= 1) current += ch;
  }
  return null;
}

function isTestFile(file) {
  return (
    /[.-](spec|test)\.[^.]+$|_test\.go$|Tests?\.cs$|(?:^|\/)test_[^/]*\.py$|_test\.py$/.test(file) ||
    /(?:^|\/)(?:tests?|e2e|__tests__)\/|(?:^|\/)[^/]+\.Tests?\//.test(file)
  );
}

function walk(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (IGNORE_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, acc);
    else if (CODE_EXTENSIONS.some((ext) => entry.name.endsWith(ext)) && !GENERATED_FILE_RX.test(entry.name)) acc.push(full);
  }
  return acc;
}

function main() {
  const args = parseArgs(process.argv);
  const rootDir = path.resolve(args.root);
  const files = [];
  for (const s of args.scan) walk(path.resolve(rootDir, s), files);

  const findings = [];

  for (const file of files) {
    const rel = path.relative(rootDir, file).split(path.sep).join('/');
    const source = fs.readFileSync(file, 'utf8');
    const lines = source.split('\n');
    const prodFile = !isTestFile(rel);
    let consecutiveCommentedCode = 0;
    let lineStart = 0;

    lines.forEach((line, idx) => {
      const offset = lineStart;
      lineStart += line.length + 1;
      const lineNo = idx + 1;
      const isComment = /^[ \t]*(?:\/\/|#|\/\*|\*)/.test(line) || /\/\/|#/.test(line);

      if (isComment) {
        for (const rx of NARRATIVE_PATTERNS) {
          if (rx.test(line)) {
            findings.push(`[narrative-comment] ${rel}:${lineNo} — Comentario con narrativa histórica o cita funcional: ${line.trim()}`);
            break;
          }
        }
      }

      for (const rx of SUPPRESSION_PATTERNS) {
        if (rx.test(line)) {
          findings.push(`[evasive-suppression] ${rel}:${lineNo} — Supresión de advertencia sin justificación explícita: ${line.trim()}`);
          break;
        }
      }

      if (prodFile && !/^[ \t]*(?:\/\/|#|\/\*|\*)/.test(line) && !/hygiene-allow:\s*system-clock/.test(line)) {
        for (const rx of SYSTEM_CLOCK_PATTERNS) {
          if (rx.test(line)) {
            findings.push(`[direct-clock] ${rel}:${lineNo} — Uso directo del reloj del sistema en producción; inyecta un proveedor de tiempo: ${line.trim()}`);
            break;
          }
        }
      }

      const prevLine = idx > 0 ? lines[idx - 1] : '';
      const allowSkipRx = /hygiene-allow:\s*skipped-test\s*(?:—|--|:)\s*\S+/;
      if (!prodFile && !/^[ \t]*(?:\/\/|#|\/\*|\*)/.test(line) && !allowSkipRx.test(line) && !allowSkipRx.test(prevLine)) {
        for (const { rx, conditional } of SKIPPED_TEST_PATTERNS) {
          const match = rx.exec(line);
          if (match) {
            const ctx = { source, prevLine, openParen: offset + match.index + match[0].length - 1 };
            if (conditional && conditional(line, ctx)) break;
            findings.push(`[skipped-test] ${rel}:${lineNo} — Prueba saltada o deshabilitada sin justificación; prohibido ocultar fallos reales de tests: ${line.trim()}`);
            break;
          }
        }
      }

      if (COMMENTED_CODE_RX.test(line)) {
        consecutiveCommentedCode++;
        if (consecutiveCommentedCode === 2) {
          findings.push(`[commented-code] ${rel}:${lineNo} — Posible bloque de código muerto comentado.`);
        }
      } else {
        consecutiveCommentedCode = 0;
      }
    });
  }

  if (findings.length > 0) {
    console.error(`Se detectaron ${findings.length} hallazgos de higiene de código:\n`);
    for (const f of findings) console.error(`  ✗ ${f}`);
    process.exit(1);
  }

  console.log(`✓ Higiene de código verificada sin hallazgos (${files.length} archivos inspeccionados).`);
}

main();
