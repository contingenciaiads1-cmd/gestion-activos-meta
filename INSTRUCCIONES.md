# Instrucciones — Gestión de Activos Meta (por Converxio / IADS)

Panel que audita tu perfil de Meta (páginas, Business Managers, cuentas publicitarias, tarjetas y WhatsApp). Corre como **bookmarklet** en tu navegador, dentro de facebook.com / business.facebook.com. Solo lectura, salvo renombrar un BM (con confirmación).

## Instalar y usar

1. Abre la **landing**: https://contingenciaiads1-cmd.github.io/gestion-activos-meta/
2. **Arrastra** el botón azul a tu barra de marcadores (o clic derecho → Copiar enlace → crea un marcador con ese enlace).
3. Entra a **facebook.com** o **business.facebook.com** con tu sesión iniciada y pulsa el marcador.
4. Usa las pestañas: **Resumen · Páginas · Business · Cuentas pub. · Exportar · Ayuda**. Botón **🔄 Actualizar** para volver a leer todo.

Si el navegador muestra «Stop!» en la consola, escribe `allow pasting` y pulsa Enter.

## Formas de compartir (elige una)

| Forma | Archivo | Se actualiza solo | Notas |
|---|---|---|---|
| **Comprimido** (como fbacc.io) | `gestor-meta-comprimido.txt` | No (recompartir) | Código ofuscado con LZString. Autocontenido, funciona aunque el CSP bloquee cargas externas. |
| **Cargador remoto** | `cargador-bookmarklet.txt` | **Sí** | Baja el código desde jsDelivr. En business.facebook.com el CSP puede bloquearlo → usar el comprimido o pegar en consola. |
| **Legible** | `gestor-meta-bookmarklet.txt` | No | Igual que el comprimido pero sin ofuscar (para depurar). |

La **landing** ya usa el comprimido, así que compartir = pasar el enlace de la landing.

## Cómo publicar una versión nueva (mantenimiento)

1. Edita `gestor-meta.js` y sube `VERSION` (p. ej. `v3.1 · 2026-08`).
2. Reconstruye los artefactos:
   ```
   node -e "const fs=require('fs');fs.writeFileSync('gestor-meta-bookmarklet.txt','javascript:'+encodeURIComponent(fs.readFileSync('gestor-meta.js','utf8')))"
   node build-compressed.mjs
   node build-landing.mjs
   ```
3. Actualiza `version.json` con la misma cadena de `VERSION`.
4. Sube todo al repo (push a `main`). GitHub Pages y jsDelivr sirven lo nuevo.
   - jsDelivr cachea `@main` ~12 h: para refrescar ya, abre `https://purge.jsdelivr.net/gh/contingenciaiads1-cmd/gestion-activos-meta@main/gestor-meta.js`.
5. Quien use el **cargador** obtiene la nueva versión automáticamente. Quien use el **comprimido** ve el chip **⬆️ Nueva versión** (gracias a `version.json`) y sabe que debe reinstalar desde la landing.

## Seguridad

- **Guardarraíl de dominio:** solo corre en facebook.com / business.facebook.com.
- **Solo lectura**, salvo ✏️ Renombrar BM (pide confirmación).
- Todo dato de Meta se **escapa** antes de mostrarse.
- El código de un bookmarklet **siempre es legible** por quien lo ejecuta: la compresión ofusca (sube la barrera) pero no protege al 100 %. Para control real de quién lo usa + actualizaciones seguras, ver la nota en `LEEME.md` (endpoint propio con clave/kill-switch).
