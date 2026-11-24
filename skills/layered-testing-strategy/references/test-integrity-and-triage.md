# Integridad de las Pruebas y Protocolo ante Fallos (Anti-Tampering)

## Por qué alterar un test para «ponerlo en verde» es un defecto crítico

El único propósito de una prueba automatizada es actuar como alarma independiente frente a defectos del sistema. Si un agente o desarrollador escribe o ejecuta una prueba, observa que falla y modifica la expectativa del test para que coincida con lo que el código devuelve hoy, convierte una falla visible en un **error latente certificado falsamente por la suite**: el pipeline marca verde mientras el defecto real viaja a producción.

---

## Formas prohibidas de manipulación de pruebas (*Test Tampering*)

Quedan **terminantemente prohibidas** todas las variantes directas e indirectas de debilitar pruebas para lograr que pasen:

| Práctica prohibida | Cómo se disfraza | Consecuencia real |
| --- | --- | --- |
| **Ajustar el valor esperado al valor erróneo devuelto** | Cambiar `expect(status).toBe(403)` por `400` o cambiar el `reason` esperado al que hoy escupe el código sin verificar la regla de negocio. | Institucionaliza un bug de seguridad o contrato como «comportamiento esperado». |
| **Aflojar aserciones precisas por genéricas** | Reemplazar `toEqual(objetoExacto)` por `toBeDefined()` / `not.toBeNull()`, o quitar aserciones sobre efectos secundarios (bitácora, Outbox, versión). | El test deja de detectar regresiones reales de datos o pérdida de trazabilidad. |
| **Escribir un test nuevo copiando la salida actual del código sin contrastar el requerimiento** | Ejecutar primero el código defectuoso, leer lo que imprimió y pegar ese resultado en el `Assert`. | Crea un test tautológico que congela los bugs presentes en la implementación. |
| **Silenciar, saltar o borrar el caso que falla** | Agregar `skip`, `todo`, comentar el test o eliminar el escenario borde conflictivo. | Ciega la cobertura justo en el caso límite donde el código falló. |
| **Mockear o puentear la pieza que destapa el fallo** | Sustituir un validador real, filtro antiforgery, política de permisos o consulta SQL por un stub complaciente para que deje de fallar. | Oculta rupturas de integración, seguridad o concurrencia. |
| **Maquillar los datos de entrada para esquivar un caso borde legítimo** | Cambiar un texto con espacios/tildes, una fecha límite o un monto decimal en el test porque el código no lo soporta bien. | Deja el defecto de normalización o cálculo vivo para usuarios reales. |

---

## Salto condicional legítimo frente a manipulación

Saltar una prueba no es manipulación cuando la prueba depende de un entorno que la corrida actual no tiene, y esa dependencia es explícita, verificable y está cubierta por otra corrida versionada. Deben cumplirse **las cuatro condiciones**:

1. **Condición evaluada en código** contra una variable de entorno, perfil o capacidad concreta, nunca un `skip` incondicional (`test.skip(process.env.SECURITY_PREVIEW !== 'true', ...)`, `Assert.SkipUnless(condición, "motivo")` en xUnit v3 (en xUnit 2, un `FactAttribute` propio con `Skip` calculado), `pytest.mark.skipif(...)`).
2. **Motivo escrito en la propia llamada**, que nombra el perfil o artefacto requerido (`'Requiere playwright.security.config.ts y el build QA'`).
3. **Configuración dedicada y versionada que fija la condición** (p. ej. `playwright.security.config.ts` asignando la variable antes de cargar los specs) y un job de CI que la ejecuta: la prueba corre en algún lugar en cada integración.
4. **Existía antes del fallo**: el salto forma parte del diseño de la suite, no se agregó después de ver la prueba en rojo.

Si falta cualquiera, es la fila «Silenciar, saltar o borrar el caso que falla» de la tabla anterior. Un salto por entorno nunca encubre una prueba que falla en el perfil donde sí debe correr.

### Preferir el fallo explícito al salto para suites de infraestructura

