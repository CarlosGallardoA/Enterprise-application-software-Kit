#!/usr/bin/env node
// Generador de gobierno documental para aplicaciones nuevas (Node.js soportado y parcheado, cero dependencias).
// Crea AGENTS.md, DESIGN.md, .editorconfig, .gitattributes, .gitignore y las 10 subcarpetas canónicas
// de docs/ (5 obligatorias para check-docs-governance.mjs + 5 opcionales) con sus documentos base
// enlazados (arquitectura con secciones obligatorias, guías con checklist de PR y despliegue por perfil
// de hospedaje), la política de tecnologías, el informe inicial de seguridad de tecnologías (estado
// BLOQUEADO hasta la primera corrida real) y la primera entrada numerada de docs/historial/changelog.md.
// --dotnet agrega global.json, Directory.Build.props, Directory.Packages.props y nuget.config;
// --docker agrega .dockerignore.
//
// Uso:
//   node scaffold-project-docs.mjs --target <ruta-proyecto> --name "MiSistema" [--dotnet] [--docker] [--force]

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const resourcesDir = path.resolve(__dirname, '../resources');
const designTemplatePath = path.resolve(__dirname, '../../institutional-design-system-ux/resources/DESIGN.template.md');
const technologySecurityPolicyPath = path.resolve(__dirname, '../../security-and-auditability/references/technology-security-policy.md');

function parseArgs(argv) {
  const args = { target: process.cwd(), name: 'MiProyecto', force: false, dotnet: false, docker: false };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--target' && argv[i + 1]) args.target = argv[++i];
    else if (argv[i] === '--name' && argv[i + 1]) args.name = argv[++i];
    else if (argv[i] === '--force') args.force = true;
    else if (argv[i] === '--dotnet') args.dotnet = true;
    else if (argv[i] === '--docker') args.docker = true;
    else if (argv[i] === '--help' || argv[i] === '-h') {
      console.log('Uso: node scaffold-project-docs.mjs --target <dir> --name "NombreProyecto" [--dotnet] [--docker] [--force]');
      process.exit(0);
    }
  }
  return args;
}

const CANONICAL_DOCS_DIRS = [
  'arquitectura',
  'requisitos',
  'guias',
  'operacion',
  'decisiones',
  'auditorias',
  'planes',
  'reglas',
  'estandares',
  'historial'
];

function writeIfMissing(destPath, content, force) {
  fs.mkdirSync(path.dirname(destPath), { recursive: true });
  if (fs.existsSync(destPath) && !force) return false;
  fs.writeFileSync(destPath, content, 'utf8');
  return true;
}

function renderTemplate(raw, name, todayIso, stack = '') {
  return raw
    .replaceAll('<NOMBRE_PROYECTO>', name)
    .replaceAll('<FECHA_HOY>', todayIso)
    .replaceAll('<STACK>', stack);
}

