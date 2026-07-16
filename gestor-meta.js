(async function gestorPaginasMeta() {
  'use strict';

  // --- guardarraíl de seguridad --------------------------------------
  // Este panel lee el token de tu sesión de Meta. Solo debe ejecutarse en
  // dominios de Facebook/Meta; si se abre en otra web, se detiene para que
  // el token nunca quede expuesto en una página que no controla Meta.
  const HOST = location.hostname || '';
  // Cubre facebook.com y TODOS sus subdominios (adsmanager, business, www, web, m…) + meta.com.
  const DOMINIOS_OK = ['facebook.com', 'meta.com'];
  const dominioValido = DOMINIOS_OK.some(d => HOST === d || HOST.endsWith('.' + d));
  if (!dominioValido) {
    alert('Gestor Meta: por seguridad, este panel solo funciona dentro de Facebook (facebook.com y subdominios). Abre esa pestaña e inténtalo ahí.\n\nDominio actual: ' + HOST);
    return;
  }

  // limpiar instancia previa
  document.getElementById('gpm-overlay')?.remove();
  document.getElementById('gpm-style')?.remove();
  document.getElementById('gpm-pop')?.remove();

  // --- token de sesión ----------------------------------------------
  // Se busca en varias fuentes porque cada superficie de Meta lo expone distinto
  // (la raíz business.facebook.com/ a veces NO lo trae; Ads Manager y www sí).
  let token, businessID, fbDtsg, userId;
  try { token = require('WebApiApplication').getAccessToken(); } catch (e) {}
  if (!token) { try { token = require('CurrentBusinessUser')?.accessToken; } catch (e) {} }
  if (!token) {
    const html = document.documentElement.innerHTML;
    const patrones = [
      /"accessToken":"(EAA[^"\\]+)"/,
      /accessToken\\?"\s*:\s*\\?"(EAA[^"\\]+)/,
      /\[\s*"accessToken"\s*,\s*"(EAA[^"\\]+)"/,
      /"token":"(EAAB[^"\\]+)"/,
      /(EAAG\w{30,})/, /(EAAB\w{30,})/, /(EAAD\w{30,})/
    ];
    for (const re of patrones) { const m = html.match(re); if (m) { token = m[1]; break; } }
  }
  try { businessID = require('BusinessUnifiedNavigationContext').businessID; } catch (e) {}
  if (!businessID) businessID = new URLSearchParams(location.search).get('business_id');
  try { fbDtsg = require('DTSGInitialData').token; } catch (e) {}
  if (!fbDtsg) fbDtsg = document.querySelector('[name="fb_dtsg"]')?.value;
  try { userId = require('CurrentUserInitialData').USER_ID; } catch (e) {}
  if (!userId) userId = document.cookie.match(/c_user=(\d+)/)?.[1];

  const API = 'https://graph.facebook.com/v17.0';
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const esc = (s) => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const urlPerfil = (id) => `https://www.facebook.com/profile.php?id=${id}`;
  // Ambos enlaces usan la ruta por ID de página (la fiable): abre "Configuración
  // de la página" de ESA página, donde están "Acceso a la página" y "Nombre".
  const urlAsignar = (id) => `https://www.facebook.com/${id}/settings/?tab=page_access`;
  const urlRenombrar = (id) => `https://www.facebook.com/${id}/settings/?tab=page_info`;
  // Fecha (timestamp unix de Meta) -> AAAA-MM-DD
  const formatFecha = (u) => {
    if (!u) return '—';
    const d = new Date(u * 1000);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  };
  const fmtNum = (n) => (Number(n) || 0).toLocaleString('es-ES');
  // Resume las "tasks" largas de Meta en una etiqueta corta legible.
  const rolCorto = (tareas) => {
    if (!tareas) return '—';
    const t = String(tareas).toUpperCase();
    if (t.includes('FULL_CONTROL') || t.includes('MANAGE')) return 'Admin';
    if (t.includes('CREATE_CONTENT') || t.includes('MODERATE') || t.includes('MESSAGING')) return 'Editor';
    if (t.includes('ADVERTISE')) return 'Anunciante';
    if (t.includes('ANALYZE')) return 'Analista';
    return String(tareas).split('+')[0];
  };

  // --- helpers de Business Manager (BM) ------------------------------
  // Enlaces directos a las pantallas oficiales del BM.
  const urlBM        = (bid) => `https://business.facebook.com/settings/info?business_id=${bid}`;
  const urlBMHome    = (bid) => `https://business.facebook.com/latest/home?business_id=${bid}`;
  const urlBMUsers   = (bid) => `https://business.facebook.com/settings/people?business_id=${bid}`;
  const urlBMPages   = (bid) => `https://business.facebook.com/settings/pages?business_id=${bid}`;
  const urlBMAdAcc   = (bid) => `https://business.facebook.com/settings/ad-accounts?business_id=${bid}`;
  const urlBMWa      = (bid) => `https://business.facebook.com/settings/whatsapp-business-accounts?business_id=${bid}`;
  const urlAdsMgr    = (act, bid) => `https://business.facebook.com/adsmanager/manage/campaigns?act=${act}&business_id=${bid}`;

  const antiguedad = (u) => {
    if (!u) return '—';
    const dias = Math.floor((Date.now()/1000 - u)/86400);
    if (dias < 1) return 'hoy';
    if (dias < 60) return dias + ' días';
    if (dias < 730) return Math.floor(dias/30) + ' meses';
    return (dias/365).toFixed(1) + ' años';
  };
  const verifLabel = (v) => {
    v = (v||'').toLowerCase();
    const map = { verified:'✅ Verificado', not_verified:'Sin verificar', pending:'⏳ Pendiente', pending_need_more_info:'⏳ Falta info', pending_submission:'⏳ Sin enviar', rejected:'❌ Rechazado', revoked:'❌ Revocado', expired:'⚠️ Expirado', failed:'❌ Falló', ineligible:'🚫 No elegible' };
    return map[v] || (v || '—');
  };
  // Veredicto de si el BM sirve para crear una cuenta de WhatsApp API (WABA).
  const aptoWaba = (b) => {
    if (b.disabled) return { cls:'gpm-no', txt:'🔴 No', word:'restringido', det:'BM inhabilitado por integridad' };
    const v = (b.verif||'').toLowerCase();
    if (['rejected','revoked','failed'].includes(v)) return { cls:'gpm-no', txt:'🔴 Riesgo', word:'riesgo', det:'Verificación: '+v };
    if (v === 'verified') return { cls:'gpm-ok', txt:'🟢 Sí', word:'apto', det:'Negocio verificado · hasta 20 WABAs' };
    return { cls:'gpm-warn', txt:'🟡 Limitado', word:'limitado', det:'Sin verificar · WABAs limitadas hasta verificar el negocio' };
  };
  // Muestra un conteo (o "—" si no se pudo obtener); "+" = puede haber más.
  // Texto plano SIEMPRE: se usa también dentro de atributos title="...".
  const cnt  = (c) => c == null ? '—' : (fmtNum(c.n) + (c.approx ? '+' : ''));
  const suma = (a,b) => { if (a==null && b==null) return null; return { n:(a?a.n:0)+(b?b.n:0), approx:(a&&a.approx)||(b&&b.approx) }; };
  const numCsv = (c) => c == null ? '' : c.n;
  const adStatus = (s) => ({1:'🟢 Activa',2:'🔴 Inhabilitada',3:'🟠 Sin liquidar',7:'⏳ Revisión de riesgo',8:'⏳ Pago pendiente',9:'🟡 Periodo de gracia',100:'🔴 Cierre pendiente',101:'🔴 Cerrada',201:'🟢 Activa',202:'🔴 Cerrada'}[s] || ('Estado ' + (s==null?'—':s)));
  const adDisable = (d) => ({1:'Integridad de anuncios',2:'Revisión de IP',3:'Riesgo de pago',4:'Cuenta gris cerrada',5:'Revisión AFC',6:'Integridad del negocio',7:'Cierre permanente',8:'Reseller sin uso',9:'Cuenta sin uso'}[d] || '');
  const actNum = (a) => a.account_id || String(a.id||'').replace('act_','');
  const rolCortoBM = (r) => ({ ADMIN:'Admin', EMPLOYEE:'Empleado', FINANCE_EDITOR:'Finanzas (editar)', FINANCE_ANALYST:'Finanzas (ver)', DEVELOPER:'Desarrollador' }[r] || r || '—');
  // Muestra un importe de Meta (viene en centavos) con su moneda.
  const dinero = (cent, cur) => (cent == null || cent === '') ? '—' : ((Number(cent)/100).toLocaleString('es-ES', { maximumFractionDigits: 2 }) + (cur ? ' ' + cur : ''));
  // Etiqueta de la tarjeta / medio de pago de una cuenta publicitaria.
  const cardLabel = (a) => {
    const f = a && a.funding_source_details;
    if (f && f.display_string) return f.display_string;
    if (f && f.type != null) return ({ 1:'Tarjeta', 2:'Cupón', 3:'Crédito de Meta', 4:'PayPal', 6:'Débito directo', 7:'Fecha de facturación' }[f.type] || 'Financiación');
    return '—';
  };
  // Lista de tarjetas/medios de pago distintos de un conjunto de cuentas.
  const tarjetasDistintas = (items) => {
    const set = [];
    (items || []).forEach(a => { const c = cardLabel(a); if (c && c !== '—' && !set.includes(c)) set.push(c); });
    return set;
  };
  // Estado (revisión) de una WABA de WhatsApp.
  const wabaEstado = (s) => ({ APPROVED:'🟢 Activa', PENDING:'⏳ Pendiente', REJECTED:'🔴 Restringida', DISABLED:'🔴 Deshabilitada', PENDING_REVIEW:'⏳ En revisión' }[s] || (s ? esc(s) : '—'));
  const wabaCls = (s) => (s === 'APPROVED' ? 'gpm-ok' : (s === 'REJECTED' || s === 'DISABLED' ? 'gpm-no' : 'gpm-warn'));

  // Panel flotante reutilizable (por encima del panel principal).
  function abrirPopover(titulo, contenido) {
    document.getElementById('gpm-pop')?.remove();
    const pop = document.createElement('div');
    pop.id = 'gpm-pop';
    pop.innerHTML = `<div class="gpm-pop-card"><div class="gpm-pop-head"><span>${titulo}</span><button class="gpm-pop-x" title="Cerrar">×</button></div><div class="gpm-pop-body">${contenido}</div></div>`;
    document.body.appendChild(pop);
    const cerrar = () => pop.remove();
    pop.addEventListener('click', async (e) => {
      if (e.target === pop || e.target.classList.contains('gpm-pop-x')) { cerrar(); return; }
      const cp = e.target.closest('[data-copy]');
      if (cp) { await copiar(cp.dataset.copy); const p = cp.textContent; cp.textContent = '✅'; setTimeout(() => { cp.textContent = p; }, 1200); return; }
      const wb = e.target.closest('[data-waba]');
      if (wb) {
        const wabaId = wb.dataset.waba;
        const row = pop.querySelector('[data-nums="' + wabaId + '"]');
        if (!row) return;
        const td = row.querySelector('td');
        td.innerHTML = '<div class="gpm-load" style="padding:10px"><div class="gpm-spin"></div>Leyendo números...</div>';
        wb.disabled = true;
        const res = await fetchWabaNumbers(wabaId);
        td.innerHTML = renderNumeros(res);
        wb.textContent = '📞 Números'; wb.disabled = false;
        return;
      }
    });
    return pop;
  }

  // Contenido del popover de cuentas publicitarias de un BM.
  function popAds(b) {
    const items = b.adsItems || [];
    if (!items.length) return '<div class="gpm-info">Sin cuentas publicitarias visibles (o falta permiso para listarlas).</div>';
    const activas = items.filter(a => a.account_status === 1 || a.account_status === 201).length;
    const inhab = items.filter(a => a.account_status === 2 || a.account_status === 101 || a.account_status === 202).length;
    const tarjetas = tarjetasDistintas(items);
    const rows = items.map(a => {
      const act = actNum(a);
      const motivo = (a.account_status !== 1 && a.disable_reason) ? adDisable(a.disable_reason) : '';
      return `<tr>
        <td>${esc(a.name || '(sin nombre)')}<div style="font-size:10px;color:#94a3b8">${esc(a.origen || '')}</div></td>
        <td style="white-space:nowrap">act_${esc(act)} <button class="gpm-mini" data-copy="${esc(act)}" title="Copiar ID">📋</button></td>
        <td style="white-space:nowrap">${adStatus(a.account_status)}${motivo ? `<div style="font-size:10px;color:#dc2626">${esc(motivo)}</div>` : ''}</td>
        <td style="white-space:nowrap">💳 ${esc(cardLabel(a))}</td>
        <td style="white-space:nowrap;text-align:right">${dinero(a.amount_spent, a.currency)}</td>
        <td style="white-space:nowrap;text-align:right">${a.spend_cap && Number(a.spend_cap) > 0 ? dinero(a.spend_cap, a.currency) : '∞'}</td>
        <td><a class="gpm-link" href="${urlAdsMgr(act, b.id)}" target="_blank" rel="noopener">Ads Manager ↗</a></td>
      </tr>`;
    }).join('');
    return `<div style="margin-bottom:8px"><span class="gpm-badge gpm-b-green">🟢 Activas ${activas}</span><span class="gpm-badge gpm-b-red">🔴 Inhabilitadas ${inhab}</span><span class="gpm-badge gpm-b-blue">💳 Tarjetas ${tarjetas.length}</span></div>
      ${tarjetas.length ? `<div style="font-size:12px;color:#334155;margin-bottom:8px">💳 <b>Tarjetas del BM:</b> ${tarjetas.map(esc).join(' · ')}</div>` : ''}
      <div class="gpm-scroll"><table class="gpm-table"><thead><tr><th>Cuenta</th><th>ID</th><th>Estado</th><th>Tarjeta</th><th>Gastado</th><th>Límite</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>
      <div style="margin-top:8px"><a class="gpm-link" href="${urlBMAdAcc(b.id)}" target="_blank" rel="noopener">Ver todas en Configuración del negocio ↗</a></div>`;
  }

  // Contenido del popover de usuarios (personas + usuarios de sistema) de un BM.
  function popUsers(b) {
    const items = b.usersItems || [];
    if (!items.length) return '<div class="gpm-info">Sin usuarios visibles (o falta permiso para listarlos). Ábrelo dentro de business.facebook.com con una cuenta con acceso.</div>';
    const personas = items.filter(u => u.tipo === 'persona').length;
    const sistema = items.filter(u => u.tipo === 'sistema').length;
    const rows = items.map(u => `<tr>
        <td>${esc(u.name || '(sin nombre)')}${u.title ? `<div style="font-size:10px;color:#94a3b8">${esc(u.title)}</div>` : ''}</td>
        <td style="white-space:nowrap">${u.email ? `${esc(u.email)} <button class="gpm-mini" data-copy="${esc(u.email)}" title="Copiar correo">📋</button>` : '<span style="color:#94a3b8">—</span>'}</td>
        <td style="white-space:nowrap">${esc(rolCortoBM(u.role))}</td>
        <td style="white-space:nowrap">${u.tipo === 'sistema' ? '⚙️ Sistema' : '👤 Persona'}</td>
      </tr>`).join('');
    return `<div style="margin-bottom:8px"><span class="gpm-badge gpm-b-blue">👤 Personas ${personas}</span><span class="gpm-badge gpm-b-blue">⚙️ Sistema ${sistema}</span></div>
      <div class="gpm-scroll"><table class="gpm-table"><thead><tr><th>Nombre</th><th>Correo</th><th>Rol</th><th>Tipo</th></tr></thead><tbody>${rows}</tbody></table></div>
      <div style="margin-top:8px"><a class="gpm-link" href="${urlBMUsers(b.id)}" target="_blank" rel="noopener">Ver / gestionar en Configuración del negocio ↗</a></div>`;
  }

  // Renombra el BM (ÚNICA operación de escritura del panel). Requiere confirmación.
  async function renameBM(bid, nuevo) {
    try {
      const r = await fetch(`${API}/${bid}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ name: nuevo, access_token: token }),
        credentials: 'include'
      });
      const j = await r.json();
      if (j.error) return { error: j.error.message };
      return { ok: true };
    } catch (e) { return { error: e.message }; }
  }

  // Ventana para renombrar un BM, con confirmación explícita (es escritura).
  function abrirRename(b, onDone) {
    const pop = abrirPopover('✏️ Renombrar BM · ' + esc(b.nombre), `
      <div class="gpm-info">⚠️ Esta acción <b>sí modifica</b> el Business Manager en Meta (es la única del panel que escribe). Cambia el nombre visible del negocio.</div>
      <label style="font-size:12px;font-weight:600;color:#334155">Nuevo nombre</label>
      <input class="gpm-search" id="gpmRenameInput" style="margin:6px 0" value="${esc(b.nombre)}" maxlength="100">
      <div id="gpmRenameMsg" style="font-size:12px;color:#475569;margin-bottom:8px"></div>
      <button class="gpm-btn" id="gpmRenameSave">Guardar cambios</button>
      <button class="gpm-btn sec" id="gpmRenameCancel">Cancelar</button>
      <div style="margin-top:10px;font-size:11px;color:#64748b">Si Meta rechaza el cambio por permisos, usa el enlace oficial: <a class="gpm-link" href="${urlBM(b.id)}" target="_blank" rel="noopener">Información del negocio ↗</a></div>`);
    const input = pop.querySelector('#gpmRenameInput');
    const msg = pop.querySelector('#gpmRenameMsg');
    const save = pop.querySelector('#gpmRenameSave');
    pop.querySelector('#gpmRenameCancel').onclick = () => pop.remove();
    input.focus();
    save.onclick = async () => {
      const nuevo = input.value.trim();
      if (!nuevo || nuevo === b.nombre) { msg.textContent = 'Escribe un nombre distinto.'; return; }
      save.disabled = true; msg.textContent = 'Guardando...';
      const res = await renameBM(b.id, nuevo);
      if (res.error) { msg.innerHTML = '❌ ' + esc(res.error); save.disabled = false; return; }
      b.nombre = nuevo;
      msg.innerHTML = '✅ Nombre actualizado.';
      setTimeout(() => { pop.remove(); onDone && onDone(); }, 700);
    };
  }

  // Popover de WABAs de un BM: estado, ID copiable y números (se cargan solos).
  function abrirWaba(b) {
    const pop = abrirPopover('WhatsApp (WABAs) · ' + esc(b.nombre), loader('Leyendo WABAs y sus números...'));
    (async () => {
      const cont = pop.querySelector('.gpm-pop-body');
      if (!cont) return;
      const items = b.wabaItems || [];
      if (!items.length) { cont.innerHTML = '<div class="gpm-info">Sin cuentas de WhatsApp API (o falta el permiso whatsapp_business_management en tu sesión).</div>'; return; }
      let html = `<div style="font-size:12px;color:#334155;margin-bottom:8px">${items.length} WABA(s) en este BM.</div>`;
      for (const w of items) {
        const nums = await fetchWabaNumbers(w.id);
        html += `<div style="border:1px solid #e2e8f0;border-radius:10px;padding:10px 12px;margin-bottom:10px">
          <div style="font-weight:600">${esc(w.name || '(sin nombre)')} <span class="gpm-pill ${wabaCls(w.account_review_status)}">${wabaEstado(w.account_review_status)}</span></div>
          <div style="font-size:11px;color:#94a3b8;margin:2px 0 8px">${esc(w.id)} <button class="gpm-mini" data-copy="${esc(w.id)}" title="Copiar ID de la WABA">📋 copiar ID</button> · ${esc(w.origen || '')}</div>
          ${renderNumeros(nums)}
        </div>`;
      }
      cont.innerHTML = html
        + `<div style="font-size:11px;color:#64748b">OBA = cuenta oficial (tilde verde) · "Verificación" = registro del número · "Estado" de la WABA es su revisión en Meta.</div>`
        + `<div style="margin-top:6px"><a class="gpm-link" href="${urlBMWa(b.id)}" target="_blank" rel="noopener">Ver en Configuración del negocio ↗</a></div>`;
    })();
  }

  // Lee los números de una WABA con su verificación / OBA (solo lectura).
  async function fetchWabaNumbers(wabaId) {
    try {
      const r = await fetch(`${API}/${wabaId}/phone_numbers?access_token=${token}&fields=display_phone_number,verified_name,code_verification_status,quality_rating,name_status,is_official_business_account,platform_type&limit=50`, { credentials: 'include' });
      const j = await r.json();
      if (j.error) return { error: j.error.message };
      return { data: j.data || [] };
    } catch (e) { return { error: e.message }; }
  }

  function renderNumeros(res) {
    if (res.error) return `<div class="gpm-info">No se pudieron leer los números: ${esc(res.error)}</div>`;
    if (!res.data.length) return `<div class="gpm-info">Esta WABA todavía no tiene números.</div>`;
    const codeV = (s) => s === 'VERIFIED' ? '🟢 Verificado' : (s === 'EXPIRED' ? '🟠 Expirado' : (s ? '🔴 No verificado' : '—'));
    const nameS = (s) => ({ APPROVED:'🟢 Aprobado', AVAILABLE_WITHOUT_REVIEW:'🟢 Disponible', PENDING_REVIEW:'⏳ En revisión', PENDING:'⏳ Pendiente', DECLINED:'🔴 Rechazado', NONE:'—' }[s] || s || '—');
    const qual  = (q) => ({ GREEN:'🟢 Alta', YELLOW:'🟡 Media', RED:'🔴 Baja' }[q] || '—');
    const oba   = (n) => n.is_official_business_account ? '🔵 Sí' : 'No';
    const rows = res.data.map(n => `<tr>
        <td style="white-space:nowrap">${esc(n.display_phone_number || '—')}</td>
        <td>${esc(n.verified_name || '—')}</td>
        <td style="white-space:nowrap">${nameS(n.name_status)}</td>
        <td style="white-space:nowrap">${codeV(n.code_verification_status)}</td>
        <td style="white-space:nowrap">${oba(n)}</td>
        <td style="white-space:nowrap">${qual(n.quality_rating)}</td>
      </tr>`).join('');
    return `<div class="gpm-scroll"><table class="gpm-table" style="margin:6px 0"><thead><tr><th>Número</th><th>Nombre visible</th><th>Nombre</th><th>Verificación</th><th>OBA</th><th>Calidad</th></tr></thead><tbody>${rows}</tbody></table></div>`;
  }

  // --- helpers de Páginas --------------------------------------------
  const estadoPagePill = (p) => {
    if (p.acceso === 'live') return '<span class="gpm-pill gpm-ok">🟢 LIVE</span>';
    if (p.acceso === 'pzrd') return '<span class="gpm-pill gpm-warn">🟡 PZRD</span>';
    if (p.acceso === 'die')  return '<span class="gpm-pill gpm-no">🔴 DIE</span>';
    return p.publicada ? '<span class="gpm-pill gpm-ok">Publicada</span>' : '<span class="gpm-pill gpm-warn">Despublicada</span>';
  };

  // Consulta de SOLO LECTURA que clasifica LIVE/PZRD/DIE de todas las páginas.
  async function comprobarRestriccion() {
    if (!userId || !fbDtsg) return { error: 'Falta fb_dtsg o USER_ID. Abre Facebook con tu sesión iniciada.' };
    try {
      const params = new URLSearchParams({
        av: userId, __user: userId, __a: '1', fb_dtsg: fbDtsg,
        fb_api_caller_class: 'RelayModern',
        fb_api_req_friendly_name: 'AccountQualityUserPagesWrapper_UserPageQuery',
        variables: JSON.stringify({ assetOwnerId: userId }),
        server_timestamps: 'true', doc_id: '5196344227155252'
      });
      const r = await fetch('https://business.facebook.com/api/graphql/', {
        method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: params, credentials: 'include'
      });
      const j = await r.json();
      const lista = j.data?.userData?.pages_can_administer || [];
      const mapa = {};
      lista.forEach(pg => {
        const ri = pg.advertising_restriction_info;
        let estado = 'live', detalle = '';
        if (ri) {
          if (ri.is_restricted) { estado = 'die'; detalle = (ri.restriction_type || '') + (ri.restriction_date ? ' · ' + ri.restriction_date : ''); }
          else if (ri.restriction_type === 'ALE' || ri.restriction_type === 'BUSINESS_INTEGRITY') { estado = 'pzrd'; detalle = ri.restriction_type; }
        }
        mapa[pg.id] = { estado, detalle };
      });
      paginas.forEach(p => { const m = mapa[p.id]; if (m) { p.acceso = m.estado; p.accesoDetalle = m.detalle; } else { p.acceso = 'live'; p.accesoDetalle = ''; } });
      return { ok: lista.length };
    } catch (e) { return { error: e.message }; }
  }

  // Popover de administradores de una página (carga bajo demanda).
  function abrirPageAdmins(p) {
    const pop = abrirPopover('Personas con rol · ' + esc(p.nombre), loader('Leyendo administradores...'));
    fetchPageAdmins(p).then(admins => {
      const cont = pop.querySelector('.gpm-pop-body');
      if (!cont) return;
      const rows = (admins || []).map(a => `<tr>
          <td>${esc(a.nombre || '')}</td>
          <td style="white-space:nowrap">${a.id ? esc(a.id) + ' <button class="gpm-mini" data-copy="' + esc(a.id) + '" title="Copiar ID">📋</button>' : '—'}</td>
          <td class="gpm-rol" title="${esc(a.rol)}">${esc(rolCorto(a.rol))}</td>
        </tr>`).join('');
      cont.innerHTML = `<div class="gpm-scroll"><table class="gpm-table"><thead><tr><th>Persona</th><th>ID</th><th>Rol</th></tr></thead><tbody>${rows}</tbody></table></div>
        <div style="margin-top:8px"><a class="gpm-link" href="${urlAsignar(p.id)}" target="_blank" rel="noopener">Añadir / gestionar personas ↗</a></div>`;
    });
  }

  // --- estilos -------------------------------------------------------
  const style = document.createElement('style');
  style.id = 'gpm-style';
  style.textContent = `
    #gpm-overlay{position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:99999;display:flex;align-items:center;justify-content:center;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}
    .gpm-box{background:#fff;border-radius:12px;width:94%;max-width:1140px;height:90vh;max-height:90vh;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 8px 30px rgba(0,0,0,.3)}
    .gpm-head{background:#2563eb;color:#fff;padding:10px 170px 10px 18px;position:relative;flex:0 0 auto}
    .gpm-head h2{margin:0;font-size:16px}
    .gpm-head p{margin:3px 0 0;font-size:11px;opacity:.9}
    .gpm-close{position:absolute;top:8px;right:12px;background:#ef4444;border:none;color:#fff;width:28px;height:28px;border-radius:50%;font-size:16px;cursor:pointer;z-index:2}
    .gpm-tabs{display:flex;background:#f1f5f9;border-bottom:1px solid #e2e8f0;overflow-x:auto;flex:0 0 auto}
    .gpm-tab{padding:10px 14px;border:none;background:none;font-size:13px;font-weight:600;color:#475569;cursor:pointer;white-space:nowrap;border-bottom:3px solid transparent}
    .gpm-tab.active{color:#2563eb;border-bottom-color:#2563eb;background:#fff}
    .gpm-body{padding:14px 18px;overflow:auto;flex:1 1 auto;min-height:0}
    .gpm-scroll{width:100%;overflow-x:auto}
    .gpm-btn{padding:9px 16px;border:none;border-radius:6px;font-weight:600;font-size:13px;cursor:pointer;background:#2563eb;color:#fff;margin-right:8px}
    .gpm-btn.sec{background:#fff;color:#475569;border:1px solid #cbd5e1}
    .gpm-btn:disabled{opacity:.5;cursor:not-allowed}
    .gpm-search{width:100%;padding:8px 10px;border:1px solid #cbd5e1;border-radius:6px;margin:12px 0;font-size:13px;box-sizing:border-box}
    .gpm-table{width:100%;border-collapse:collapse;font-size:12px}
    .gpm-table th{background:#2563eb;color:#fff;padding:8px;text-align:left;position:sticky;top:-1px;z-index:3}
    .gpm-table td{padding:7px 8px;border-bottom:1px solid #eef2f7}
    .gpm-table tr:nth-child(even){background:#f8fafc}
    .gpm-badge{display:inline-block;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:700;margin-left:6px;color:#fff}
    .gpm-b-blue{background:#2563eb}.gpm-b-green{background:#16a34a}.gpm-b-amber{background:#d97706}.gpm-b-red{background:#dc2626}
    .gpm-pill{padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600}
    .gpm-mini{border:1px solid #cbd5e1;background:#fff;border-radius:5px;padding:2px 7px;font-size:12px;cursor:pointer;margin-left:4px}
    .gpm-mini:hover{background:#eff6ff}
    .gpm-link{color:#2563eb;text-decoration:none;font-size:12px}
    .gpm-rol{max-width:120px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:#64748b;cursor:help}
    .gpm-table td{vertical-align:middle}
    .gpm-nombre{max-width:220px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .gpm-ok{background:#dcfce7;color:#166534}.gpm-no{background:#fee2e2;color:#991b1b}.gpm-warn{background:#fef9c3;color:#854d0e}
    .gpm-info{background:#eff6ff;border:1px solid #bfdbfe;color:#1e40af;padding:10px;border-radius:6px;font-size:12px;margin-bottom:8px}
    .gpm-load{text-align:center;padding:30px;color:#2563eb}
    .gpm-spin{width:28px;height:28px;border:3px solid #e5e7eb;border-top-color:#2563eb;border-radius:50%;animation:gpmspin 1s linear infinite;margin:0 auto 8px}
    @keyframes gpmspin{to{transform:rotate(360deg)}}
    .gpm-foot{padding:7px 14px;font-size:11px;color:#64748b;background:#f8fafc;border-top:1px solid #e2e8f0;flex:0 0 auto;display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap}
    .gpm-promo{color:#334155}
    .gpm-promo a{color:#2563eb;font-weight:700;text-decoration:none}
    .gpm-promo a:hover{text-decoration:underline}
    .gpm-ver{font-size:11px;font-weight:600;opacity:.75;background:rgba(255,255,255,.2);padding:1px 7px;border-radius:10px;margin-left:6px;vertical-align:middle}
    .gpm-mini[data-biz-action],.gpm-mini[href]{color:#2563eb}
    .gpm-mini[data-biz-action="rename"]{color:#b45309;border-color:#fcd34d;background:#fffbeb}
    .gpm-mini[data-biz-action="rename"]:hover{background:#fef3c7}
    .gpm-refresh{position:absolute;top:8px;right:48px;background:rgba(255,255,255,.18);border:none;color:#fff;padding:5px 10px;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer}
    .gpm-refresh:hover{background:rgba(255,255,255,.3)}
    .gpm-refresh:disabled{opacity:.6;cursor:default}
    .gpm-cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:10px}
    .gpm-card{border:1px solid #e2e8f0;border-radius:10px;padding:12px 14px;background:#fff}
    .gpm-card-t{font-size:12px;color:#64748b;font-weight:600}
    .gpm-card-v{font-size:24px;font-weight:800;color:#0f172a;margin:4px 0;font-variant-numeric:tabular-nums}
    .gpm-card-s{font-size:11px;color:#64748b}
    .gpm-perfil{display:flex;align-items:center;gap:12px;margin:6px 0 14px;padding:12px 14px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px}
    .gpm-perfil-av{width:44px;height:44px;border-radius:50%;background:#2563eb;color:#fff;display:flex;align-items:center;justify-content:center;font-size:20px;font-weight:800;flex:0 0 auto}
    .gpm-update{position:absolute;bottom:6px;right:18px;background:#f59e0b;color:#fff;padding:3px 9px;border-radius:10px;font-size:11px;font-weight:700;text-decoration:none}
    .gpm-filters{display:flex;flex-wrap:wrap;gap:10px 14px;align-items:center;margin:6px 0 10px}
    .gpm-filters .g{display:flex;align-items:center;gap:5px}
    .gpm-filters label{font-size:11px;color:#64748b;font-weight:700;text-transform:uppercase;letter-spacing:.02em}
    .gpm-filters select{padding:6px 8px;border:1px solid #cbd5e1;border-radius:6px;font-size:12px;background:#fff;cursor:pointer}
    .gpm-cellbtn{border:1px solid #cbd5e1;background:#fff;border-radius:5px;padding:2px 8px;font-size:12px;cursor:pointer;font-weight:600;color:#2563eb}
    .gpm-cellbtn:hover{background:#eff6ff}
    .gpm-num{text-align:right;font-variant-numeric:tabular-nums}
    #gpm-pop{position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:100001;display:flex;align-items:center;justify-content:center;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}
    .gpm-pop-card{background:#fff;border-radius:10px;width:92%;max-width:680px;max-height:82vh;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 12px 44px rgba(0,0,0,.4)}
    .gpm-pop-head{background:#0f172a;color:#fff;padding:10px 14px;display:flex;justify-content:space-between;align-items:center;font-weight:600;font-size:14px;gap:10px}
    .gpm-pop-head span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .gpm-pop-x{background:none;border:none;color:#fff;font-size:20px;line-height:1;cursor:pointer;flex:0 0 auto}
    .gpm-pop-body{padding:12px 14px;overflow:auto}
  `;
  document.head.appendChild(style);

  // --- UI ------------------------------------------------------------
  const VERSION = 'v3.5 · 2026-07';
  // URL a un JSON {"version":"...","url":"..."} para avisar de nuevas versiones.
  // Si el CSP de la página lo bloquea, falla en silencio (no rompe nada).
  const UPDATE_URL = 'https://raw.githubusercontent.com/contingenciaiads1-cmd/gestion-activos-meta/main/version.json';
  const ov = document.createElement('div');
  ov.id = 'gpm-overlay';
  ov.innerHTML = `
    <div class="gpm-box">
      <div class="gpm-head">
        <button class="gpm-close" id="gpmClose" title="Cerrar">×</button>
        <button class="gpm-refresh" id="gpmRefresh" title="Actualizar: vuelve a leer todo desde Meta">🔄 Actualizar</button>
        <h2>🗂️ Gestión de Activos <span class="gpm-ver">${VERSION}</span></h2>
        <p>Auditoría del perfil de Meta${businessID ? ' · BM: ' + esc(businessID) : ''} · por <b>Converxio</b></p>
      </div>
      <div class="gpm-tabs">
        <button class="gpm-tab active" data-tab="resumen">📊 Resumen</button>
        <button class="gpm-tab" data-tab="paginas">📋 Páginas</button>
        <button class="gpm-tab" data-tab="business">🏢 Business</button>
        <button class="gpm-tab" data-tab="adaccounts">💳 Cuentas pub.</button>
        <button class="gpm-tab" data-tab="exportar">💾 Exportar</button>
        <button class="gpm-tab" data-tab="ayuda">❓ Ayuda</button>
      </div>
      <div class="gpm-body" id="gpmBody"></div>
      <div class="gpm-foot">
        <span>Solo lectura · única escritura: ✏️ Renombrar BM (con confirmación)</span>
        <span class="gpm-promo">🤖 ¿Operas WhatsApp + Meta Ads? <a href="https://converxio.app" target="_blank" rel="noopener">Converxio</a> es tu operador IA 24/7 · agencia <b>IADS</b></span>
      </div>
    </div>`;
  document.body.appendChild(ov);

  // El panel se queda fijo: SOLO se cierra con la × (no al hacer clic fuera).
  document.getElementById('gpmClose').onclick = () => { ov.remove(); style.remove(); document.getElementById('gpm-pop')?.remove(); };

  const body = document.getElementById('gpmBody');
  let paginas = [];        // cache de páginas
  let businesses = [];     // cache de business managers
  let businessCargados = false;
  let adaccounts = [];     // cache de cuentas publicitarias (perfil)
  let adaccountsCargados = false;
  let perfil = null;       // datos básicos del perfil
  let tabActual = 'resumen';

  // copiar al portapapeles desde cualquier botón con data-copy
  async function copiar(texto) {
    try { await navigator.clipboard.writeText(texto); return true; }
    catch {
      const t = document.createElement('textarea'); t.value = texto;
      document.body.appendChild(t); t.select(); document.execCommand('copy'); t.remove(); return true;
    }
  }
  body.addEventListener('click', async (e) => {
    const cp = e.target.closest('[data-copy]');
    if (cp) {
      await copiar(cp.dataset.copy);
      const prev = cp.textContent; cp.textContent = '✅';
      setTimeout(() => { cp.textContent = prev; }, 1200);
      return;
    }
    const ba = e.target.closest('[data-biz-action]');
    if (ba) {
      const b = businesses.find(x => x.id === ba.dataset.bm);
      if (!b) return;
      const a = ba.dataset.bizAction;
      if (a === 'ads') abrirPopover('Cuentas publicitarias · ' + esc(b.nombre), popAds(b));
      else if (a === 'waba') abrirWaba(b);
      else if (a === 'users') abrirPopover('Usuarios · ' + esc(b.nombre), popUsers(b));
      else if (a === 'rename') abrirRename(b, () => render('business'));
      return;
    }
    const pa = e.target.closest('[data-page-action]');
    if (pa) {
      const p = paginas.find(x => x.id === pa.dataset.page);
      if (p && pa.dataset.pageAction === 'admins') abrirPageAdmins(p);
      return;
    }
  });

  // estado de filtros de la pestaña Business
  let fEstado = 'todos', fApto = 'todos', fVerif = 'todos', fWaba = 'todos', bizQ = '';
  // estado de filtros de la pestaña Páginas
  let fPub = 'todos', fRestr = 'todos', fRol = 'todos', fBm = 'todos', pagQ = '';
  // estado de filtros de la pestaña Cuentas publicitarias
  let fAEstado = 'todos', fABm = 'todos', fACard = 'todos', adQ = '';

  // --- carga de páginas (compartida) ---------------------------------
  async function cargarPaginas() {
    if (paginas.length) return paginas;
    if (!token) throw new Error('No se detectó el token de sesión en esta página. Abre el panel desde el Administrador de Anuncios (adsmanager.facebook.com) o tu perfil (www.facebook.com), donde la sesión sí trae el token.');
    paginas = [];
    let url = `${API}/me/accounts?access_token=${token}`
            + `&fields=id,name,access_token,tasks,is_published,followers_count,fan_count,page_created_time,business`
            + `&date_format=U&limit=100&locale=es_ES`;
    while (url) {
      const r = await fetch(url, { credentials: 'include' });
      const j = await r.json();
      if (j.error) throw new Error(j.error.message);
      (j.data || []).forEach(p => paginas.push({
        id: p.id, nombre: p.name || 'N/A',
        pageToken: p.access_token || null,
        misTareas: (p.tasks || []).join('+'),
        publicada: !!p.is_published,
        seguidores: (p.followers_count != null ? p.followers_count : p.fan_count) || 0,
        creada: p.page_created_time || null,
        bm: p.business ? { id: p.business.id, nombre: p.business.name || p.business.id } : null,
        admins: null
      }));
      url = j.paging?.next || null;
      if (url) await sleep(350);
    }
    return paginas;
  }

  // Lee los administradores de UNA página (bajo demanda, para el popover).
  async function fetchPageAdmins(p) {
    if (p.admins) return p.admins;
    const tk = p.pageToken || token;
    // Método 1 (preferido dentro del BM): assigned_users
    if (businessID) {
      try {
        const r = await fetch(`${API}/${p.id}/assigned_users?access_token=${tk}&business=${businessID}&fields=id,name,tasks&limit=200`, { credentials: 'include' });
        const j = await r.json();
        if (j.data && j.data.length) { p.admins = j.data.map(u => ({ id: u.id || '', nombre: u.name || '', rol: (u.tasks || []).join('+') })); return p.admins; }
      } catch (e) {}
    }
    // Método 2 (respaldo): endpoint /roles
    try {
      const r = await fetch(`${API}/${p.id}/roles?access_token=${tk}&fields=id,name,role,tasks&limit=100`, { credentials: 'include' });
      const j = await r.json();
      if (j.data && j.data.length) { p.admins = j.data.map(u => ({ id: u.id || '', nombre: u.name || '', rol: u.role || (u.tasks ? u.tasks.join('+') : '') })); return p.admins; }
      if (j.error) { p.admins = [{ id: '', nombre: '(' + j.error.message + ')', rol: '' }]; return p.admins; }
    } catch (e) {}
    p.admins = [{ id: '', nombre: '(sin datos — ábrelo dentro del Business Manager)', rol: '' }];
    return p.admins;
  }

  // --- carga de Business Managers (BM) y sus activos ------------------
  // Cuenta los elementos de un "edge" del BM. Prefiere summary.total_count
  // (exacto y barato); si Meta no lo da, cuenta las filas devueltas.
  // Devuelve null si el edge falla (p.ej. falta permiso) para no romper el resto.
  async function edgeCount(bid, edge) {
    try {
      const r = await fetch(`${API}/${bid}/${edge}?access_token=${token}&limit=100&summary=true`, { credentials: 'include' });
      const j = await r.json();
      if (j.error) return null;
      if (j.summary && j.summary.total_count != null) return { n: j.summary.total_count, approx: false };
      const n = (j.data || []).length;
      return { n, approx: !!(j.paging && j.paging.next) };
    } catch (e) { return null; }
  }

  // Como edgeCount, pero además devuelve la lista de elementos (para popovers).
  async function edgeList(bid, edge, fields) {
    try {
      const r = await fetch(`${API}/${bid}/${edge}?access_token=${token}&fields=${fields}&limit=100&summary=true`, { credentials: 'include' });
      const j = await r.json();
      if (j.error) return { count: null, items: [] };
      const items = j.data || [];
      const exact = j.summary && j.summary.total_count != null;
      return { count: { n: exact ? j.summary.total_count : items.length, approx: !exact && !!(j.paging && j.paging.next) }, items };
    } catch (e) { return { count: null, items: [] }; }
  }

  // Lee TODAS las WABAs de un edge del BM, paginando. Sin summary (ese parámetro
  // hace fallar el edge de WhatsApp). El conteo real = número de WABAs leídas.
  async function fetchWabas(bid, edge) {
    const items = [];
    let url = `${API}/${bid}/${edge}?access_token=${token}&fields=id,name,account_review_status,ownership_type&limit=100`;
    try {
      while (url) {
        const r = await fetch(url, { credentials: 'include' });
        const j = await r.json();
        if (j.error) break;
        (j.data || []).forEach(w => items.push(w));
        url = j.paging?.next || null;
        if (url) await sleep(200);
      }
    } catch (e) {}
    return items;
  }

  async function cargarBusinesses() {
    if (businessCargados) return businesses;
    if (!token) throw new Error('No se detectó el token de sesión en esta página. Abre el panel desde el Administrador de Anuncios (adsmanager.facebook.com) o tu perfil (www.facebook.com), donde la sesión sí trae el token.');
    businesses = [];
    // 1) lista base de BMs (campos fiables en un solo llamado)
    let url = `${API}/me/businesses?access_token=${token}`
            + `&fields=id,name,created_time,verification_status,two_factor_type,is_disabled_for_integrity_reasons,permitted_roles`
            + `&date_format=U&limit=50&locale=es_ES`;
    while (url) {
      const r = await fetch(url, { credentials: 'include' });
      const j = await r.json();
      if (j.error) throw new Error(j.error.message);
      (j.data || []).forEach(b => businesses.push({
        id: b.id, nombre: b.name || 'N/A',
        creada: b.created_time || null,
        verif: b.verification_status || '',
        twoFactor: b.two_factor_type || '',
        disabled: !!b.is_disabled_for_integrity_reasons,
        roles: (b.permitted_roles || []).join('+'),
        usuarios: null, systemUsers: null, usersItems: [],
        pagsOwned: null, pagsClient: null,
        adsOwned: null, adsClient: null, adsItems: [],
        wabaOwned: null, wabaClient: null, wabaItems: []
      }));
      url = j.paging?.next || null;
      if (url) await sleep(350);
    }
    // 2) conteos + listas por edge, para cada BM (tolerante a fallos por permiso)
    for (const b of businesses) {
      const [bu, su, po, pc, ao, ac, wo, wc] = await Promise.all([
        edgeList(b.id, 'business_users', 'id,name,email,role,title'),
        edgeList(b.id, 'system_users', 'id,name,role'),
        edgeCount(b.id, 'owned_pages'),
        edgeCount(b.id, 'client_pages'),
        edgeList(b.id, 'owned_ad_accounts', 'id,name,account_id,account_status,disable_reason,currency,amount_spent,spend_cap,funding_source_details'),
        edgeList(b.id, 'client_ad_accounts', 'id,name,account_id,account_status,disable_reason,currency,amount_spent,spend_cap,funding_source_details'),
        fetchWabas(b.id, 'owned_whatsapp_business_accounts'),
        fetchWabas(b.id, 'client_whatsapp_business_accounts')
      ]);
      b.usuarios = bu.count; b.systemUsers = su.count;
      b.usersItems = [...bu.items.map(x => ({ ...x, tipo: 'persona' })), ...su.items.map(x => ({ ...x, tipo: 'sistema' }))];
      b.pagsOwned = po; b.pagsClient = pc;
      b.adsOwned = ao.count; b.adsClient = ac.count;
      b.adsItems = [...ao.items.map(x => ({ ...x, origen: 'propia' })), ...ac.items.map(x => ({ ...x, origen: 'compartida' }))];
      // WABAs: conteo real = cantidad de WABAs leídas (owned + client).
      b.wabaItems = [...wo.map(x => ({ ...x, origen: 'propia' })), ...wc.map(x => ({ ...x, origen: 'compartida' }))];
      b.wabaOwned = { n: wo.length, approx: false };
      b.wabaClient = { n: wc.length, approx: false };
      await sleep(150);
    }
    businessCargados = true;
    return businesses;
  }

  // --- carga de cuentas publicitarias del perfil ---------------------
  async function cargarAdAccounts() {
    if (adaccountsCargados) return adaccounts;
    if (!token) throw new Error('No se detectó el token de sesión en esta página. Abre el panel desde el Administrador de Anuncios (adsmanager.facebook.com) o tu perfil (www.facebook.com), donde la sesión sí trae el token.');
    adaccounts = [];
    let url = `${API}/me/adaccounts?access_token=${token}`
            + `&fields=id,name,account_id,account_status,disable_reason,currency,amount_spent,spend_cap,funding_source_details,business,created_time`
            + `&date_format=U&limit=100&locale=es_ES`;
    while (url) {
      const r = await fetch(url, { credentials: 'include' });
      const j = await r.json();
      if (j.error) throw new Error(j.error.message);
      (j.data || []).forEach(a => adaccounts.push({
        id: a.id, nombre: a.name || '(sin nombre)',
        account_id: a.account_id || String(a.id || '').replace('act_', ''),
        account_status: a.account_status,
        disable_reason: a.disable_reason,
        currency: a.currency, amount_spent: a.amount_spent, spend_cap: a.spend_cap,
        funding_source_details: a.funding_source_details || null,
        creada: a.created_time || null,
        bm: a.business ? { id: a.business.id, nombre: a.business.name || a.business.id } : null
      }));
      url = j.paging?.next || null;
      if (url) await sleep(350);
    }
    adaccountsCargados = true;
    return adaccounts;
  }

  // Datos del perfil (para el resumen/auditoría). Dos llamadas: una fiable
  // (id, name) y otra "best-effort" para ubicación/idiomas (puede no tener permiso).
  async function cargarPerfil() {
    if (perfil) return perfil;
    perfil = { id: userId || '—', name: '—', location: null, hometown: null, languages: [], ageRange: null };
    try {
      const r = await fetch(`${API}/me?access_token=${token}&fields=id,name`, { credentials: 'include' });
      const j = await r.json();
      if (!j.error) { perfil.id = j.id || perfil.id; perfil.name = j.name || perfil.name; }
    } catch (e) {}
    try {
      const r = await fetch(`${API}/me?access_token=${token}&fields=location{name},hometown{name},languages{name},age_range`, { credentials: 'include' });
      const j = await r.json();
      if (!j.error) {
        perfil.location = (j.location && j.location.name) || null;
        perfil.hometown = (j.hometown && j.hometown.name) || null;
        perfil.languages = (j.languages || []).map(l => l.name).filter(Boolean);
        perfil.ageRange = j.age_range || null;
      }
    } catch (e) {}
    return perfil;
  }

  const loader = (txt) => `<div class="gpm-load"><div class="gpm-spin"></div>${txt}</div>`;

  function filtro(rows, q, getText) {
    q = (q || '').toLowerCase().trim();
    return q ? rows.filter(r => getText(r).toLowerCase().includes(q)) : rows;
  }

  // --- render de pestañas --------------------------------------------
  async function render(tab) {
    if (tab === 'resumen') {
      body.innerHTML = loader('Auditando el perfil (páginas, Business Managers y cuentas)...');
      let errores = [];
      await cargarPerfil();
      try { await cargarPaginas(); } catch (e) { errores.push('Páginas: ' + e.message); }
      try { await cargarBusinesses(); } catch (e) { errores.push('Business: ' + e.message); }
      try { await cargarAdAccounts(); } catch (e) { errores.push('Cuentas: ' + e.message); }
      // Restricción de páginas (Account Quality) para el veredicto de estado.
      if (userId && fbDtsg && !paginas.some(p => p.acceso)) { try { await comprobarRestriccion(); } catch (e) {} }

      const pagRestr = paginas.filter(p => p.acceso === 'die' || p.acceso === 'pzrd').length;
      const pagDie = paginas.filter(p => p.acceso === 'die').length;
      const bmVerif = businesses.filter(b => (b.verif||'').toLowerCase()==='verified').length;
      const bmRestr = businesses.filter(b => b.disabled).length;
      const bmAptos = businesses.filter(b => !b.disabled && !['rejected','revoked','failed'].includes((b.verif||'').toLowerCase())).length;
      const adsAct = adaccounts.filter(a => a.account_status === 1 || a.account_status === 201).length;
      const adsInhab = adaccounts.filter(a => a.account_status === 2 || a.account_status === 101 || a.account_status === 202).length;
      const tarjetas = tarjetasDistintas(adaccounts);
      const wabaTotal = businesses.reduce((n,b) => n + ((suma(b.wabaOwned,b.wabaClient)||{n:0}).n), 0);
      const gastoTotal = {};
      adaccounts.forEach(a => { if (a.amount_spent != null) { const c = a.currency || '—'; gastoTotal[c] = (gastoTotal[c]||0) + Number(a.amount_spent); } });
      const gastoStr = Object.keys(gastoTotal).length ? Object.entries(gastoTotal).map(([c,v]) => dinero(v, c)).join(' · ') : '—';

      // Antigüedad aproximada = activo más antiguo (Meta NO expone la fecha del perfil).
      const fechas = [];
      paginas.forEach(p => { if (p.creada) fechas.push(Number(p.creada)); });
      businesses.forEach(b => { if (b.creada) fechas.push(Number(b.creada)); });
      adaccounts.forEach(a => { if (a.creada) fechas.push(Number(a.creada)); });
      const masAntiguo = fechas.length ? Math.min.apply(null, fechas) : null;

      // Estado del perfil (derivado; Meta no da un campo "cuenta restringida" por API).
      const restr = pagDie + bmRestr + adsInhab;
      const estadoPerfil = restr > 0
        ? { cls:'gpm-no', txt:'⚠️ Con restricciones' }
        : { cls:'gpm-ok', txt:'🟢 Sin restricciones detectadas' };

      // Ubicación declarada (la real/IP no está disponible por API).
      const ubic = perfil.location || perfil.hometown || null;
      const idiomas = (perfil.languages || []).slice(0, 3).join(', ');

      const tarjeta = (icono, titulo, valor, sub) => `
        <div class="gpm-card">
          <div class="gpm-card-t">${icono} ${titulo}</div>
          <div class="gpm-card-v">${valor}</div>
          <div class="gpm-card-s">${sub||''}</div>
        </div>`;

      body.innerHTML = `
        <div class="gpm-info">📊 Auditoría de todo lo que hay en tu perfil de Meta. Un vistazo de páginas, Business Managers, cuentas publicitarias, tarjetas y WhatsApp. Usa <b>🔄 Actualizar</b> (arriba) para volver a leer todo.</div>
        ${errores.length ? `<div class="gpm-info" style="background:#fef2f2;border-color:#fecaca;color:#991b1b">⚠️ ${errores.map(esc).join('<br>')}</div>` : ''}
        <div class="gpm-perfil">
          <div class="gpm-perfil-av">${esc((perfil.name||'?').slice(0,1).toUpperCase())}</div>
          <div style="flex:1;min-width:0">
            <div style="font-weight:700;font-size:15px">${esc(perfil.name||'—')} <span class="gpm-pill ${estadoPerfil.cls}">${estadoPerfil.txt}</span></div>
            <div style="font-size:12px;color:#64748b">ID ${esc(String(perfil.id))} <button class="gpm-mini" data-copy="${esc(String(perfil.id))}" title="Copiar ID del perfil">📋</button>${businessID ? ' · contexto BM ' + esc(businessID) : ''}</div>
          </div>
          <a class="gpm-btn" style="text-decoration:none;white-space:nowrap" href="https://business.facebook.com/latest/home" target="_blank" rel="noopener">🏢 Abrir Business Manager</a>
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:8px;margin:0 0 12px">
          <a class="gpm-btn sec" style="text-decoration:none" href="https://www.facebook.com/primary_location/info" target="_blank" rel="noopener" title="Ubicación principal real que Meta asigna al perfil (dónde está 'sumergido')">📍 Ubicación real del perfil (Meta)</a>
          <a class="gpm-btn sec" style="text-decoration:none" href="https://www.facebook.com/diagnostics" target="_blank" rel="noopener" title="Datos y diagnóstico del perfil según Meta">🩺 Diagnóstico del perfil</a>
          <a class="gpm-btn sec" style="text-decoration:none" href="https://business.facebook.com/accountquality" target="_blank" rel="noopener" title="Estado real de restricciones">🛡️ Account Quality</a>
        </div>
        <div class="gpm-cards">
          ${tarjeta('🛡️','Estado del perfil', `<span class="gpm-pill ${estadoPerfil.cls}">${estadoPerfil.txt}</span>`, `${restr>0?`${pagDie} págs · ${bmRestr} BMs · ${adsInhab} cuentas restringidas`:'páginas, BMs y cuentas OK'} · <a class="gpm-link" href="https://business.facebook.com/accountquality" target="_blank" rel="noopener">Account Quality ↗</a>`)}
          ${tarjeta('🗓️','Antigüedad (aprox.)', masAntiguo ? antiguedad(masAntiguo) : '—', masAntiguo ? ('activo más antiguo: ' + formatFecha(masAntiguo)) : 'Meta no expone la fecha del perfil')}
          ${tarjeta('📍','Ubicación (declarada)', ubic ? esc(ubic) : '—', ubic ? (idiomas ? ('idiomas: ' + esc(idiomas)) : 'declarada por el usuario') : 'no disponible por API (permiso/privacidad)')}
          ${tarjeta('📋','Páginas', fmtNum(paginas.length), pagRestr ? ('⚠️ ' + pagRestr + ' con restricción') : 'clic en la pestaña Páginas')}
          ${tarjeta('🏢','Business Managers', fmtNum(businesses.length), `✅ ${bmVerif} verificados · 🔴 ${bmRestr} restringidos`)}
          ${tarjeta('🟢','BMs aptos WhatsApp', fmtNum(bmAptos), `de ${businesses.length} BMs`)}
          ${tarjeta('💳','Cuentas publicitarias', fmtNum(adaccounts.length), `🟢 ${adsAct} activas · 🔴 ${adsInhab} inhabilitadas`)}
          ${tarjeta('🏦','Tarjetas / medios de pago', fmtNum(tarjetas.length), tarjetas.length ? tarjetas.slice(0,2).map(esc).join(' · ') : 'ninguna visible')}
          ${tarjeta('📱','WABAs (WhatsApp API)', fmtNum(wabaTotal), 'cuentas de WhatsApp en tus BMs')}
          ${tarjeta('💰','Gasto acumulado', gastoStr, 'suma de tus cuentas publicitarias')}
          ${tarjeta('🔑','Sesión', token ? 'OK' : '—', `${userId ? 'usuario ' + esc(String(userId)) : 'sin USER_ID'}${fbDtsg ? ' · restricción disponible' : ''}`)}
        </div>
        <div class="gpm-info" style="font-size:11px;color:#64748b;margin-top:10px">ℹ️ Meta <b>no expone por API</b> la fecha de creación ni la ubicación real/IP de un perfil. Aquí la <b>antigüedad</b> es una estimación por el activo más antiguo y la <b>ubicación</b> es la declarada por el usuario. Para el dato <b>real</b> usa los botones de arriba: <b>📍 Ubicación real</b> (dónde está "sumergido" el perfil), <b>🩺 Diagnóstico</b> y <b>🛡️ Account Quality</b> (restricciones) — son las páginas oficiales de Meta con esa información.</div>`;
      return;
    }

    else if (tab === 'adaccounts') {
      body.innerHTML = loader('Leyendo tus cuentas publicitarias...');
      try { await cargarAdAccounts(); } catch (e) { body.innerHTML = `<div class="gpm-info">❌ ${esc(e.message)}<br><br>Necesita permiso de anuncios (<i>ads_read</i>) en tu sesión.</div>`; return; }
      if (!adaccounts.length) { body.innerHTML = `<div class="gpm-info">ℹ️ No se encontraron cuentas publicitarias en este perfil.</div>`; return; }

      const activas = adaccounts.filter(a => a.account_status === 1 || a.account_status === 201).length;
      const inhab = adaccounts.filter(a => a.account_status === 2 || a.account_status === 101 || a.account_status === 202).length;
      const conBM = adaccounts.filter(a => a.bm).length;

      body.innerHTML = `
        <div class="gpm-info">ℹ️ Todas tus cuentas publicitarias, en cualquier BM o personales. Clic en el <b>nombre</b> abre el Ads Manager; <b>BM</b> lleva al Business Manager dueño. Incluye estado, <b>tarjeta / medio de pago</b>, gastado y límite. Solo lectura.</div>
        <div style="margin-bottom:8px">
          <span class="gpm-badge gpm-b-blue">Cuentas ${adaccounts.length}</span>
          <span class="gpm-badge gpm-b-green">🟢 Activas ${activas}</span>
          <span class="gpm-badge gpm-b-red">🔴 Inhabilitadas ${inhab}</span>
          <span class="gpm-badge gpm-b-blue">En un BM ${conBM}</span>
        </div>
        <div class="gpm-filters">
          <div class="g"><label>Estado</label><select id="aEstado"><option value="todos">Todos</option><option value="activa">🟢 Activa</option><option value="inhab">🔴 Inhabilitada</option></select></div>
          <div class="g"><label>BM</label><select id="aBm"><option value="todos">Todas</option><option value="con">En un BM</option><option value="sin">Sin BM</option></select></div>
          <div class="g"><label>Tarjeta</label><select id="aCard"><option value="todos">Todas</option><option value="con">Con tarjeta</option><option value="sin">Sin tarjeta</option></select></div>
          <button class="gpm-btn sec" id="aCsv">💾 CSV</button>
          <span id="aCount" style="font-size:11px;color:#64748b"></span>
        </div>
        <input class="gpm-search" id="aSearch" placeholder="Buscar por nombre o ID (act_...)" value="${esc(adQ)}">
        <table class="gpm-table"><thead><tr><th>Cuenta</th><th>Estado</th><th>Tarjeta</th><th>Gastado</th><th>Límite</th><th>Creada</th><th>Business Manager</th></tr></thead>
        <tbody id="aBody"></tbody></table>`;

      const pasa = (a) => {
        const act = a.account_status;
        if (fAEstado === 'activa' && !(act === 1 || act === 201)) return false;
        if (fAEstado === 'inhab' && !(act === 2 || act === 101 || act === 202)) return false;
        if (fABm === 'con' && !a.bm) return false;
        if (fABm === 'sin' && a.bm) return false;
        const tieneCard = cardLabel(a) !== '—';
        if (fACard === 'con' && !tieneCard) return false;
        if (fACard === 'sin' && tieneCard) return false;
        return true;
      };
      const drawBody = () => {
        const q = adQ.toLowerCase().trim();
        const rows = adaccounts.filter(a => pasa(a) && (!q || (a.nombre + ' act_' + a.account_id).toLowerCase().includes(q)));
        const c = document.getElementById('aCount'); if (c) c.textContent = rows.length + ' de ' + adaccounts.length;
        document.getElementById('aBody').innerHTML = rows.map(a => {
          const motivo = (a.account_status !== 1 && a.disable_reason) ? adDisable(a.disable_reason) : '';
          const bmCell = a.bm
            ? `<a class="gpm-link" href="${urlBM(a.bm.id)}" target="_blank" rel="noopener">${esc(a.bm.nombre)}</a><div style="font-size:10px;color:#94a3b8">${esc(a.bm.id)} <button class="gpm-mini" data-copy="${esc(a.bm.id)}" title="Copiar ID del BM">📋</button></div>`
            : '<span style="color:#94a3b8">— sin BM</span>';
          return `<tr>
            <td class="gpm-nombre" title="${esc(a.nombre)} · act_${a.account_id}">
              <a class="gpm-link" style="font-weight:600" href="${urlAdsMgr(a.account_id, a.bm ? a.bm.id : '')}" target="_blank" rel="noopener">${esc(a.nombre)}</a>
              <div style="font-size:10px;color:#94a3b8;margin-top:2px">act_${a.account_id} <button class="gpm-mini" data-copy="${a.account_id}" title="Copiar ID">📋</button></div>
            </td>
            <td style="white-space:nowrap">${adStatus(a.account_status)}${motivo ? `<div style="font-size:10px;color:#dc2626">${esc(motivo)}</div>` : ''}</td>
            <td style="white-space:nowrap">💳 ${esc(cardLabel(a))}</td>
            <td class="gpm-num">${dinero(a.amount_spent, a.currency)}</td>
            <td class="gpm-num">${a.spend_cap && Number(a.spend_cap) > 0 ? dinero(a.spend_cap, a.currency) : '∞'}</td>
            <td style="white-space:nowrap">${formatFecha(a.creada)}</td>
            <td class="gpm-nombre">${bmCell}</td>
          </tr>`;
        }).join('');
      };
      const sel = (id, val, cb) => { const el = document.getElementById(id); el.value = val; el.onchange = () => { cb(el.value); drawBody(); }; };
      sel('aEstado', fAEstado, v => fAEstado = v);
      sel('aBm', fABm, v => fABm = v);
      sel('aCard', fACard, v => fACard = v);
      const s = document.getElementById('aSearch');
      s.oninput = () => { adQ = s.value; drawBody(); document.getElementById('aSearch').focus(); const v = s.value; document.getElementById('aSearch').setSelectionRange(v.length, v.length); };
      drawBody();
      document.getElementById('aCsv').onclick = () => {
        const filas = [['cuenta_id','cuenta_nombre','estado','motivo_inhabilitacion','tarjeta','gastado','moneda','limite_gasto','creada','bm_id','bm_nombre']];
        adaccounts.forEach(a => filas.push(['act_'+a.account_id, a.nombre, adStatus(a.account_status).replace(/[🟢🔴🟠🟡⏳ ]/g,''), a.disable_reason ? adDisable(a.disable_reason) : '', cardLabel(a), a.amount_spent!=null?(Number(a.amount_spent)/100):'', a.currency||'', (a.spend_cap && Number(a.spend_cap)>0)?(Number(a.spend_cap)/100):'', formatFecha(a.creada), a.bm?a.bm.id:'', a.bm?a.bm.nombre:'']));
        const csv = filas.map(f => f.map(c => `"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n');
        const blob = new Blob(['﻿'+csv], { type:'text/csv;charset=utf-8' });
        const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'auditoria-cuentas-publicitarias-meta.csv'; a.click(); URL.revokeObjectURL(a.href);
      };
      return;
    }

    else if (tab === 'paginas') {
      body.innerHTML = loader('Cargando páginas...');
      try { await cargarPaginas(); } catch (e) { body.innerHTML = `<div class="gpm-info">❌ ${esc(e.message)}</div>`; return; }

      const conBM = paginas.filter(p => p.bm).length;

      const cabecera = () => {
        const pub = paginas.filter(p => p.publicada).length;
        const comprobado = paginas.some(p => p.acceso);
        const live = paginas.filter(p => p.acceso === 'live').length;
        const pzrd = paginas.filter(p => p.acceso === 'pzrd').length;
        const die  = paginas.filter(p => p.acceso === 'die').length;
        return `
        <div class="gpm-info">ℹ️ Todas las páginas que administras. Clic en el <b>nombre</b> abre la página; <b>Personas</b> muestra quién tiene rol; <b>BM</b> lleva al Business Manager dueño. Pulsa <b>Comprobar restricción</b> para clasificar 🟢 LIVE / 🟡 PZRD / 🔴 DIE (solo lectura).</div>
        <div style="margin-bottom:8px">
          <span class="gpm-badge gpm-b-blue">Páginas ${paginas.length}</span>
          <span class="gpm-badge gpm-b-green">Publicadas ${pub}</span>
          <span class="gpm-badge gpm-b-blue">En un BM ${conBM}</span>
          ${comprobado ? `<span class="gpm-badge gpm-b-green">🟢 ${live}</span><span class="gpm-badge gpm-b-amber">🟡 ${pzrd}</span><span class="gpm-badge gpm-b-red">🔴 ${die}</span>` : ''}
        </div>
        <div class="gpm-filters">
          <div class="g"><label>Publicada</label><select id="pPub"><option value="todos">Todas</option><option value="si">Sí</option><option value="no">No</option></select></div>
          <div class="g"><label>Restricción</label><select id="pRestr"><option value="todos">Todas</option><option value="live">🟢 LIVE</option><option value="pzrd">🟡 PZRD</option><option value="die">🔴 DIE</option></select></div>
          <div class="g"><label>Rol</label><select id="pRol"><option value="todos">Todos</option><option value="Admin">Admin</option><option value="Editor">Editor</option><option value="Anunciante">Anunciante</option><option value="Analista">Analista</option></select></div>
          <div class="g"><label>BM</label><select id="pBm"><option value="todos">Todas</option><option value="con">En un BM</option><option value="sin">Sin BM</option></select></div>
          <button class="gpm-btn sec" id="pCsv">💾 CSV</button>
          <button class="gpm-btn" id="pCheck">🔎 Comprobar restricción</button>
          <span id="pProg" style="font-size:11px;color:#64748b"></span>
        </div>
        <input class="gpm-search" id="pSearch" placeholder="Buscar por nombre o ID de página..." value="${esc(pagQ)}">
        <table class="gpm-table"><thead><tr><th>Página</th><th>Seguidores</th><th>Creada</th><th>Publicada</th><th>Restricción</th><th>Tu rol</th><th>Personas</th><th>Business Manager</th></tr></thead>
        <tbody id="pBody"></tbody></table>`;
      };

      const pasa = (p) => {
        if (fPub === 'si' && !p.publicada) return false;
        if (fPub === 'no' && p.publicada) return false;
        if (fRestr !== 'todos' && p.acceso !== fRestr) return false;
        if (fRol !== 'todos' && rolCorto(p.misTareas) !== fRol) return false;
        if (fBm === 'con' && !p.bm) return false;
        if (fBm === 'sin' && p.bm) return false;
        return true;
      };

      const drawBody = () => {
        const q = pagQ.toLowerCase().trim();
        const rows = paginas.filter(p => pasa(p) && (!q || (p.nombre + ' ' + p.id).toLowerCase().includes(q)));
        document.getElementById('pBody').innerHTML = rows.map(p => {
          const bmCell = p.bm
            ? `<a class="gpm-link" href="${urlBM(p.bm.id)}" target="_blank" rel="noopener" title="Abrir el BM dueño">${esc(p.bm.nombre)}</a><div style="font-size:10px;color:#94a3b8">${esc(p.bm.id)} <button class="gpm-mini" data-copy="${esc(p.bm.id)}" title="Copiar ID del BM">📋</button></div>`
            : '<span style="color:#94a3b8">— sin BM</span>';
          return `<tr>
            <td class="gpm-nombre" title="${esc(p.nombre)} · ${p.id}">
              <a class="gpm-link" style="font-weight:600" href="${urlPerfil(p.id)}" target="_blank" rel="noopener">${esc(p.nombre)}</a>
              <div style="font-size:10px;color:#94a3b8;margin-top:2px">${p.id} <button class="gpm-mini" data-copy="${p.id}" title="Copiar ID">📋</button> <a class="gpm-mini" style="text-decoration:none" href="${urlRenombrar(p.id)}" target="_blank" rel="noopener" title="Renombrar la página (pantalla oficial)">✏️ renombrar</a></div>
            </td>
            <td class="gpm-num">${fmtNum(p.seguidores)}</td>
            <td style="white-space:nowrap">${formatFecha(p.creada)}</td>
            <td><span class="gpm-pill ${p.publicada?'gpm-ok':'gpm-no'}">${p.publicada?'Sí':'No'}</span></td>
            <td>${estadoPagePill(p)}${p.accesoDetalle ? `<div style="color:#94a3b8;font-size:10px">${esc(p.accesoDetalle)}</div>` : ''}</td>
            <td class="gpm-rol" title="${esc(p.misTareas)}">${esc(rolCorto(p.misTareas))}</td>
            <td><button class="gpm-cellbtn" data-page-action="admins" data-page="${p.id}" title="Ver personas con rol en la página">👥 ver</button></td>
            <td class="gpm-nombre">${bmCell}</td>
          </tr>`;
        }).join('');
      };

      const pintar = () => {
        body.innerHTML = cabecera();
        const sel = (id, val, cb) => { const el = document.getElementById(id); el.value = val; el.onchange = () => { cb(el.value); drawBody(); }; };
        sel('pPub', fPub, v => fPub = v);
        sel('pRestr', fRestr, v => fRestr = v);
        sel('pRol', fRol, v => fRol = v);
        sel('pBm', fBm, v => fBm = v);
        const s = document.getElementById('pSearch');
        s.oninput = () => { pagQ = s.value; drawBody(); document.getElementById('pSearch').focus(); const v = s.value; document.getElementById('pSearch').setSelectionRange(v.length, v.length); };
        document.getElementById('pCheck').onclick = async () => {
          const btn = document.getElementById('pCheck'); const prog = document.getElementById('pProg');
          btn.disabled = true; prog.textContent = 'Consultando restricción...';
          const res = await comprobarRestriccion();
          if (res.error) { prog.textContent = '❌ ' + res.error; btn.disabled = false; return; }
          pintar(); document.getElementById('pProg').textContent = '✅ Comprobadas ' + res.ok + ' páginas.';
        };
        document.getElementById('pCsv').onclick = () => {
          const filas = [['pagina_id','pagina_nombre','url_perfil','seguidores','creada','publicada','restriccion','tu_rol','bm_id','bm_nombre']];
          paginas.forEach(p => filas.push([p.id, p.nombre, urlPerfil(p.id), p.seguidores, formatFecha(p.creada), p.publicada?'Sí':'No', p.acceso || 'sin comprobar', p.misTareas, p.bm ? p.bm.id : '', p.bm ? p.bm.nombre : '']));
          const csv = filas.map(f => f.map(c => `"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n');
          const blob = new Blob(['﻿'+csv], { type:'text/csv;charset=utf-8' });
          const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'auditoria-paginas-meta.csv'; a.click(); URL.revokeObjectURL(a.href);
        };
        drawBody();
      };
      pintar();
    }

    else if (tab === 'business') {
      body.innerHTML = loader('Leyendo tus Business Managers y sus activos (puede tardar)...');
      try { await cargarBusinesses(); } catch (e) { body.innerHTML = `<div class="gpm-info">❌ ${esc(e.message)}<br><br>Si el error habla de permisos, este panel necesita el permiso <b>business_management</b> en tu sesión. Ábrelo desde <b>business.facebook.com</b> con la cuenta que tiene acceso a los BM.</div>`; return; }

      if (!businesses.length) { body.innerHTML = `<div class="gpm-info">ℹ️ No se encontraron Business Managers en esta cuenta.</div>`; return; }

      const verificados = businesses.filter(b => (b.verif||'').toLowerCase()==='verified').length;
      const restringidos = businesses.filter(b => b.disabled).length;
      const aptos = businesses.filter(b => !b.disabled && !['rejected','revoked','failed'].includes((b.verif||'').toLowerCase())).length;

      body.innerHTML = `
        <div class="gpm-info">ℹ️ Business Managers a los que tienes acceso. Clic en el <b>nombre</b> abre el negocio; <b>✏️ renombrar</b> cambia su nombre (te pide confirmación). Clic en <b>Usuarios</b> muestra nombre/correo/rol; en <b>Cuentas pub.</b> los IDs, estado y gasto (con enlace al Ads Manager); en <b>WABAs</b> los números con su verificación. <b>Páginas</b> lleva a esa sección.<br><br><b>Apto WhatsApp</b>: 🟢 verificado (crea hasta 20 WABAs) · 🟡 sin verificar (pocas WABAs hasta verificar) · 🔴 restringido o verificación rechazada.</div>
        <div style="margin-bottom:8px">
          <span class="gpm-badge gpm-b-blue">BMs ${businesses.length}</span>
          <span class="gpm-badge gpm-b-green">Verificados ${verificados}</span>
          <span class="gpm-badge gpm-b-green">Aptos WhatsApp ${aptos}</span>
          <span class="gpm-badge gpm-b-red">Restringidos ${restringidos}</span>
        </div>
        <div class="gpm-filters">
          <div class="g"><label>Estado</label><select id="fEstado"><option value="todos">Todos</option><option value="limpio">🟢 Limpio</option><option value="restringido">🔴 Restringido</option></select></div>
          <div class="g"><label>Apto WhatsApp</label><select id="fApto"><option value="todos">Todos</option><option value="apto">🟢 Sí</option><option value="limitado">🟡 Limitado</option><option value="noapto">🔴 No apto</option></select></div>
          <div class="g"><label>Verificación</label><select id="fVerif"><option value="todos">Todas</option><option value="verificado">Verificado</option><option value="sin">Sin verificar</option></select></div>
          <div class="g"><label>WABAs</label><select id="fWaba"><option value="todos">Todos</option><option value="con">Con WABAs</option><option value="sin">Sin WABAs</option></select></div>
          <button class="gpm-btn sec" id="gpmBizCsv">💾 CSV</button>
          <span id="gpmBizCount" style="font-size:11px;color:#64748b"></span>
        </div>
        <input class="gpm-search" id="gpmSearch4" placeholder="Buscar por nombre o ID de BM..." value="${esc(bizQ)}">
        <table class="gpm-table"><thead><tr><th>Business Manager</th><th>Antigüedad</th><th>Verificación</th><th>Estado</th><th>Apto WhatsApp</th><th>Usuarios</th><th>Páginas</th><th>Cuentas pub.</th><th>WABAs</th></tr></thead>
        <tbody id="gpmBizBody"></tbody></table>`;

      const pasaFiltros = (b) => {
        if (fEstado === 'limpio' && b.disabled) return false;
        if (fEstado === 'restringido' && !b.disabled) return false;
        const w = aptoWaba(b).word;
        if (fApto === 'apto' && w !== 'apto') return false;
        if (fApto === 'limitado' && w !== 'limitado') return false;
        if (fApto === 'noapto' && !(w === 'restringido' || w === 'riesgo')) return false;
        const v = (b.verif||'').toLowerCase();
        if (fVerif === 'verificado' && v !== 'verified') return false;
        if (fVerif === 'sin' && v === 'verified') return false;
        const totWaba = suma(b.wabaOwned, b.wabaClient);
        const nWaba = totWaba ? totWaba.n : 0;
        if (fWaba === 'con' && nWaba <= 0) return false;
        if (fWaba === 'sin' && nWaba > 0) return false;
        return true;
      };

      const drawBody = () => {
        const q = bizQ.toLowerCase().trim();
        const rows = businesses.filter(b => pasaFiltros(b) && (!q || (b.nombre + ' ' + b.id).toLowerCase().includes(q)));
        const c = document.getElementById('gpmBizCount'); if (c) c.textContent = rows.length + ' de ' + businesses.length;
        document.getElementById('gpmBizBody').innerHTML = rows.map(b => {
          const ap = aptoWaba(b);
          const usuarios = suma(b.usuarios, b.systemUsers);
          const pags = suma(b.pagsOwned, b.pagsClient);
          const ads = suma(b.adsOwned, b.adsClient);
          const waba = suma(b.wabaOwned, b.wabaClient);
          const estado = b.disabled ? '<span class="gpm-pill gpm-no">🔴 Restringido</span>' : '<span class="gpm-pill gpm-ok">🟢 Limpio</span>';
          const celdaAds = (b.adsItems && b.adsItems.length) ? `<button class="gpm-cellbtn" data-biz-action="ads" data-bm="${b.id}" title="Ver IDs, estado y gasto de cada cuenta e ir al Ads Manager">${cnt(ads)} 🔎</button>` : cnt(ads);
          const celdaWaba = (b.wabaItems && b.wabaItems.length) ? `<button class="gpm-cellbtn" data-biz-action="waba" data-bm="${b.id}" title="Ver WABAs y sus números / verificación">${cnt(waba)} 🔎</button>` : cnt(waba);
          const celdaUsers = (b.usersItems && b.usersItems.length) ? `<button class="gpm-cellbtn" data-biz-action="users" data-bm="${b.id}" title="Ver nombre, correo y rol de cada usuario">${cnt(usuarios)} 🔎</button>` : cnt(usuarios);
          return `<tr>
            <td class="gpm-nombre" title="${esc(b.nombre)} · ${b.id}">
              <a class="gpm-link" style="font-weight:600" href="${urlBM(b.id)}" target="_blank" rel="noopener">${esc(b.nombre)}</a>
              <div style="font-size:10px;color:#94a3b8;margin-top:2px">${b.id} <button class="gpm-mini" data-copy="${b.id}" title="Copiar ID del BM">📋</button> <a class="gpm-mini" style="text-decoration:none" href="${urlBMHome(b.id)}" target="_blank" rel="noopener" title="Abrir el BM">↗ abrir</a> <button class="gpm-mini" data-biz-action="rename" data-bm="${b.id}" title="Renombrar el BM (modifica en Meta)">✏️ renombrar</button></div>
            </td>
            <td style="white-space:nowrap" title="${b.creada ? 'Creado ' + formatFecha(b.creada) : ''}">${antiguedad(b.creada)}</td>
            <td style="white-space:nowrap">${verifLabel(b.verif)}</td>
            <td>${estado}</td>
            <td><span class="gpm-pill ${ap.cls}" title="${esc(ap.det)}">${ap.txt}</span></td>
            <td class="gpm-num" title="Personas ${cnt(b.usuarios)} · Sistema ${cnt(b.systemUsers)}">${celdaUsers}</td>
            <td class="gpm-num" title="Propias ${cnt(b.pagsOwned)} · Compartidas ${cnt(b.pagsClient)}"><a class="gpm-link" href="${urlBMPages(b.id)}" target="_blank" rel="noopener">${cnt(pags)}</a></td>
            <td class="gpm-num">${celdaAds}</td>
            <td class="gpm-num">${celdaWaba}</td>
          </tr>`;
        }).join('');
      };

      const sel = (id, val, cb) => { const el = document.getElementById(id); el.value = val; el.onchange = () => { cb(el.value); drawBody(); }; };
      sel('fEstado', fEstado, v => fEstado = v);
      sel('fApto', fApto, v => fApto = v);
      sel('fVerif', fVerif, v => fVerif = v);
      sel('fWaba', fWaba, v => fWaba = v);
      const s4 = document.getElementById('gpmSearch4');
      s4.oninput = () => { bizQ = s4.value; drawBody(); document.getElementById('gpmSearch4').focus(); const v = s4.value; document.getElementById('gpmSearch4').setSelectionRange(v.length, v.length); };
      drawBody();

      document.getElementById('gpmBizCsv').onclick = () => {
        const filas = [['bm_id','bm_nombre','creado','antiguedad','verificacion','restringido','apto_whatsapp','usuarios','system_users','paginas_propias','paginas_compartidas','ad_accounts_total','ad_account_ids','wabas_total','waba_ids','tu_rol']];
        businesses.forEach(b => {
          const ap = aptoWaba(b);
          const adsTot = suma(b.adsOwned, b.adsClient);
          const wabaTot = suma(b.wabaOwned, b.wabaClient);
          const adIds = (b.adsItems || []).map(a => 'act_' + actNum(a)).join(';');
          const wabaIds = (b.wabaItems || []).map(w => w.id).join(';');
          filas.push([b.id, b.nombre, b.creada ? formatFecha(b.creada) : '', antiguedad(b.creada), b.verif || '', b.disabled ? 'Sí' : 'No', ap.word, numCsv(b.usuarios), numCsv(b.systemUsers), numCsv(b.pagsOwned), numCsv(b.pagsClient), adsTot ? adsTot.n : '', adIds, wabaTot ? wabaTot.n : '', wabaIds, b.roles]);
        });
        const csv = filas.map(f => f.map(c => `"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n');
        const blob = new Blob(['﻿'+csv], { type:'text/csv;charset=utf-8' });
        const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'auditoria-business-managers-meta.csv'; a.click(); URL.revokeObjectURL(a.href);
      };
    }

    else if (tab === 'exportar') {
      body.innerHTML = `
        <div class="gpm-info">ℹ️ Exporta lo que ya cargaste. Cada pestaña (Páginas / Business) tiene además su propio botón <b>💾 CSV</b>.</div>
        <button class="gpm-btn" id="gpmCsv">💾 CSV de páginas</button>
        <button class="gpm-btn sec" id="gpmCopy">📋 Copiar IDs de páginas</button>
        <button class="gpm-btn sec" id="gpmCopyUrls">🔗 Copiar URLs de páginas</button>
        <div id="gpmExpMsg" style="margin-top:10px;font-size:12px;color:#475569"></div>`;
      document.getElementById('gpmCsv').onclick = async () => {
        await cargarPaginas();
        const filas = [['pagina_id','pagina_nombre','url_perfil','seguidores','creada','publicada','restriccion','tu_rol','bm_id','bm_nombre']];
        paginas.forEach(p => filas.push([p.id, p.nombre, urlPerfil(p.id), p.seguidores, formatFecha(p.creada), p.publicada?'Sí':'No', p.acceso || 'sin comprobar', p.misTareas, p.bm ? p.bm.id : '', p.bm ? p.bm.nombre : '']));
        const csv = filas.map(f => f.map(c => `"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n');
        const blob = new Blob(['﻿'+csv], { type:'text/csv;charset=utf-8' });
        const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'auditoria-paginas-meta.csv'; a.click(); URL.revokeObjectURL(a.href);
        document.getElementById('gpmExpMsg').textContent = '✅ CSV descargado.';
      };
      document.getElementById('gpmCopy').onclick = async () => {
        await cargarPaginas();
        await copiar(paginas.map(p => p.id).join('\n'));
        document.getElementById('gpmExpMsg').textContent = '✅ IDs copiados al portapapeles.';
      };
      document.getElementById('gpmCopyUrls').onclick = async () => {
        await cargarPaginas();
        await copiar(paginas.map(p => urlPerfil(p.id)).join('\n'));
        document.getElementById('gpmExpMsg').textContent = '✅ URLs copiadas al portapapeles.';
      };
    }

    else if (tab === 'ayuda') {
      const si = '<span style="color:#16a34a;font-weight:700">✅ detectado</span>';
      const no = '<span style="color:#dc2626;font-weight:700">❌ no detectado</span>';
      body.innerHTML = `
        <div class="gpm-info">ℹ️ Diagnóstico de tu sesión actual (en <b>${esc(location.hostname)}</b>):</div>
        <table class="gpm-table"><tbody>
          <tr><td>Token de sesión</td><td>${token ? si : no}</td><td>Necesario para todo</td></tr>
          <tr><td>Business Manager (business_id)</td><td>${businessID ? si + ' · ' + esc(businessID) : no}</td><td>Mejora la lista de personas por página</td></tr>
          <tr><td>fb_dtsg</td><td>${fbDtsg ? si : no}</td><td rowspan="2" style="vertical-align:middle">Necesarios para <b>LIVE/PZRD/DIE</b></td></tr>
          <tr><td>USER_ID</td><td>${userId ? si : no}</td></tr>
        </tbody></table>

        <h3 style="font-size:14px;margin:16px 0 6px">📖 Cómo usar</h3>
        <div style="font-size:12px;line-height:1.7;color:#334155">
          <b>¿Dónde abrirlo?</b><br>
          • Casi todo funciona desde tu perfil normal (<code>facebook.com</code>).<br>
          • Para ver la <b>lista completa de admins</b> de cada página, ábrelo dentro de <b>business.facebook.com</b> (ahí existe el <i>business_id</i>).<br><br>

          <b>Pestañas</b><br>
          • <b>📋 Páginas</b> — todas las que administras, con seguidores, fecha, publicada, restricción (🟢 LIVE / 🟡 PZRD / 🔴 DIE tras pulsar <b>Comprobar restricción</b>), tu rol, <b>Personas</b> con rol (clic) y el <b>Business Manager</b> dueño (clic abre el BM). Con filtros y buscador.<br>
          • <b>🏢 Business</b> — tus Business Managers: antigüedad, verificación, si están limpios, si son aptos para crear una WABA de WhatsApp, y usuarios / páginas / cuentas publicitarias / WABAs (clic para el detalle). Renombrar el BM desde aquí. Necesita el permiso <i>business_management</i>.<br>
          • <b>💾 Exportar</b> — CSV, copiar IDs o URLs.<br><br>

          <b>Seguridad</b><br>
          • Este panel solo se ejecuta dentro de <b>facebook.com / business.facebook.com</b>; en otra web se detiene para no exponer tu sesión.<br>
          • Es de <b>solo lectura</b>, con una única excepción: <b>✏️ Renombrar BM</b>, que te pide confirmación antes de escribir. Renombrar páginas te lleva a la pantalla oficial de Meta.<br>
          • Si Facebook muestra «Stop!» en la consola, escribe <code>allow pasting</code> y pulsa Enter.
        </div>
        <div class="gpm-info" style="margin-top:14px;background:#0f172a;border-color:#0f172a;color:#e2e8f0">
          🤖 <b>¿Este panel te ahorró tiempo?</b> <b>Converxio</b> hace lo mismo con tus clientes 24/7: contesta WhatsApp, opera Meta Ads y hace seguimiento con control humano. Operado por la agencia <b>IADS</b>.<br>
          <a href="https://converxio.app" target="_blank" rel="noopener" style="color:#93c5fd;font-weight:700">Conoce Converxio ↗</a>
        </div>`;
    }
  }

  // --- navegación de pestañas ----------------------------------------
  ov.querySelectorAll('.gpm-tab').forEach(t => t.onclick = () => {
    ov.querySelectorAll('.gpm-tab').forEach(x => x.classList.remove('active'));
    t.classList.add('active');
    tabActual = t.dataset.tab;
    render(tabActual);
  });

  // Botón actualizar: vacía todas las cachés y recarga la pestaña activa.
  document.getElementById('gpmRefresh').onclick = async () => {
    const btn = document.getElementById('gpmRefresh');
    btn.disabled = true; const prev = btn.textContent; btn.textContent = '⏳ Actualizando...';
    paginas = []; businesses = []; businessCargados = false;
    adaccounts = []; adaccountsCargados = false; perfil = null;
    document.getElementById('gpm-pop')?.remove();
    await render(tabActual);
    btn.textContent = prev; btn.disabled = false;
  };

  render(tabActual);

  // Aviso de nueva versión (a prueba de fallos; nunca rompe si el CSP lo bloquea).
  if (UPDATE_URL) {
    fetch(UPDATE_URL, { cache: 'no-store' }).then(r => r.json()).then(j => {
      if (j && j.version && j.version !== VERSION) {
        const chip = document.createElement('a');
        chip.href = j.url || '#'; chip.target = '_blank'; chip.rel = 'noopener';
        chip.className = 'gpm-update'; chip.textContent = '⬆️ Nueva versión ' + j.version;
        ov.querySelector('.gpm-head').appendChild(chip);
      }
    }).catch(() => {});
  }
})();
