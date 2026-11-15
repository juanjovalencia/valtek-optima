/* ==========================================================================
   Valtek Access — Capa de datos real (Supabase)
   --------------------------------------------------------------------------
   Lee y escribe personas, empresas contratistas, documentos, puntos de control,
   presencia y bitácora de la institución activa de una cuenta real, y entrega
   todo con la misma forma que usa la demostración (assets/access.js), para que
   las pantallas sean las mismas.
   · La validación en garita la hace la base de datos (función access_validate):
     revisa las reglas, escribe la bitácora y actualiza quién está dentro.
   · Cada institución solo ve sus datos: lo garantiza la base (RLS por org_id).
   Depende de: Backend.client y Backend.ctx (assets/backend.js).
   ========================================================================== */
(function () {
  'use strict';

  const NEVER = '9999-12-31'; // documento sin fecha de vencimiento
  const PAGE = 1000;          // la API entrega como máximo 1000 filas por consulta
  const DAY = 86400000;
  const GATE_KIND = { garita: 'Garita', torniquete: 'Torniquete', zona: 'Zona restringida', puerta: 'Puerta', barrera: 'Barrera vehicular' };
  const TIPO = { propio: 'Personal propio', contratista: 'Contratista', visita: 'Visita', estudiante: 'Estudiante', docente: 'Docente', funcionario: 'Funcionario' };
  const ORG = '_org', VISITS = '_visitas'; // "empresas" de pantalla para el personal propio y las visitas
  const LOG_COLS = 'id, created_at, gate_id, gate_label, person_id, rut, full_name, company_name, direction, allowed, reason, exception_reason, operator_name';

  const sb = () => window.Backend.client;
  const uid = () => window.Backend.ctx.profile.id;
  const cleanRut = s => String(s || '').replace(/[^0-9kK]/g, '').toUpperCase();
  const fmtRut = s => { const c = cleanRut(s); return c.length < 2 ? (s || '—') : c.slice(0, -1).replace(/\B(?=(\d{3})+(?!\d))/g, '.') + '-' + c.slice(-1); };

  // Mensajes claros para los errores de la base de datos.
  function explain(error, fallback, duplicate) {
    const code = error && error.code, text = String((error && error.message) || '');
    if (code === '23505') return duplicate || 'Ya existe un registro con esos datos.';
    if (code === 'P0001' || code === '23514' || code === '42501') {
      if (!/row-level security|permission denied|violates check/i.test(text)) return text;
      if (code === '42501') return 'Tu rol no tiene permiso para hacer este cambio.';
    }
    if (/fetch|network/i.test(text)) return 'No hay conexión con el servidor. Revisa tu internet e inténtalo de nuevo.';
    return fallback || 'No se pudo completar la operación. Inténtalo de nuevo.';
  }
  function check(res, fallback, duplicate) {
    if (res.error) throw new Error(explain(res.error, fallback, duplicate));
    return res.data;
  }

  // Trae todas las filas de una consulta, de a 1000.
  async function all(build, max) {
    const out = [];
    for (let from = 0; from < (max || Infinity); from += PAGE) {
      const rows = check(await build().range(from, from + PAGE - 1), 'No se pudieron cargar los datos.');
      out.push(...rows);
      if (rows.length < PAGE) break;
    }
    return out;
  }

  // ── Lectura ────────────────────────────────────────────────────────────
  // Catálogos, puntos de control, empresas y personas con su documentación.
  async function loadBase(org) {
    const id = org.id;
    const [types, gates, companies, people, docs] = await Promise.all([
      all(() => sb().from('doc_types').select('scope, code, label, short_label, applies_to').eq('org_id', id).order('sort_order').order('code')),
      all(() => sb().from('gates').select('id, code, name, kind, requires_gate, zone, required_cert, description, sort_order, active').eq('org_id', id).order('sort_order').order('code')),
      all(() => sb().from('companies').select('id, name, rut, kind, status, status_reason, service').eq('org_id', id).order('name').order('id')),
      all(() => sb().from('people').select('id, company_id, rut, full_name, kind, job_title, status, status_reason, zones, valid_from, valid_to, host').eq('org_id', id).order('created_at', { ascending: false }).order('id')),
      all(() => sb().from('current_documents').select('person_id, company_id, doc_type, expires_at').eq('org_id', id).order('id')),
    ]);

    const certs = Object.fromEntries(types.filter(t => t.scope === 'certificacion').map(t => [t.code, t.label]));
    const points = gates.map(g => ({
      id: g.id, code: g.code, name: g.name, short: g.name, desc: g.description || GATE_KIND[g.kind] || '', kind: g.kind,
      zone: g.zone || undefined, requires: g.requires_gate || undefined, cert: g.required_cert || undefined,
      active: g.active, order: g.sort_order,
    }));
    const zones = {};
    points.forEach(p => { if (p.zone) zones[p.zone] = p.zone; });
    const catalog = {
      DOCS: types.filter(t => t.scope === 'persona').map(t => ({ k: t.code, l: t.label, s: t.short_label || t.label, kinds: t.applies_to || [] })),
      CERTS: certs,
      COMPANY_DOCS: types.filter(t => t.scope === 'empresa').map(t => ({ k: t.code, l: t.label })),
      POINTS: points,
      ZONES: zones,
      // Dónde queda una persona después de pasar por cada punto
      LOC_LABEL: Object.fromEntries(points.map(p => [p.id, p.zone || (p.requires ? p.name : 'Recinto')])),
      TIPO,
    };

    const byPerson = {}, byCompany = {};
    docs.forEach(d => {
      const bucket = d.person_id ? (byPerson[d.person_id] = byPerson[d.person_id] || {}) : (byCompany[d.company_id] = byCompany[d.company_id] || {});
      bucket[d.doc_type] = d.expires_at || NEVER;
    });

    const uiCompanies = [{ id: ORG, nombre: org.name, rut: '—', servicio: 'Personal propio', tipo: 'propio', estado: 'habilitada', motivo: '', docs: {} }]
      .concat(companies.map(c => ({
        id: c.id, nombre: c.name, rut: c.rut ? fmtRut(c.rut) : '—', servicio: c.service || '', tipo: c.kind === 'visitas' ? 'visita' : c.kind,
        estado: c.status, motivo: c.status_reason || '', docs: byCompany[c.id] || {},
      })))
      .concat([{ id: VISITS, nombre: 'Visitas', rut: '—', servicio: 'Visitas autorizadas', tipo: 'visita', estado: 'habilitada', motivo: '', docs: {} }]);

    const uiPeople = people.map(p => {
      const mine = byPerson[p.id] || {}, d = {}, c = {};
      Object.keys(mine).forEach(k => { (certs[k] ? c : d)[k] = mine[k]; });
      return {
        id: p.id, nombre: p.full_name, rut: fmtRut(p.rut), tipo: p.kind, cargo: p.job_title || '',
        empresaId: p.company_id || (p.kind === 'visita' ? VISITS : p.kind === 'contratista' ? null : ORG),
        zonas: p.zones || [], docs: d, certs: c, desde: p.valid_from, hasta: p.valid_to,
        estado: p.status, motivo: p.status_reason || '', anfitrion: p.host || '',
        loc: null, inSince: null, locSince: null, demo: false,
      };
    });
    return { catalog, companies: uiCompanies, people: uiPeople };
  }

  const mapLog = r => ({
    id: r.id, ts: Date.parse(r.created_at), pid: r.gate_id, punto: r.gate_label || '', dir: r.direction, ok: r.allowed,
    personId: r.person_id, rut: r.rut ? fmtRut(r.rut) : '—', nombre: r.full_name || 'Desconocido', empresa: r.company_name || '—',
    motivo: r.exception_reason ? 'Excepción autorizada: ' + r.exception_reason : (r.reason || ''),
    operador: r.operator_name || '—', excepcion: !!r.exception_reason,
  });

  // Bitácora entre dos momentos (los más recientes primero al paginar; se entrega en orden cronológico).
  async function loadLogs(orgId, opts) {
    opts = opts || {};
    const rows = await all(() => {
      let q = sb().from('access_logs').select(LOG_COLS).eq('org_id', orgId).eq('kind', 'acceso');
      if (opts.afterId) q = q.gt('id', opts.afterId);
      if (opts.from) q = q.gte('created_at', new Date(opts.from).toISOString());
      if (opts.to) q = q.lt('created_at', new Date(opts.to).toISOString());
      return q.order('id', { ascending: false });
    }, opts.max || 5000);
    return rows.map(mapLog).reverse();
  }

  // Lo que cambia minuto a minuto: quién está dentro y los registros nuevos de la bitácora.
  async function loadLive(orgId, afterId) {
    const [presence, log] = await Promise.all([
      all(() => sb().from('access_presence').select('person_id, gate_id, inside_since, location_since').eq('org_id', orgId).order('person_id')),
      loadLogs(orgId, afterId ? { afterId } : { from: new Date().setHours(0, 0, 0, 0) - 6 * DAY }),
    ]);
    return {
      presence: presence.map(r => ({ personId: r.person_id, loc: r.gate_id, inSince: Date.parse(r.inside_since), locSince: Date.parse(r.location_since) })),
      log,
    };
  }

  // ── Validación en el punto de control ──────────────────────────────────
  async function validate(gateId, rut, dir, exception) {
    return check(await sb().rpc('access_validate', { p_gate: gateId, p_rut: rut, p_direction: dir, p_exception: exception || null }),
      'No se pudo validar. Inténtalo de nuevo.');
  }

  // ── Personas ───────────────────────────────────────────────────────────
  const realCompany = id => (!id || id === ORG || id === VISITS) ? null : id;

  async function savePerson(orgId, id, f) {
    const row = {
      full_name: f.nombre, rut: f.rut, kind: f.tipo, company_id: realCompany(f.empresaId), job_title: f.cargo || null,
      zones: f.zonas || [], valid_from: f.desde || null, valid_to: f.hasta || null, host: f.anfitrion || null,
    };
    const q = id ? sb().from('people').update(row).eq('id', id) : sb().from('people').insert(Object.assign({ org_id: orgId }, row));
    const rows = check(await q.select('id'), 'No se pudo guardar la persona.', 'Ya existe una persona con ese RUT.');
    if (!rows.length) throw new Error('Tu rol no tiene permiso para hacer este cambio.');
    return rows[0].id;
  }

  async function setPersonStatus(id, estado, motivo) {
    const rows = check(await sb().from('people').update({ status: estado, status_reason: motivo || null }).eq('id', id).select('status'),
      'No se pudo cambiar el estado de la credencial.');
    if (!rows.length || rows[0].status !== estado) throw new Error('Tu rol no tiene permiso para suspender o reactivar credenciales.');
  }

  // Registra un documento ya revisado. Sin fecha = no vence. Cada registro nuevo reemplaza al anterior.
  async function setDocument(orgId, subject, code, expires) {
    check(await sb().from('contractor_documents').insert({
      org_id: orgId, person_id: subject.personId || null, company_id: subject.companyId || null,
      doc_type: code, expires_at: expires || null, status: 'aprobado', uploaded_by: uid(),
    }), 'No se pudo registrar el documento.');
  }

  // Importa una nómina: crea las empresas que falten y agrega solo los RUT que no existían.
  async function importPeople(orgId, orgName, rows) {
    const existing = check(await sb().from('companies').select('id, name').eq('org_id', orgId), 'No se pudieron leer las empresas.');
    const byName = {};
    existing.forEach(c => { byName[c.name.trim().toLowerCase()] = c.id; });
    const own = String(orgName || '').trim().toLowerCase();
    const missing = [...new Set(rows.map(r => (r.empresa || '').trim()).filter(n => n && n.toLowerCase() !== own && !byName[n.toLowerCase()]).map(n => n.toLowerCase()))]
      .map(low => rows.find(r => (r.empresa || '').trim().toLowerCase() === low).empresa.trim());
    if (missing.length) {
      const created = check(await sb().from('companies').insert(missing.map(name => ({ org_id: orgId, name, kind: 'contratista' }))).select('id, name'),
        'No se pudieron crear las empresas de la nómina.');
      created.forEach(c => { byName[c.name.trim().toLowerCase()] = c.id; });
    }
    const seen = new Set();
    const people = rows.filter(r => { const k = cleanRut(r.rut); if (seen.has(k)) return false; seen.add(k); return true; }).map(r => {
      const company = byName[(r.empresa || '').trim().toLowerCase()] || null;
      return { org_id: orgId, full_name: r.nombre, rut: r.rut, kind: company ? 'contratista' : 'propio', company_id: company, job_title: r.cargo || null };
    });
    let added = 0;
    for (let i = 0; i < people.length; i += 500) {
      const res = check(await sb().from('people').upsert(people.slice(i, i + 500), { onConflict: 'org_id,rut', ignoreDuplicates: true }).select('id'),
        'No se pudo importar la nómina.');
      added += res.length;
    }
    return { added, repeated: rows.length - added, companies: missing.length };
  }

  // ── Empresas contratistas ──────────────────────────────────────────────
  async function saveCompany(orgId, id, f) {
    const row = { name: f.nombre, rut: f.rut || null, service: f.servicio || null };
    const q = id ? sb().from('companies').update(row).eq('id', id) : sb().from('companies').insert(Object.assign({ org_id: orgId, kind: 'contratista' }, row));
    const rows = check(await q.select('id'), 'No se pudo guardar la empresa.');
    if (!rows.length) throw new Error('Tu rol no tiene permiso para hacer este cambio.');
    return rows[0].id;
  }

  async function setCompanyStatus(id, estado, motivo) {
    const rows = check(await sb().from('companies').update({ status: estado, status_reason: motivo || null }).eq('id', id).select('id'),
      'No se pudo cambiar el estado de la empresa.');
    if (!rows.length) throw new Error('Tu rol no tiene permiso para suspender o habilitar empresas.');
  }

  // ── Puntos de control ──────────────────────────────────────────────────
  async function saveGate(orgId, id, f) {
    const row = {
      code: f.code, name: f.name, kind: f.kind, requires_gate: f.requires || null, zone: f.zone || null,
      required_cert: f.cert || null, description: f.desc || null, sort_order: f.order || 0,
    };
    const q = id ? sb().from('gates').update(row).eq('id', id) : sb().from('gates').insert(Object.assign({ org_id: orgId }, row));
    const rows = check(await q.select('id'), 'No se pudo guardar el punto de control.', 'Ya existe un punto de control con ese código.');
    if (!rows.length) throw new Error('Tu rol no tiene permiso para hacer este cambio.');
    return rows[0].id;
  }

  async function setGateActive(id, active) {
    const rows = check(await sb().from('gates').update({ active }).eq('id', id).select('id'), 'No se pudo cambiar el punto de control.');
    if (!rows.length) throw new Error('Tu rol no tiene permiso para hacer este cambio.');
  }

  async function deleteGate(id) {
    const rows = check(await sb().from('gates').delete().eq('id', id).select('id'), 'No se pudo eliminar el punto de control.');
    if (!rows.length) throw new Error('Tu rol no tiene permiso para hacer este cambio.');
  }

  window.AccessData = {
    NEVER, ORG, VISITS, GATE_KIND,
    loadBase, loadLive, loadLogs, validate,
    savePerson, setPersonStatus, setDocument, importPeople,
    saveCompany, setCompanyStatus,
    saveGate, setGateActive, deleteGate,
  };
})();