Para una suite completa que exige infraestructura (base de datos real, cola, almacenamiento de objetos), la opción por defecto **no es saltar**, sino fallar en voz alta y aislarla:

1. El fixture compartido lanza un error legible si falta su variable (`?? throw new InvalidOperationException("SQL_TEST_CONNECTION debe estar configurada; ver docs/…")`).
2. La suite vive en su propio proyecto o paquete de pruebas y en su propio paso de CI, que provee la variable (servicio de base en el agente, contenedor de Testcontainers o `docker compose`, LocalDB en agentes Windows).
3. El comando local que la corre está documentado en `AGENTS.md`; quien corre solo las pruebas unitarias no la invoca.

El salto condicional queda para specs individuales que dependen de un perfil distinto (como el perfil de seguridad sobre el build productivo). Una suite entera que se salta en silencio puede quedar meses sin ejecutarse sin que nadie lo note.

---

## Política anti-flaky (sin reintentos)

Una prueba intermitente es un defecto, del código o del arnés, y se diagnostica; nunca se tapa con reintentos.

1. **`retries: 0` siempre**: en Playwright, en el runner de unidad y en el pipeline. Un reintento convierte una carrera real (doble envío, orden de eventos, bloqueo) en verde intermitente.
2. **Trazas en el primer fallo**: con `retries: 0`, la opción `trace: 'on-first-retry'` nunca guarda nada; usar `trace: 'retain-on-failure'` (y capturas/video equivalentes) para que el primer fallo deje evidencia.
3. **Timeouts justificados por escrito**: subir un timeout (arranque JIT en frío, primer `connect` a una base recién creada, `ConnectRetryCount` del cliente SQL) es válido solo con un comentario junto a la configuración que explique la causa medida. Nunca como respuesta a un fallo no diagnosticado.
4. **Serie documentada**: las suites que comparten estado (usuarios de prueba con borrador único, una sola instancia de base local, puertos fijos) corren en serie (`workers: 1`, `fullyParallel: false`, `maxParallelThreads: 1`) y la configuración dice por qué. Paralelizar exige primero aislar ese estado.
5. **Esperas eventuales, no pausas**: prohibido `waitForTimeout`/`sleep` en specs; activar la regla de lint correspondiente (`playwright/no-wait-for-timeout`) sobre la carpeta E2E. La única excepción admitida es esperar una ventana real de rate limit del servidor, con marcador de excepción y motivo en la línea.
6. **Nunca desactivar controles para estabilizar**: el rate limiter, el antiforgery o la autenticación siguen activos en E2E; si un 429 aparece, el helper reutiliza la sesión o espera el `Retry-After`, no apaga el limitador.

---

## Protocolo obligatorio de 4 pasos cuando un test falla

Cada vez que una prueba (preexistente o recién escrita) falle:

1. **Presunción de fallo real en producción**:
   - Asumir por defecto que **el test tiene razón y el código de producción contiene un error**.
2. **Trazabilidad contra la fuente de verdad**:
   - Contrastar el comportamiento contra la especificación funcional, `docs/reglas/`, `docs/arquitectura/` y los invariantes del dominio — **jamás** contra lo que la implementación actual «casualmente hace».
3. **Corregir el código de producción**:
   - Si el código incumple la regla, el contrato, el permiso o el caso borde, reparar el código de producción manteniendo intacta (o endureciendo aún más) la aserción del test.
4. **Único caso legítimo para modificar un test existente**:
   - Solo se permite cambiar una aserción cuando se cumplan **las tres condiciones a la vez**:
     1. Se demostró documentalmente que el requerimiento de negocio cambió a propósito en la tarea actual, **o** se demostró un defecto técnico objetivo en el armado del propio test (ej. faltaba avanzar el `FakeClock` o registrar un provider de ruta ajeno a la regla probada).
     2. La nueva aserción sigue siendo **estricta y específica** sobre el comportamiento correcto, nunca más laxa.
     3. Si existe cualquier duda sobre si el comportamiento anterior del test protegía una regla de negocio intencional, **detenerse y preguntar al usuario** antes de tocar la expectativa del test.
