// Autoprueba del validador de fronteras: node --test check-architecture-boundaries.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptsDir = path.dirname(fileURLToPath(import.meta.url));
const checker = path.join(scriptsDir, 'check-architecture-boundaries.mjs');
const fixtures = path.join(scriptsDir, 'fixtures', 'boundaries');

function run(fixture, config = 'boundaries.config.json') {
  const result = spawnSync(process.execPath, [checker, '--root', path.join(fixtures, fixture), '--config', config], {
    encoding: 'utf8'
  });
  return { code: result.status, output: `${result.stdout}${result.stderr}` };
}

test('un proyecto que respeta las fronteras termina en verde', () => {
  const { code, output } = run('clean');
  assert.equal(code, 0, output);
  assert.match(output, /sin violaciones/);
});

test('las pruebas quedan exentas solo de las reglas por capa', () => {
  const { output } = run('clean');
  assert.doesNotMatch(output, /incident-list\.component\.spec\.ts/);
  assert.doesNotMatch(output, /CreateIncidentTests\.cs/);
});

test('cadenas y comentarios con nombres calificados no cuentan como dependencia', () => {
  const { output } = run('clean');
  assert.doesNotMatch(output, /NotAReference|AlsoNot/);
});

const expectedViolations = [
  '[application-isolation] src/Acme.Application/Claims/CreateClaim.cs:4',
  '[forbidden-package] src/Acme.Application/Claims/CreateClaim.cs:5',
  '[forbidden-package] src/Acme.Domain/Claims/Claim.cs:1',
  '[core-to-feature] src/app/core/http/bad.ts:1',
  '[duplicate-import] src/app/features/claims/application/claim-summary.policy.ts:2',
  '[relative-import] src/app/features/claims/application/claim-summary.policy.ts:3',
  '[application-isolation] src/app/features/claims/application/create-claim.use-case.ts:1',
  '[forbidden-package] src/app/features/claims/application/create-claim.use-case.ts:2',
  '[forbidden-package] src/app/features/claims/domain/claim.rule.ts:1',
  '[cross-feature] src/app/features/claims/ui/claim-list.component.spec.ts:1',
  '[cross-feature] src/app/features/claims/ui/claim-list.component.ts:1',
  '[ui-to-adapter] src/app/features/claims/ui/claim-list.component.ts:2',
  '[late-import] src/app/features/claims/ui/late.ts:2'
];

test('cada violación esperada se reporta con su regla y su línea', () => {
  const { code, output } = run('violations');
  assert.equal(code, 1, output);
  for (const violation of expectedViolations) {
    assert.ok(output.includes(violation), `Falta: ${violation}\n${output}`);
  }
});

test('no se reportan violaciones adicionales a las esperadas', () => {
  const { output } = run('violations');
  assert.match(output, new RegExp(`Se detectaron ${expectedViolations.length} violaciones`));
});

test('una spec de ui puede importar el adaptador concreto de su propia feature', () => {
  const { output } = run('violations');
  assert.doesNotMatch(output, /\[ui-to-adapter\] src\/app\/features\/claims\/ui\/claim-list\.component\.spec\.ts/);
});

test('un --config inexistente termina con código 2', () => {
  const { code } = run('clean', 'no-existe.json');
  assert.equal(code, 2);
});
