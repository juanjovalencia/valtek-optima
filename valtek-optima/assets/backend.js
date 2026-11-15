/* ==========================================================================
   Valtek Optima — Cuentas reales (Supabase)
   Inicio de sesión, creación de cuenta, recuperación de contraseña y la
   pantalla "Mi cuenta" (instituciones, personas con acceso y roles).
   Cada cuenta trabaja en una institución activa: su rol ahí decide qué
   pantallas de Valtek Access ve (assets/shell.js y assets/access.js).
   Las cuentas de demostración siguen funcionando aparte, con datos de ejemplo
   guardados en el navegador.
   Depende de: supabase-js (CDN), config.js, state/loginSuccess/showAuth/
   showToast (index.html) y Shell (shell.js).
   ========================================================================== */
(function () {
  'use strict';

  const CFG = window.VALTEK_CONFIG || {};
  const enabled = !!(window.supabase && CFG.supabaseUrl && CFG.supabaseKey);
  const sb = enabled ? window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseKey) : null;
  const ctx = { profile: null, orgs: [], orgId: null, error: null };
  const ORG_KEY = 'vo_org'; // institución en la que la cuenta trabajó la última vez
  let entering = false;

  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ROLE = { admin: 'Administración', jefe: 'Jefatura de aseo', trabajador: 'Operario/a de aseo', proveedor: 'Empresa contratista', porteria: 'Portería', seguridad: 'Jefatura de seguridad', guardia: 'Guardia', campus: 'Dirección de campus' };
  const TYPE = { colegio: 'Colegio', universidad: 'Universidad', instituto: 'Instituto profesional', clinica: 'Clínica', mall: 'Centro comercial', industria: 'Industria', empresa: 'Empresa' };
  const MODULE = { aseo: 'Aseo', acceso: 'Acceso', contratistas: 'Contratistas', eventos: 'Eventos', salas: 'Salas' };

  // ── Formulario de acceso (login / crear cuenta / recuperar / nueva clave) ──
  const MODES = {
    login: { title: 'Ingresa a Valtek Optima', tag: 'Acceso exclusivo para instituciones clientes', btn: 'Ingresar' },
    signup: { title: 'Crea tu cuenta', tag: 'Usa el correo con el que tu institución te dio acceso', btn: 'Crear cuenta' },
    reset: { title: 'Recupera tu contraseña', tag: 'Te enviaremos un enlace para crear una nueva', btn: 'Enviar enlace' },
    newpass: { title: 'Crea tu nueva contraseña', tag: 'Elige una contraseña de al menos 8 caracteres', btn: 'Guardar contraseña' },
  };
  const api = { enabled, authMode: 'login', ctx };

  function msg(kind, text) {
    const err = $('login-error'), info = $('login-info');
    if (err) { err.textContent = kind === 'error' ? text : 'Credenciales incorrectas o incompletas.'; err.classList.toggle('show', kind === 'error'); }
    if (info) { info.textContent = kind === 'info' ? text : ''; info.classList.toggle('show', kind === 'info'); }
  }
  function setBusy(on) {
    const b = $('login-submit');
    if (!b) return;
    b.disabled = on;
    b.textContent = on ? 'Un momento…' : MODES[api.authMode].btn;
  }
  function setMode(m) {
    api.authMode = m;
    const M = MODES[m];
    $('auth-title').textContent = M.title;
    $('auth-tagline').textContent = M.tag;
    $('login-submit').textContent = M.btn;
    $('login-name-group').hidden = m !== 'signup';
    $('login-email-group').hidden = m === 'newpass';
    $('login-password-group').hidden = m === 'reset';
    $('login-password').autocomplete = m === 'login' ? 'current-password' : 'new-password';
    $('auth-demo').hidden = m !== 'login';
    $('auth-links').innerHTML = m === 'login'
      ? '<button type="button" onclick="Backend.setMode(\'signup\')">Crear cuenta</button><button type="button" onclick="Backend.setMode(\'reset\')">Olvidé mi contraseña</button>'
      : m === 'newpass' ? '' : '<button type="button" onclick="Backend.setMode(\'login\')">Volver a ingresar</button>';
    msg();
  }

  function explain(error) {
    const code = error && (error.code || ''), text = String((error && error.message) || '');
    if (code === 'invalid_credentials' || /invalid login/i.test(text)) return 'Correo o contraseña incorrectos.';
    if (code === 'email_not_confirmed' || /not confirmed/i.test(text)) return 'Todavía no confirmas tu correo. Abre el mensaje que te enviamos y vuelve a intentarlo.';
    if (code === 'user_already_exists' || /already registered/i.test(text)) return 'Ya existe una cuenta con ese correo. Ingresa o recupera tu contraseña.';
    if (/rate limit|too many/i.test(text) || /rate_limit/.test(code)) return 'Demasiados intentos seguidos. Espera unos minutos y vuelve a probar.';
    if (code === 'weak_password' || /password/i.test(text)) return 'La contraseña no es válida. Usa al menos 8 caracteres.';
    if (code === 'same_password') return 'La nueva contraseña debe ser distinta de la anterior.';
    if (/fetch|network/i.test(text)) return 'No hay conexión con el servidor. Revisa tu internet e inténtalo de nuevo.';
    return 'No se pudo completar la operación. Inténtalo de nuevo.';
  }
  const redirectUrl = () => window.location.origin + window.location.pathname;

  async function signIn(email, password) {
    if (!enabled) { msg('error', 'Credenciales incorrectas o incompletas.'); return; }
    if (!email || !password) { msg('error', 'Ingresa tu correo y tu contraseña.'); return; }
    setBusy(true);
    const { error } = await sb.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) { msg('error', explain(error)); return; }
    await enter(false);
  }

  async function submit() {
    if (!enabled) return;
    const m = api.authMode;
    const email = $('login-email').value.trim().toLowerCase(), password = $('login-password').value, name = $('login-name').value.trim();
    if (m === 'signup') {
      if (name.length < 3) { msg('error', 'Ingresa tu nombre y apellido.'); return; }
      if (!/^\S+@\S+\.\S+$/.test(email)) { msg('error', 'Ingresa un correo válido.'); return; }
      if (password.length < 8) { msg('error', 'La contraseña debe tener al menos 8 caracteres.'); return; }
      setBusy(true);
      const { data, error } = await sb.auth.signUp({ email, password, options: { data: { full_name: name }, emailRedirectTo: redirectUrl() } });
      setBusy(false);
      if (error) { msg('error', explain(error)); return; }
      if (data.session) { await enter(false); return; }
      $('login-password').value = '';
      msg('info', 'Te enviamos un correo a ' + email + '. Ábrelo y confirma tu cuenta para poder ingresar.');
    } else if (m === 'reset') {
      if (!/^\S+@\S+\.\S+$/.test(email)) { msg('error', 'Ingresa el correo de tu cuenta.'); return; }
      setBusy(true);
      const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: redirectUrl() });
      setBusy(false);
      if (error) { msg('error', explain(error)); return; }
      msg('info', 'Si ese correo tiene una cuenta, te llegará un enlace para crear una nueva contraseña.');
    } else if (m === 'newpass') {
      if (password.length < 8) { msg('error', 'La contraseña debe tener al menos 8 caracteres.'); return; }
      setBusy(true);
      const { error } = await sb.auth.updateUser({ password });
      setBusy(false);
      if (error) { msg('error', explain(error)); return; }
      setMode('login');
      showToast('Contraseña actualizada.');
      await enter(false);
    }
  }

  // ── Contexto de la cuenta: perfil e instituciones que puede ver ──────────
  async function loadContext() {
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return false;
    const [p, o] = await Promise.all([
      sb.from('profiles').select('id, full_name, email, is_superadmin').eq('id', user.id).maybeSingle(),
      sb.from('organizations').select('id, name, type, city, plan, created_at, org_modules(module, enabled), memberships(id, role, user_id, profiles(full_name, email))').order('created_at'),
    ]);
    ctx.error = (p.error || o.error) ? 'No se pudieron cargar los datos de tu cuenta.' : null;
    ctx.profile = p.data || { id: user.id, full_name: '', email: user.email, is_superadmin: false };
    ctx.orgs = o.data || [];
    return true;
  }
  const myRole = org => { const m = (org.memberships || []).find(x => x.user_id === ctx.profile.id); return m ? m.role : null; };
  const canAdmin = org => ctx.profile.is_superadmin || myRole(org) === 'admin';

  // ── Institución activa ───────────────────────────────────────────────────
  // El super admin de Valtek administra cualquier institución aunque no sea parte de ella.
  const orgRole = org => myRole(org) || (ctx.profile.is_superadmin ? 'admin' : null);
  function pickOrg() {
    let saved = null;
    try { saved = localStorage.getItem(ORG_KEY); } catch (e) { /* almacenamiento no disponible */ }
    const org = ctx.orgs.find(o => o.id === saved) || ctx.orgs.find(o => myRole(o)) || ctx.orgs[0] || null;
    ctx.orgId = org ? org.id : null;
  }
  // Datos de la sesión que usa el resto de la aplicación (menú, permisos y Valtek Access).
  function sessionUser() {
    const p = ctx.profile, org = ctx.orgs.find(o => o.id === ctx.orgId) || null;
    return {
      id: p.id, name: p.full_name || p.email || 'Cuenta', email: p.email, role: 'cuenta', real: true, schoolId: null,
      superadmin: !!p.is_superadmin,
      orgId: org ? org.id : null, orgName: org ? org.name : '', orgType: org ? org.type : '', orgRole: org ? orgRole(org) : null,
      modules: org ? (org.org_modules || []).filter(m => m.enabled).map(m => m.module) : [],
      orgLabel: org ? org.name : 'Sin institución',
    };
  }
  function useOrg(id) {
    const org = ctx.orgs.find(o => o.id === id);
    if (!org || !state.currentUser || !state.currentUser.real) return;
    ctx.orgId = id;
    try { localStorage.setItem(ORG_KEY, id); } catch (e) { /* almacenamiento no disponible */ }
    Object.assign(state.currentUser, sessionUser());
    Shell.enterApp(state.currentUser, 'account-home');
    showToast('Ahora trabajas en ' + org.name + '.');
  }

  async function enter(silent) {
    if (entering) return;
    entering = true;
    try {
      if (!(await loadContext())) return;
      pickOrg();
      const user = sessionUser();
      // Al recargar la página se vuelve a la misma pantalla en que estaba la cuenta.
      let route;
      try {
        const saved = JSON.parse(sessionStorage.getItem('vo_session') || 'null');
        if (silent && saved && saved.email === user.email) route = saved.route;
      } catch (e) { /* almacenamiento no disponible */ }
      loginSuccess(user, { silent, route });
    } finally { entering = false; }
  }

  // ── Pantalla "Mi cuenta" ─────────────────────────────────────────────────
  function orgCard(org) {
    const admin = canAdmin(org), mine = myRole(org), active = org.id === ctx.orgId;
    const members = (org.memberships || []).slice().sort((a, b) => (a.profiles ? a.profiles.full_name : '').localeCompare(b.profiles ? b.profiles.full_name : ''));
    const mods = (org.org_modules || []).filter(m => m.enabled).map(m => `<span class="ac-chip">${esc(MODULE[m.module] || m.module)}</span>`).join('');
    return `
      <div class="ac-org">
        <div class="ac-org-head">
          <div><b>${esc(org.name)}</b><span>${esc([TYPE[org.type] || org.type, org.city, 'Plan ' + org.plan].filter(Boolean).join(' · '))}</span></div>
          <div class="ax-actions">
            ${ctx.orgs.length > 1 ? (active ? '<span class="badge badge-process">Institución activa</span>' : `<button class="btn btn-sm" onclick="Backend.useOrg('${org.id}')">Trabajar aquí</button>`) : ''}
            <span class="badge ${mine ? 'badge-clean' : 'badge-pending'}">${esc(mine ? 'Tu rol: ' + (ROLE[mine] || mine) : 'Super admin')}</span>
          </div>
        </div>
        <div class="ac-chips">${mods || '<span class="ax-muted">Sin módulos activos</span>'}</div>
        ${admin || members.length > 1 ? `
        <div class="ax-sub-title">Personas con acceso (${members.length})</div>
        <div style="overflow-x:auto;"><table class="data-table">
          <thead><tr><th>Persona</th><th>Correo</th><th>Rol</th>${admin ? '<th></th>' : ''}</tr></thead>
          <tbody>${members.map(m => `<tr><td><b>${esc((m.profiles && m.profiles.full_name) || '—')}</b></td><td class="mono">${esc((m.profiles && m.profiles.email) || '')}</td><td>${esc(ROLE[m.role] || m.role)}</td>${admin ? `<td style="text-align:right;">${m.user_id === ctx.profile.id ? '' : `<button class="btn btn-sm" onclick="Backend.removeMember('${m.id}')">Quitar</button>`}</td>` : ''}</tr>`).join('') || `<tr class="empty-row"><td colspan="${admin ? 4 : 3}">Todavía no hay personas con acceso.</td></tr>`}</tbody>
        </table></div>` : ''}
        ${admin ? `
        <div class="ac-add">
          <input class="f-input" id="ac-email-${org.id}" type="email" placeholder="Correo de la persona" aria-label="Correo de la persona">
          <select class="f-input f-select" id="ac-role-${org.id}" aria-label="Rol">${Object.keys(ROLE).map(r => `<option value="${r}">${ROLE[r]}</option>`).join('')}</select>
          <button class="btn btn-primary" onclick="Backend.addMember('${org.id}')">Dar acceso</button>
        </div>
        <div class="ax-hint">La persona debe crear antes su cuenta con ese mismo correo, desde "Ingresar" y luego "Crear cuenta".</div>` : ''}
      </div>`;
  }

  function render() {
    const el = $('account-root');
    if (!el || !ctx.profile) return;
    const p = ctx.profile, first = (p.full_name || p.email || '').split(' ')[0];
    const people = new Set();
    ctx.orgs.forEach(o => (o.memberships || []).forEach(m => people.add(m.user_id)));
    el.innerHTML = `
      <div class="ov-hello">
        <div><h2>Hola, ${esc(first)}</h2><p>${esc(p.email || '')} · Cuenta real: tus datos se guardan en la base de datos de Valtek Optima</p></div>
        <div class="ax-actions">${p.is_superadmin ? '<span class="badge badge-process">Super admin Valtek</span>' : ''}<button class="btn" onclick="Backend.refresh()">Actualizar</button></div>
      </div>
      ${ctx.error ? `<section class="j-card"><div class="alert-list"><div class="alert-item bad"><div class="alert-ico">!</div><div class="alert-text"><b>${esc(ctx.error)}</b><span>Revisa tu conexión y toca "Actualizar".</span></div><span></span></div></div></section>` : ''}
      <div class="kpi-row ax-kpis">
        <div class="kpi-box ax-kpi-main"><div class="kpi-value">${ctx.orgs.length}</div><div class="kpi-label">${ctx.orgs.length === 1 ? 'Institución' : 'Instituciones'}</div></div>
        <div class="kpi-box"><div class="kpi-value">${people.size}</div><div class="kpi-label">Personas con acceso</div></div>
        <div class="kpi-box"><div class="kpi-value">${ctx.orgs.reduce((a, o) => a + (o.org_modules || []).filter(m => m.enabled).length, 0)}</div><div class="kpi-label">Módulos contratados</div></div>
      </div>
      <section class="j-card">
        <div class="j-card-title">${p.is_superadmin ? 'Instituciones clientes' : 'Tus instituciones'}</div>
        ${ctx.orgs.map(orgCard).join('') || `<div class="empty-state">Tu cuenta está creada, pero todavía no pertenece a ninguna institución.<br>Pide a la administración de tu institución que te dé acceso con el correo <b>${esc(p.email || '')}</b>.</div>`}
      </section>
      ${p.is_superadmin ? `
      <section class="j-card">
        <div class="j-card-title">Nueva institución</div>
        <div class="ac-new">
          <label>Nombre<input class="f-input" id="ac-org-name" placeholder="Ej: Universidad del Sur"></label>
          <label>Tipo<select class="f-input f-select" id="ac-org-type">${Object.keys(TYPE).map(t => `<option value="${t}">${TYPE[t]}</option>`).join('')}</select></label>
          <label>Ciudad<input class="f-input" id="ac-org-city" placeholder="Ej: Santiago"></label>
          <label>Plan<select class="f-input f-select" id="ac-org-plan"><option>Básico</option><option selected>Profesional</option><option>Enterprise</option></select></label>
          <button class="btn btn-primary" onclick="Backend.createOrg()">Crear institución</button>
        </div>
      </section>` : ''}
      <section class="j-card">
        <div class="j-card-title">Qué ya funciona con datos reales</div>
        <div class="alert-list">
          <div class="alert-item info"><div class="alert-ico">✓</div><div class="alert-text"><b>Cuentas, instituciones y roles</b><span>Inicio de sesión seguro. Cada institución solo ve sus propios datos.</span></div><span class="badge badge-clean">Conectado</span></div>
          <div class="alert-item info"><div class="alert-ico">✓</div><div class="alert-text"><b>Valtek Access: control de acceso</b><span>Personas, empresas contratistas, documentos, puntos de control y bitácora. Está en el menú de la izquierda, según tu rol en la institución activa.</span></div><span class="badge badge-clean">Conectado</span></div>
          <div class="alert-item warn"><div class="alert-ico">…</div><div class="alert-text"><b>Valtek Clean, Eventos y Salas</b><span>Por ahora se muestran con datos de ejemplo, desde los accesos de demostración. Se conectan a la base de datos módulo por módulo.</span></div><span class="badge badge-process">En demostración</span></div>
        </div>
      </section>`;
  }

  async function refresh(quiet) {
    await loadContext();
    // Si cambió el rol o la institución activa ya no existe, el menú se ajusta.
    if (!ctx.orgs.some(o => o.id === ctx.orgId)) pickOrg();
    if (state.currentUser && state.currentUser.real) { Object.assign(state.currentUser, sessionUser()); Shell.syncUser(); }
    render();
    if (!quiet) showToast('Datos actualizados.');
  }

  async function addMember(orgId) {
    const email = $('ac-email-' + orgId).value.trim().toLowerCase(), role = $('ac-role-' + orgId).value;
    if (!/^\S+@\S+\.\S+$/.test(email)) { showToast('Ingresa el correo de la persona.', true); return; }
    const { error } = await sb.rpc('add_member', { p_org: orgId, p_email: email, p_role: role });
    if (error) { showToast(error.code === 'P0001' || error.code === '42501' ? error.message : 'No se pudo dar acceso. Inténtalo de nuevo.', true); return; }
    await refresh(true);
    showToast('Acceso otorgado a ' + email + ' como ' + ROLE[role] + '.');
  }
  async function removeMember(id) {
    if (!window.confirm('¿Quitar el acceso de esta persona a la institución?')) return;
    const { error } = await sb.from('memberships').delete().eq('id', id);
    if (error) { showToast('No se pudo quitar el acceso.', true); return; }
    await refresh(true);
    showToast('Acceso retirado.');
  }
  async function createOrg() {
    const name = $('ac-org-name').value.trim();
    if (name.length < 3) { showToast('Ingresa el nombre de la institución.', true); return; }
    const row = { name, type: $('ac-org-type').value, city: $('ac-org-city').value.trim() || null, plan: $('ac-org-plan').value };
    const { data, error } = await sb.from('organizations').insert(row).select('id').single();
    if (error) { showToast('No se pudo crear la institución.', true); return; }
    await sb.from('org_modules').insert(Object.keys(MODULE).map(module => ({ org_id: data.id, module })));
    await refresh(true);
    showToast('Institución creada: ' + name + '.');
  }

  Object.assign(api, {
    client: sb, useOrg,
    setMode, submit, signIn, render, refresh: () => refresh(false), addMember, removeMember, createOrg,
    signOut() { if (enabled) sb.auth.signOut(); ctx.profile = null; ctx.orgs = []; ctx.orgId = null; },
  });
  window.Backend = api;

  document.addEventListener('DOMContentLoaded', () => {
    if (!enabled) return;
    setMode('login');
    sb.auth.onAuthStateChange(event => {
      // El enlace de "recuperar contraseña" abre la página con una sesión temporal.
      if (event === 'PASSWORD_RECOVERY') setTimeout(() => { showAuth(); setMode('newpass'); }, 0);
    });
    sb.auth.getSession().then(({ data }) => {
      if (data.session && !state.currentUser && api.authMode !== 'newpass') enter(true);
    });
  });
})();
