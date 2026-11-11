# Controles de Autenticación, Sesiones Revocables, Permisos y Anti-IDOR

## 1. Arquitectura de Sesión Revocable con Sello de Seguridad

Las cookies firmadas puramente sin estado (*stateless*) tienen dos debilidades graves en sistemas institucionales: un `logout` no invalida una cookie ya copiada, y quitar un rol/permiso no surte efecto hasta que caduque el ticket.

### Solución
1. Mantener un **almacén de tickets en servidor** acotado en memoria (si corre en un único proceso) o en un almacén compartido revocable (si hay múltiples nodos).
2. Al emitir la sesión, grabar dentro del ticket la `securityVersion` actual del usuario y una fecha de expiración absoluta máxima (ej. 14 días).
3. En cada petición autenticada, el validador de sesión consulta el sello vigente del usuario (compuesto por estado `isActive`, sello de contraseña/credencial y huella de roles/permisos asignados). Si difiere del grabado en el ticket, rechaza e invalida la sesión antes de llegar al controlador.
   - Por defecto, consultar sin caché. Se admite una caché corta del sello (≤ 30 s) **solo** si su clave incluye una generación por usuario que la aplicación incrementa en **todo** cambio de seguridad (desactivar, cambiar contraseña, editar roles/permisos o alcance), de modo que esos cambios apliquen en la siguiente petición. Documentar que un cambio hecho directo en la base de datos, fuera de la aplicación, tarda hasta el TTL en surtir efecto. Medir el vencimiento con el mismo reloj inyectable de la sesión para poder probarlo (p. ej. `CachedSessionSecurityReader` en SICRE).
4. **Vencimiento deslizante que respeta «Recordarme»**: si el framework solo conoce una ventana deslizante global, desactivarla y reimplementarla con una política pura y testeable: renovar pasada la mitad de la ventana usando la duración corta (p. ej. 30 min) para sesiones normales y la persistente (p. ej. 14 días) para «Recordarme», sin superar nunca el vencimiento absoluto medido desde el inicio de sesión.
5. **Topes del almacén de sesiones**: limitar sesiones por usuario (p. ej. 10; al superarlo se revoca la más antigua de ese usuario) y una capacidad global (p. ej. 10 000). Si aun así se llena tras liberar las vencidas, el inicio de sesión falla de forma explícita con `503` + `Retry-After`; jamás descartar en silencio una sesión existente ni emitir una cookie sin ticket en servidor.
6. **Bloqueo de cuenta**: tras un número acotado de fallos consecutivos de contraseña (p. ej. 5) bloquear la cuenta local por un tiempo fijo (p. ej. 15 min), activo también para cuentas nuevas. Complementa (no sustituye) los límites de tasa por cuenta e IP, y la respuesta al cliente sigue siendo uniforme para no revelar el bloqueo.

## 2. Permisos en Base de Datos y Separación de Sensibilidad

- Los códigos de permiso siguen un vocabulario en minúsculas separado por puntos (`sistema.modulo.accion`) definido en constantes únicas y sembrado por migración.
- Las políticas de autorización delegan en un lector de permisos (decorable con caché corta de ~30 s invalidada explícitamente al editar usuarios o roles).
- **Endurecimiento para administración de identidades**: gestionar usuarios y roles exige, además del permiso funcional, poseer activamente el rol `Administrator`, impidiendo escalación horizontal desde roles delegados.
- **Consistencia jerárquica al asignar alcances**: validar siempre en `application` que la combinación `Región → Municipio/Distrito → Sede/Unidad` pertenezca realmente a la misma rama jerárquica antes de persistir.

## 3. Recuperación de Contraseña sin Condiciones de Carrera ni Enumeración

1. **Derivación HMAC dedicada**: derivar una subclave de 256 bits con propósito exclusivo + `userId` para calcular `HMAC-SHA-256(codigo)` y comparar con `FixedTimeEquals` / tiempo constante. Es equivalente derivar la subclave solo por propósito versionado (p. ej. `<app>.PasswordReset.Hash.v1`) e incluir el `userId` dentro del mensaje autenticado (`HMAC(subclave, userId + ":" + codigo)`): lo indispensable es que la subclave no se reutilice para otro propósito y que el mismo código no produzca el mismo hash para dos usuarios.
2. **Serialización transaccional por cuenta**: adquirir un bloqueo de aplicación ligado a la transacción (`pg_advisory_xact_lock` / `sp_getapplock`) sobre la clave `PasswordReset:{userId}` antes de leer intentos vigentes, registrar un fallo o consumir el código. Garantiza matemáticamente que 20 peticiones paralelas no superen el tope de 5 intentos ni confirmen dos veces el mismo código.
3. **Límites de tasa duales**: aplicar *rate limiting* tanto por cuenta normalizada como por dirección IP de origen en login, solicitud de código y confirmación.