function main() {
  const args = parseArgs(process.argv);
  const targetRoot = path.resolve(args.target);
  const todayIso = new Date().toISOString().slice(0, 10);
  const technologySecurityPolicy = fs.readFileSync(technologySecurityPolicyPath, 'utf8');

  for (const sub of CANONICAL_DOCS_DIRS) {
    fs.mkdirSync(path.join(targetRoot, 'docs', sub), { recursive: true });
  }

  const created = [];
  const skipped = [];
  const emit = (relPath, content) => {
    const ok = writeIfMissing(path.join(targetRoot, relPath), content, args.force);
    (ok ? created : skipped).push(relPath);
  };

  emit(
    'AGENTS.md',
    renderTemplate(fs.readFileSync(path.join(resourcesDir, 'AGENTS.template.md'), 'utf8'), args.name, todayIso)
  );
  emit(
    'docs/AGENTS.md',
    renderTemplate(fs.readFileSync(path.join(resourcesDir, 'docs-AGENTS.template.md'), 'utf8'), args.name, todayIso)
  );
  emit(
    'docs/reglas/reglas-generales.md',
    renderTemplate(fs.readFileSync(path.join(resourcesDir, 'reglas-generales.template.md'), 'utf8'), args.name, todayIso)
  );
  emit('docs/reglas/seguridad-de-tecnologias.md', technologySecurityPolicy);
  emit(
    'docs/auditorias/seguridad-tecnologias.md',
    renderTemplate(fs.readFileSync(path.join(resourcesDir, 'seguridad-tecnologias.template.md'), 'utf8'), args.name, todayIso)
  );
  emit(
    'docs/historial/changelog.md',
    renderTemplate(fs.readFileSync(path.join(resourcesDir, 'changelog.template.md'), 'utf8'), args.name, todayIso)
  );
  const readResource = (file) => fs.readFileSync(path.join(resourcesDir, file), 'utf8');

  emit('.editorconfig', readResource('.editorconfig.template'));
  emit('.gitattributes', readResource('.gitattributes.template'));
  emit('.gitignore', readResource('.gitignore.template'));

  if (args.dotnet) {
    emit('global.json', readResource('global.json.template'));
    emit('Directory.Build.props', readResource('Directory.Build.props.template'));
    emit('Directory.Packages.props', readResource('Directory.Packages.props.template'));
    emit('nuget.config', readResource('nuget.config.template'));
  }
  if (args.docker) {
    emit('.dockerignore', readResource('.dockerignore.template'));
  }

  emit('docs/arquitectura/backend-architecture.md', renderTemplate(readResource('backend-architecture.template.md'), args.name, todayIso));
  emit('docs/arquitectura/frontend-architecture.md', renderTemplate(readResource('frontend-architecture.template.md'), args.name, todayIso));
  emit('docs/guias/backend-guide.md', renderTemplate(readResource('stack-guide.template.md'), args.name, todayIso, 'Backend'));
  emit('docs/guias/frontend-guide.md', renderTemplate(readResource('stack-guide.template.md'), args.name, todayIso, 'Frontend'));
  emit('docs/operacion/deployment.md', renderTemplate(readResource('deployment.template.md'), args.name, todayIso));

  if (fs.existsSync(designTemplatePath)) {
    emit('DESIGN.md', renderTemplate(fs.readFileSync(designTemplatePath, 'utf8'), args.name, todayIso));
  } else {
    emit('DESIGN.md', `# Sistema de Diseño — ${args.name}\n\nTokens semánticos, escalas y reglas de accesibilidad.\n`);
  }

  // Documentos base enlazados desde AGENTS.md para arrancar sin enlaces rotos
  const starterDocs = {
    'docs/arquitectura/principios-generales.md': `# Principios Generales de Arquitectura\n\nRegla obligatoria antes de tocar código: identificar el vertical slice y la capa exacta (\`domain\` → \`application\` → \`infrastructure\` / \`ui\`) manteniendo dependencias estrictamente hacia adentro.\n`,
    'docs/arquitectura/realtime-and-background-jobs.md': `# Eventos Durables (Outbox), Jobs Periódicos y Sondeo\n\nEspecificación de entrega confiable \`at-least-once\`, workers acotados y \`PollScheduler\` en cliente.\n`,
    'docs/estandares/estandares-backend.md': `# Estándares de Implementación Backend\n\nPolítica de \`0 warnings\`, higiene de comentarios, reloj inyectado y consultas de solo lectura sin tracking.\n\n## Sintaxis moderna\n\nConstrucciones obligatorias de la versión del lenguaje adoptada y sus excepciones conocidas.\n`,
    'docs/estandares/estandares-frontend.md': `# Estándares de Implementación Frontend\n\nComponentes declarativos sin lógica de negocio, tokens semánticos CSS, accesibilidad WCAG AA e i18n por scopes.\n\n## Sintaxis moderna\n\nConstrucciones obligatorias de la versión del lenguaje y del framework adoptados y sus excepciones conocidas.\n`,
    'docs/operacion/logs.md': `# Logs Estructurados y Diagnóstico\n\nCorrelación por \`traceId\`, formato estructurado libre de PII y reporte acotado de errores de cliente.\n`
  };

  for (const [relPath, body] of Object.entries(starterDocs)) {
    emit(relPath, body);
  }

  console.log(`✓ Estructura documental preparada en ${targetRoot} (${created.length} creados, ${skipped.length} conservados).`);
}

main();
