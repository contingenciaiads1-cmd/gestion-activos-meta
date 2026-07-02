# Gestión de Activos Meta — por Converxio

Panel de auditoría del perfil de Meta (páginas, Business Managers, cuentas publicitarias, tarjetas y WhatsApp) que corre como **bookmarklet** dentro de facebook.com / business.facebook.com. Solo lectura, con una única escritura opcional (renombrar BM, con confirmación).

## Archivos

- **`gestor-meta.js`** — código legible (fuente de verdad; aquí se edita).
- **`gestor-meta-bookmarklet.txt`** — bookmarklet **autocontenido** (todo el código embebido). El más confiable. Pégalo como URL de un marcador.
- **`cargador-bookmarklet.txt`** — bookmarklet **cargador** (auto-actualización): baja `gestor-meta.js` desde una URL que tú alojas. Editas el archivo alojado y **todos** obtienen la nueva versión sin recopiar nada.

## Cómo actualizar (dentro del panel)

- Botón **🔄 Actualizar** (arriba a la derecha): vacía las cachés y vuelve a leer todo desde Meta.

## Auto-actualización para otros (como fbacc.io)

Dos caminos, según qué tanto control quieras:

1. **Cargador remoto (auto-update real).**
   - Sube `gestor-meta.js` a una URL pública (GitHub Raw, un Gist, jsDelivr, o tu propio servidor). Ejemplo con jsDelivr: `https://cdn.jsdelivr.net/gh/USUARIO/REPO@main/gestor-meta.js`.
   - En `cargador-bookmarklet.txt`, reemplaza `PON_TU_URL_AQUI` por tu URL base.
   - Reparte el **cargador** como marcador. Cuando edites y vuelvas a subir `gestor-meta.js`, todos cargarán la última versión (el `?t=` evita caché).
   - ⚠️ **Aviso honesto de CSP:** `business.facebook.com` tiene una política de seguridad (CSP) estricta que **puede bloquear** cargar un script externo. Si se bloquea: (a) usa el bookmarklet **autocontenido**, o (b) pega el cargador en la **consola** (F12 → escribe `allow pasting` → Enter), que suele saltarse el CSP. Pruébalo en tu navegador antes de repartirlo.

2. **Aviso de versión (a prueba de fallos).**
   - En `gestor-meta.js`, pon en `UPDATE_URL` la URL de un JSON como `{"version":"v3.1 · 2026-08","url":"https://.../instrucciones"}`.
   - Al abrir el panel, si la versión difiere aparece un chip **⬆️ Nueva versión** que enlaza a tus instrucciones. Si el CSP bloquea la petición, no pasa nada (falla en silencio).

## Sobre "proteger el código" (importante, sin humo)

El código de un bookmarklet corre en el navegador del usuario, así que **cualquiera puede leerlo**: no existe protección real 100% en cliente. Lo que sí ayuda:

- **Alojar remoto (cargador):** el marcador que repartes es un cargador diminuto; la lógica vive en tu URL y puedes **cambiarla o apagarla** cuando quieras (kill-switch: si borras el archivo, deja de funcionar para todos).
- **Minificar/ofuscar** el archivo alojado sube la barrera para copiarlo (no lo impide).
- **Servidor con autenticación:** si de verdad necesitas controlar quién lo usa, sírvelo desde un backend que valide un token/sesión antes de entregar el JS. Eso es lo único que "protege" de verdad, y ya no es un bookmarklet puro.
- Ojo: **no** se puede usar `eval`/`atob` para ofuscar dentro de Facebook — su CSP bloquea `eval`, así que el código debe ir en claro.

## Seguridad ya incluida

- **Guardarraíl de dominio:** solo corre en facebook.com / business.facebook.com; en otra web se detiene para no exponer tu token de sesión.
- **Solo lectura**, salvo ✏️ Renombrar BM (pide confirmación explícita antes de escribir).
- Todo dato de Meta se **escapa** antes de mostrarse (evita inyección de HTML).
