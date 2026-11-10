/* ==========================================================================
   Valtek Optima — Shell de navegación
   Organiza la aplicación en dos módulos:
     · Aseo y Personal   (Optima Clean)
     · Seguridad y Acceso (Optima Access)
   y agrega el Centro de control, la sesión persistente y la landing.
   Depende de las funciones globales definidas en index.html
   (showView, switchJefeTab, switchSaTab, switchPorteriaTab, switchProvTab,
   checkWorkerStatus, state, SUPER_ADMIN, doLogin…).
   ========================================================================== */
(function () {
  'use strict';

  // ── Íconos (trazo 1.8, estilo lineal) ──
  const P = 'viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"';
  const ICON = {
    grid: `<svg ${P}><rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/></svg>`,
    activity: `<svg ${P}><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>`,
    map: `<svg ${P}><polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/><line x1="8" y1="2" x2="8" y2="18"/><line x1="16" y1="6" x2="16" y2="22"/></svg>`,
    users: `<svg ${P}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
    chart: `<svg ${P}><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>`,
    phone: `<svg ${P}><rect x="6" y="2" width="12" height="20" rx="2"/><line x1="11" y1="18" x2="13" y2="18"/></svg>`,
    shield: `<svg ${P}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>`,
    scan: `<svg ${P}><path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2"/><rect x="7" y="7" width="10" height="10" rx="1"/></svg>`,
    calendar: `<svg ${P}><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>`,
    badge: `<svg ${P}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><polyline points="9 15 11 17 15 13"/></svg>`,
    folder: `<svg ${P}><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>`,
    building: `<svg ${P}><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>`,
    userPlus: `<svg ${P}><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/></svg>`,
    list: `<svg ${P}><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>`,
    globe: `<svg ${P}><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>`,
    bars: `<svg ${P}><path d="M3 3v18h18"/><path d="M7 15l4-4 3 3 5-6"/></svg>`,
    alert: `<svg ${P}><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
    x: `<svg ${P}><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`,
    info: `<svg ${P}><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`,
    sparkle: `<svg ${P}><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1"/></svg>`,
    login: `<svg ${P}><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/></svg>`,
    arrow: `<svg ${P}><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>`,
  };

  const ROLE_LABEL = {
    superadmin: 'Super admin · Valtek',
    admin: 'Administración',
    jefe: 'Jefatura de aseo',
    trabajador: 'Operario/a de aseo',
    proveedor: 'Empresa contratista',
    porteria: 'Portería y seguridad',
  };

  const GROUPS = {
    general: { label: 'General', mod: 'general' },
    clean: { label: 'Aseo y Personal', mod: 'clean', short: 'Aseo y Personal' },
    access: { label: 'Seguridad y Acceso', mod: 'access', short: 'Seguridad y Acceso' },
    admin: { label: 'Administración Valtek', mod: 'admin', short: 'Administración' },
  };

  const ALL_STAFF = ['superadmin', 'admin', 'jefe'];
  const ADMINS = ['superadmin', 'admin'];

  // ── Helpers de navegación hacia las vistas existentes ──
  function role() { return state.currentUser ? state.currentUser.role : null; }
  function openJefe(tab) {
    state.jefeMode = role() === 'jefe' ? 'jefe' : 'admin';
    showView('jefe');
    switchJefeTab(tab);
  }
  function openSa(tab) { showView('superadmin'); switchSaTab(tab); }
  function openPorteria(tab) { showView('porteria'); switchPorteriaTab(tab); }
  function openProv(tab) { showView('proveedor'); switchProvTab(tab); }

  // ── Mapa de rutas: cada pantalla pertenece a un módulo ──
  const ROUTES = [
    { id: 'overview', group: 'general', icon: 'grid', label: 'Centro de control', roles: ADMINS,
      sub: 'Resumen en vivo de aseo y seguridad', open: () => showView('overview') },

    { id: 'clean-monitor', group: 'clean', icon: 'activity', label: 'Monitor en vivo', roles: ALL_STAFF,
      sub: 'Dónde está cada operario y cómo avanzan las zonas', open: () => openJefe('monitoreo') },
    { id: 'clean-assign', group: 'clean', icon: 'map', label: 'Asignación de zonas', roles: ALL_STAFF,
      sub: 'Reparte las zonas del día y envía el mensaje al equipo', open: () => openJefe('asignacion') },
    { id: 'clean-staff', group: 'clean', icon: 'users', label: 'Equipo de aseo', roles: ALL_STAFF,
      sub: 'Nómina del personal y estado de su jornada', open: () => openJefe('personal') },
    { id: 'clean-reports', group: 'clean', icon: 'chart', label: 'Informes', roles: ALL_STAFF,
      sub: 'Rendimiento por día, por persona y por zona', open: () => openJefe('informes') },
    { id: 'clean-app', group: 'clean', icon: 'phone', label: 'App del operario', roles: ['superadmin', 'trabajador'],
      labelFor: { trabajador: 'Mis zonas de hoy' },
      sub: 'Así registra su trabajo el equipo en terreno', open: () => showView('trabajador') },

    { id: 'access-gate', group: 'access', icon: 'shield', label: 'Portería', roles: ['superadmin', 'admin', 'jefe', 'porteria'],
      sub: 'Consulta por RUT y registro de entradas y salidas', open: () => openPorteria('contratistas') },
    { id: 'access-auto', group: 'access', icon: 'scan', label: 'Acceso automatizado', roles: ['superadmin', 'admin', 'jefe', 'porteria'],
      sub: 'Lectores QR en puerta exterior (P1) y torniquete (P2)', open: () => openPorteria('eventos') },
    { id: 'access-events', group: 'access', icon: 'calendar', label: 'Eventos y acreditación', roles: ADMINS,
      sub: 'Crea eventos, comparte el link de registro y aprueba visitantes', open: () => openJefe('eventos') },
    { id: 'access-contractors', group: 'access', icon: 'badge', label: 'Contratistas', roles: ADMINS,
      sub: 'Aprobación del personal externo y su documentación legal',
      open: () => (role() === 'superadmin' ? openSa('aprobaciones') : openJefe('aprobaciones')) },
    { id: 'access-docs', group: 'access', icon: 'folder', label: 'Bitácora documental', roles: ADMINS,
      sub: 'Archivo de documentos asociados a cada trabajador',
      open: () => (role() === 'superadmin' ? openSa('bitacora') : openJefe('bitacora')) },
    { id: 'access-vendor', group: 'access', icon: 'building', label: 'Portal contratistas', roles: ALL_STAFF,
      sub: 'Vista de la empresa contratista: personal y documentos', open: () => openProv('cargar') },

    // Rutas propias de la empresa contratista
    { id: 'vendor-add', group: 'access', icon: 'userPlus', label: 'Cargar personal', roles: ['proveedor'],
      sub: 'Inscribe a los trabajadores que enviarás al recinto', open: () => openProv('cargar') },
    { id: 'vendor-docs', group: 'access', icon: 'badge', label: 'Documentación legal', roles: ['proveedor'],
      sub: 'Sube los 6 documentos obligatorios de cada trabajador', open: () => openProv('docs') },
    { id: 'vendor-status', group: 'access', icon: 'list', label: 'Estado de aprobación', roles: ['proveedor'],
      sub: 'Revisa qué trabajadores están habilitados para ingresar', open: () => openProv('estado') },

    { id: 'admin-clients', group: 'admin', icon: 'globe', label: 'Clientes y usuarios', roles: ['superadmin'],
      sub: 'Instituciones, planes contratados y cuentas de acceso', open: () => openSa('colegios') },
    { id: 'admin-metrics', group: 'admin', icon: 'bars', label: 'Métricas globales', roles: ['superadmin'],
      sub: 'Indicadores consolidados de toda la plataforma', open: () => openSa('metricas') },
  ];

  const DEFAULT_ROUTE = {
    superadmin: 'overview', admin: 'overview', jefe: 'clean-monitor',
    trabajador: 'clean-app', proveedor: 'vendor-add', porteria: 'access-gate',
  };

  let currentRoute = null;

  function routesFor(r) { return ROUTES.filter(rt => rt.roles.includes(r)); }
  function labelOf(rt, r) { return (rt.labelFor && rt.labelFor[r]) || rt.label; }

  function pendingCounts() {
    const counts = {};
    try {
      const sid = state.currentUser && state.currentUser.schoolId;
      const evIds = new Set(state.eventos.filter(e => !sid || e.schoolId === sid).map(e => e.id));
      counts['access-events'] = state.invitadosAcceso.filter(i => evIds.has(i.eventoId) && i.estadoAprobacion === 'pendiente').length;
      counts['access-contractors'] = state.externalWorkers.filter(w => {
        const s = checkWorkerStatus(w);
        return s === 'pendiente' || s === 'vencido';
      }).length;
    } catch (e) { /* datos aún no cargados */ }
    return counts;
  }

  function renderSidebar() {
    const r = role();
    const nav = document.getElementById('sb-nav');
    if (!nav || !r) return;
    const counts = pendingCounts();
    const list = routesFor(r);
    let html = '';
    Object.keys(GROUPS).forEach(g => {
      const items = list.filter(rt => rt.group === g);
      if (!items.length) return;
      html += `<div class="sb-group" data-mod="${GROUPS[g].mod}">`;
      html += `<div class="sb-group-title"><i></i>${GROUPS[g].label}</div>`;
      items.forEach(rt => {
        const c = counts[rt.id];
        html += `<button class="sb-item${rt.id === currentRoute ? ' active' : ''}" onclick="Shell.go('${rt.id}')">${ICON[rt.icon] || ''}<span>${labelOf(rt, r)}</span>${c ? `<span class="sb-badge">${c}</span>` : ''}</button>`;
      });
      html += '</div>';
    });
    nav.innerHTML = html;
  }

  function setTopbar(rt) {
    const r = role();
    const g = GROUPS[rt.group];
    const mod = document.getElementById('tb-module');
    mod.dataset.mod = g.mod;
    mod.style.display = rt.group === 'general' ? 'none' : '';
    document.getElementById('tb-module-text').textContent = g.short || g.label;
    document.getElementById('tb-title').textContent = labelOf(rt, r);
    document.getElementById('tb-sub').textContent = rt.sub || '';
    document.title = labelOf(rt, r) + ' · Valtek Optima';
  }

  function go(id) {
    const r = role();
    if (!r) return;
    let rt = ROUTES.find(x => x.id === id && x.roles.includes(r));
    if (!rt) rt = ROUTES.find(x => x.id === DEFAULT_ROUTE[r]);
    currentRoute = rt.id;
    rt.open();
    setTopbar(rt);
    renderSidebar();
    closeSidebar();
    window.scrollTo({ top: 0, behavior: 'instant' });
    try { sessionStorage.setItem('vo_session', JSON.stringify({ email: state.currentUser.email, route: rt.id })); } catch (e) { /* almacenamiento no disponible */ }
  }

  function enterApp(user, route) {
    document.body.classList.add('in-app');
    document.body.className = document.body.className.replace(/\brole-\S+/g, '').trim();
    document.body.classList.add('role-' + user.role);

    const av = document.getElementById('nav-avatar');
    av.textContent = (user.name || '?').charAt(0).toUpperCase();
    av.className = 'user-avatar' + (user.role === 'superadmin' ? ' gold' : '');
    document.getElementById('nav-username').textContent = user.name;
    document.getElementById('nav-role-label').textContent = ROLE_LABEL[user.role] || user.role;

    const sch = state.schools.find(s => s.id === user.schoolId);
    document.getElementById('sb-org-name').textContent = user.role === 'superadmin' ? 'Todas las instituciones' : (sch ? sch.name : '—');
    document.getElementById('sb-org-meta').textContent = user.role === 'superadmin'
      ? state.schools.length + (state.schools.length === 1 ? ' cliente activo' : ' clientes activos')
      : (sch ? [(sch.type || 'Colegio'), sch.city, 'Plan ' + sch.plan].filter(Boolean).join(' · ') : '');

    go(route || DEFAULT_ROUTE[user.role]);
  }

  function exitApp() {
    currentRoute = null;
    document.body.classList.remove('in-app', 'sb-open');
    document.body.className = document.body.className.replace(/\brole-\S+/g, '').trim();
    document.title = 'Valtek Optima · Aseo y seguridad para instituciones';
    try { sessionStorage.removeItem('vo_session'); } catch (e) { /* noop */ }
    window.scrollTo({ top: 0, behavior: 'instant' });
  }

  function toggleSidebar() { document.body.classList.toggle('sb-open'); }
  function closeSidebar() { document.body.classList.remove('sb-open'); }

  function demoLogin(email, pass) {
    document.getElementById('login-email').value = email;
    document.getElementById('login-password').value = pass;
    doLogin();
  }

  // ── Reloj de la topbar ──
  function tickClock() {
    const el = document.getElementById('tb-clock');
    if (!el) return;
    const n = new Date();
    const date = n.toLocaleDateString('es-CL', { weekday: 'short', day: '2-digit', month: 'short' });
    const time = n.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' });
    el.innerHTML = `${time}<span>${date}</span>`;
  }

  // ==========================================================================
  //  CENTRO DE CONTROL
  // ==========================================================================
  function ymd(d) {
    const x = new Date(d);
    return x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0');
  }
  function hhmm(ts) { return new Date(ts).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' }); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

  function ring(pct) {
    const r = 56, c = 2 * Math.PI * r;
    const off = c * (1 - Math.max(0, Math.min(1, pct)));
    return `<div class="ov-ring"><svg viewBox="0 0 132 132"><circle class="ring-bg" cx="66" cy="66" r="${r}"/><circle class="ring-fg" cx="66" cy="66" r="${r}" stroke-dasharray="${c.toFixed(1)}" stroke-dashoffset="${off.toFixed(1)}"/></svg><div class="ov-ring-c"><b>${Math.round(pct * 100)}%</b><span>completado</span></div></div>`;
  }

  function renderOverview() {
    const root = document.getElementById('overview-root');
    if (!root || !state.currentUser) return;
    const u = state.currentUser;
    const sid = u.schoolId;
    const today = ymd(Date.now());
    const startToday = new Date().setHours(0, 0, 0, 0);

    // Aseo
    const zones = state.zones || [];
    const clean = zones.filter(z => z.status === 'limpio').length;
    const proc = zones.filter(z => z.status === 'en-proceso').length;
    const pend = zones.length - clean - proc;
    const workers = state.users.filter(x => x.role === 'trabajador' && (!sid || x.schoolId === sid));
    const activeWorkers = new Set(zones.filter(z => z.status === 'en-proceso').map(z => z.assignedTo)).size;
    const todayAudit = (state.auditLog || []).filter(e => e.entradaTime && ymd(e.entradaTime) === today);
    const done = todayAudit.filter(e => e.salidaTime);
    const avgMin = done.length ? Math.round(done.reduce((a, e) => a + (e.salidaTime - e.entradaTime), 0) / done.length / 60000) : 0;

    // Acceso
    const gateToday = (state.gateLog || []).filter(g => g.timestamp >= startToday);
    const contractors = state.externalWorkers || [];
    const cStatus = contractors.map(w => ({ w, s: checkWorkerStatus(w) }));
    const enabled = cStatus.filter(x => x.s === 'autorizado' || x.s === 'autorizado-forzado').length;
    const myEvents = state.eventos.filter(e => !sid || e.schoolId === sid);
    const todayEvents = myEvents.filter(e => e.fecha === today || e.fecha === new Date().toISOString().split('T')[0]);
    const evIds = new Set(myEvents.map(e => e.id));
    const guests = state.invitadosAcceso.filter(i => evIds.has(i.eventoId));
    const guestsPending = guests.filter(i => i.estadoAprobacion === 'pendiente').length;
    const guestsIn = guests.filter(i => i.ingresoMarcado || i.scanP2).length;
    const accessesToday = gateToday.filter(g => g.type === 'entrada').length + guests.filter(i => i.horaIngreso && i.horaIngreso >= startToday).length;

    // Alertas
    const alerts = [];
    cStatus.filter(x => x.s === 'vencido').forEach(x => alerts.push({ k: 'bad', icon: 'x', t: x.w.name + ' tiene documentos vencidos', d: 'Acceso bloqueado automáticamente en portería', go: 'access-contractors' }));
    cStatus.filter(x => x.s === 'pendiente').forEach(x => alerts.push({ k: 'warn', icon: 'alert', t: x.w.name + ' espera aprobación', d: 'Contratista con documentación por revisar', go: 'access-contractors' }));
    if (guestsPending) alerts.push({ k: 'warn', icon: 'calendar', t: guestsPending + (guestsPending === 1 ? ' visitante espera' : ' visitantes esperan') + ' acreditación', d: 'Revisa sus fichas en Eventos y acreditación', go: 'access-events' });
    todayAudit.filter(e => e.diagnostic === 'malo').slice(0, 3).forEach(e => alerts.push({ k: 'warn', icon: 'alert', t: (e.zoneName || 'Zona') + ' llegó en mal estado', d: 'Reportado por ' + (e.workerName || 'operario') + ' a las ' + hhmm(e.entradaTime), go: 'clean-reports' }));
    cStatus.filter(x => x.s === 'autorizado-forzado').forEach(x => alerts.push({ k: 'info', icon: 'info', t: x.w.name + ' autorizado con observaciones', d: 'Ingreso permitido manualmente con documentos pendientes', go: 'access-contractors' }));

    // Actividad reciente (ambos módulos)
    const feed = [];
    todayAudit.forEach(e => {
      if (e.salidaTime) feed.push({ mod: 'clean', ts: e.salidaTime, t: (e.zoneName || 'Zona') + ' quedó limpia', d: e.workerName || '' });
      else feed.push({ mod: 'clean', ts: e.entradaTime, t: (e.workerName || 'Operario') + ' comenzó ' + (e.zoneName || 'una zona'), d: 'En proceso' });
    });
    gateToday.forEach(g => feed.push({ mod: 'access', ts: g.timestamp, t: g.name + ' · ' + (g.type === 'entrada' ? 'entrada' : 'salida'), d: 'Portería · ' + (g.registeredBy || '') }));
    guests.filter(i => i.horaIngreso && i.horaIngreso >= startToday).forEach(i => feed.push({ mod: 'access', ts: i.horaIngreso, t: i.nombreCompleto + ' ingresó al evento', d: 'Acceso automatizado P1 → P2' }));
    feed.sort((a, b) => b.ts - a.ts);

    const greet = (() => { const h = new Date().getHours(); return h < 12 ? 'Buenos días' : h < 20 ? 'Buenas tardes' : 'Buenas noches'; })();
    const sch = state.schools.find(s => s.id === sid);
    const dateLong = new Date().toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' });

    root.innerHTML = `
      <div class="ov-hello">
        <div>
          <h2>${greet}, ${esc(u.name.split(' ')[0])}</h2>
          <p>${dateLong.charAt(0).toUpperCase() + dateLong.slice(1)} · ${esc(u.role === 'superadmin' ? 'Vista de todas las instituciones' : (sch ? sch.name : ''))}</p>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          <button class="btn" onclick="Shell.go('clean-reports')">${ICON.chart}Informe del día</button>
          <button class="btn btn-primary" onclick="Shell.go('access-events')">${ICON.calendar}Nuevo evento</button>
        </div>
      </div>

      <div class="ov-modules">
        <section class="ov-mod clean">
          <div class="ov-mod-head">
            <div><div class="module-tag" style="--mc:var(--mod-clean)"><i></i>Aseo y Personal</div><h3 style="margin-top:8px;">Avance de limpieza de hoy</h3></div>
            <span class="badge badge-clean">${clean}/${zones.length} zonas</span>
          </div>
          <div class="ov-mod-main">
            ${ring(zones.length ? clean / zones.length : 0)}
            <div class="ov-metrics">
              <div class="ov-metric"><b style="color:var(--clean)">${clean}</b><span>Zonas limpias</span></div>
              <div class="ov-metric"><b style="color:var(--process)">${proc}</b><span>En proceso</span></div>
              <div class="ov-metric"><b>${pend}</b><span>Pendientes</span></div>
              <div class="ov-metric"><b>${activeWorkers}<small style="font-size:.6em;color:var(--text-muted);font-weight:500;"> / ${workers.length}</small></b><span>Operarios trabajando ahora</span></div>
            </div>
          </div>
          <div class="ov-links">
            <button class="btn btn-sm" onclick="Shell.go('clean-monitor')">${ICON.activity}Monitor en vivo</button>
            <button class="btn btn-sm" onclick="Shell.go('clean-assign')">${ICON.map}Asignar zonas</button>
            <span style="margin-left:auto;align-self:center;font-size:.78rem;color:var(--text-muted);">${done.length} registros cerrados${avgMin ? ' · ' + avgMin + ' min promedio' : ''}</span>
          </div>
        </section>

        <section class="ov-mod access">
          <div class="ov-mod-head">
            <div><div class="module-tag" style="--mc:var(--mod-access)"><i></i>Seguridad y Acceso</div><h3 style="margin-top:8px;">Control de acceso de hoy</h3></div>
            <span class="badge" style="color:var(--mod-access);border-color:rgba(157,140,255,.3);background:rgba(157,140,255,.08);">${todayEvents.length} ${todayEvents.length === 1 ? 'evento' : 'eventos'} hoy</span>
          </div>
          <div class="ov-metrics" style="grid-template-columns:repeat(2,1fr);">
            <div class="ov-metric"><b>${accessesToday}</b><span>Ingresos registrados hoy</span></div>
            <div class="ov-metric"><b style="color:var(--clean)">${enabled}<small style="font-size:.6em;color:var(--text-muted);font-weight:500;"> / ${contractors.length}</small></b><span>Contratistas habilitados</span></div>
            <div class="ov-metric"><b style="color:${guestsPending ? 'var(--process)' : 'var(--text)'}">${guestsPending}</b><span>Acreditaciones por aprobar</span></div>
            <div class="ov-metric"><b>${guestsIn}<small style="font-size:.6em;color:var(--text-muted);font-weight:500;"> / ${guests.length}</small></b><span>Visitantes ya ingresados</span></div>
          </div>
          <div class="ov-links">
            <button class="btn btn-sm" onclick="Shell.go('access-gate')">${ICON.shield}Portería</button>
            <button class="btn btn-sm" onclick="Shell.go('access-auto')">${ICON.scan}Acceso automatizado</button>
            <button class="btn btn-sm" onclick="Shell.go('access-contractors')">${ICON.badge}Contratistas</button>
          </div>
        </section>
      </div>

      <div class="ov-bottom">
        <section class="j-card">
          <div class="j-card-title">Requiere tu atención <span class="badge" style="margin-left:auto;">${alerts.length}</span></div>
          <div class="alert-list">
            ${alerts.length ? alerts.slice(0, 6).map(a => `
              <div class="alert-item ${a.k}">
                <div class="alert-ico">${ICON[a.icon]}</div>
                <div class="alert-text"><b>${esc(a.t)}</b><span>${esc(a.d)}</span></div>
                <button class="icon-btn" onclick="Shell.go('${a.go}')" aria-label="Abrir">${ICON.arrow}</button>
              </div>`).join('') : '<div class="empty-state">Todo en orden. No hay alertas pendientes.</div>'}
          </div>
        </section>
        <section class="j-card">
          <div class="j-card-title">Actividad reciente <span class="live-pill" style="margin-left:auto;">EN VIVO</span></div>
          <div class="feed-list">
            ${feed.length ? feed.slice(0, 7).map(f => `
              <div class="feed-item ${f.mod}">
                <div class="feed-ico">${f.mod === 'clean' ? ICON.sparkle : ICON.login}</div>
                <div class="feed-text"><b>${esc(f.t)}</b><span>${esc(f.d)}</span></div>
                <div class="feed-time">${hhmm(f.ts)}</div>
              </div>`).join('') : '<div class="empty-state">Aún no hay actividad registrada hoy.</div>'}
          </div>
        </section>
      </div>`;
  }

  // ==========================================================================
  //  LANDING: header con scroll y revelado progresivo
  // ==========================================================================
  function initLanding() {
    const header = document.getElementById('site-header');
    const onScroll = () => header && header.classList.toggle('scrolled', window.scrollY > 8);
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();

    const els = document.querySelectorAll('.reveal');
    if (!('IntersectionObserver' in window)) { els.forEach(e => e.classList.add('in')); return; }
    const io = new IntersectionObserver(entries => {
      entries.forEach(en => { if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); } });
    }, { rootMargin: '0px 0px 12% 0px', threshold: 0 });
    els.forEach(e => io.observe(e));
  }

  // Restaura la sesión al recargar (solo en esta pestaña)
  function restoreSession() {
    if (window.location.hash.startsWith('#enrol-')) return;
    let saved = null;
    try { saved = JSON.parse(sessionStorage.getItem('vo_session') || 'null'); } catch (e) { saved = null; }
    if (!saved || !saved.email) return;
    const email = String(saved.email).toLowerCase();
    const user = (email === SUPER_ADMIN.email || email === SUPER_ADMIN.aliasEmail)
      ? SUPER_ADMIN
      : state.users.find(x => x.email.toLowerCase() === email);
    if (user) loginSuccess(user, { silent: true, route: saved.route });
  }

  document.addEventListener('DOMContentLoaded', () => {
    initLanding();
    tickClock();
    setInterval(tickClock, 20000);
    restoreSession();
    // Mantener vivos el centro de control y los contadores del menú
    setInterval(() => {
      if (!state.currentUser) return;
      if (currentRoute === 'overview') renderOverview();
      renderSidebar();
    }, 10000);
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') { hideAuth(); closeSidebar(); }
    });
  });

  window.Shell = { go, enterApp, exitApp, toggleSidebar, closeSidebar, demoLogin, renderOverview, renderSidebar, ROLE_LABEL };
})();
