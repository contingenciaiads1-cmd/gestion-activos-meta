// Genera index.html (landing) embebiendo el bookmarklet comprimido como enlace arrastrable.
import { readFileSync, writeFileSync } from 'fs';

// En Facebook el CSP bloquea eval y scripts externos: SOLO funciona la versión
// plana (IIFE, sin eval). Por eso la landing usa el bookmarklet plano.
const bm = readFileSync('gestor-meta-bookmarklet.txt', 'utf8').trim();
const esc = s => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const hrefBm = esc(bm);

const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Gestión de Activos Meta · por Converxio</title>
<meta name="description" content="Panel de auditoría de tu perfil de Meta: páginas, Business Managers, cuentas publicitarias, tarjetas y WhatsApp. Por Converxio / IADS.">
<style>
  *{box-sizing:border-box}
  body{margin:0;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;color:#0f172a;background:#0b1220}
  .wrap{max-width:1000px;margin:0 auto;padding:0 20px}
  header{background:linear-gradient(135deg,#1d4ed8,#0ea5e9);color:#fff;padding:56px 0 64px}
  .brand{display:flex;align-items:center;gap:10px;font-weight:700;font-size:15px;opacity:.95}
  h1{font-size:38px;margin:18px 0 8px;line-height:1.1}
  .sub{font-size:17px;opacity:.95;max-width:640px}
  .ver{display:inline-block;background:rgba(255,255,255,.2);padding:2px 10px;border-radius:12px;font-size:13px;font-weight:600;margin-left:8px;vertical-align:middle}
  .cta{margin-top:28px;display:flex;align-items:center;gap:16px;flex-wrap:wrap}
  .bm{display:inline-block;background:#fff;color:#1d4ed8;font-weight:800;font-size:17px;padding:14px 22px;border-radius:12px;text-decoration:none;box-shadow:0 8px 24px rgba(0,0,0,.25);cursor:grab}
  .bm:active{cursor:grabbing}
  .copy{background:rgba(255,255,255,.15);color:#fff;border:1px solid rgba(255,255,255,.5);font-weight:700;font-size:15px;padding:14px 20px;border-radius:12px;cursor:pointer}
  .copy:hover{background:rgba(255,255,255,.25)}
  .hint{font-size:13px;opacity:.9;flex-basis:100%;margin-top:6px}
  section{background:#fff;border-radius:16px;margin:-32px 0 22px;padding:26px 28px;box-shadow:0 10px 30px rgba(0,0,0,.15)}
  section h2{margin:0 0 14px;font-size:22px}
  .steps{counter-reset:s;display:grid;gap:12px}
  .step{display:flex;gap:12px;align-items:flex-start}
  .step .n{counter-increment:s;background:#1d4ed8;color:#fff;width:26px;height:26px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:700;flex:0 0 auto}
  .step .n::before{content:counter(s)}
  .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:14px}
  .card{border:1px solid #e2e8f0;border-radius:12px;padding:16px}
  .card h3{margin:0 0 6px;font-size:15px}
  .card p{margin:0;font-size:13px;color:#475569;line-height:1.5}
  .note{background:#f0f9ff;border:1px solid #bae6fd;border-radius:12px;padding:14px 16px;font-size:13px;color:#075985}
  code{background:#f1f5f9;padding:1px 6px;border-radius:5px;font-size:13px}
  footer{color:#94a3b8;text-align:center;padding:30px 0 50px;font-size:13px}
  footer a{color:#7dd3fc;font-weight:700;text-decoration:none}
  .promo{background:#0f172a;color:#e2e8f0;border-radius:16px;padding:22px 26px;margin-bottom:22px}
  .promo a{display:inline-block;margin-top:10px;background:#22c55e;color:#052e16;font-weight:800;padding:10px 18px;border-radius:10px;text-decoration:none}
</style>
</head>
<body>
<header>
  <div class="wrap">
    <div class="brand">🤖 Converxio · agencia IADS</div>
    <h1>Gestión de Activos Meta <span class="ver">v3.3</span></h1>
    <p class="sub">Audita en segundos todo lo que hay en tu perfil de Meta: páginas, Business Managers, cuentas publicitarias, tarjetas y WhatsApp. Sin instalar nada, directo en tu navegador.</p>
    <div class="cta">
      <button class="copy" id="copyBtn" type="button">📋 Copiar bookmarklet (recomendado)</button>
      <a class="bm" id="bm" href="${hrefBm}" onclick="return false" title="Arrástrame a tu barra de marcadores">🗂️ o arrastra esto</a>
      <span class="hint"><b>Lo más fiable:</b> pulsa <b>Copiar</b> → crea un marcador nuevo → pega el enlace como URL. (Arrastrar puede fallar por el tamaño del código.)</span>
    </div>
    <textarea id="bmSrc" style="position:absolute;left:-9999px;top:-9999px" readonly>${esc(bm)}</textarea>
  </div>
</header>

<div class="wrap">
  <section>
    <h2>Cómo instalar (30 segundos)</h2>
    <div class="steps">
      <div class="step"><span class="n"></span><div>Muestra la barra de marcadores del navegador (<code>Ctrl/Cmd + Shift + B</code>).</div></div>
      <div class="step"><span class="n"></span><div><b>Arrastra</b> el botón azul de arriba hasta esa barra. Queda guardado como marcador.</div></div>
      <div class="step"><span class="n"></span><div>Entra a <b>facebook.com</b> o <b>business.facebook.com</b> con tu sesión y pulsa el marcador. Se abre el panel.</div></div>
    </div>
    <div class="note" style="margin-top:16px">¿No puedes arrastrar? Haz clic derecho en el botón → «Copiar enlace» y crea un marcador manual pegando ese enlace como URL. Si el navegador bloquea el pegado en la consola, escribe <code>allow pasting</code> y Enter.</div>
  </section>

  <section>
    <h2>Qué hace</h2>
    <div class="grid">
      <div class="card"><h3>📊 Resumen del perfil</h3><p>Auditoría global: cuántas páginas, BMs, cuentas publicitarias, tarjetas, WABAs y el gasto acumulado.</p></div>
      <div class="card"><h3>📋 Páginas</h3><p>Estado, restricción (LIVE/PZRD/DIE), tu rol, personas con rol y el Business Manager dueño de cada página.</p></div>
      <div class="card"><h3>🏢 Business Managers</h3><p>Antigüedad, verificación, si está limpio y si es apto para crear una cuenta de WhatsApp API (WABA).</p></div>
      <div class="card"><h3>💳 Cuentas publicitarias</h3><p>Estado, motivo de inhabilitación, tarjeta/medio de pago, gastado y límite. Por cuenta y por BM.</p></div>
      <div class="card"><h3>📱 WhatsApp</h3><p>Números de cada WABA con su verificación, estado del nombre, OBA (cuenta oficial) y calidad.</p></div>
      <div class="card"><h3>💾 Exportar</h3><p>CSV de páginas, BMs y cuentas. Filtros y buscador en cada sección.</p></div>
    </div>
  </section>

  <section>
    <h2>Seguridad</h2>
    <div class="note">
      🔒 Es de <b>solo lectura</b> (única excepción: renombrar un BM, que pide confirmación). Solo se ejecuta dentro de <b>facebook.com / business.facebook.com</b>; en cualquier otra web se detiene para no exponer tu sesión. Lee el token de <b>tu</b> sesión en tu propio navegador y no lo envía a ningún lado.
    </div>
  </section>

  <div class="promo">
    <b>¿Operas WhatsApp + Meta Ads para tu negocio o tus clientes?</b><br>
    Converxio es tu operador IA 24/7: contesta WhatsApp, opera Meta Ads y hace seguimiento con control humano. Operado por la agencia IADS.
    <br><a href="https://converxio.app" target="_blank" rel="noopener">Conoce Converxio →</a>
  </div>
</div>

<footer>
  Hecho por <a href="https://converxio.app" target="_blank" rel="noopener">Converxio</a> · agencia IADS ·
  <a href="https://github.com/contingenciaiads1-cmd/gestion-activos-meta" target="_blank" rel="noopener">código e instrucciones</a>
</footer>
<script>
  (function(){
    var btn=document.getElementById('copyBtn'), src=document.getElementById('bmSrc');
    if(!btn||!src)return;
    btn.addEventListener('click',function(){
      var code=src.value;
      function done(){var t=btn.textContent;btn.textContent='✅ Copiado — crea un marcador y pégalo como URL';setTimeout(function(){btn.textContent=t;},2800);}
      if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(code).then(done).catch(fallback);}else{fallback();}
      function fallback(){src.style.left='0';src.focus();src.select();try{document.execCommand('copy');}catch(e){}src.style.left='-9999px';done();}
    });
  })();
</script>
</body>
</html>
`;

writeFileSync('index.html', html);
console.log('index.html generado (' + html.length + ' chars)');
