# Línea Base de Rigor del Compilador y del Linter

Las reglas de higiene solo se sostienen si el compilador y el linter las hacen cumplir en cada build. Esta línea base es el mínimo obligatorio; un proyecto puede endurecerla, nunca relajarla sin una decisión arquitectónica documentada.

## 1. TypeScript (frontend y Node)

Activar en el `tsconfig.json` raíz (y heredarlo en los `tsconfig.*.json` derivados):

```jsonc
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,          // arr[i] y dict[k] son T | undefined
    "noImplicitOverride": true,                // override explícito en clases derivadas
    "noPropertyAccessFromIndexSignature": true, // obj['clave'] para firmas de índice
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "forceConsistentCasingInFileNames": true,
    "isolatedModules": true
  },
  // Solo Angular: plantillas con el mismo rigor que el código.
  "angularCompilerOptions": {
    "strictTemplates": true,
    "strictInjectionParameters": true,
    "strictInputAccessModifiers": true
  }
}
```

- Ejecutar en CI una verificación de símbolos sin uso que no bloquee la edición local: `tsc --noEmit --noUnusedLocals --noUnusedParameters -p tsconfig.app.json` (y el `tsconfig` de pruebas).
- Prohibido bajar cualquiera de estas banderas en un `tsconfig` hijo para que compile un archivo concreto.

## 2. ESLint (frontend)

Configuración plana (`eslint.config.js`) con estas reglas en **error**:

```js
export default [
  {
    files: ['**/*.ts'],
    rules: {
      // Imports por alias de módulo; los relativos solo dentro de la misma carpeta.
      'no-restricted-imports': ['error', { patterns: [{ group: ['../*'], message: 'Usa el alias de módulo (@core/..., @features/...).' }] }],
      '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-non-null-assertion': 'error',
      'no-console': ['error', { allow: ['warn', 'error'] }],
      // Prohibir las APIs que desactivan la sanitización del framework.
      'no-restricted-properties': ['error',
        ...['bypassSecurityTrustHtml', 'bypassSecurityTrustScript', 'bypassSecurityTrustStyle',
            'bypassSecurityTrustUrl', 'bypassSecurityTrustResourceUrl']
          .map((property) => ({ property, message: 'Desactiva la sanitización: renderiza texto o segmentos seguros.' }))
      ]
      // Angular: '@angular-eslint/component-selector' y 'directive-selector' con el prefijo del proyecto.
    }
  },
  {
    files: ['**/*.html'],
    // Angular: angular.configs.templateRecommended + angular.configs.templateAccessibility.
    // React: eslint-plugin-jsx-a11y (recommended). Vue: eslint-plugin-vuejs-accessibility.
  },
  {
    files: ['e2e/**/*.ts'],
    rules: { 'playwright/no-wait-for-timeout': 'error' }
  }
];
```

- **Equivalentes por framework** para la prohibición de sanitización: React `react/no-danger` (`dangerouslySetInnerHTML`), Vue `vue/no-v-html`. Cada excepción lleva `eslint-disable-next-line <regla> -- <motivo>` y revisión de seguridad. La regla de seguridad que esta configuración hace cumplir está en la §5 de [`security-and-auditability`](../../security-and-auditability/SKILL.md).
- El preset de **accesibilidad de plantillas** del framework es obligatorio y sin supresiones (ver [`institutional-design-system-ux`](../../institutional-design-system-ux/SKILL.md)).
- Las reglas de fronteras (cross-feature, capas) se hacen cumplir con el validador de [`hexagonal-vertical-slices`](../../hexagonal-vertical-slices/SKILL.md) o con una regla ESLint propia del proyecto, que debe tener su propia prueba con casos válidos e inválidos.
- `npm run lint` encadena ESLint, el validador de fronteras y las pruebas de las reglas propias; CI lo ejecuta como compuerta.

## 3. .NET

- `Directory.Build.props` en la raíz fija para todos los proyectos: `TargetFramework`, `<Nullable>enable</Nullable>`, `<ImplicitUsings>enable</ImplicitUsings>`, `<TreatWarningsAsErrors>true</TreatWarningsAsErrors>`, `<AnalysisLevel>latest-recommended</AnalysisLevel>` y `<EnforceCodeStyleInBuild>true</EnforceCodeStyleInBuild>`. Las únicas exclusiones admitidas en `WarningsNotAsErrors` son las de disponibilidad de herramientas descritas en el pilar 1 de la [skill](../SKILL.md).
- Versiones de paquetes solo en `Directory.Packages.props` (`ManagePackageVersionsCentrally`); los `.csproj` no llevan `Version`. Ver la línea base de build en [`enterprise-app-blueprint`](../../enterprise-app-blueprint/SKILL.md).
- `.editorconfig` con severidad `error` para las reglas que el pilar 3 exige y el compilador puede verificar:

```ini
[*.cs]
dotnet_diagnostic.IDE0005.severity = error   # using sin uso
dotnet_diagnostic.IDE0001.severity = error   # nombre calificado simplificable (FQN en línea)
dotnet_diagnostic.IDE0065.severity = error   # ubicación de using
csharp_using_directive_placement = outside_namespace:error
csharp_style_namespace_declarations = file_scoped:error
```

- `IDE0005` solo se reporta en build si el proyecto genera documentación XML (`<GenerateDocumentationFile>true</GenerateDocumentationFile>` con `CS1591` excluido), o en CI con `dotnet format --verify-no-changes`.
- Logging tipado con generación en compilación (`[LoggerMessage]`) en lugar de `logger.LogInformation($"...")`: evita la interpolación en caliente y fija el `EventId`.

## 4. Sintaxis moderna por stack

El documento de estándares de cada stack (`docs/estandares/estandares-<stack>.md`) declara qué sintaxis moderna es obligatoria y sus excepciones. Ejemplos .NET: constructores primarios, namespaces de ámbito de archivo, expresiones de colección, *pattern matching*; excepción: árboles de expresión del ORM que no admiten esas construcciones. Ejemplos TypeScript/Angular: `inject()`, signals, control de flujo `@if`/`@for` en plantillas, componentes standalone.
