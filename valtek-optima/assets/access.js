/* ==========================================================================
   Valtek Access — Control de acceso y seguridad para plantas industriales
   --------------------------------------------------------------------------
   · Base de personas (personal propio, contratistas y visitas) con su
     documentación, certificaciones, zonas autorizadas y período de faena.
   · Puntos de control en secuencia: Garita (P1) → Torniquete planta (P2)
     → Zonas restringidas (P3 Sala eléctrica, P4 Bodega SUSPEL).
   · Motor de reglas: cada validación muestra qué se revisó y por qué
     se permite o se deniega. Todo queda en la bitácora.
   · Presencia en tiempo real y lista de evacuación.
   Datos de demostración en localStorage (clave vo_access).
   ========================================================================== */
(function () {
  'use strict';

  const KEY = 'vo_access';
  const VERSION = 3;
  const DAY = 86400000;

  // ── Catálogos ──────────────────────────────────────────────────────────
  const DOCS = [
    { k: 'cedula', l: 'Cédula de identidad', s: 'CI' },
    { k: 'contrato', l: 'Contrato de trabajo', s: 'Contrato' },
    { k: 'examen', l: 'Examen pre-ocupacional', s: 'Examen' },
    { k: 'induccion', l: 'Inducción de seguridad (ODI)', s: 'Inducción' },
    { k: 'mutual', l: 'Seguro Ley 16.744 (mutualidad)', s: 'Mutual' },
    { k: 'epp', l: 'Entrega de EPP', s: 'EPP' },
  ];
  const DOC = Object.fromEntries(DOCS.map(d => [d.k, d]));
  const CERTS = {
    sec: 'Licencia SEC (instalaciones eléctricas)',
    sustancias: 'Curso manejo de sustancias peligrosas',
    altura: 'Certificación trabajo en altura',
    grua: 'Licencia operador de grúa horquilla',
  };
  const COMPANY_DOCS = [
    { k: 'f30', l: 'Certificado F30 (antecedentes laborales)' },
    { k: 'f301', l: 'Certificado F30-1 (cumplimiento previsional)' },
    { k: 'mutual', l: 'Adhesión a mutualidad' },
    { k: 'contrato', l: 'Contrato de servicios' },
  ];
  const POINTS = [
    { id: 'P1', name: 'Garita principal', short: 'Garita', desc: 'Ingreso peatonal y vehicular al recinto' },
    { id: 'P2', name: 'Torniquete planta', short: 'Torniquete', desc: 'Acceso al área de producción', zone: 'planta', requires: 'P1' },
    { id: 'P3', name: 'Sala eléctrica', short: 'Sala eléctrica', desc: 'Zona restringida · riesgo eléctrico', zone: 'electrica', requires: 'P2', cert: 'sec' },
    { id: 'P4', name: 'Bodega SUSPEL', short: 'Bodega SUSPEL', desc: 'Zona restringida · sustancias peligrosas', zone: 'bodega', requires: 'P2', cert: 'sustancias' },
  ];
  const POINT = Object.fromEntries(POINTS.map(p => [p.id, p]));
  const ZONES = { planta: 'Planta de producción', electrica: 'Sala eléctrica', bodega: 'Bodega SUSPEL', oficinas: 'Oficinas' };
  const LOC_LABEL = { P1: 'Recinto (patio y oficinas)', P2: 'Planta de producción', P3: 'Sala eléctrica', P4: 'Bodega SUSPEL' };
  const TIPO = { propio: 'Personal propio', contratista: 'Contratista', visita: 'Visita' };

  // ── Utilidades ─────────────────────────────────────────────────────────
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pad = n => String(n).padStart(2, '0');
  const ymd = d => { const x = new Date(d); return x.getFullYear() + '-' + pad(x.getMonth() + 1) + '-' + pad(x.getDate()); };
  const today = () => ymd(Date.now());
  const addDays = n => ymd(Date.now() + n * DAY);
  const fmtDate = s => { if (!s) return '—'; const [y, m, d] = s.split('-'); return d + '-' + m + '-' + y; };
  const hhmm = ts => new Date(ts).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' });
  const startOfDay = () => new Date().setHours(0, 0, 0, 0);
  const daysTo = s => Math.round((new Date(s + 'T12:00:00') - new Date(today() + 'T12:00:00')) / DAY);
  const dur = ms => { const m = Math.max(0, Math.round(ms / 60000)); return m < 60 ? m + ' min' : Math.floor(m / 60) + ' h ' + pad(m % 60) + ' min'; };
  const initials = n => String(n).split(' ').filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase();

  function rutDv(body) {
    let s = 0, m = 2;
    const b = String(body);
    for (let i = b.length - 1; i >= 0; i--) { s += Number(b[i]) * m; m = m === 7 ? 2 : m + 1; }
    const r = 11 - (s % 11);
    return r === 11 ? '0' : r === 10 ? 'K' : String(r);
  }
  const cleanRut = s => String(s || '').replace(/[^0-9kK]/g, '').toUpperCase();
  const fmtRut = body => String(body).replace(/\B(?=(\d{3})+(?!\d))/g, '.') + '-' + rutDv(body);
  const validRut = s => { const c = cleanRut(s); return c.length >= 2 && rutDv(c.slice(0, -1)) === c.slice(-1); };
  const formatRutInput = s => { const c = cleanRut(s); if (c.length < 2) return c; return c.slice(0, -1).replace(/\B(?=(\d{3})+(?!\d))/g, '.') + '-' + c.slice(-1); };

  function dateState(d) {
    if (!d) return 'miss';
    const n = daysTo(d);
    if (n < 0) return 'bad';
    if (n <= 30) return 'warn';
    return 'ok';
  }

  // Generador pseudoaleatorio estable (los datos demo son siempre iguales)
  function rng(seed) {
    return function () {
      seed |= 0; seed = seed + 0x6D2B79F5 | 0;
      let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  // ── Datos ──────────────────────────────────────────────────────────────
  let db = null;

  function seed() {
    const R = rng(2026);
    const pick = a => a[Math.floor(R() * a.length)];
    const between = (a, b) => Math.floor(a + R() * (b - a + 1));
    const now = Date.now();

    const okCompanyDocs = () => ({ f30: addDays(between(20, 40)), f301: addDays(between(25, 45)), mutual: addDays(between(120, 300)), contrato: addDays(between(150, 400)) });
    const companies = [
      { id: 'c0', nombre: 'Planta Valle Norte', rut: fmtRut(96512340), servicio: 'Personal propio', tipo: 'propio', estado: 'habilitada', docs: {} },
      { id: 'c1', nombre: 'Montajes Industriales del Sur Ltda.', rut: fmtRut(76345120), servicio: 'Montaje y mantención mecánica', tipo: 'contratista', estado: 'habilitada', docs: okCompanyDocs() },
      { id: 'c2', nombre: 'Servicios Eléctricos Ríos SpA', rut: fmtRut(77120453), servicio: 'Mantención eléctrica', tipo: 'contratista', estado: 'habilitada', docs: okCompanyDocs() },
      { id: 'c3', nombre: 'Transportes Cordillera Ltda.', rut: fmtRut(78903211), servicio: 'Transporte de carga', tipo: 'contratista', estado: 'habilitada', docs: Object.assign(okCompanyDocs(), { f301: addDays(-12) }) },
      { id: 'c4', nombre: 'Aseo Industrial Integral SpA', rut: fmtRut(76998412), servicio: 'Aseo industrial', tipo: 'contratista', estado: 'habilitada', docs: okCompanyDocs() },
      { id: 'c5', nombre: 'Casinos y Alimentación Pacífico', rut: fmtRut(79554180), servicio: 'Casino y alimentación', tipo: 'contratista', estado: 'habilitada', docs: okCompanyDocs() },
      { id: 'cv', nombre: 'Visitas', rut: '—', servicio: 'Visitas autorizadas', tipo: 'visita', estado: 'habilitada', docs: {} },
    ];

    const NOM = ['Juan', 'José', 'Luis', 'Carlos', 'Jorge', 'Pedro', 'Manuel', 'Francisco', 'Diego', 'Rodrigo', 'Sebastián', 'Matías', 'Nicolás', 'Claudio', 'Patricio', 'Marcelo', 'Víctor', 'Camila', 'Carolina', 'Valentina', 'Francisca', 'Javiera', 'Paula', 'Constanza', 'Marcela', 'Alejandra', 'Gonzalo', 'Ricardo', 'Hernán', 'Esteban'];
    const APE = ['González', 'Muñoz', 'Rojas', 'Díaz', 'Pérez', 'Contreras', 'Silva', 'Martínez', 'Sepúlveda', 'Rodríguez', 'López', 'Hernández', 'Torres', 'Flores', 'Espinoza', 'Valenzuela', 'Castillo', 'Reyes', 'Gutiérrez', 'Pizarro', 'Álvarez', 'Vásquez', 'Sánchez', 'Fernández', 'Cortés', 'Navarro', 'Bravo', 'Olivares', 'Figueroa', 'Carrasco'];
    const CARGOS = {
      c0: ['Operador de producción', 'Operador de producción', 'Operador de producción', 'Supervisor de turno', 'Técnico de mantención', 'Jefe de bodega', 'Analista de calidad', 'Operador de grúa horquilla', 'Prevencionista de riesgos', 'Administrativo', 'Ingeniero de procesos'],
      c1: ['Soldador', 'Mecánico industrial', 'Montajista', 'Rigger', 'Supervisor de faena'],
      c2: ['Eléctrico industrial', 'Técnico eléctrico', 'Supervisor eléctrico'],
      c3: ['Conductor de camión', 'Peoneta'],
      c4: ['Operario de aseo industrial', 'Supervisora de aseo'],
      c5: ['Manipuladora de alimentos', 'Jefe de casino'],
    };
    const COUNTS = { c0: 17, c1: 8, c2: 4, c3: 4, c4: 5, c5: 3 };

    const usedRuts = new Set();
    const newRutBody = () => { let b; do { b = between(9000000, 21999999); } while (usedRuts.has(b)); usedRuts.add(b); return b; };
    const okDocs = () => Object.fromEntries(DOCS.map(d => [d.k, addDays(between(45, 380))]));
    let n = 0;
    const people = [];
    const mk = (o) => {
      const p = Object.assign({
        id: 'p' + (++n), rut: fmtRut(newRutBody()), tipo: 'propio', empresaId: 'c0', zonas: ['planta'], docs: okDocs(), certs: {},
        desde: null, hasta: null, estado: 'activa', motivo: '', loc: null, inSince: null, locSince: null, demo: false,
      }, o);
      people.push(p);
      return p;
    };

    // Personas destacadas para el guion de demostración
    mk({ nombre: 'Jorge Muñoz Tapia', rut: fmtRut(15823467), cargo: 'Operador de producción', demo: 'Todo en regla' });
    mk({ nombre: 'Luis Herrera Castro', rut: fmtRut(16234981), empresaId: 'c2', tipo: 'contratista', cargo: 'Eléctrico industrial', zonas: ['planta', 'electrica'], certs: { sec: addDays(-9) }, desde: addDays(-40), hasta: addDays(50), demo: 'Licencia SEC vencida (probar en Sala eléctrica)' });
    mk({ nombre: 'Cristián Vega Araya', rut: fmtRut(17456213), empresaId: 'c1', tipo: 'contratista', cargo: 'Soldador', docs: Object.assign(okDocs(), { examen: addDays(-21) }), desde: addDays(-30), hasta: addDays(60), demo: 'Examen pre-ocupacional vencido' });
    mk({ nombre: 'Andrés Pino Rojas', rut: fmtRut(14987320), empresaId: 'c3', tipo: 'contratista', cargo: 'Conductor de camión', desde: addDays(-60), hasta: addDays(30), demo: 'Su empresa tiene el F30-1 vencido' });
    mk({ nombre: 'Daniela Soto Fuentes', rut: fmtRut(19345672), empresaId: 'c4', tipo: 'contratista', cargo: 'Operaria de aseo industrial', docs: Object.assign(okDocs(), { induccion: null }), desde: addDays(-2), hasta: addDays(90), demo: 'Sin inducción de seguridad' });
    mk({ nombre: 'Patricia Lagos Méndez', rut: fmtRut(12876543), empresaId: 'cv', tipo: 'visita', cargo: 'Auditora externa · ISO 45001', zonas: ['oficinas'], docs: { cedula: addDays(900), induccion: today() }, desde: today(), hasta: today(), anfitrion: 'Prevención de riesgos', demo: 'Visita (solo oficinas)' });
    mk({ nombre: 'Felipe Morales Núñez', rut: fmtRut(18120934), cargo: 'Técnico de mantención', estado: 'suspendida', motivo: 'Suspensión por incumplimiento de procedimiento LOTO', demo: 'Credencial suspendida' });

    // Personal general
    Object.keys(COUNTS).forEach(cid => {
      for (let i = 0; i < COUNTS[cid]; i++) {
        const cargo = pick(CARGOS[cid]);
        const p = mk({
          nombre: pick(NOM) + ' ' + pick(APE) + ' ' + pick(APE),
          empresaId: cid, tipo: cid === 'c0' ? 'propio' : 'contratista', cargo,
          zonas: cargo === 'Administrativo' || cargo === 'Ingeniero de procesos' ? ['oficinas', 'planta'] : cargo.includes('casino') || cargo.includes('Manipuladora') ? ['oficinas'] : ['planta'],
          desde: cid === 'c0' ? null : addDays(-between(10, 120)), hasta: cid === 'c0' ? null : addDays(between(20, 200)),
        });
        if (cargo.includes('Eléctrico') || cargo.includes('eléctrico')) { p.zonas.push('electrica'); p.certs.sec = addDays(between(60, 300)); }
        if (cargo === 'Jefe de bodega' || cargo === 'Operador de grúa horquilla') { p.zonas.push('bodega'); p.certs.sustancias = addDays(between(40, 300)); }
        if (cargo === 'Operador de grúa horquilla') p.certs.grua = addDays(between(40, 300));
        if (cargo === 'Montajista' || cargo === 'Rigger') p.certs.altura = addDays(between(40, 300));
      }
    });

    // Algunos casos para alertas: documentos por vencer y vencidos
    const general = people.filter(p => !p.demo);
    general.slice(3, 7).forEach((p, i) => { p.docs[['examen', 'induccion', 'mutual', 'epp'][i]] = addDays(between(3, 18)); });
    const expired = [general[9], general[21]];
    expired[0].docs.examen = addDays(-between(3, 40));
    expired[1].docs.induccion = addDays(-between(3, 40));

    // ── Bitácora de hoy ──
    const log = [];
    let lid = 0;
    const start = now - 7 * 3600000;
    const span = 6.4 * 3600000;
    const push = (p, pid, dir, ok, motivo, ts, operador) => log.push({
      id: 'l' + (++lid), ts, pid, dir, ok, personId: p ? p.id : null, rut: p ? p.rut : '—', nombre: p ? p.nombre : 'Desconocido',
      empresa: p ? companies.find(c => c.id === p.empresaId).nombre : '—', motivo: motivo || '', operador: operador || 'Lector automático',
    });

    const eligible = general.filter(p => p.empresaId !== 'c3' && !expired.includes(p));
    eligible.forEach(p => {
      if (R() < 0.12) return; // no vino hoy
      const t1 = start + R() * span * 0.75;
      push(p, 'P1', 'entrada', true, '', t1, 'Guardia · Garita principal');
      p.loc = 'P1'; p.inSince = t1; p.locSince = t1;
      if (p.zonas.includes('planta') && R() < 0.9) {
        const t2 = t1 + between(2, 9) * 60000;
        push(p, 'P2', 'entrada', true, '', t2);
        p.loc = 'P2'; p.locSince = t2;
        const special = p.zonas.find(z => z === 'electrica' || z === 'bodega');
        if (special && R() < 0.6) {
          const pid = special === 'electrica' ? 'P3' : 'P4';
          const t3 = t2 + between(15, 90) * 60000;
          if (t3 < now - 60000) { push(p, pid, 'entrada', true, '', t3); p.loc = pid; p.locSince = t3; }
        }
      }
      if (R() < 0.22) { // terminó su jornada o salió
        const t4 = Math.min(now - 120000, p.locSince + between(40, 180) * 60000);
        if (t4 > p.locSince) {
          if (p.loc === 'P3' || p.loc === 'P4') push(p, p.loc, 'salida', true, '', t4 - 240000);
          if (p.loc !== 'P1') push(p, 'P2', 'salida', true, '', t4 - 120000);
          push(p, 'P1', 'salida', true, '', t4, 'Guardia · Garita principal');
          p.loc = null; p.inSince = null; p.locSince = null;
        }
      }
    });
    // Rechazos registrados hoy
    const c3 = general.filter(p => p.empresaId === 'c3');
    c3.slice(0, 3).forEach(p => push(p, 'P1', 'entrada', false, 'Empresa suspendida: F30-1 vencido', start + R() * span, 'Guardia · Garita principal'));
    push(expired[0], 'P1', 'entrada', false, 'Examen pre-ocupacional vencido', start + R() * span, 'Guardia · Garita principal');
    push(expired[1], 'P1', 'entrada', false, 'Inducción de seguridad vencida', start + R() * span, 'Guardia · Garita principal');
    const someone = eligible.find(p => p.loc === 'P2' && !p.zonas.includes('electrica'));
    if (someone) push(someone, 'P3', 'entrada', false, 'No tiene autorización para Sala eléctrica', someone.locSince + 30 * 60000 < now ? someone.locSince + 30 * 60000 : now - 600000);
    push(null, 'P1', 'entrada', false, 'RUT no registrado en la base de datos', start + R() * span, 'Guardia · Garita principal');
    log.sort((a, b) => a.ts - b.ts);

    // Suspender la empresa con el F30-1 vencido
    const c3c = companies.find(c => c.id === 'c3');
    c3c.estado = 'suspendida';
    c3c.motivo = 'Certificado F30-1 vencido: no acredita el pago de cotizaciones previsionales';

    return { v: VERSION, seededAt: now, companies, people, log, sim: true };
  }

  function load() {
    try {
      const raw = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (raw && raw.v === VERSION) { db = raw; return; }
    } catch (e) { /* datos corruptos: se vuelven a generar */ }
    db = seed();
    save();
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) { /* almacenamiento lleno o no disponible */ }
  }
  function ensure() { if (!db) load(); }

  const company = id => db.companies.find(c => c.id === id) || { nombre: '—', tipo: 'contratista', estado: 'habilitada', docs: {} };
  const findByRut = rut => { const c = cleanRut(rut); return db.people.find(p => cleanRut(p.rut) === c); };
  const requiredDocs = p => p.tipo === 'visita' ? ['cedula', 'induccion'] : DOCS.map(d => d.k);

  function companyStatus(c) {
    if (c.tipo !== 'contratista') return { ok: true };
    if (c.estado === 'suspendida') return { ok: false, detail: c.motivo || 'Empresa suspendida por la planta' };
    const bad = COMPANY_DOCS.filter(d => dateState(c.docs[d.k]) === 'bad' || dateState(c.docs[d.k]) === 'miss');
    if (bad.length) return { ok: false, detail: 'Empresa con documentos vencidos: ' + bad.map(d => d.l).join(', ') };
    return { ok: true };
  }

  function docIssues(p) {
    const out = [];
    requiredDocs(p).forEach(k => {
      const st = dateState(p.docs[k]);
      if (st === 'miss') out.push({ k, l: DOC[k].l, st: 'pendiente', sev: 'bad' });
      else if (st === 'bad') out.push({ k, l: DOC[k].l, st: 'vencido el ' + fmtDate(p.docs[k]), sev: 'bad' });
      else if (st === 'warn') out.push({ k, l: DOC[k].l, st: 'vence en ' + daysTo(p.docs[k]) + ' días', sev: 'warn' });
    });
    return out;
  }

  // Estado general de habilitación de una persona (para listas)
  function personStatus(p) {
    if (p.estado === 'suspendida') return { k: 'bad', t: 'Suspendida', d: p.motivo };
    const cs = companyStatus(company(p.empresaId));
    if (!cs.ok) return { k: 'bad', t: 'Empresa suspendida', d: cs.detail };
    if (p.hasta && p.hasta < today()) return { k: 'bad', t: 'Fuera de período', d: 'Período autorizado terminó el ' + fmtDate(p.hasta) };
    if (p.desde && p.desde > today()) return { k: 'warn', t: 'Aún no inicia', d: 'Autorizado desde el ' + fmtDate(p.desde) };
    const iss = docIssues(p);
    const bad = iss.filter(i => i.sev === 'bad');
    if (bad.length) return { k: 'bad', t: 'Bloqueada', d: bad.map(i => i.l + ' ' + i.st).join(' · ') };
    if (iss.length) return { k: 'warn', t: 'Por vencer', d: iss.map(i => i.l + ' ' + i.st).join(' · ') };
    return { k: 'ok', t: 'Habilitada', d: 'Documentación al día' };
  }

  // ── Motor de reglas ────────────────────────────────────────────────────
  function evaluate(p, pid, dir) {
    const pt = POINT[pid];
    const checks = [];
    const add = (label, ok, detail) => checks.push({ label, ok, detail });
    if (!p) {
      add('Persona registrada', false, 'El RUT no existe en la base de datos de la planta');
      return { ok: false, checks };
    }
    const c = company(p.empresaId);
    add('Persona registrada', true, TIPO[p.tipo] + ' · ' + c.nombre);

    if (dir === 'salida') {
      const ok = pid === 'P1' ? !!p.loc : p.loc === pid;
      add('Registro de salida', ok, ok
        ? 'Se encuentra en ' + LOC_LABEL[p.loc] + ' desde las ' + hhmm(p.locSince)
        : (p.loc ? 'Está registrada en ' + LOC_LABEL[p.loc] + ', no en este punto' : 'No tiene un ingreso abierto'));
      return { ok: checks.every(x => x.ok), checks };
    }

    add('Credencial activa', p.estado !== 'suspendida', p.estado === 'suspendida' ? 'Suspendida: ' + p.motivo : 'Credencial vigente');
    if (p.tipo === 'contratista') {
      const cs = companyStatus(c);
      add('Empresa contratista habilitada', cs.ok, cs.ok ? 'F30, F30-1 y mutualidad al día' : cs.detail);
    }
    if (p.desde || p.hasta) {
      const t = today();
      const ok = (!p.desde || p.desde <= t) && (!p.hasta || p.hasta >= t);
      const lbl = p.tipo === 'visita' ? 'Visita programada' : 'Período de faena vigente';
      add(lbl, ok, ok
        ? (p.desde === p.hasta ? 'Autorizada para hoy' + (p.anfitrion ? ' · Anfitrión: ' + p.anfitrion : '') : 'Del ' + fmtDate(p.desde) + ' al ' + fmtDate(p.hasta))
        : 'Fuera del período autorizado (' + fmtDate(p.desde) + ' al ' + fmtDate(p.hasta) + ')');
    }
    const iss = docIssues(p).filter(i => i.sev === 'bad');
    const ind = iss.find(i => i.k === 'induccion');
    add('Inducción de seguridad', !ind, ind ? 'Inducción ' + ind.st : 'Vigente');
    const others = iss.filter(i => i.k !== 'induccion');
    add('Documentación vigente', !others.length, others.length ? others.map(i => i.l + ' ' + i.st).join(' · ') : requiredDocs(p).length + ' documentos al día');
    if (pt.zone) {
      const ok = p.zonas.includes(pt.zone);
      add('Zona autorizada', ok, ok ? 'Autorizado para ' + ZONES[pt.zone] : 'No tiene autorización para ' + ZONES[pt.zone]);
    }
    if (pt.cert) {
      const d = p.certs && p.certs[pt.cert];
      const st = dateState(d);
      add(CERTS[pt.cert], st === 'ok' || st === 'warn', !d ? 'Sin certificación registrada' : st === 'bad' ? 'Vencida el ' + fmtDate(d) : 'Vigente hasta el ' + fmtDate(d));
    }
    let seqOk, seqDetail;
    if (pid === 'P1') {
      seqOk = !p.loc;
      seqDetail = seqOk ? 'Sin ingresos abiertos' : 'Ya registra un ingreso sin salida (anti-passback)';
    } else {
      seqOk = p.loc === pt.requires;
      seqDetail = seqOk ? 'Validó antes en ' + POINT[pt.requires].name
        : p.loc === pid ? 'Ya está dentro de esta zona (anti-passback)'
          : 'Debe validar primero en ' + POINT[pt.requires].name;
    }
    add('Secuencia de acceso', seqOk, seqDetail);
    return { ok: checks.every(x => x.ok), checks };
  }

  function register(p, pid, dir, res, opts) {
    opts = opts || {};
    const fail = res.checks.find(x => !x.ok);
    const entry = {
      id: 'l' + Date.now() + Math.floor(Math.random() * 1000), ts: Date.now(), pid, dir, ok: res.ok || !!opts.excepcion,
      personId: p ? p.id : null, rut: p ? p.rut : formatRutInput(opts.rut || ''), nombre: p ? p.nombre : 'Desconocido',
      empresa: p ? company(p.empresaId).nombre : '—',
      motivo: opts.excepcion ? 'Excepción autorizada: ' + opts.excepcion : (fail ? (fail.label === 'Persona registrada' ? 'RUT no registrado en la base de datos' : fail.detail) : ''),
      operador: opts.operador || (state.currentUser ? state.currentUser.name : 'Operador'), excepcion: !!opts.excepcion,
    };
    db.log.push(entry);
    if (entry.ok && p) {
      const t = entry.ts;
      if (dir === 'entrada') { if (pid === 'P1') p.inSince = t; p.loc = pid; p.locSince = t; }
      else if (pid === 'P1') { p.loc = null; p.inSince = null; p.locSince = null; }
      else { p.loc = POINT[pid].requires; p.locSince = t; }
    }
    save();
    return entry;
  }

  // ── Estado de UI ───────────────────────────────────────────────────────
  const ui = {
    page: 'dashboard',
    gate: { pid: 'P1', dir: 'entrada', last: null },
    people: { q: '', tipo: '', empresa: '', estado: '' },
    log: { q: '', pid: '', res: '' },
    presence: { area: '' },
  };

  function root() { return document.getElementById('access-root'); }

  function show(page) {
    ensure();
    ui.page = page;
    render();
  }

  function render() {
    const el = root();
    if (!el) return;
    const f = { dashboard: pDashboard, gate: pGate, presence: pPresence, people: pPeople, companies: pCompanies, log: pLog }[ui.page] || pDashboard;
    el.innerHTML = f();
    if (ui.page === 'gate') {
      const inp = document.getElementById('ax-rut');
      if (inp) { inp.focus(); }
    }
  }

  // ── Componentes ────────────────────────────────────────────────────────
  const ICO = {
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>',
    x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
    in: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/></svg>',
    out: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>',
    print: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>',
    down: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>',
    up: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>',
    plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>',
    scan: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2"/><line x1="7" y1="12" x2="17" y2="12"/></svg>',
    reset: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>',
    pause: '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>',
    play: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 5v14l12-7z"/></svg>',
  };

  const badge = (k, t) => `<span class="badge ${k === 'ok' ? 'badge-clean' : k === 'warn' ? 'badge-process' : k === 'bad' ? 'badge-rejected' : 'badge-pending'}">${esc(t)}</span>`;
  const resBadge = e => e.ok ? (e.excepcion ? badge('warn', 'Excepción') : badge('ok', e.dir === 'entrada' ? 'Permitido' : 'Salida')) : badge('bad', 'Denegado');
  const avatar = p => `<span class="ax-av ${p && p.tipo ? 'tipo-' + p.tipo : ''}">${p ? esc(initials(p.nombre)) : '?'}</span>`;
  const personCell = (name, rut, p) => `<div class="ax-person">${avatar(p)}<div><b>${esc(name)}</b><span class="mono">${esc(rut)}</span></div></div>`;

  function docChips(p) {
    const req = requiredDocs(p);
    const issues = req.filter(k => dateState(p.docs[k]) !== 'ok');
    if (!issues.length) return `<span class="ax-doc ok">${req.length}/${req.length} vigentes</span>`;
    return `<span class="ax-doc">${req.length - issues.length}/${req.length}</span>` + issues.map(k => {
      const st = dateState(p.docs[k]);
      const title = DOC[k].l + ': ' + (st === 'miss' ? 'pendiente' : (st === 'bad' ? 'vencido ' : 'vence ') + fmtDate(p.docs[k]));
      return `<span class="ax-doc ${st}" title="${esc(title)}">${DOC[k].s}</span>`;
    }).join('');
  }

  function simBar() {
    return `<button class="btn btn-sm ax-sim ${db.sim ? 'on' : ''}" onclick="Access.toggleSim()">${db.sim ? ICO.pause + 'Tráfico en vivo' : ICO.play + 'Simular tráfico'}</button>`;
  }

  // ── Página: Panel de seguridad ─────────────────────────────────────────
  function pDashboard() {
    const t0 = startOfDay();
    const inside = db.people.filter(p => p.loc);
    const todayLog = db.log.filter(e => e.ts >= t0);
    const ingresos = todayLog.filter(e => e.pid === 'P1' && e.dir === 'entrada' && e.ok).length;
    const denied = todayLog.filter(e => !e.ok);
    const contr = db.companies.filter(c => c.tipo === 'contratista');
    const contrOk = contr.filter(c => companyStatus(c).ok).length;
    const expiring = db.people.filter(p => docIssues(p).some(i => i.sev === 'warn'));
    const blocked = db.people.filter(p => personStatus(p).k === 'bad');

    const byLoc = ['P1', 'P2', 'P3', 'P4'].map(k => ({ k, n: inside.filter(p => p.loc === k).length }));
    const maxLoc = Math.max(1, ...byLoc.map(x => x.n));
    const byCo = db.companies.map(c => ({ c, n: inside.filter(p => p.empresaId === c.id).length })).filter(x => x.n).sort((a, b) => b.n - a.n);
    const maxCo = Math.max(1, ...byCo.map(x => x.n));

    const hNow = new Date().getHours();
    const hStart = todayLog.length ? Math.max(hNow - 11, Math.min(...todayLog.map(e => new Date(e.ts).getHours()))) : Math.max(0, hNow - 6);
    const hours = [];
    for (let h = hStart; h <= hNow; h++) {
      const evs = todayLog.filter(e => new Date(e.ts).getHours() === h && e.dir === 'entrada');
      hours.push({ h, ok: evs.filter(e => e.ok).length, no: evs.filter(e => !e.ok).length });
    }
    const maxH = Math.max(1, ...hours.map(x => x.ok + x.no));

    const alerts = [];
    db.companies.filter(c => !companyStatus(c).ok).forEach(c => alerts.push({ k: 'bad', t: c.nombre + ' suspendida', d: companyStatus(c).detail, go: "Shell.go('sec-companies')" }));
    inside.filter(p => personStatus(p).k === 'bad').forEach(p => alerts.push({ k: 'bad', t: p.nombre + ' está dentro con documentación bloqueada', d: personStatus(p).d, go: `Access.openPerson('${p.id}')` }));
    expiring.slice(0, 5).forEach(p => alerts.push({ k: 'warn', t: p.nombre + ': documentos por vencer', d: docIssues(p).filter(i => i.sev === 'warn').map(i => i.l + ' ' + i.st).join(' · '), go: `Access.openPerson('${p.id}')` }));

    return `
      <div class="ov-hello">
        <div>
          <h2>Panel de seguridad</h2>
          <p>${esc(siteName())} · ${new Date().toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
        </div>
        <div class="ax-actions">
          ${simBar()}
          <button class="btn" onclick="Access.printEvacuation()">${ICO.print}Lista de evacuación</button>
          <button class="btn btn-primary" onclick="Shell.go('sec-gate')">${ICO.scan}Control de acceso</button>
        </div>
      </div>

      <div class="kpi-row ax-kpis">
        <div class="kpi-box ax-kpi-main"><div class="kpi-value">${inside.length}</div><div class="kpi-label">Personas dentro ahora</div></div>
        <div class="kpi-box"><div class="kpi-value">${ingresos}</div><div class="kpi-label">Ingresos hoy</div></div>
        <div class="kpi-box"><div class="kpi-value" style="color:${denied.length ? '#ff8a95' : 'var(--text)'}">${denied.length}</div><div class="kpi-label">Accesos denegados hoy</div></div>
        <div class="kpi-box"><div class="kpi-value">${contrOk}<small class="ax-of">/ ${contr.length}</small></div><div class="kpi-label">Contratistas habilitadas</div></div>
        <div class="kpi-box"><div class="kpi-value" style="color:${blocked.length ? 'var(--process)' : 'var(--text)'}">${blocked.length}</div><div class="kpi-label">Personas bloqueadas</div></div>
      </div>

      <div class="ax-grid">
        <section class="j-card">
          <div class="j-card-title">¿Dónde está la gente ahora? <span class="live-pill" style="margin-left:auto;">EN VIVO</span></div>
          <div class="ax-bars">
            ${byLoc.map(x => `<div class="ax-bar-row"><span>${LOC_LABEL[x.k]}</span><div class="ax-bar"><i style="width:${(x.n / maxLoc) * 100}%"></i></div><b>${x.n}</b></div>`).join('')}
          </div>
          <div class="ax-sub-title">Por empresa</div>
          <div class="ax-bars compact">
            ${byCo.map(x => `<div class="ax-bar-row"><span>${esc(x.c.nombre)}</span><div class="ax-bar alt"><i style="width:${(x.n / maxCo) * 100}%"></i></div><b>${x.n}</b></div>`).join('') || '<div class="empty-state">Nadie dentro del recinto.</div>'}
          </div>
          <div class="ov-links"><button class="btn btn-sm" onclick="Shell.go('sec-presence')">Ver personas en planta</button></div>
        </section>

        <section class="j-card">
          <div class="j-card-title">Ingresos por hora <span class="ax-legend"><i class="ok"></i>Permitidos <i class="no"></i>Denegados</span></div>
          <div class="ax-hours">
            ${hours.map(x => `<div class="ax-hour" title="${pad(x.h)}:00 · ${x.ok} permitidos, ${x.no} denegados"><div class="ax-hour-col"><i class="no" style="height:${(x.no / maxH) * 100}%"></i><i class="ok" style="height:${(x.ok / maxH) * 100}%"></i></div><span>${pad(x.h)}</span></div>`).join('')}
          </div>
          <div class="ax-sub-title">Últimos accesos denegados</div>
          <div class="feed-list">
            ${denied.slice(-4).reverse().map(e => `<div class="feed-item ax-denied"><div class="feed-ico">${ICO.x}</div><div class="feed-text"><b>${esc(e.nombre)} · ${POINT[e.pid].short}</b><span>${esc(e.motivo)}</span></div><div class="feed-time">${hhmm(e.ts)}</div></div>`).join('') || '<div class="empty-state">Sin rechazos hoy.</div>'}
          </div>
        </section>
      </div>

      <div class="ax-grid">
        <section class="j-card">
          <div class="j-card-title">Requiere atención <span class="badge" style="margin-left:auto;">${alerts.length}</span></div>
          <div class="alert-list">
            ${alerts.slice(0, 6).map(a => `<div class="alert-item ${a.k}"><div class="alert-ico">${a.k === 'bad' ? ICO.x : '!'}</div><div class="alert-text"><b>${esc(a.t)}</b><span>${esc(a.d)}</span></div><button class="icon-btn" onclick="${a.go}" aria-label="Abrir">→</button></div>`).join('') || '<div class="empty-state">Todo en orden.</div>'}
          </div>
        </section>
        <section class="j-card">
          <div class="j-card-title">Actividad en vivo <span class="live-pill" style="margin-left:auto;">EN VIVO</span></div>
          <div class="feed-list" id="ax-live-feed">${feedHTML(7)}</div>
          <div class="ov-links"><button class="btn btn-sm" onclick="Shell.go('sec-log')">Ver bitácora completa</button></div>
        </section>
      </div>`;
  }

  function feedHTML(n) {
    return db.log.slice(-n).reverse().map(e => `
      <div class="feed-item ${e.ok ? 'access' : 'ax-denied'}">
        <div class="feed-ico">${e.ok ? (e.dir === 'entrada' ? ICO.in : ICO.out) : ICO.x}</div>
        <div class="feed-text"><b>${esc(e.nombre)}</b><span>${e.ok ? (e.dir === 'entrada' ? 'Ingresó por ' : 'Salió por ') + POINT[e.pid].name : 'Denegado en ' + POINT[e.pid].name + ' · ' + esc(e.motivo)}</span></div>
        <div class="feed-time">${hhmm(e.ts)}</div>
      </div>`).join('') || '<div class="empty-state">Sin actividad.</div>';
  }

  // ── Página: Control de acceso ──────────────────────────────────────────
  function pGate() {
    const g = ui.gate;
    const demo = db.people.filter(p => p.demo && typeof p.demo === 'string');
    return `
      <div class="ax-gate">
        <div>
          <section class="j-card">
            <div class="j-card-title">1 · Punto de control</div>
            <div class="ax-points">
              ${POINTS.map(p => `<button class="ax-point ${g.pid === p.id ? 'active' : ''}" onclick="Access.setPoint('${p.id}')"><span class="ax-point-id">${p.id}</span><b>${p.name}</b><span>${p.desc}</span></button>`).join('')}
            </div>
            <div class="seg-tabs" style="margin-top:14px;">
              <button class="seg-tab ${g.dir === 'entrada' ? 'active' : ''}" onclick="Access.setDir('entrada')">Entrada</button>
              <button class="seg-tab ${g.dir === 'salida' ? 'active' : ''}" onclick="Access.setDir('salida')">Salida</button>
            </div>
          </section>
          <section class="j-card">
            <div class="j-card-title">2 · Identificación</div>
            <div class="ax-rut-row">
              <input class="port-input" id="ax-rut" placeholder="12.345.678-9" autocomplete="off" oninput="this.value=Access.fmtRut(this.value)" onkeydown="if(event.key==='Enter')Access.validate()">
              <button class="btn btn-primary btn-lg" onclick="Access.validate()">${ICO.scan}Validar</button>
            </div>
            <div class="ax-hint">Ingresa el RUT o acerca la credencial al lector. En la operación real, la validación la hace el lector del torniquete automáticamente.</div>
            <div class="ax-sub-title">Casos para la demostración</div>
            <div class="ax-chips">
              ${demo.map(p => `<button class="ax-chip" onclick="Access.tryRut('${p.rut}')"><b>${esc(p.nombre.split(' ').slice(0, 2).join(' '))}</b><span>${esc(p.demo)}</span></button>`).join('')}
              <button class="ax-chip" onclick="Access.tryRut('11.111.111-1')"><b>RUT desconocido</b><span>No está en la base de datos</span></button>
            </div>
          </section>
        </div>
        <div>
          <section class="j-card ax-result-card" id="ax-result">${resultHTML(g.last)}</section>
          <section class="j-card">
            <div class="j-card-title">Últimos registros en ${esc(POINT[g.pid].name)}</div>
            <div class="feed-list" id="ax-gate-recent">${recentAt(g.pid)}</div>
          </section>
        </div>
      </div>`;
  }

  function recentAt(pid) {
    return db.log.filter(e => e.pid === pid).slice(-6).reverse().map(e => `
      <div class="feed-item ${e.ok ? 'access' : 'ax-denied'}">
        <div class="feed-ico">${e.ok ? (e.dir === 'entrada' ? ICO.in : ICO.out) : ICO.x}</div>
        <div class="feed-text"><b>${esc(e.nombre)}</b><span>${e.ok ? (e.dir === 'entrada' ? 'Entrada' : 'Salida') + (e.excepcion ? ' · excepción' : '') : esc(e.motivo)}</span></div>
        <div class="feed-time">${hhmm(e.ts)}</div>
      </div>`).join('') || '<div class="empty-state">Sin registros en este punto.</div>';
  }

  function resultHTML(r) {
    if (!r) {
      return `<div class="ax-idle"><div class="ax-idle-ring">${ICO.scan}</div><b>Esperando identificación</b><span>Selecciona el punto de control e ingresa un RUT.</span></div>`;
    }
    const p = r.personId ? db.people.find(x => x.id === r.personId) : null;
    const c = p ? company(p.empresaId) : null;
    const pt = POINT[r.pid];
    const ok = r.res.ok || r.excepcion;
    return `
      <div class="ax-verdict ${ok ? (r.excepcion ? 'warn' : 'ok') : 'no'}">
        <div class="ax-verdict-ico">${ok ? ICO.check : ICO.x}</div>
        <div>
          <div class="ax-verdict-t">${ok ? (r.excepcion ? 'Ingreso por excepción' : r.dir === 'entrada' ? 'Acceso permitido' : 'Salida registrada') : 'Acceso denegado'}</div>
          <div class="ax-verdict-s">${esc(pt.name)} · ${r.dir === 'entrada' ? 'Entrada' : 'Salida'} · ${hhmm(r.ts)}</div>
        </div>
      </div>
      ${p ? `
      <div class="ax-id">
        <span class="ax-av lg tipo-${p.tipo}">${esc(initials(p.nombre))}</span>
        <div class="ax-id-fields">
          <div><span>Nombre</span><b>${esc(p.nombre)}</b></div>
          <div><span>RUT</span><b class="mono">${esc(p.rut)}</b></div>
          <div><span>Empresa</span><b>${esc(c.nombre)}</b></div>
          <div><span>Cargo</span><b>${esc(p.cargo)}</b></div>
        </div>
      </div>` : `<div class="ax-id"><span class="ax-av lg">?</span><div class="ax-id-fields"><div><span>RUT</span><b class="mono">${esc(r.rut)}</b></div><div><span>Estado</span><b>No registrado</b></div></div></div>`}
      <ul class="ax-checks">
        ${r.res.checks.map(x => `<li class="${x.ok ? 'ok' : 'no'}"><i>${x.ok ? ICO.check : ICO.x}</i><div><b>${esc(x.label)}</b><span>${esc(x.detail)}</span></div></li>`).join('')}
      </ul>
      ${!ok && p && r.dir === 'entrada' ? `
      <div class="ax-exception">
        <div class="ax-sub-title" style="margin-top:0;">Autorizar excepción (queda registrada)</div>
        <div class="ax-rut-row">
          <input class="f-input" id="ax-exc" placeholder="Motivo y quién autoriza">
          <button class="btn" onclick="Access.authorizeException()">Autorizar</button>
        </div>
      </div>` : ''}
      ${p ? `<div class="ov-links" style="margin-top:14px;"><button class="btn btn-sm" onclick="Access.openPerson('${p.id}')">Ver ficha completa</button></div>` : ''}`;
  }

  function validate(rutOverride) {
    ensure();
    const inp = document.getElementById('ax-rut');
    const rut = rutOverride || (inp ? inp.value : '');
    if (!cleanRut(rut)) { showToast('Ingresa un RUT.', true); return; }
    if (!validRut(rut) && !findByRut(rut)) { showToast('El RUT ingresado no es válido (dígito verificador).', true); return; }
    const p = findByRut(rut);
    const g = ui.gate;
    const res = evaluate(p, g.pid, g.dir);
    const entry = register(p, g.pid, g.dir, res, { rut });
    g.last = { res, pid: g.pid, dir: g.dir, personId: p ? p.id : null, rut: formatRutInput(rut), ts: entry.ts, logId: entry.id };
    if (inp) inp.value = '';
    document.getElementById('ax-result').innerHTML = resultHTML(g.last);
    document.getElementById('ax-gate-recent').innerHTML = recentAt(g.pid);
    if (window.innerWidth < 1100) document.getElementById('ax-result').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function authorizeException() {
    const g = ui.gate;
    const motivo = (document.getElementById('ax-exc') || {}).value || '';
    if (!motivo.trim()) { showToast('Indica el motivo y quién autoriza la excepción.', true); return; }
    const p = db.people.find(x => x.id === g.last.personId);
    const entry = register(p, g.last.pid, g.last.dir, g.last.res, { excepcion: motivo.trim() });
    g.last = Object.assign({}, g.last, { excepcion: true, ts: entry.ts });
    document.getElementById('ax-result').innerHTML = resultHTML(g.last);
    document.getElementById('ax-gate-recent').innerHTML = recentAt(g.pid);
    showToast('Excepción registrada en la bitácora.');
  }

  // ── Página: Personas en planta ─────────────────────────────────────────
  function pPresence() {
    const area = ui.presence.area;
    const inside = db.people.filter(p => p.loc && (!area || p.loc === area)).sort((a, b) => a.inSince - b.inSince);
    const all = db.people.filter(p => p.loc);
    return `
      <div class="ax-toolbar">
        <div class="seg-tabs">
          <button class="seg-tab ${!area ? 'active' : ''}" onclick="Access.setArea('')">Todas <span class="ax-n">${all.length}</span></button>
          ${['P1', 'P2', 'P3', 'P4'].map(k => `<button class="seg-tab ${area === k ? 'active' : ''}" onclick="Access.setArea('${k}')">${LOC_LABEL[k].split(' (')[0]} <span class="ax-n">${all.filter(p => p.loc === k).length}</span></button>`).join('')}
        </div>
        <div class="ax-actions">
          <button class="btn" onclick="Access.exportPresence()">${ICO.down}Exportar CSV</button>
          <button class="btn btn-primary" onclick="Access.printEvacuation()">${ICO.print}Imprimir lista de evacuación</button>
        </div>
      </div>
      <section class="j-card">
        <div class="j-card-title">${inside.length} ${inside.length === 1 ? 'persona' : 'personas'} ${area ? 'en ' + LOC_LABEL[area] : 'dentro del recinto'} <span class="live-pill" style="margin-left:auto;">EN VIVO</span></div>
        <div style="overflow-x:auto;">
          <table class="data-table">
            <thead><tr><th>Persona</th><th>Empresa</th><th>Cargo</th><th>Ubicación</th><th>Ingreso</th><th>Tiempo dentro</th><th>Estado</th></tr></thead>
            <tbody>
              ${inside.map(p => { const st = personStatus(p); return `<tr class="ax-row" onclick="Access.openPerson('${p.id}')"><td>${personCell(p.nombre, p.rut, p)}</td><td>${esc(company(p.empresaId).nombre)}</td><td>${esc(p.cargo)}</td><td>${esc(LOC_LABEL[p.loc])}</td><td class="mono">${hhmm(p.inSince)}</td><td>${dur(Date.now() - p.inSince)}</td><td>${badge(st.k, st.t)}</td></tr>`; }).join('') || '<tr class="empty-row"><td colspan="7">No hay personas en esta área.</td></tr>'}
            </tbody>
          </table>
        </div>
      </section>`;
  }

  // ── Página: Registro de personas ───────────────────────────────────────
  function pPeople() {
    const f = ui.people;
    const list = db.people.filter(p => {
      if (f.tipo && p.tipo !== f.tipo) return false;
      if (f.empresa && p.empresaId !== f.empresa) return false;
      if (f.estado && personStatus(p).k !== f.estado) return false;
      if (f.q) { const q = f.q.toLowerCase(); if (!(p.nombre.toLowerCase().includes(q) || cleanRut(p.rut).includes(cleanRut(q)) && cleanRut(q) || p.cargo.toLowerCase().includes(q))) return false; }
      return true;
    });
    const counts = { ok: 0, warn: 0, bad: 0 };
    db.people.forEach(p => counts[personStatus(p).k]++);
    return `
      <div class="kpi-row">
        <div class="kpi-box"><div class="kpi-value">${db.people.length}</div><div class="kpi-label">Personas registradas</div></div>
        <div class="kpi-box"><div class="kpi-value" style="color:var(--clean)">${counts.ok}</div><div class="kpi-label">Habilitadas</div></div>
        <div class="kpi-box"><div class="kpi-value" style="color:var(--process)">${counts.warn}</div><div class="kpi-label">Documentos por vencer</div></div>
        <div class="kpi-box"><div class="kpi-value" style="color:#ff8a95">${counts.bad}</div><div class="kpi-label">Bloqueadas</div></div>
      </div>
      <div class="ax-toolbar">
        <div class="ax-filters">
          <input class="f-input" placeholder="Buscar por nombre, RUT o cargo" value="${esc(f.q)}" oninput="Access.filterPeople('q', this.value)" id="ax-people-q">
          <select class="f-input f-select" onchange="Access.filterPeople('tipo', this.value)"><option value="">Todos los tipos</option>${Object.keys(TIPO).map(k => `<option value="${k}" ${f.tipo === k ? 'selected' : ''}>${TIPO[k]}</option>`).join('')}</select>
          <select class="f-input f-select" onchange="Access.filterPeople('empresa', this.value)"><option value="">Todas las empresas</option>${db.companies.map(c => `<option value="${c.id}" ${f.empresa === c.id ? 'selected' : ''}>${esc(c.nombre)}</option>`).join('')}</select>
          <select class="f-input f-select" onchange="Access.filterPeople('estado', this.value)"><option value="">Todos los estados</option><option value="ok" ${f.estado === 'ok' ? 'selected' : ''}>Habilitadas</option><option value="warn" ${f.estado === 'warn' ? 'selected' : ''}>Por vencer</option><option value="bad" ${f.estado === 'bad' ? 'selected' : ''}>Bloqueadas</option></select>
        </div>
        <div class="ax-actions">
          <label class="btn" style="cursor:pointer;">${ICO.up}Importar nómina<input type="file" accept=".csv,text/csv" style="display:none" onchange="Access.importCSV(event)"></label>
          <button class="btn btn-primary" onclick="Access.newPerson()">${ICO.plus}Agregar persona</button>
        </div>
      </div>
      <section class="j-card">
        <div style="overflow-x:auto;">
          <table class="data-table">
            <thead><tr><th>Persona</th><th>Empresa</th><th>Cargo</th><th>Documentos</th><th>Estado de acceso</th><th>Ubicación</th></tr></thead>
            <tbody>
              ${list.map(p => { const st = personStatus(p); return `<tr class="ax-row" onclick="Access.openPerson('${p.id}')"><td>${personCell(p.nombre, p.rut, p)}</td><td>${esc(company(p.empresaId).nombre)}<div class="ax-muted">${TIPO[p.tipo]}</div></td><td>${esc(p.cargo)}</td><td><div class="ax-docs">${docChips(p)}</div></td><td>${badge(st.k, st.t)}${st.k !== 'ok' ? `<div class="ax-muted ax-clip" title="${esc(st.d)}">${esc(st.d)}</div>` : ''}</td><td>${p.loc ? `<span class="ax-dot on"></span>${esc(LOC_LABEL[p.loc].split(' (')[0])}` : '<span class="ax-dot"></span><span class="ax-muted">Fuera</span>'}</td></tr>`; }).join('') || '<tr class="empty-row"><td colspan="6">Sin resultados.</td></tr>'}
            </tbody>
          </table>
        </div>
      </section>`;
  }

  // ── Página: Empresas contratistas ──────────────────────────────────────
  function pCompanies() {
    const list = db.companies.filter(c => c.tipo === 'contratista');
    return `
      <div class="card-hint" style="margin:0 0 18px;">Cada empresa contratista debe acreditar mensualmente el pago de cotizaciones (F30-1) y sus antecedentes laborales (F30), como exige la Ley de Subcontratación. Si una empresa queda suspendida, ninguno de sus trabajadores puede ingresar.</div>
      <div class="ax-companies">
        ${list.map(c => {
          const st = companyStatus(c);
          const ws = db.people.filter(p => p.empresaId === c.id);
          const okW = ws.filter(p => personStatus(p).k !== 'bad').length;
          const inside = ws.filter(p => p.loc).length;
          const pct = ws.length ? Math.round(okW / ws.length * 100) : 0;
          return `
          <section class="j-card ax-company ${st.ok ? '' : 'suspended'}">
            <div class="ax-company-head">
              <div><b>${esc(c.nombre)}</b><span>${esc(c.servicio)} · RUT ${esc(c.rut)}</span></div>
              ${st.ok ? badge('ok', 'Habilitada') : badge('bad', 'Suspendida')}
            </div>
            ${st.ok ? '' : `<div class="ax-company-warn">${esc(st.detail)}</div>`}
            <div class="ax-company-stats">
              <div><b>${ws.length}</b><span>Trabajadores</span></div>
              <div><b>${inside}</b><span>En planta ahora</span></div>
              <div><b>${pct}%</b><span>Cumplimiento</span></div>
            </div>
            <div class="ax-bar ${pct < 80 ? 'warn' : ''}" style="margin:4px 0 16px;"><i style="width:${pct}%"></i></div>
            <div class="ax-company-docs">
              ${COMPANY_DOCS.map(d => { const s = dateState(c.docs[d.k]); return `<div class="ax-cdoc ${s}"><span>${d.l}</span><b>${s === 'miss' ? 'Pendiente' : (s === 'bad' ? 'Vencido ' : 'Vence ') + fmtDate(c.docs[d.k])}</b></div>`; }).join('')}
            </div>
            <div class="ov-links">
              <button class="btn btn-sm" onclick="Access.filterCompany('${c.id}')">Ver trabajadores</button>
              ${c.estado === 'suspendida'
                ? `<button class="btn btn-sm" onclick="Access.renewCompany('${c.id}')">Registrar F30-1 al día y habilitar</button>`
                : `<button class="btn btn-sm btn-red" onclick="Access.suspendCompany('${c.id}')">Suspender empresa</button>`}
            </div>
          </section>`;
        }).join('')}
      </div>`;
  }

  // ── Página: Bitácora ───────────────────────────────────────────────────
  function pLog() {
    const f = ui.log;
    const list = db.log.filter(e => {
      if (f.pid && e.pid !== f.pid) return false;
      if (f.res === 'ok' && !e.ok) return false;
      if (f.res === 'no' && e.ok) return false;
      if (f.q) { const q = f.q.toLowerCase(); if (!(e.nombre.toLowerCase().includes(q) || e.empresa.toLowerCase().includes(q) || cleanRut(e.rut).includes(cleanRut(q)) && cleanRut(q))) return false; }
      return true;
    }).slice().reverse();
    return `
      <div class="ax-toolbar">
        <div class="ax-filters">
          <input class="f-input" placeholder="Buscar persona, RUT o empresa" value="${esc(f.q)}" oninput="Access.filterLog('q', this.value)" id="ax-log-q">
          <select class="f-input f-select" onchange="Access.filterLog('pid', this.value)"><option value="">Todos los puntos</option>${POINTS.map(p => `<option value="${p.id}" ${f.pid === p.id ? 'selected' : ''}>${p.id} · ${p.name}</option>`).join('')}</select>
          <select class="f-input f-select" onchange="Access.filterLog('res', this.value)"><option value="">Todos los resultados</option><option value="ok" ${f.res === 'ok' ? 'selected' : ''}>Permitidos</option><option value="no" ${f.res === 'no' ? 'selected' : ''}>Denegados</option></select>
        </div>
        <div class="ax-actions">${simBar()}<button class="btn" onclick="Access.exportLog()">${ICO.down}Exportar CSV</button></div>
      </div>
      <section class="j-card">
        <div class="j-card-title">${list.length} registros <span class="live-pill" style="margin-left:auto;">EN VIVO</span></div>
        <div style="overflow-x:auto;">
          <table class="data-table">
            <thead><tr><th>Hora</th><th>Persona</th><th>Empresa</th><th>Punto</th><th>Sentido</th><th>Resultado</th><th>Detalle</th><th>Registrado por</th></tr></thead>
            <tbody>
              ${list.slice(0, 200).map(e => `<tr><td class="mono">${hhmm(e.ts)}</td><td>${personCell(e.nombre, e.rut, e.personId ? db.people.find(p => p.id === e.personId) : null)}</td><td>${esc(e.empresa)}</td><td><span class="ax-pid">${e.pid}</span> ${POINT[e.pid].short}</td><td>${e.dir === 'entrada' ? 'Entrada' : 'Salida'}</td><td>${resBadge(e)}</td><td class="ax-muted">${esc(e.motivo || '—')}</td><td class="ax-muted">${esc(e.operador)}</td></tr>`).join('') || '<tr class="empty-row"><td colspan="8">Sin registros.</td></tr>'}
            </tbody>
          </table>
        </div>
      </section>`;
  }

  // ── Ficha de persona (modal) ───────────────────────────────────────────
  function modal(html) {
    let m = document.getElementById('ax-modal');
    if (!m) {
      m = document.createElement('div');
      m.id = 'ax-modal';
      m.addEventListener('click', e => { if (e.target === m) closeModal(); });
      document.body.appendChild(m);
    }
    m.innerHTML = `<div class="ax-modal-card"><button class="icon-btn ax-modal-x" onclick="Access.closeModal()" aria-label="Cerrar">${ICO.x}</button>${html}</div>`;
    m.classList.add('open');
  }
  function closeModal() { const m = document.getElementById('ax-modal'); if (m) m.classList.remove('open'); }

  function openPerson(id) {
    ensure();
    const p = db.people.find(x => x.id === id);
    if (!p) return;
    const c = company(p.empresaId);
    const st = personStatus(p);
    const hist = db.log.filter(e => e.personId === p.id).slice(-8).reverse();
    modal(`
      <div class="ax-id" style="margin-top:0;">
        <span class="ax-av lg tipo-${p.tipo}">${esc(initials(p.nombre))}</span>
        <div style="flex:1;min-width:0;">
          <div class="ax-modal-name">${esc(p.nombre)}</div>
          <div class="ax-muted">${esc(p.cargo)} · ${esc(c.nombre)}</div>
          <div style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap;">${badge(st.k, st.t)}${badge('', TIPO[p.tipo])}${p.loc ? badge('ok', 'En ' + LOC_LABEL[p.loc].split(' (')[0]) : badge('', 'Fuera del recinto')}</div>
        </div>
      </div>
      ${st.k !== 'ok' ? `<div class="ax-company-warn" style="margin-top:14px;">${esc(st.d)}</div>` : ''}
      <div class="ax-detail-grid">
        <div><span>RUT</span><b class="mono">${esc(p.rut)}</b></div>
        <div><span>Credencial</span><b>${p.estado === 'suspendida' ? 'Suspendida' : 'Activa'}</b></div>
        <div><span>Período autorizado</span><b>${p.desde || p.hasta ? fmtDate(p.desde) + ' al ' + fmtDate(p.hasta) : 'Indefinido (personal propio)'}</b></div>
        <div><span>Zonas autorizadas</span><b>${p.zonas.map(z => ZONES[z]).join(', ')}</b></div>
      </div>
      <div class="ax-sub-title">Documentación</div>
      <div class="ax-doclist">
        ${requiredDocs(p).map(k => { const s = dateState(p.docs[k]); return `<div class="ax-cdoc ${s}"><span>${DOC[k].l}</span><b>${s === 'miss' ? 'Pendiente' : (s === 'bad' ? 'Vencido ' : 'Vence ') + fmtDate(p.docs[k])}</b>${s !== 'ok' ? `<button class="btn btn-sm" onclick="Access.renewDoc('${p.id}','${k}')">Registrar vigente</button>` : ''}</div>`; }).join('')}
        ${Object.keys(p.certs || {}).map(k => { const s = dateState(p.certs[k]); return `<div class="ax-cdoc ${s}"><span>${CERTS[k]}</span><b>${(s === 'bad' ? 'Vencida ' : 'Vence ') + fmtDate(p.certs[k])}</b>${s === 'bad' ? `<button class="btn btn-sm" onclick="Access.renewCert('${p.id}','${k}')">Registrar vigente</button>` : ''}</div>`; }).join('')}
      </div>
      <div class="ax-sub-title">Últimos accesos</div>
      <div class="feed-list">
        ${hist.map(e => `<div class="feed-item ${e.ok ? 'access' : 'ax-denied'}"><div class="feed-ico">${e.ok ? (e.dir === 'entrada' ? ICO.in : ICO.out) : ICO.x}</div><div class="feed-text"><b>${POINT[e.pid].name} · ${e.dir === 'entrada' ? 'Entrada' : 'Salida'}</b><span>${e.ok ? (e.excepcion ? esc(e.motivo) : 'Permitido') : esc(e.motivo)}</span></div><div class="feed-time">${hhmm(e.ts)}</div></div>`).join('') || '<div class="empty-state">Sin accesos registrados.</div>'}
      </div>
      <div class="ov-links">
        ${p.estado === 'suspendida'
          ? `<button class="btn btn-sm" onclick="Access.toggleSuspend('${p.id}')">Reactivar credencial</button>`
          : `<button class="btn btn-sm btn-red" onclick="Access.toggleSuspend('${p.id}')">Suspender credencial</button>`}
        <button class="btn btn-sm" onclick="Access.closeModal();Shell.go('sec-gate');Access.tryRut('${p.rut}', true)">Validar en control de acceso</button>
      </div>`);
  }

  function newPerson() {
    ensure();
    modal(`
      <div class="ax-modal-name">Agregar persona</div>
      <div class="ax-muted" style="margin-bottom:18px;">La persona queda bloqueada hasta que su documentación esté registrada.</div>
      <div class="j-grid-2" style="gap:12px;">
        <div class="f-group"><label class="f-label">Nombre completo</label><input class="f-input" id="np-nombre" placeholder="Nombre y apellidos"></div>
        <div class="f-group"><label class="f-label">RUT</label><input class="f-input" id="np-rut" placeholder="12.345.678-9" oninput="this.value=Access.fmtRut(this.value)"></div>
        <div class="f-group"><label class="f-label">Tipo</label><select class="f-input f-select" id="np-tipo">${Object.keys(TIPO).map(k => `<option value="${k}">${TIPO[k]}</option>`).join('')}</select></div>
        <div class="f-group"><label class="f-label">Empresa</label><select class="f-input f-select" id="np-empresa">${db.companies.map(c => `<option value="${c.id}">${esc(c.nombre)}</option>`).join('')}</select></div>
        <div class="f-group"><label class="f-label">Cargo</label><input class="f-input" id="np-cargo" placeholder="Ej: Mecánico industrial"></div>
        <div class="f-group"><label class="f-label">Autorizado hasta</label><input type="date" class="f-input" id="np-hasta" value="${addDays(90)}"></div>
      </div>
      <div class="f-group"><label class="f-label">Zonas autorizadas</label>
        <div class="ax-checkrow">${Object.keys(ZONES).map(z => `<label class="zone-check-item"><input type="checkbox" value="${z}" class="np-zona" ${z === 'planta' ? 'checked' : ''}> ${ZONES[z]}</label>`).join('')}</div>
      </div>
      <label class="consent-check" style="margin-top:4px;"><input type="checkbox" id="np-docs"><span style="font-size:.8rem;color:var(--text-dim);">Revisé la documentación (cédula, contrato, examen, inducción, mutualidad y EPP) y está vigente por un año.</span></label>
      <div id="np-err" class="error-msg"></div>
      <div class="ov-links"><button class="btn btn-primary" onclick="Access.savePerson()">Guardar persona</button><button class="btn" onclick="Access.closeModal()">Cancelar</button></div>`);
  }

  function savePerson() {
    const v = id => document.getElementById(id).value.trim();
    const err = document.getElementById('np-err');
    const nombre = v('np-nombre'), rut = v('np-rut'), cargo = v('np-cargo');
    const fail = m => { err.textContent = m; err.classList.add('show'); };
    if (!nombre || !rut || !cargo) return fail('Completa nombre, RUT y cargo.');
    if (!validRut(rut)) return fail('El RUT no es válido (revisa el dígito verificador).');
    if (findByRut(rut)) return fail('Ya existe una persona con ese RUT.');
    const tipo = v('np-tipo');
    const docsOk = document.getElementById('np-docs').checked;
    const p = {
      id: 'p' + Date.now(), nombre, rut: formatRutInput(rut), cargo, tipo, empresaId: v('np-empresa'),
      zonas: [...document.querySelectorAll('.np-zona:checked')].map(x => x.value),
      docs: Object.fromEntries(DOCS.map(d => [d.k, docsOk ? addDays(365) : null])), certs: {},
      desde: tipo === 'propio' ? null : today(), hasta: tipo === 'propio' ? null : v('np-hasta'),
      estado: 'activa', motivo: '', loc: null, inSince: null, locSince: null, demo: false,
    };
    db.people.unshift(p);
    save();
    closeModal();
    ui.people = { q: '', tipo: '', empresa: '', estado: '' };
    render();
    showToast(nombre + ' agregado a la base de datos.');
  }

  function importCSV(ev) {
    const file = ev.target.files && ev.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const lines = String(reader.result).split(/\r?\n/).filter(l => l.trim());
      if (!lines.length) return;
      const sep = lines[0].includes(';') ? ';' : ',';
      const head = lines[0].toLowerCase().split(sep).map(s => s.trim());
      const idx = k => head.findIndex(h => h.includes(k));
      const iN = idx('nombre'), iR = idx('rut'), iE = idx('empresa'), iC = idx('cargo');
      if (iN < 0 || iR < 0) { showToast('El archivo debe tener columnas "nombre" y "rut".', true); return; }
      let added = 0, skipped = 0;
      lines.slice(1).forEach(l => {
        const cols = l.split(sep).map(s => s.trim().replace(/^"|"$/g, ''));
        const rut = cols[iR], nombre = cols[iN];
        if (!nombre || !validRut(rut) || findByRut(rut)) { skipped++; return; }
        const empName = iE >= 0 ? cols[iE] : '';
        let c = db.companies.find(x => x.nombre.toLowerCase() === (empName || '').toLowerCase());
        if (!c && empName) {
          c = { id: 'c' + Date.now() + added, nombre: empName, rut: '—', servicio: 'Por definir', tipo: 'contratista', estado: 'habilitada', docs: {} };
          db.companies.push(c);
        }
        db.people.unshift({
          id: 'p' + Date.now() + '_' + added, nombre, rut: formatRutInput(rut), cargo: iC >= 0 && cols[iC] ? cols[iC] : 'Sin cargo', tipo: c && c.tipo === 'contratista' ? 'contratista' : 'propio',
          empresaId: c ? c.id : 'c0', zonas: ['planta'], docs: Object.fromEntries(DOCS.map(d => [d.k, null])), certs: {},
          desde: null, hasta: null, estado: 'activa', motivo: '', loc: null, inSince: null, locSince: null, demo: false,
        });
        added++;
      });
      save();
      render();
      showToast(added + ' personas importadas' + (skipped ? ' · ' + skipped + ' omitidas (RUT inválido o repetido)' : '') + '. Quedan bloqueadas hasta cargar su documentación.');
    };
    reader.readAsText(file);
    ev.target.value = '';
  }

  // ── Acciones ───────────────────────────────────────────────────────────
  function renewDoc(id, k) { const p = db.people.find(x => x.id === id); p.docs[k] = addDays(365); save(); openPerson(id); render(); showToast(DOC[k].l + ' registrado como vigente.'); }
  function renewCert(id, k) { const p = db.people.find(x => x.id === id); p.certs[k] = addDays(365); save(); openPerson(id); render(); showToast(CERTS[k] + ' registrada como vigente.'); }
  function toggleSuspend(id) {
    const p = db.people.find(x => x.id === id);
    if (p.estado === 'suspendida') { p.estado = 'activa'; p.motivo = ''; showToast('Credencial reactivada.'); }
    else { p.estado = 'suspendida'; p.motivo = 'Suspendida por ' + (state.currentUser ? state.currentUser.name : 'seguridad'); showToast('Credencial suspendida: no podrá ingresar.'); }
    save(); openPerson(id); render();
  }
  function suspendCompany(id) { const c = company(id); c.estado = 'suspendida'; c.motivo = 'Suspendida manualmente por ' + (state.currentUser ? state.currentUser.name : 'seguridad'); save(); render(); showToast(c.nombre + ' suspendida.'); }
  function renewCompany(id) { const c = company(id); c.estado = 'habilitada'; c.motivo = ''; c.docs.f301 = addDays(30); c.docs.f30 = addDays(30); save(); render(); showToast(c.nombre + ' habilitada nuevamente.'); }

  function csv(rows, name) {
    const body = rows.map(r => r.map(v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"').join(';')).join('\r\n');
    const blob = new Blob(['﻿' + body], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }
  function exportLog() {
    csv([['Fecha', 'Hora', 'Nombre', 'RUT', 'Empresa', 'Punto', 'Sentido', 'Resultado', 'Detalle', 'Registrado por']].concat(
      db.log.slice().reverse().map(e => [ymd(e.ts), hhmm(e.ts), e.nombre, e.rut, e.empresa, e.pid + ' ' + POINT[e.pid].name, e.dir, e.ok ? (e.excepcion ? 'Excepción' : 'Permitido') : 'Denegado', e.motivo, e.operador])), 'bitacora-accesos-' + today() + '.csv');
  }
  function exportPresence() {
    csv([['Nombre', 'RUT', 'Empresa', 'Cargo', 'Ubicación', 'Hora de ingreso']].concat(
      db.people.filter(p => p.loc).map(p => [p.nombre, p.rut, company(p.empresaId).nombre, p.cargo, LOC_LABEL[p.loc], hhmm(p.inSince)])), 'personas-en-planta-' + today() + '.csv');
  }

  function printEvacuation() {
    ensure();
    const inside = db.people.filter(p => p.loc).sort((a, b) => (a.loc + a.nombre).localeCompare(b.loc + b.nombre));
    const area = document.getElementById('report-print-area');
    const now = new Date();
    area.innerHTML = `
      <div class="print-header"><div class="print-logo">Valtek <span>Access</span></div><div class="print-report-meta">Lista de evacuación<br>${now.toLocaleDateString('es-CL')} · ${hhmm(now)}</div></div>
      <h1>${esc(siteName())}: personas dentro del recinto (${inside.length})</h1>
      <p>Usar en el punto de encuentro para verificar que todas las personas evacuaron. Marcar cada persona presente.</p>
      ${['P1', 'P2', 'P3', 'P4'].map(k => { const g = inside.filter(p => p.loc === k); if (!g.length) return ''; return `<h2>${LOC_LABEL[k]} (${g.length})</h2><table><thead><tr><th style="width:30px;">✓</th><th>Nombre</th><th>RUT</th><th>Empresa</th><th>Cargo</th><th>Ingreso</th></tr></thead><tbody>${g.map(p => `<tr><td>☐</td><td>${esc(p.nombre)}</td><td>${esc(p.rut)}</td><td>${esc(company(p.empresaId).nombre)}</td><td>${esc(p.cargo)}</td><td>${hhmm(p.inSince)}</td></tr>`).join('')}</tbody></table>`; }).join('')}`;
    window.print();
  }

  function siteName() {
    const u = state.currentUser;
    const s = u && state.schools.find(x => x.id === u.schoolId);
    return s && s.type === 'Industria' ? s.name : 'Planta Industrial Valle Norte';
  }

  // ── Simulación de tráfico en vivo ──────────────────────────────────────
  function simTick() {
    if (!db || !db.sim || !state.currentUser) return;
    if (!['seguridad', 'guardia', 'superadmin'].includes(state.currentUser.role)) return;
    const pool = db.people.filter(p => !p.demo);
    const r = Math.random();
    let p, pid, dir;
    const outside = pool.filter(x => !x.loc && personStatus(x).k !== 'bad');
    const atP1 = pool.filter(x => x.loc === 'P1' && x.zonas.includes('planta'));
    const inside = pool.filter(x => x.loc);
    const bad = pool.filter(x => !x.loc && personStatus(x).k === 'bad');
    if (r < 0.42 && outside.length) { p = outside[Math.floor(Math.random() * outside.length)]; pid = 'P1'; dir = 'entrada'; }
    else if (r < 0.62 && atP1.length) { p = atP1[Math.floor(Math.random() * atP1.length)]; pid = 'P2'; dir = 'entrada'; }
    else if (r < 0.88 && inside.length) {
      p = inside[Math.floor(Math.random() * inside.length)]; pid = p.loc; dir = 'salida';
    } else if (bad.length) { p = bad[Math.floor(Math.random() * bad.length)]; pid = 'P1'; dir = 'entrada'; }
    if (!p) return;
    const res = evaluate(p, pid, dir);
    register(p, pid, dir, res, { operador: pid === 'P1' ? 'Lector · Garita principal' : 'Lector automático' });
    refreshLive();
  }

  function refreshLive() {
    if (!state.currentUser) return;
    const route = document.getElementById('view-access');
    if (!route || !route.classList.contains('active')) return;
    if (ui.page === 'gate') {
      const el = document.getElementById('ax-gate-recent');
      if (el) el.innerHTML = recentAt(ui.gate.pid);
      return;
    }
    if (document.getElementById('ax-modal') && document.getElementById('ax-modal').classList.contains('open')) return;
    const active = document.activeElement;
    if (active && (active.tagName === 'INPUT' || active.tagName === 'SELECT')) return;
    if (ui.page === 'dashboard' || ui.page === 'presence' || ui.page === 'log') render();
  }

  // ── API pública ────────────────────────────────────────────────────────
  window.Access = {
    show, render,
    setPoint(pid) { ui.gate.pid = pid; if (POINT[pid].requires && ui.gate.dir === 'salida') { /* ok */ } render(); },
    setDir(d) { ui.gate.dir = d; render(); },
    validate: () => validate(),
    tryRut(rut, keepPoint) {
      ensure();
      const p = findByRut(rut);
      // Avanza solo al siguiente punto de la secuencia: Garita → Torniquete → Zona restringida
      if (!keepPoint && p) {
        ui.gate.dir = 'entrada';
        ui.gate.pid = !p.loc ? 'P1' : p.loc === 'P1' ? 'P2'
          : p.loc === 'P2' ? (p.zonas.includes('electrica') ? 'P3' : p.zonas.includes('bodega') ? 'P4' : 'P2') : p.loc;
      }
      if (ui.page !== 'gate') { ui.page = 'gate'; }
      render();
      const inp = document.getElementById('ax-rut');
      if (inp) inp.value = rut;
      validate(rut);
    },
    authorizeException,
    setArea(a) { ui.presence.area = a; render(); },
    filterPeople(k, v) { ui.people[k] = v; render(); if (k === 'q') { const i = document.getElementById('ax-people-q'); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } } },
    filterLog(k, v) { ui.log[k] = v; render(); if (k === 'q') { const i = document.getElementById('ax-log-q'); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } } },
    filterCompany(id) { ui.people = { q: '', tipo: '', empresa: id, estado: '' }; Shell.go('sec-people'); },
    openPerson, closeModal, newPerson, savePerson, importCSV,
    renewDoc, renewCert, toggleSuspend, suspendCompany, renewCompany,
    exportLog, exportPresence, printEvacuation,
    toggleSim() { db.sim = !db.sim; save(); render(); showToast(db.sim ? 'Simulación de tráfico activada.' : 'Simulación de tráfico en pausa.'); },
    reset() { localStorage.removeItem(KEY); db = null; load(); ui.gate.last = null; render(); showToast('Datos de demostración reiniciados.'); },
    fmtRut: formatRutInput,
    counts() { ensure(); return { blocked: db.people.filter(p => personStatus(p).k === 'bad').length, inside: db.people.filter(p => p.loc).length }; },
  };

  document.addEventListener('DOMContentLoaded', () => {
    setInterval(simTick, 6500);
    document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });
  });
})();
