# Línea Base de Build, Toolchain y Empaquetado

Configuración mínima que todo proyecto nuevo trae desde el primer commit. Las plantillas viven en [`resources/`](../resources/) y el scaffold las copia con `--dotnet` (archivos .NET) o siempre (archivos agnósticos). Funciona igual en Windows + IIS y en Linux + Docker.

## 1. Grafo de proyectos compilados (backend .NET)

Cada capa es un **proyecto propio** y el compilador impide los atajos; el linter de fronteras queda como segunda línea.

| Proyecto | Referencias permitidas |
| --- | --- |
| `<App>.Domain` | Ninguna (ni paquetes de infraestructura). |
| `<App>.Application` | `Domain`. |
| `<App>.Infrastructure` | `Domain`, `Application`. |
| `<App>.Api` | Compone todo; es la única raíz de composición HTTP. |
| `<App>.DbMigrator` | `Infrastructure` (nunca referenciado por `Api`). |

- **Un proyecto de pruebas por proyecto de `src`**, que referencia solo lo que prueba: las pruebas de `Application` no referencian `Infrastructure` ni `Api`, así un test de caso de uso no puede tocar la base de datos por accidente. Las pruebas de integración contra base real viven en su propio proyecto.
- El grafo es acíclico y se documenta en la tabla de proyectos de `docs/arquitectura/backend-architecture.md`.

## 2. Build centralizado (.NET)

- **`Directory.Build.props`** ([plantilla](../resources/Directory.Build.props.template)) en la raíz declara una sola vez: `TargetFramework`, `Nullable=enable`, `ImplicitUsings`, `LangVersion`, `TreatWarningsAsErrors=true`, `AnalysisLevel` y `EnforceCodeStyleInBuild=true`. Los `.csproj` no repiten estas propiedades. `WarningsNotAsErrors` solo admite códigos justificados en un comentario (p. ej. avisos de auditoría NuGet que la compuerta de seguridad ya bloquea por su cuenta).
- **`Directory.Packages.props`** ([plantilla](../resources/Directory.Packages.props.template)) con `ManagePackageVersionsCentrally=true`: las versiones viven solo aquí y los `.csproj` usan `<PackageReference Include="..."/>` sin `Version`. Cada **pin de dependencia transitiva** (`CentralPackageTransitivePinningEnabled` o `PackageVersion` explícito) lleva un comentario con el aviso que corrige y la condición para retirarlo.
- **`nuget.config`** ([plantilla](../resources/nuget.config.template)) con `<clear/>` y solo las fuentes aprobadas; con más de una fuente, `packageSourceMapping` asigna cada prefijo de paquete a su fuente.
- **`global.json`** ([plantilla](../resources/global.json.template)): versión base del SDK con `rollForward: latestPatch` y `allowPrerelease: false`. Admite parches de seguridad del SDK sin saltar de banda; la compuerta de tecnologías registra la versión efectiva.
- **Analizadores en `.editorconfig`**: la sección `[*.cs]` fija como error `IDE0005` (usings sin uso), `IDE0001` (nombres simplificables, prohíbe nombres totalmente calificados en línea) e `IDE0065` (`using` fuera del *namespace*). Con `EnforceCodeStyleInBuild` el build falla, no solo el IDE.

## 3. Frontend y Node

- Versión exacta de Node en `.node-version`/`.nvmrc` y verificación en `preinstall` que aborta con otra versión.
- `package-lock.json` versionado; CI usa `npm ci`. Prohibido `npm install` en CI.
- La línea base de `tsconfig` estricto y reglas de lint vive en `clean-code-and-standards` (toolchain estricto).

## 4. Finales de línea y codificación

- `.editorconfig` ([plantilla](../resources/.editorconfig.template)): UTF-8 sin BOM, `end_of_line = lf` en todo el repositorio; `crlf` solo para `*.cmd`, `*.bat` y `*.ps1`.
- `.gitattributes` ([plantilla](../resources/.gitattributes.template)): `* text=auto eol=lf`, `eol=crlf` para scripts de Windows y `binary` para imágenes, fuentes, PDF y certificados. Así un clon en Windows (IIS) y uno en Linux/CI producen los mismos bytes, y los scripts `.sh` de las imágenes Docker nunca llevan `CRLF`.
- Prettier con `endOfLine: 'lf'`, coherente con los dos archivos anteriores.

## 5. Imágenes Docker (perfil Linux + Docker)

- Build **multi-etapa**: SDK solo en la etapa de compilación; la imagen final usa el runtime mínimo (`aspnet`, `nginx` sin herramientas extra) fijado por **digest**.
- Usuario **no root** en la imagen final y sistema de archivos de solo lectura salvo volúmenes declarados (llaves, documentos, logs).
- `.dockerignore` ([plantilla](../resources/.dockerignore.template)) excluye `.git`, `bin/`, `obj/`, `node_modules/`, `.env*`, `secrets.json`, `*.local.json` y certificados: un secreto copiado a una capa queda en la imagen aunque una capa posterior lo borre.
- `HEALTHCHECK` (o el `healthcheck` del *compose*) contra `/health/ready`.
- La configuración por ambiente entra por variables de entorno, `env_file` fuera del repositorio o *Docker secrets*, nunca por `COPY`.

## 6. Verificación

- [ ] Ningún `.csproj` declara `TargetFramework`, `Nullable` ni `Version` de paquete; todo sale de los archivos centrales.
- [ ] `dotnet build -c Release` termina con `0 warnings, 0 errors` y falla ante un `using` sobrante.
- [ ] `nuget.config` tiene `<clear/>`; `global.json` usa `latestPatch` sin prerelease.
- [ ] Cada pin transitivo tiene comentario con motivo y condición de retiro.
- [ ] `git ls-files --eol` no muestra archivos de texto con `crlf` fuera de los scripts de Windows.
- [ ] La imagen final corre como usuario no root y no contiene archivos de configuración local ni secretos.
