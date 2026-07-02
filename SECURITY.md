# Política de seguridad

## Reporte de vulnerabilidades

Si encuentras un problema de seguridad, escríbenos en privado a **grupoidexcom@gmail.com**.
No abras un issue público ni publiques el detalle hasta que lo hayamos corregido.

## Alcance y garantías de la herramienta

- Es un **bookmarklet de solo lectura** que se ejecuta en el navegador del propio usuario.
- Solo corre en **facebook.com / business.facebook.com** (guardarraíl de dominio); en cualquier otro sitio se detiene.
- Lee el **token de la sesión del propio usuario** en su navegador y **no lo envía** a ningún servidor.
- Única operación de escritura: renombrar un Business Manager, con confirmación explícita.

## Qué protege (y qué no) el repositorio

- Las reglas del repositorio (protección de rama, forks desactivados, licencia propietaria)
  protegen el **repositorio** de cambios no autorizados y desincentivan la copia.
- **No** ocultan el código a quien lo ejecuta: cualquier JavaScript de navegador es legible
  por el usuario final. El control real de acceso se logra sirviendo el código desde un
  endpoint propio con clave y kill-switch (ver `LEEME.md`).
