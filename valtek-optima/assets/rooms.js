/* ==========================================================================
   Valtek Optima — Salas conectadas
   Cerraduras con lector QR, asistencia automática, reservas de salas y
   control de vehículos por patente. Los datos de demostración se guardan en
   localStorage (vo_rooms) y el horario se arma alrededor de la hora actual,
   para que la demo siempre muestre clases en curso.
   Depende de: state, showToast (index.html) y Shell (shell.js).
   ========================================================================== */
(function () {
  'use strict';

  const KEY = 'vo_rooms';
  const VERSION = 1;
  const MIN = 60000;
  const GRACE = 15 * MIN;   // la sala se puede abrir 15 min antes de la clase
  const LATE = 10 * MIN;    // después de 10 min, la asistencia queda como atraso
  const STALE = 60 * MIN;   // pasado este tiempo, el horario se rearma al recargar

  // ── Utilidades ─────────────────────────────────────────────────────────
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pad = n => String(n).padStart(2, '0');
  const hhmm = ts => new Date(ts).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' });
  const initials = n => String(n).split(' ').filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase();
  const short = n => { const w = String(n).split(' '); return w[0] + (w[1] ? ' ' + w[1][0] + '.' : ''); };
  const mins = ms => Math.max(0, Math.round(ms / MIN));
  const startOfDay = () => new Date().setHours(0, 0, 0, 0);
  const cleanRut = s => String(s || '').replace(/[^0-9kK]/g, '').toUpperCase();
  function rutDv(body) {
    let sum = 0, mul = 2;
    for (let i = String(body).length - 1; i >= 0; i--) { sum += Number(String(body)[i]) * mul; mul = mul === 7 ? 2 : mul + 1; }
    const r = 11 - (sum % 11);
    return r === 11 ? '0' : r === 10 ? 'K' : String(r);
  }
  const fmtRut = body => String(body).replace(/\B(?=(\d{3})+(?!\d))/g, '.') + '-' + rutDv(body);
  const formatRutInput = s => { const c = cleanRut(s); if (c.length < 2) return c; return c.slice(0, -1).replace(/\B(?=(\d{3})+(?!\d))/g, '.') + '-' + c.slice(-1); };
  const cleanPlate = s => String(s || '').replace(/[^0-9a-zA-Z]/g, '').toUpperCase();
  const fmtPlate = s => { const c = cleanPlate(s); return c.length > 4 ? c.slice(0, 4) + '·' + c.slice(4, 6) : c; };
  function rng(seed) {
    let a = seed >>> 0;
    return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }

  // ── Catálogos por tipo de institución ──────────────────────────────────
  const FIRST = ['Camila', 'Benjamín', 'Sofía', 'Vicente', 'Antonia', 'Martín', 'Isidora', 'Joaquín', 'Florencia', 'Agustín', 'Catalina', 'Tomás', 'Josefa', 'Maximiliano', 'Fernanda', 'Cristóbal', 'Constanza', 'Diego', 'Francisca', 'Sebastián', 'Javiera', 'Nicolás', 'Trinidad', 'Felipe', 'Amanda', 'Gabriel', 'Paula', 'Lucas', 'Daniela', 'Ignacio', 'Emilia', 'Rodrigo', 'Macarena', 'Pablo', 'Carolina', 'Andrés'];
  const LAST = ['González', 'Muñoz', 'Rojas', 'Díaz', 'Pérez', 'Soto', 'Contreras', 'Silva', 'Martínez', 'Sepúlveda', 'Morales', 'Rodríguez', 'López', 'Fuentes', 'Hernández', 'Torres', 'Araya', 'Flores', 'Espinoza', 'Valenzuela', 'Castillo', 'Tapia', 'Reyes', 'Gutiérrez', 'Castro', 'Pizarro', 'Álvarez', 'Vásquez', 'Sánchez', 'Fernández', 'Ramírez', 'Carrasco', 'Gómez', 'Cortés', 'Herrera', 'Núñez'];
  const TEACHING = ['sala', 'lab'];
  const TIPO_SALA = { sala: 'Sala de clases', lab: 'Laboratorio', estudio: 'Sala de estudio', reunion: 'Sala de reuniones', biblioteca: 'Libre acceso con credencial', auditorio: 'Auditorio', restringida: 'Acceso restringido' };
  const MODES = ['featured', 'live', 'live', 'soon', 'live', 'late', 'live', 'live', 'soon', 'free', 'live', 'free'];

  const CONFIG = {
    campus: {
      site: 'Universidad Valle Norte · Campus Oriente',
      docente: 'Docente', estudiante: 'Estudiante', grupo: 'sección', parking: 120,
      buildings: [
        { id: 'A', nombre: 'Edificio A · Aulas', rooms: [['A-101', 'Sala A-101', 'sala', 45, 1], ['A-102', 'Sala A-102', 'sala', 45, 1], ['A-103', 'Sala A-103', 'sala', 40, 1], ['A-104', 'Sala A-104', 'sala', 40, 1], ['A-201', 'Sala A-201', 'sala', 60, 2], ['A-202', 'Sala A-202', 'sala', 60, 2], ['A-203', 'Sala A-203', 'sala', 35, 2], ['A-204', 'Sala de estudio A-204', 'estudio', 20, 2]] },
        { id: 'B', nombre: 'Edificio B · Laboratorios', rooms: [['B-101', 'Laboratorio de Computación 1', 'lab', 30, 1], ['B-102', 'Laboratorio de Computación 2', 'lab', 30, 1], ['B-201', 'Laboratorio de Química', 'lab', 24, 2], ['B-202', 'Laboratorio de Física', 'lab', 24, 2], ['B-203', 'Taller de Electrónica', 'lab', 20, 2]] },
        { id: 'C', nombre: 'Edificio C · Biblioteca y auditorio', rooms: [['C-001', 'Biblioteca central', 'biblioteca', 120, 1], ['C-002', 'Auditorio principal', 'auditorio', 180, 1], ['C-101', 'Sala de reuniones Decanato', 'reunion', 12, 2], ['C-102', 'Sala de servidores', 'restringida', 4, 2]] },
      ],
      subjects: ['Cálculo II', 'Física General', 'Programación Avanzada', 'Derecho Civil I', 'Anatomía Humana', 'Microeconomía', 'Química Orgánica', 'Estadística', 'Taller de Diseño', 'Redes de Datos', 'Contabilidad', 'Álgebra Lineal'],
      groupName: (i) => 'Sección ' + (i % 4 + 1),
      detalle: ['Ingeniería Civil', 'Derecho', 'Medicina', 'Ingeniería Comercial', 'Enfermería', 'Arquitectura', 'Psicología'],
    },
    colegio: {
      site: 'Colegio San Nicolás de Myra',
      docente: 'Profesor/a', estudiante: 'Alumno/a', grupo: 'curso', parking: 40,
      buildings: [
        { id: 'B', nombre: 'Pabellón Básica', rooms: [['B-1', 'Sala 1° Básico A', 'sala', 32, 1], ['B-2', 'Sala 2° Básico A', 'sala', 32, 1], ['B-3', 'Sala 3° Básico A', 'sala', 32, 1], ['B-4', 'Sala 4° Básico A', 'sala', 34, 2], ['B-5', 'Sala 5° Básico A', 'sala', 34, 2], ['B-6', 'Sala 6° Básico A', 'sala', 34, 2]] },
        { id: 'M', nombre: 'Pabellón Media', rooms: [['M-7', 'Sala 7° Básico A', 'sala', 36, 1], ['M-8', 'Sala 8° Básico A', 'sala', 36, 1], ['M-1', 'Sala I° Medio A', 'sala', 36, 1], ['M-2', 'Sala II° Medio A', 'sala', 36, 2], ['M-3', 'Sala III° Medio A', 'sala', 36, 2], ['M-4', 'Sala IV° Medio A', 'sala', 36, 2]] },
        { id: 'E', nombre: 'Espacios comunes', rooms: [['E-1', 'Laboratorio de Ciencias', 'lab', 30, 1], ['E-2', 'Sala de Computación', 'lab', 30, 1], ['E-3', 'Sala de Música', 'lab', 25, 1], ['E-4', 'Biblioteca', 'biblioteca', 60, 1], ['E-5', 'Gimnasio', 'auditorio', 150, 1], ['E-6', 'Sala de Profesores', 'reunion', 20, 2], ['E-7', 'Bodega de materiales', 'restringida', 4, 1]] },
      ],
      subjects: ['Matemática', 'Lenguaje', 'Ciencias Naturales', 'Historia', 'Inglés', 'Artes Visuales', 'Música', 'Tecnología', 'Física', 'Química', 'Biología', 'Filosofía'],
      groupName: (i, room) => /^Sala \S+° /.test(room.nombre) ? room.nombre.replace('Sala ', '') : ['7° Básico A', 'I° Medio A', 'III° Medio A'][i % 3],
      detalle: null,
    },
  };

  // ── Datos de demostración ──────────────────────────────────────────────
  let db = null;

  function seedOrg(kind) {
    const cfg = CONFIG[kind];
    const rand = rng(kind === 'campus' ? 4242 : 1717);
    const pick = arr => arr[Math.floor(rand() * arr.length)];
    const now = Date.now();
    const people = [], rooms = [], classes = [], log = [], reservas = [];
    const used = new Set();
    const newRut = (lo, hi) => { let n; do { n = lo + Math.floor(rand() * (hi - lo)); } while (used.has(n)); used.add(n); return fmtRut(n); };
    const fullName = () => pick(FIRST) + ' ' + pick(LAST) + ' ' + pick(LAST);
    const addPerson = (nombre, rol, extra) => { const p = Object.assign({ id: 'p' + (people.length + 1), nombre, rol, activa: true, rut: newRut(rol === 'estudiante' ? (kind === 'campus' ? 19500000 : 23000000) : 9000000, rol === 'estudiante' ? (kind === 'campus' ? 21900000 : 25900000) : 17500000) }, extra || {}); people.push(p); return p; };
    const addLog = (ts, room, p, tipo, detalle, ok) => log.push({ id: 'l' + log.length, ts, roomId: room.id, sala: room.nombre, personId: p ? p.id : null, nombre: p ? p.nombre : 'Sistema', rol: p ? p.rol : '', ok: ok !== false, tipo, detalle });

    const aseo = [addPerson('Rosa Díaz Carrasco', 'aseo', { cargo: 'Personal de aseo', sectores: cfg.buildings.map(b => b.id) }), addPerson('Carmen Rojas Vidal', 'aseo', { cargo: 'Personal de aseo', sectores: cfg.buildings.map(b => b.id) })];

    cfg.buildings.forEach(b => b.rooms.forEach(([id, nombre, tipo, cap, piso]) => {
      rooms.push({ id, nombre, edificio: b.id, edificioNombre: b.nombre, piso, tipo, cap, open: tipo === 'biblioteca', by: null, at: null, remote: null, occ: {}, aseo: { ts: now - (50 + Math.floor(rand() * 240)) * MIN, por: pick(aseo).nombre } });
    }));

    const docentes = ['Marcela Riquelme Soto', 'Tomás Aravena Pinto'].map(n => addPerson(n, 'docente', { detalle: cfg.docente }));
    for (let i = 0; i < 14; i++) docentes.push(addPerson(fullName(), 'docente', { detalle: cfg.docente }));
    const d1 = docentes[0], d2 = docentes[1];
    let docIdx = 2;

    const teaching = rooms.filter(r => TEACHING.includes(r.tipo));
    const demo = {};
    teaching.forEach((room, i) => {
      const m0 = MODES[i % MODES.length];
      const mode = i === 0 ? 'featured' : m0 === 'featured' ? 'live' : m0;
      const docente = mode === 'featured' ? d1 : docentes[2 + (docIdx++ % (docentes.length - 2))];
      const size = Math.min(room.cap - 3, 18 + Math.floor(rand() * 14));
      const grupoNombre = cfg.groupName(i, room);
      const grupo = [];
      for (let k = 0; k < size; k++) grupo.push(addPerson(fullName(), 'estudiante', { detalle: cfg.detalle ? pick(cfg.detalle) : grupoNombre }));
      let start;
      if (mode === 'featured') start = now - 2 * MIN;
      else if (mode === 'live') start = now - (8 + Math.floor(rand() * 38)) * MIN;
      else if (mode === 'late') start = now - 12 * MIN;
      else if (mode === 'soon') start = now + (20 + Math.floor(rand() * 30)) * MIN;
      else start = now - 150 * MIN;
      const c = { id: 'c' + (classes.length + 1), roomId: room.id, nombre: cfg.subjects[i % cfg.subjects.length], grupoNombre, docenteId: docente.id, start, end: start + 90 * MIN, grupo: grupo.map(s => s.id), att: {} };
      classes.push(c);

      if (mode === 'featured') {
        grupo[0].nombre = 'Valentina Rojas Díaz';
        grupo[1].nombre = 'Ignacio Paredes Muñoz'; grupo[1].activa = false; grupo[1].motivo = 'Matrícula suspendida';
        demo.room = room.id; demo.e1 = grupo[0].id; demo.x1 = grupo[1].id;
      }
      if (mode === 'live' && !demo.e2) { grupo[0].nombre = 'Matías Fernández Lagos'; grupo[0].demoAbsent = true; demo.e2 = grupo[0].id; }
      if (mode === 'free' && !demo.freeRoom) demo.freeRoom = room.id;
      else if (mode === 'free' && !demo.cleanRoom) demo.cleanRoom = room.id;

      if (mode === 'live' || mode === 'free') {
        const openAt = start + Math.floor(rand() * 6 - 3) * MIN;
        addLog(openAt, room, docente, 'apertura', 'Abrió la sala y quedó a cargo');
        const lim = mode === 'live' ? now : c.end;
        grupo.forEach(s => {
          if (!s.activa || s.demoAbsent) return;
          const roll = rand();
          let ts = null;
          if (roll < 0.82) ts = start + (rand() * 13 - 3) * MIN;
          else if (roll < 0.92 && lim - start > 14 * MIN) ts = start + (12 + rand() * (mins(lim - start) - 13)) * MIN;
          if (ts == null) return;
          ts = Math.round(Math.min(Math.max(ts, openAt + 20000), lim - 5000));
          c.att[s.id] = ts;
          if (mode === 'live') { room.occ[s.id] = ts; addLog(ts, room, s, 'ingreso', ts > start + LATE ? 'Asistencia registrada con atraso' : 'Asistencia registrada'); }
        });
        if (mode === 'live') { room.open = true; room.by = docente.id; room.at = openAt; room.occ[docente.id] = openAt; }
        else addLog(c.end + 4 * MIN, room, docente, 'cierre', 'Cerró la sala al terminar la clase');
      }
    });
    if (!demo.cleanRoom) demo.cleanRoom = demo.freeRoom;

    // Personal con permisos permanentes
    const restr = rooms.find(r => r.tipo === 'restringida');
    const ti = addPerson('Sergio Contreras Bravo', 'funcionario', { cargo: kind === 'campus' ? 'Encargado de TI' : 'Encargado de mantención', fixed: restr ? [restr.id] : [] });
    if (kind === 'colegio') { const sp = rooms.find(r => r.tipo === 'reunion'); docentes.forEach(d => { d.fixed = [sp.id]; }); }

    // Biblioteca con público y reservas del día
    const bib = rooms.find(r => r.tipo === 'biblioteca');
    const students = people.filter(p => p.rol === 'estudiante' && p.activa && !p.demoAbsent && p.id !== demo.e1);
    if (bib) for (let k = 0; k < Math.round(bib.cap * 0.3); k++) { const s = students[Math.floor(rand() * students.length)]; if (!rooms.some(r => r.occ[s.id])) bib.occ[s.id] = now - Math.floor(rand() * 80) * MIN; }
    const reun = rooms.find(r => r.tipo === 'reunion'), est = rooms.find(r => r.tipo === 'estudio'), aud = rooms.find(r => r.tipo === 'auditorio');
    if (reun) { const d = docentes[5]; reservas.push({ id: 'r1', roomId: reun.id, personId: d.id, start: now - 20 * MIN, end: now + 40 * MIN, motivo: 'Reunión de coordinación' }); reun.open = true; reun.by = d.id; reun.at = now - 18 * MIN; reun.occ[d.id] = reun.at; reun.occ[docentes[6].id] = reun.at + 2 * MIN; reun.occ[docentes[7].id] = reun.at + 3 * MIN; addLog(reun.at, reun, d, 'apertura', 'Abrió la sala con su reserva'); }
    if (est) reservas.push({ id: 'r2', roomId: est.id, personId: docentes[8].id, start: now + 30 * MIN, end: now + 90 * MIN, motivo: 'Ayudantía' });
    if (aud) reservas.push({ id: 'r3', roomId: aud.id, personId: docentes[9].id, start: now + 60 * MIN, end: now + 180 * MIN, motivo: kind === 'campus' ? 'Charla de titulación' : 'Ensayo de la ceremonia' });

    // Algunos rechazos del día, para que la bitácora cuente algo
    const someRoom = teaching.find(r => r.open) || teaching[0];
    addLog(now - 34 * MIN, someRoom, students[3], 'denegado', 'No pertenece a ' + classes.find(c => c.roomId === someRoom.id).grupoNombre, false);
    if (restr) addLog(now - 71 * MIN, restr, docentes[4], 'denegado', 'Sin autorización permanente para esta sala', false);
    if (restr) addLog(now - 95 * MIN, restr, ti, 'apertura', 'Abrió la sala con autorización permanente');
    log.sort((a, b) => a.ts - b.ts);

    // Vehículos
    const L = 'BCDFGHJKLPRSTVWXYZ';
    const plate = () => Array.from({ length: 4 }, () => L[Math.floor(rand() * L.length)]).join('') + pad(10 + Math.floor(rand() * 89));
    const vehicles = [], vlog = [];
    const owners = [d1].concat(docentes.slice(2, 13), [ti]);
    owners.forEach((o, i) => {
      const v = { patente: i === 0 ? 'KLRT42' : plate(), titular: o.nombre, tipo: o.rol === 'docente' ? cfg.docente : 'Funcionario', vigente: true, vence: 'Dic 2027', inside: false, since: null };
      if (i > 0 && rand() < 0.6) { v.inside = true; v.since = now - (25 + Math.floor(rand() * 200)) * MIN; vlog.push({ ts: v.since, patente: v.patente, titular: v.titular, dir: 'entrada', ok: true, detalle: 'Barrera abierta' }); }
      vehicles.push(v);
    });
    vehicles.push({ patente: 'HJPW18', titular: 'Transportes Cordillera Ltda.', tipo: 'Proveedor', vigente: false, vence: 'Sep 2026', inside: false, since: null });
    vehicles.push({ patente: plate(), titular: 'Casinos y Alimentación Pacífico', tipo: 'Proveedor', vigente: true, vence: 'Mar 2027', inside: false, since: null });
    vlog.push({ ts: now - 48 * MIN, patente: 'RTBX77', titular: 'No registrado', dir: 'entrada', ok: false, detalle: 'Patente no registrada' });
    vlog.sort((a, b) => a.ts - b.ts);

    demo.d1 = d1.id; demo.d2 = d2.id; demo.aseo = aseo[0].id;
    return { people, rooms, classes, reservas, log, vehicles, vlog, demo };
  }

  function seed() { db = { v: VERSION, seededAt: Date.now(), sim: true, orgs: { campus: seedOrg('campus'), colegio: seedOrg('colegio') } }; save(); }
  function load() {
    try { db = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { db = null; }
    if (!db || db.v !== VERSION || Date.now() - db.seededAt > STALE || new Date(db.seededAt).getDate() !== new Date().getDate()) seed();
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) { /* sin espacio: la demo sigue en memoria */ } }
  function ensure() { if (!db) load(); }

  function kind() {
    const u = state.currentUser;
    if (!u || u.role === 'superadmin') return 'campus';
    const s = state.schools.find(x => x.id === u.schoolId);
    return s && s.type === 'Colegio' ? 'colegio' : 'campus';
  }
  const cfg = () => CONFIG[kind()];
  const d = () => db.orgs[kind()];
  const person = id => d().people.find(p => p.id === id);
  const room = id => d().rooms.find(r => r.id === id);
  const findByRut = rut => { const c = cleanRut(rut); return c ? d().people.find(p => cleanRut(p.rut) === c) : null; };
  const rolLabel = p => p.rol === 'docente' ? cfg().docente : p.rol === 'estudiante' ? cfg().estudiante : (p.cargo || 'Funcionario');
  const occList = r => Object.keys(r.occ);
  const classNow = (r, t) => d().classes.find(c => c.roomId === r.id && c.start <= t && t <= c.end);
  const classAt = (r, t) => d().classes.find(c => c.roomId === r.id && c.start - GRACE <= t && t <= c.end);
  const classNext = (r, t) => d().classes.filter(c => c.roomId === r.id && c.start > t).sort((a, b) => a.start - b.start)[0];
  const reservaAt = (r, t) => d().reservas.find(x => x.roomId === r.id && x.start - GRACE <= t && t <= x.end);
  const userName = () => (state.currentUser ? state.currentUser.name : 'Administración');
  function attStats(c) {
    let pres = 0, late = 0;
    c.grupo.forEach(id => { const t = c.att[id]; if (t) { if (t > c.start + LATE) late++; else pres++; } });
    const g = c.grupo.length;
    return { g, pres, late, aus: g - pres - late, pct: g ? Math.round((pres + late) / g * 100) : 0 };
  }

  // ── Motor de reglas de la cerradura ────────────────────────────────────
  function evaluate(p, r) {
    const now = Date.now();
    const checks = [];
    const add = (ok, label, detail) => { checks.push({ ok, label, detail }); };
    if (!p) { add(false, 'Credencial', 'El código no está registrado en la base de datos.'); return { ok: false, checks, motivo: 'Código no registrado' }; }
    add(p.activa, 'Credencial', p.activa ? 'Credencial activa · ' + rolLabel(p) : 'Credencial bloqueada: ' + (p.motivo || 'sin vigencia'));
    const c = classAt(r, now), res = reservaAt(r, now);
    let perm = false, det = '', effect = 'enter';
    if (p.rol === 'docente') {
      effect = 'open';
      if (c && c.docenteId === p.id) { perm = true; det = 'Tiene la clase de ' + c.nombre + ' · ' + c.grupoNombre + ' (' + hhmm(c.start) + ' a ' + hhmm(c.end) + ')'; }
      else if (res && res.personId === p.id) { perm = true; det = 'Tiene una reserva de ' + hhmm(res.start) + ' a ' + hhmm(res.end) + ': ' + res.motivo; }
      else if ((p.fixed || []).includes(r.id)) { perm = true; det = 'Autorización permanente para esta sala'; }
      else if (r.tipo === 'biblioteca') { perm = true; effect = 'enter'; det = 'Espacio de libre acceso con credencial'; }
      else det = 'No tiene clase, reserva ni autorización permanente en esta sala.';
    } else if (p.rol === 'estudiante') {
      if (r.tipo === 'biblioteca') { perm = true; det = 'Espacio de libre acceso con credencial'; }
      else if (c && c.grupo.includes(p.id)) { perm = true; det = 'Pertenece a ' + c.grupoNombre + ' de ' + c.nombre; }
      else det = c ? 'No pertenece a ' + c.grupoNombre + ' de ' + c.nombre + '.' : 'No tiene una clase programada en esta sala a esta hora.';
    } else {
      effect = p.rol === 'aseo' ? 'clean' : 'open';
      if ((p.fixed || []).includes(r.id)) { perm = true; det = 'Autorización permanente para esta sala'; }
      else if ((p.sectores || []).includes(r.edificio)) { perm = true; det = 'Sector asignado: ' + r.edificioNombre; }
      else det = 'Esta sala no está dentro de sus autorizaciones.';
    }
    add(perm, 'Permiso sobre la sala', det);
    if (p.rol === 'estudiante' && r.tipo !== 'biblioteca') {
      const who = r.by ? person(r.by) : null;
      add(r.open, 'Sala abierta', r.open ? (who ? 'Abierta por ' + who.nombre + ' a las ' + hhmm(r.at) : 'Abierta a distancia por ' + (r.remote || 'administración')) : 'La sala está cerrada: debe abrirla quien está a cargo.');
      const n = occList(r).length;
      add(n < r.cap, 'Aforo', n + ' de ' + r.cap + ' personas dentro');
    } else if (p.rol === 'aseo') {
      const cn = classNow(r, now);
      const busy = !!cn && r.open && occList(r).length > 0;
      add(!busy, 'Sala disponible para aseo', busy ? 'Hay una clase en curso: ' + cn.nombre + ' hasta las ' + hhmm(cn.end) + '.' : 'Sin clase en curso');
    }
    const fail = checks.find(x => !x.ok);
    return { ok: !fail, checks, effect, motivo: fail ? fail.detail.replace(/\.$/, '') : '', classId: c ? c.id : null };
  }

  function pushLog(e) { const L = d().log; L.push(Object.assign({ id: 'l' + Date.now() + Math.random().toString(36).slice(2, 6) }, e)); if (L.length > 900) L.splice(0, L.length - 900); }

  function register(p, r, res) {
    const now = Date.now();
    const e = { ts: now, roomId: r.id, sala: r.nombre, personId: p ? p.id : null, nombre: p ? p.nombre : 'Código desconocido', rol: p ? p.rol : '', ok: res.ok, tipo: 'denegado', detalle: res.motivo };
    let attended = null, opened = false;
    if (res.ok) {
      if (res.effect === 'open') {
        opened = !r.open || (!r.by && !r.remote);
        if (!r.open || !r.by) { r.by = p.id; r.at = now; r.remote = null; }
        r.open = true; r.occ[p.id] = now;
        e.tipo = opened ? 'apertura' : 'ingreso'; e.detalle = opened ? 'Abrió la sala y quedó a cargo' : 'Ingresó a la sala';
      } else if (res.effect === 'enter') {
        r.occ[p.id] = now;
        const c = d().classes.find(x => x.id === res.classId);
        e.tipo = 'ingreso'; e.detalle = 'Ingresó a la sala';
        if (c && c.grupo.includes(p.id) && !c.att[p.id]) { c.att[p.id] = now; attended = now > c.start + LATE ? 'late' : 'ok'; e.detalle = attended === 'late' ? 'Asistencia registrada con atraso' : 'Asistencia registrada'; }
      } else {
        r.aseo = { ts: now, por: p.nombre };
        e.tipo = 'aseo'; e.detalle = 'Ingreso de aseo registrado';
      }
    }
    pushLog(e); save();
    return { e, attended, opened };
  }

  function remoteOpen(id) {
    const r = room(id);
    r.open = true; r.by = null; r.remote = userName(); r.at = Date.now();
    pushLog({ ts: r.at, roomId: r.id, sala: r.nombre, personId: null, nombre: userName(), rol: 'admin', ok: true, tipo: 'remoto', detalle: 'Apertura a distancia desde la plataforma' });
    save(); showToast(r.nombre + ' abierta a distancia.');
  }
  function closeRoom(id) {
    const r = room(id);
    r.open = false; r.by = null; r.remote = null; r.at = null; r.occ = {};
    pushLog({ ts: Date.now(), roomId: r.id, sala: r.nombre, personId: null, nombre: userName(), rol: 'admin', ok: true, tipo: 'cierre', detalle: 'Cierre a distancia desde la plataforma' });
    save(); showToast(r.nombre + ' cerrada.');
  }

  // ── Estado de la interfaz ──────────────────────────────────────────────
  const ui = { page: 'live', live: { ed: '', estado: '' }, reader: { roomId: null, last: null }, att: { classId: null }, log: { q: '', tipo: '' }, veh: { dir: 'entrada', last: null } };
  const root = () => document.getElementById('rooms-root');
  function show(page) { ensure(); ui.page = page; render(); }
  function render() {
    const el = root();
    if (!el) return;
    ensure();
    const f = { live: pLive, reader: pReader, attendance: pAttendance, booking: pBooking, vehicles: pVehicles, log: pLog }[ui.page] || pLive;
    el.innerHTML = f();
  }

  const S = 'viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"';
  const ICO = {
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>',
    x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
    lock: `<svg ${S}><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>`,
    unlock: `<svg ${S}><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 7.5-2"/></svg>`,
    scan: `<svg ${S}><path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2"/><line x1="7" y1="12" x2="17" y2="12"/></svg>`,
    down: `<svg ${S}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`,
    in: `<svg ${S}><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/></svg>`,
    out: `<svg ${S}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>`,
    spark: `<svg ${S}><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1"/></svg>`,
    pause: '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>',
    play: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 5v14l12-7z"/></svg>',
  };
  const badge = (k, t) => `<span class="badge ${k === 'ok' ? 'badge-clean' : k === 'warn' ? 'badge-process' : k === 'bad' ? 'badge-rejected' : 'badge-pending'}">${esc(t)}</span>`;
  const avClass = p => !p ? '' : p.rol === 'estudiante' ? 'tipo-contratista' : p.rol === 'aseo' ? 'tipo-visita' : '';
  const personCell = (p, sub) => `<div class="ax-person"><span class="ax-av ${avClass(p)}">${p ? esc(initials(p.nombre)) : '?'}</span><div><b>${esc(p ? p.nombre : '—')}</b><span class="mono">${esc(sub != null ? sub : (p ? p.rut : ''))}</span></div></div>`;
  const TIPO_EV = { apertura: ['ok', 'Apertura'], ingreso: ['ok', 'Ingreso'], aseo: ['ok', 'Aseo'], remoto: ['warn', 'Apertura remota'], cierre: ['', 'Cierre'], salida: ['', 'Salida'], denegado: ['bad', 'Denegado'] };
  const evBadge = e => { const t = TIPO_EV[e.tipo] || ['', e.tipo]; return badge(t[0], t[1]); };
  const simBtn = () => `<button class="btn btn-sm ax-sim ${db.sim ? 'on' : ''}" onclick="Rooms.toggleSim()">${db.sim ? ICO.pause + 'Movimiento en vivo' : ICO.play + 'Simular movimiento'}</button>`;
  function feed(list) {
    return list.map(e => `
      <div class="feed-item ${e.ok ? 'access' : 'ax-denied'}">
        <div class="feed-ico">${!e.ok ? ICO.x : e.tipo === 'apertura' || e.tipo === 'remoto' ? ICO.unlock : e.tipo === 'cierre' ? ICO.lock : e.tipo === 'aseo' ? ICO.spark : e.tipo === 'salida' ? ICO.out : ICO.in}</div>
        <div class="feed-text"><b>${esc(e.nombre)} · ${esc(e.sala)}</b><span>${esc(e.detalle)}</span></div>
        <div class="feed-time">${hhmm(e.ts)}</div>
      </div>`).join('') || '<div class="empty-state">Sin registros.</div>';
  }

  // ── Página: Salas en vivo ──────────────────────────────────────────────
  function roomInfo(r, now) {
    const c = classNow(r, now), next = classNext(r, now), res = reservaAt(r, now);
    const who = r.by ? person(r.by) : null;
    const alert = !!c && !r.open && now - c.start > 5 * MIN;
    return { c, next, res, who, alert, n: occList(r).length };
  }
  function roomCard(r, now) {
    const i = roomInfo(r, now);
    let line1, line2;
    if (i.c) { line1 = i.c.nombre + ' · ' + i.c.grupoNombre; line2 = r.open ? (i.who ? 'A cargo: ' + i.who.nombre + ' desde las ' + hhmm(r.at) : 'Abierta a distancia por ' + r.remote) : (now - i.c.start > 0 ? 'Empezó hace ' + mins(now - i.c.start) + ' min y nadie ha abierto' : 'Empieza a las ' + hhmm(i.c.start)); }
    else if (i.res && now >= i.res.start) { line1 = 'Reserva: ' + i.res.motivo; line2 = r.open && i.who ? 'A cargo: ' + i.who.nombre + ' desde las ' + hhmm(r.at) : 'Reservada por ' + person(i.res.personId).nombre; }
    else if (r.tipo === 'biblioteca' || r.tipo === 'restringida') { line1 = TIPO_SALA[r.tipo]; line2 = r.tipo === 'restringida' ? (r.open && i.who ? 'A cargo: ' + i.who.nombre : 'Solo personal con autorización permanente') : 'Entrada con QR personal'; }
    else if (r.open) { line1 = 'Sin clase en este bloque'; line2 = i.who ? 'A cargo: ' + i.who.nombre + ' desde las ' + hhmm(r.at) : 'Abierta a distancia por ' + r.remote; }
    else { const nx = i.next || d().reservas.filter(x => x.roomId === r.id && x.start > now)[0]; line1 = 'Libre ahora'; line2 = nx ? 'Próximo uso: ' + (nx.nombre || nx.motivo) + ' a las ' + hhmm(nx.start) : 'Sin más uso programado hoy'; }
    return `
      <div class="rm-card ${r.open ? 'open' : ''} ${i.alert ? 'alert' : ''}" onclick="Rooms.openRoom('${r.id}')" role="button" tabindex="0" onkeydown="if(event.key==='Enter')Rooms.openRoom('${r.id}')">
        <div class="rm-head">
          <div class="rm-name"><b>${esc(r.nombre)}</b><span>${esc(r.id)} · Piso ${r.piso} · ${r.cap} puestos</span></div>
          <span class="rm-lock ${r.open ? 'open' : ''}">${r.open ? ICO.unlock + 'Abierta' : ICO.lock + 'Cerrada'}</span>
        </div>
        <div class="rm-class ${i.alert ? 'warn' : ''}"><b>${esc(line1)}</b><span>${esc(line2)}</span></div>
        <div class="rm-occ"><div class="ax-bar ${i.n / r.cap > 0.9 ? 'warn' : ''}"><i style="width:${Math.min(100, (i.n / r.cap) * 100)}%"></i></div><span><b>${i.n}</b> / ${r.cap} dentro</span></div>
        <div class="rm-foot">
          <span title="Último aseo registrado">${ICO.spark}Aseo ${hhmm(r.aseo.ts)} · ${esc(short(r.aseo.por))}</span>
          <button class="btn btn-sm" onclick="event.stopPropagation();Rooms.${r.open ? 'close' : 'remote'}('${r.id}')">${r.open ? 'Cerrar' : 'Abrir'}</button>
        </div>
      </div>`;
  }

  function pLive() {
    const now = Date.now(), D = d(), t0 = startOfDay();
    const open = D.rooms.filter(r => r.open);
    const inside = D.rooms.reduce((a, r) => a + occList(r).length, 0);
    const live = D.classes.filter(c => c.start <= now && now <= c.end);
    const liveOpen = live.filter(c => room(c.roomId).open);
    const pct = liveOpen.length ? Math.round(liveOpen.reduce((a, c) => a + attStats(c).pct, 0) / liveOpen.length) : 0;
    const denied = D.log.filter(e => e.ts >= t0 && !e.ok).length;
    const alerts = D.rooms.map(r => ({ r, i: roomInfo(r, now) })).filter(x => x.i.alert);
    const f = ui.live;
    const list = D.rooms.filter(r => (!f.ed || r.edificio === f.ed) && (!f.estado || (f.estado === 'open') === r.open));
    return `
      <div class="ov-hello">
        <div><h2>Salas en vivo</h2><p>${esc(cfg().site)} · ${new Date().toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' })}</p></div>
        <div class="ax-actions">${simBtn()}<button class="btn" onclick="Shell.go('rooms-attendance')">Ver asistencia</button><button class="btn btn-primary" onclick="Shell.go('rooms-reader')">${ICO.scan}Probar un lector QR</button></div>
      </div>
      <div class="kpi-row ax-kpis">
        <div class="kpi-box ax-kpi-main"><div class="kpi-value">${inside}</div><div class="kpi-label">Personas en salas ahora</div></div>
        <div class="kpi-box"><div class="kpi-value">${open.length}<small class="ax-of">/ ${D.rooms.length}</small></div><div class="kpi-label">Salas abiertas</div></div>
        <div class="kpi-box"><div class="kpi-value">${live.length}</div><div class="kpi-label">Clases en curso</div></div>
        <div class="kpi-box"><div class="kpi-value">${pct}%</div><div class="kpi-label">Asistencia promedio</div></div>
        <div class="kpi-box"><div class="kpi-value" style="color:${denied ? '#ff8a95' : 'var(--text)'}">${denied}</div><div class="kpi-label">Accesos denegados hoy</div></div>
      </div>
      ${alerts.length ? `<section class="j-card"><div class="j-card-title">Requiere atención <span class="badge" style="margin-left:auto;">${alerts.length}</span></div><div class="alert-list">
        ${alerts.map(x => `<div class="alert-item warn"><div class="alert-ico">!</div><div class="alert-text"><b>${esc(x.r.nombre)}: la clase empezó hace ${mins(now - x.i.c.start)} min y la sala sigue cerrada</b><span>${esc(x.i.c.nombre)} · ${esc(x.i.c.grupoNombre)} · ${esc(cfg().docente)}: ${esc(person(x.i.c.docenteId).nombre)}</span></div><button class="btn btn-sm" onclick="Rooms.remote('${x.r.id}')">Abrir a distancia</button></div>`).join('')}
      </div></section>` : ''}
      <div class="ax-toolbar">
        <div class="seg-tabs">
          <button class="seg-tab ${!f.ed ? 'active' : ''}" onclick="Rooms.filterLive('ed','')">Todas <span class="ax-n">${D.rooms.length}</span></button>
          ${cfg().buildings.map(b => `<button class="seg-tab ${f.ed === b.id ? 'active' : ''}" onclick="Rooms.filterLive('ed','${b.id}')">${esc(b.nombre.split(' · ')[0])} <span class="ax-n">${b.rooms.length}</span></button>`).join('')}
        </div>
        <div class="seg-tabs">
          <button class="seg-tab ${!f.estado ? 'active' : ''}" onclick="Rooms.filterLive('estado','')">Todas</button>
          <button class="seg-tab ${f.estado === 'open' ? 'active' : ''}" onclick="Rooms.filterLive('estado','open')">Abiertas</button>
          <button class="seg-tab ${f.estado === 'closed' ? 'active' : ''}" onclick="Rooms.filterLive('estado','closed')">Cerradas</button>
        </div>
      </div>
      <div class="rm-grid">${list.map(r => roomCard(r, now)).join('') || '<div class="empty-state">Ninguna sala coincide con el filtro.</div>'}</div>
      <section class="j-card" style="margin-top:20px;">
        <div class="j-card-title">Actividad en las puertas <span class="live-pill" style="margin-left:auto;">EN VIVO</span></div>
        <div class="feed-list">${feed(D.log.slice(-7).reverse())}</div>
        <div class="ov-links"><button class="btn btn-sm" onclick="Shell.go('rooms-log')">Ver bitácora completa</button></div>
      </section>`;
  }

  // ── Ficha de sala (modal) ──────────────────────────────────────────────
  function modal(html) {
    let m = document.getElementById('ax-modal');
    if (!m) { m = document.createElement('div'); m.id = 'ax-modal'; m.addEventListener('click', e => { if (e.target === m) m.classList.remove('open'); }); document.body.appendChild(m); }
    m.innerHTML = `<div class="ax-modal-card"><button class="icon-btn ax-modal-x" onclick="Rooms.closeModal()" aria-label="Cerrar">${ICO.x}</button>${html}</div>`;
    m.classList.add('open');
  }
  function closeModal() { const m = document.getElementById('ax-modal'); if (m) m.classList.remove('open'); }
  function openRoom(id) {
    const r = room(id), now = Date.now(), i = roomInfo(r, now);
    const occ = occList(r).map(pid => ({ p: person(pid), ts: r.occ[pid] })).filter(x => x.p).sort((a, b) => (b.p.id === r.by) - (a.p.id === r.by) || a.ts - b.ts);
    const logs = d().log.filter(e => e.roomId === id).slice(-8).reverse();
    modal(`
      <div class="ax-modal-name">${esc(r.nombre)}</div>
      <div class="ax-muted">${esc(r.edificioNombre)} · Piso ${r.piso} · ${esc(TIPO_SALA[r.tipo])} · ${r.cap} puestos</div>
      <div class="rm-modal-state">
        <span class="rm-lock ${r.open ? 'open' : ''}">${r.open ? ICO.unlock + 'Abierta' : ICO.lock + 'Cerrada'}</span>
        <span>${r.open ? (i.who ? 'A cargo: <b>' + esc(i.who.nombre) + '</b> desde las ' + hhmm(r.at) : 'Abierta a distancia por <b>' + esc(r.remote) + '</b> a las ' + hhmm(r.at)) : 'Cerradura con seguro'}</span>
        <button class="btn ${r.open ? '' : 'btn-primary'}" style="margin-left:auto;" onclick="Rooms.${r.open ? 'close' : 'remote'}('${r.id}', true)">${r.open ? ICO.lock + 'Cerrar sala' : ICO.unlock + 'Abrir a distancia'}</button>
      </div>
      ${i.c ? `<div class="rm-modal-class"><b>${esc(i.c.nombre)} · ${esc(i.c.grupoNombre)}</b><span>${hhmm(i.c.start)} a ${hhmm(i.c.end)} · ${esc(cfg().docente)}: ${esc(person(i.c.docenteId).nombre)} · Asistencia ${attStats(i.c).pct}%</span><button class="btn btn-sm" onclick="Rooms.pickClass('${i.c.id}')">Ver asistencia</button></div>` : ''}
      <div class="ax-sub-title">Quién está dentro ahora (${occ.length})</div>
      <div class="rm-occ-list">${occ.map(x => `<div class="rm-occ-row">${personCell(x.p, rolLabel(x.p) + (x.p.id === r.by ? ' · a cargo' : ''))}<span class="mono">${hhmm(x.ts)}</span></div>`).join('') || '<div class="empty-state">No hay nadie dentro.</div>'}</div>
      <div class="ax-sub-title">Últimos registros de esta puerta</div>
      <div class="feed-list">${feed(logs)}</div>
      <div class="ax-muted" style="margin-top:14px;">Último aseo: ${hhmm(r.aseo.ts)} · ${esc(r.aseo.por)}</div>
      <div class="ov-links" style="margin-top:14px;"><button class="btn btn-sm" onclick="Rooms.readerAt('${r.id}')">${ICO.scan}Probar el lector de esta sala</button></div>`);
  }

  // ── Página: Lector de sala ─────────────────────────────────────────────
  function demoCases() {
    const D = d(), x = D.demo, c = cfg();
    const fr = room(x.freeRoom), cr = room(x.cleanRoom);
    return [
      { p: x.d1, r: x.room, t: c.docente + ' con clase ahora: abre la sala' },
      { p: x.e1, r: x.room, t: c.estudiante + (kind() === 'campus' ? ' de la sección' : ' del curso') + ': marca asistencia' },
      { p: x.e2, r: x.room, t: c.estudiante + (kind() === 'campus' ? ' de otra sección' : ' de otro curso') },
      { p: x.d2, r: x.freeRoom, t: 'Sin clase ni reserva en ' + (fr ? fr.nombre : 'la sala') },
      { p: x.aseo, r: x.cleanRoom, t: 'Personal de aseo en ' + (cr ? cr.nombre : 'una sala libre') },
      { p: x.x1, r: x.room, t: 'Credencial bloqueada' },
    ].filter(k => person(k.p) && room(k.r));
  }
  function recentAt(id) { return feed(d().log.filter(e => e.roomId === id).slice(-6).reverse()); }
  function resultHTML(last) {
    if (!last) return `<div class="ax-idle"><div class="ax-idle-ring">${ICO.scan}</div><b>Esperando un código QR</b><span>Elige una sala y prueba uno de los casos de demostración.</span></div>`;
    const p = last.personId ? person(last.personId) : null, r = room(last.roomId), res = last.res;
    const title = !res.ok ? 'Acceso denegado · la puerta no abre' : res.effect === 'open' ? (last.opened ? 'Sala abierta' : 'Acceso permitido') : res.effect === 'clean' ? 'Ingreso de aseo registrado' : last.attended === 'late' ? 'Asistencia registrada con atraso' : last.attended ? 'Asistencia registrada' : 'Acceso permitido';
    return `
      <div class="ax-verdict ${res.ok ? (last.attended === 'late' ? 'warn' : 'ok') : 'no'}">
        <div class="ax-verdict-ico">${res.ok ? ICO.check : ICO.x}</div>
        <div><div class="ax-verdict-t">${title}</div><div class="ax-verdict-s">${esc(r.nombre)} · ${hhmm(last.ts)}${res.ok && res.effect === 'open' && last.opened ? ' · queda a cargo de la sala' : ''}</div></div>
      </div>
      ${p ? `<div class="ax-id"><span class="ax-av lg ${avClass(p)}">${esc(initials(p.nombre))}</span><div class="ax-id-fields">
        <div><span>Nombre</span><b>${esc(p.nombre)}</b></div><div><span>RUT</span><b class="mono">${esc(p.rut)}</b></div>
        <div><span>Perfil</span><b>${esc(rolLabel(p))}</b></div><div><span>${p.rol === 'estudiante' ? (kind() === 'campus' ? 'Carrera' : 'Curso') : 'Área'}</span><b>${esc(p.detalle || p.cargo || '—')}</b></div></div></div>`
        : `<div class="ax-id"><span class="ax-av lg">?</span><div class="ax-id-fields"><div><span>Código leído</span><b class="mono">${esc(last.code)}</b></div><div><span>Estado</span><b>No registrado</b></div></div></div>`}
      <ul class="ax-checks">${res.checks.map(x => `<li class="${x.ok ? 'ok' : 'no'}"><i>${x.ok ? ICO.check : ICO.x}</i><div><b>${esc(x.label)}</b><span>${esc(x.detail)}</span></div></li>`).join('')}</ul>
      ${!res.ok && p && p.rol === 'docente' && p.activa ? `<div class="ov-links" style="margin-top:14px;"><button class="btn btn-sm" onclick="Rooms.bookFor('${p.id}','${r.id}')">Reservarle esta sala</button></div>` : ''}`;
  }
  function pReader() {
    const D = d(), g = ui.reader;
    if (!g.roomId || !room(g.roomId)) g.roomId = D.demo.room;
    const r = room(g.roomId), i = roomInfo(r, Date.now());
    return `
      <div class="ax-gate">
        <div>
          <section class="j-card">
            <div class="j-card-title">1 · Puerta</div>
            <select class="f-input f-select" id="rm-reader-room" onchange="Rooms.setReaderRoom(this.value)" aria-label="Sala">
              ${cfg().buildings.map(b => `<optgroup label="${esc(b.nombre)}">${D.rooms.filter(x => x.edificio === b.id).map(x => `<option value="${x.id}" ${x.id === r.id ? 'selected' : ''}>${esc(x.nombre)}</option>`).join('')}</optgroup>`).join('')}
            </select>
            <div class="rm-reader-state"><span class="rm-lock ${r.open ? 'open' : ''}">${r.open ? ICO.unlock + 'Abierta' : ICO.lock + 'Cerrada'}</span><span>${i.c ? esc(i.c.nombre + ' · ' + i.c.grupoNombre + ' · ' + hhmm(i.c.start) + ' a ' + hhmm(i.c.end)) : 'Sin clase en este bloque'}</span></div>
          </section>
          <section class="j-card">
            <div class="j-card-title">2 · Código QR</div>
            <div class="ax-rut-row">
              <input class="port-input" id="rm-code" placeholder="RUT o código QR" autocomplete="off" oninput="this.value=Rooms.fmtRut(this.value)" onkeydown="if(event.key==='Enter')Rooms.scan()">
              <button class="btn btn-primary btn-lg" onclick="Rooms.scan()">${ICO.scan}Leer</button>
            </div>
            <div class="ax-hint">En la operación real, la persona acerca su QR al lector de la puerta y la cerradura decide sola. Aquí lo simulamos con el RUT.</div>
            <div class="ax-sub-title">Casos para la demostración</div>
            <div class="ax-chips">
              ${demoCases().map(k => `<button class="ax-chip" onclick="Rooms.tryCase('${k.p}','${k.r}')"><b>${esc(person(k.p).nombre.split(' ').slice(0, 2).join(' '))}</b><span>${esc(k.t)}</span></button>`).join('')}
              <button class="ax-chip" onclick="Rooms.tryCode('11.111.111-1')"><b>Código desconocido</b><span>No está en la base de datos</span></button>
            </div>
          </section>
        </div>
        <div>
          <section class="j-card ax-result-card" id="rm-result">${resultHTML(g.last)}</section>
          <section class="j-card"><div class="j-card-title">Últimos registros en ${esc(r.nombre)}</div><div class="feed-list" id="rm-recent">${recentAt(r.id)}</div></section>
        </div>
      </div>`;
  }
  function scan(codeOverride) {
    ensure();
    const inp = document.getElementById('rm-code');
    const code = codeOverride || (inp ? inp.value : '');
    if (!cleanRut(code)) { showToast('Ingresa un RUT o código.', true); return; }
    const p = findByRut(code), r = room(ui.reader.roomId);
    const res = evaluate(p, r);
    const out = register(p, r, res);
    ui.reader.last = { res, roomId: r.id, personId: p ? p.id : null, code: formatRutInput(code), ts: out.e.ts, attended: out.attended, opened: out.opened };
    render();
    if (window.innerWidth < 1100) { const el = document.getElementById('rm-result'); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
  }

  // ── Página: Asistencia ─────────────────────────────────────────────────
  function classState(c, now) { return now < c.start ? ['', 'Próxima'] : now <= c.end ? (room(c.roomId).open ? ['ok', 'En curso'] : ['warn', 'Sala sin abrir']) : ['', 'Terminada']; }
  function pAttendance() {
    const D = d(), now = Date.now();
    const order = c => (now < c.start ? 1 : now <= c.end ? 0 : 2);
    const classes = D.classes.slice().sort((a, b) => order(a) - order(b) || a.start - b.start);
    if (!ui.att.classId || !D.classes.find(c => c.id === ui.att.classId)) ui.att.classId = (classes.find(c => order(c) === 0 && room(c.roomId).open) || classes[0]).id;
    const c = D.classes.find(x => x.id === ui.att.classId), st = attStats(c), started = now >= c.start;
    const rows = c.grupo.map(id => ({ p: person(id), ts: c.att[id] })).sort((a, b) => (a.ts ? 0 : 1) - (b.ts ? 0 : 1) || (a.ts || 0) - (b.ts || 0) || a.p.nombre.localeCompare(b.p.nombre));
    return `
      <section class="j-card">
        <div class="j-card-title">Clases de hoy <span class="live-pill" style="margin-left:auto;">EN VIVO</span></div>
        <div style="overflow-x:auto;"><table class="data-table">
          <thead><tr><th>Clase</th><th>Sala</th><th>${esc(cfg().docente)}</th><th>Horario</th><th>Asistencia</th><th>Estado</th></tr></thead>
          <tbody>${classes.map(x => { const s = attStats(x), cs = classState(x, now); return `<tr class="ax-row ${x.id === c.id ? 'rm-sel' : ''}" onclick="Rooms.pickClass('${x.id}')"><td><b>${esc(x.nombre)}</b><div class="ax-muted">${esc(x.grupoNombre)}</div></td><td>${esc(room(x.roomId).nombre)}</td><td>${esc(person(x.docenteId).nombre)}</td><td class="mono" style="white-space:nowrap;">${hhmm(x.start)} a ${hhmm(x.end)}</td><td>${now >= x.start ? `<div class="rm-att"><div class="ax-bar alt"><i style="width:${s.pct}%"></i></div><b>${s.pct}%</b><span>${s.pres + s.late}/${s.g}</span></div>` : '<span class="ax-muted">Aún no empieza</span>'}</td><td>${badge(cs[0], cs[1])}</td></tr>`; }).join('')}</tbody>
        </table></div>
      </section>
      <div class="ax-toolbar" id="rm-att-detail" style="margin-top:20px;">
        <div><h3 class="rm-h3">${esc(c.nombre)} · ${esc(c.grupoNombre)}</h3><div class="ax-muted">${esc(room(c.roomId).nombre)} · ${hhmm(c.start)} a ${hhmm(c.end)} · ${esc(cfg().docente)}: ${esc(person(c.docenteId).nombre)}</div></div>
        <div class="ax-actions"><button class="btn" onclick="Rooms.exportAttendance()">${ICO.down}Exportar a Excel (CSV)</button></div>
      </div>
      <div class="kpi-row ax-kpis">
        <div class="kpi-box ax-kpi-main"><div class="kpi-value">${started ? st.pct + '%' : '—'}</div><div class="kpi-label">Asistencia</div></div>
        <div class="kpi-box"><div class="kpi-value">${st.pres}</div><div class="kpi-label">Presentes a la hora</div></div>
        <div class="kpi-box"><div class="kpi-value" style="color:${st.late ? 'var(--process)' : 'var(--text)'}">${st.late}</div><div class="kpi-label">Con atraso</div></div>
        <div class="kpi-box"><div class="kpi-value" style="color:${started && st.aus ? '#ff8a95' : 'var(--text)'}">${started ? st.aus : '—'}</div><div class="kpi-label">${now <= c.end ? 'Aún no llegan' : 'Ausentes'}</div></div>
      </div>
      <section class="j-card">
        <div class="j-card-title">Lista de ${esc(c.grupoNombre)} <span class="ax-muted" style="margin-left:auto;font-weight:400;">La asistencia se marca sola cuando cada persona pasa su QR por el lector de la sala</span></div>
        <div style="overflow-x:auto;"><table class="data-table">
          <thead><tr><th>${esc(cfg().estudiante)}</th><th>${kind() === 'campus' ? 'Carrera' : 'Curso'}</th><th>Estado</th><th>Hora de ingreso</th></tr></thead>
          <tbody>${rows.map(x => `<tr><td>${personCell(x.p)}</td><td>${esc(x.p.detalle || '')}</td><td>${!x.p.activa ? badge('bad', 'Credencial bloqueada') : x.ts ? (x.ts > c.start + LATE ? badge('warn', 'Atraso') : badge('ok', 'Presente')) : started ? badge('', now <= c.end ? 'Aún no llega' : 'Ausente') : badge('', 'Pendiente')}</td><td class="mono">${x.ts ? hhmm(x.ts) : '—'}</td></tr>`).join('')}</tbody>
        </table></div>
      </section>`;
  }

  // ── Página: Reservas ───────────────────────────────────────────────────
  function blocks() {
    const now = Date.now(), out = [{ start: now, end: now + 60 * MIN, label: 'Ahora · ' + hhmm(now) + ' a ' + hhmm(now + 60 * MIN) }];
    let t = Math.ceil((now + 10 * MIN) / (30 * MIN)) * 30 * MIN;
    for (let k = 0; k < 5; k++, t += 60 * MIN) out.push({ start: t, end: t + 60 * MIN, label: hhmm(t) + ' a ' + hhmm(t + 60 * MIN) });
    return out;
  }
  const busyIn = (r, s, e) => d().classes.find(c => c.roomId === r.id && c.start < e && s < c.end) || d().reservas.find(x => x.roomId === r.id && x.start < e && s < x.end);
  function pBooking() {
    const D = d(), now = Date.now(), b = ui.book || {};
    const reservable = D.rooms.filter(r => r.tipo !== 'biblioteca' && r.tipo !== 'restringida');
    const staff = D.people.filter(p => p.rol === 'docente').sort((a, b2) => a.nombre.localeCompare(b2.nombre));
    const free = reservable.filter(r => !r.open && !busyIn(r, now, now + 60 * MIN));
    const list = D.reservas.slice().sort((a, b2) => a.start - b2.start);
    return `
      <div class="ax-gate">
        <div>
          <section class="j-card">
            <div class="j-card-title">Nueva reserva</div>
            <div class="rm-form">
              <label>Sala<select class="f-input f-select" id="rm-b-room">${cfg().buildings.map(bd => `<optgroup label="${esc(bd.nombre)}">${reservable.filter(r => r.edificio === bd.id).map(r => `<option value="${r.id}" ${b.roomId === r.id ? 'selected' : ''}>${esc(r.nombre)} · ${r.cap} puestos</option>`).join('')}</optgroup>`).join('')}</select></label>
              <label>A nombre de<select class="f-input f-select" id="rm-b-person">${staff.map(p => `<option value="${p.id}" ${b.personId === p.id ? 'selected' : ''}>${esc(p.nombre)}</option>`).join('')}</select></label>
              <label>Horario<select class="f-input f-select" id="rm-b-block">${blocks().map((x, i) => `<option value="${x.start}|${x.end}" ${i === 0 ? 'selected' : ''}>${x.label}</option>`).join('')}</select></label>
              <label>Motivo<input class="f-input" id="rm-b-motivo" placeholder="Ej: ayudantía, reunión, recuperación de clase" value="${esc(b.motivo || '')}"></label>
              <button class="btn btn-primary" onclick="Rooms.book()">Reservar sala</button>
            </div>
            <div class="ax-hint">Quien reserva puede abrir esa sala con su QR desde 15 minutos antes y hasta el término del horario. Fuera de ese horario, la cerradura no le abre.</div>
          </section>
          <section class="j-card">
            <div class="j-card-title">Libres en la próxima hora <span class="badge" style="margin-left:auto;">${free.length}</span></div>
            <div class="rm-free">${free.map(r => `<button class="ax-chip" onclick="Rooms.prefill('${r.id}')"><b>${esc(r.nombre)}</b><span>${esc(TIPO_SALA[r.tipo])} · ${r.cap} puestos</span></button>`).join('') || '<div class="empty-state">No hay salas libres en la próxima hora.</div>'}</div>
          </section>
        </div>
        <div>
          <section class="j-card">
            <div class="j-card-title">Reservas de hoy</div>
            <div style="overflow-x:auto;"><table class="data-table">
              <thead><tr><th>Sala</th><th>Reservada por</th><th>Horario</th><th>Estado</th><th></th></tr></thead>
              <tbody>${list.map(x => { const st = now < x.start ? ['', 'Próxima'] : now <= x.end ? ['ok', 'En curso'] : ['', 'Terminada']; return `<tr><td><b>${esc(room(x.roomId).nombre)}</b><div class="ax-muted">${esc(x.motivo)}</div></td><td>${esc(person(x.personId).nombre)}</td><td class="mono" style="white-space:nowrap;">${hhmm(x.start)} a ${hhmm(x.end)}</td><td>${badge(st[0], st[1])}</td><td>${now <= x.end ? `<button class="btn btn-sm" onclick="Rooms.cancelBooking('${x.id}')">Cancelar</button>` : ''}</td></tr>`; }).join('') || '<tr class="empty-row"><td colspan="5">Sin reservas para hoy.</td></tr>'}</tbody>
            </table></div>
          </section>
        </div>
      </div>`;
  }
  function book() {
    const r = room(document.getElementById('rm-b-room').value), p = person(document.getElementById('rm-b-person').value);
    const [s, e] = document.getElementById('rm-b-block').value.split('|').map(Number);
    const motivo = document.getElementById('rm-b-motivo').value.trim() || 'Uso de sala';
    const clash = busyIn(r, s, e);
    if (clash) { showToast(r.nombre + ' ya está ocupada en ese horario (' + (clash.nombre || clash.motivo) + ').', true); return; }
    d().reservas.push({ id: 'r' + Date.now(), roomId: r.id, personId: p.id, start: s, end: e, motivo });
    ui.book = null; save(); render();
    showToast('Reserva creada: ' + p.nombre.split(' ')[0] + ' ya puede abrir ' + r.nombre + ' con su QR.');
  }

  // ── Página: Vehículos y patentes ───────────────────────────────────────
  function evalPlate(code, dir) {
    const D = d(), v = D.vehicles.find(x => x.patente === cleanPlate(code)), checks = [];
    const add = (ok, label, detail) => checks.push({ ok, label, detail });
    if (!v) { add(false, 'Patente registrada', 'La patente no está en la base de datos.'); return { ok: false, v: null, checks, motivo: 'Patente no registrada' }; }
    add(true, 'Patente registrada', v.titular + ' · ' + v.tipo);
    if (dir === 'entrada') {
      add(v.vigente, 'Permiso de ingreso', v.vigente ? 'Vigente hasta ' + v.vence : 'Venció en ' + v.vence);
      add(!v.inside, 'Sin ingreso duplicado', v.inside ? 'Este vehículo ya figura dentro desde las ' + hhmm(v.since) : 'No figura dentro del recinto');
      const n = D.vehicles.filter(x => x.inside).length;
      add(n < cfg().parking, 'Estacionamientos disponibles', (cfg().parking - n) + ' de ' + cfg().parking + ' libres');
    } else add(v.inside, 'Vehículo dentro', v.inside ? 'Ingresó a las ' + hhmm(v.since) : 'No figura dentro del recinto');
    const fail = checks.find(x => !x.ok);
    return { ok: !fail, v, checks, motivo: fail ? fail.detail : '' };
  }
  function readPlate(codeOverride) {
    const inp = document.getElementById('rm-plate');
    const code = cleanPlate(codeOverride || (inp ? inp.value : ''));
    if (code.length < 5) { showToast('Ingresa una patente.', true); return; }
    const dir = ui.veh.dir, res = evalPlate(code, dir), now = Date.now();
    if (res.ok) { res.v.inside = dir === 'entrada'; res.v.since = dir === 'entrada' ? now : null; }
    d().vlog.push({ ts: now, patente: code, titular: res.v ? res.v.titular : 'No registrado', dir, ok: res.ok, detalle: res.ok ? 'Barrera abierta' : res.motivo });
    ui.veh.last = { res: { ok: res.ok, checks: res.checks }, code, dir, ts: now, titular: res.v ? res.v.titular : null };
    save(); render();
  }
  function pVehicles() {
    const D = d(), t0 = startOfDay(), g = ui.veh, last = g.last;
    const inside = D.vehicles.filter(v => v.inside), today = D.vlog.filter(e => e.ts >= t0);
    const okV = D.vehicles.find(v => v.vigente && !v.inside), badV = D.vehicles.find(v => !v.vigente);
    return `
      <div class="kpi-row ax-kpis">
        <div class="kpi-box ax-kpi-main"><div class="kpi-value">${inside.length}</div><div class="kpi-label">Vehículos dentro ahora</div></div>
        <div class="kpi-box"><div class="kpi-value">${cfg().parking - inside.length}<small class="ax-of">/ ${cfg().parking}</small></div><div class="kpi-label">Estacionamientos libres</div></div>
        <div class="kpi-box"><div class="kpi-value">${today.filter(e => e.ok && e.dir === 'entrada').length}</div><div class="kpi-label">Ingresos hoy</div></div>
        <div class="kpi-box"><div class="kpi-value" style="color:${today.some(e => !e.ok) ? '#ff8a95' : 'var(--text)'}">${today.filter(e => !e.ok).length}</div><div class="kpi-label">Rechazados hoy</div></div>
      </div>
      <div class="ax-gate">
        <div>
          <section class="j-card">
            <div class="j-card-title">Cámara de la barrera</div>
            <div class="seg-tabs" style="margin-bottom:14px;">
              <button class="seg-tab ${g.dir === 'entrada' ? 'active' : ''}" onclick="Rooms.setVehDir('entrada')">Entrada</button>
              <button class="seg-tab ${g.dir === 'salida' ? 'active' : ''}" onclick="Rooms.setVehDir('salida')">Salida</button>
            </div>
            <div class="ax-rut-row">
              <input class="port-input" id="rm-plate" placeholder="ABCD·12" autocomplete="off" maxlength="8" oninput="this.value=Rooms.fmtPlate(this.value)" onkeydown="if(event.key==='Enter')Rooms.readPlate()">
              <button class="btn btn-primary btn-lg" onclick="Rooms.readPlate()">${ICO.scan}Leer patente</button>
            </div>
            <div class="ax-hint">En la operación real, la cámara lee la patente sola y la barrera se abre si el vehículo está autorizado.</div>
            <div class="ax-sub-title">Casos para la demostración</div>
            <div class="ax-chips">
              ${okV ? `<button class="ax-chip" onclick="Rooms.readPlate('${okV.patente}')"><b>${fmtPlate(okV.patente)}</b><span>Vehículo autorizado</span></button>` : ''}
              ${badV ? `<button class="ax-chip" onclick="Rooms.readPlate('${badV.patente}')"><b>${fmtPlate(badV.patente)}</b><span>Proveedor con permiso vencido</span></button>` : ''}
              <button class="ax-chip" onclick="Rooms.readPlate('ZZXX99')"><b>ZZXX·99</b><span>Patente no registrada</span></button>
            </div>
          </section>
          <section class="j-card ax-result-card">
            ${last ? `<div class="ax-verdict ${last.res.ok ? 'ok' : 'no'}"><div class="ax-verdict-ico">${last.res.ok ? ICO.check : ICO.x}</div><div><div class="ax-verdict-t">${last.res.ok ? (last.dir === 'entrada' ? 'Barrera abierta' : 'Salida registrada') : 'Ingreso denegado · la barrera no abre'}</div><div class="ax-verdict-s"><span class="rm-plate">${fmtPlate(last.code)}</span> ${last.titular ? '· ' + esc(last.titular) : ''} · ${hhmm(last.ts)}</div></div></div>
            <ul class="ax-checks">${last.res.checks.map(x => `<li class="${x.ok ? 'ok' : 'no'}"><i>${x.ok ? ICO.check : ICO.x}</i><div><b>${esc(x.label)}</b><span>${esc(x.detail)}</span></div></li>`).join('')}</ul>`
              : `<div class="ax-idle"><div class="ax-idle-ring">${ICO.scan}</div><b>Esperando un vehículo</b><span>Prueba uno de los casos de demostración.</span></div>`}
          </section>
        </div>
        <div>
          <section class="j-card">
            <div class="j-card-title">Últimos movimientos <span class="live-pill" style="margin-left:auto;">EN VIVO</span></div>
            <div class="feed-list">${D.vlog.slice(-6).reverse().map(e => `<div class="feed-item ${e.ok ? 'access' : 'ax-denied'}"><div class="feed-ico">${e.ok ? (e.dir === 'entrada' ? ICO.in : ICO.out) : ICO.x}</div><div class="feed-text"><b><span class="rm-plate">${fmtPlate(e.patente)}</span> ${esc(e.titular)}</b><span>${e.ok ? (e.dir === 'entrada' ? 'Entrada' : 'Salida') + ' · ' : ''}${esc(e.detalle)}</span></div><div class="feed-time">${hhmm(e.ts)}</div></div>`).join('') || '<div class="empty-state">Sin movimientos.</div>'}</div>
          </section>
          <section class="j-card">
            <div class="j-card-title">Vehículos registrados <span class="badge" style="margin-left:auto;">${D.vehicles.length}</span></div>
            <div style="overflow-x:auto;max-height:420px;overflow-y:auto;"><table class="data-table">
              <thead><tr><th>Patente</th><th>Titular</th><th>Permiso</th><th>Estado</th></tr></thead>
              <tbody>${D.vehicles.map(v => `<tr><td><span class="rm-plate">${fmtPlate(v.patente)}</span></td><td><b>${esc(v.titular)}</b><div class="ax-muted">${esc(v.tipo)}</div></td><td>${v.vigente ? badge('ok', 'Hasta ' + v.vence) : badge('bad', 'Venció ' + v.vence)}</td><td>${v.inside ? badge('ok', 'Dentro · ' + hhmm(v.since)) : badge('', 'Fuera')}</td></tr>`).join('')}</tbody>
            </table></div>
          </section>
        </div>
      </div>`;
  }

  // ── Página: Bitácora de salas ──────────────────────────────────────────
  function logRows() {
    const f = ui.log, q = f.q.trim().toLowerCase();
    return d().log.filter(e => (!f.tipo || e.tipo === f.tipo) && (!q || (e.nombre + ' ' + e.sala + ' ' + e.detalle).toLowerCase().includes(q))).slice().reverse();
  }
  function pLog() {
    const rows = logRows(), f = ui.log;
    return `
      <div class="ax-toolbar">
        <div class="ax-filters">
          <input class="f-input" id="rm-log-q" placeholder="Buscar persona o sala" value="${esc(f.q)}" oninput="Rooms.filterLog('q', this.value)">
          <select class="f-select f-input" onchange="Rooms.filterLog('tipo', this.value)" aria-label="Tipo de evento">
            <option value="">Todos los eventos</option>
            ${Object.keys(TIPO_EV).map(k => `<option value="${k}" ${f.tipo === k ? 'selected' : ''}>${TIPO_EV[k][1]}</option>`).join('')}
          </select>
        </div>
        <div class="ax-actions"><button class="btn" onclick="Rooms.exportLog()">${ICO.down}Exportar a Excel (CSV)</button></div>
      </div>
      <section class="j-card">
        <div class="j-card-title">${rows.length} ${rows.length === 1 ? 'registro' : 'registros'} de hoy</div>
        <div style="overflow-x:auto;"><table class="data-table">
          <thead><tr><th>Hora</th><th>Sala</th><th>Persona</th><th>Evento</th><th>Detalle</th></tr></thead>
          <tbody>${rows.slice(0, 200).map(e => `<tr><td class="mono">${hhmm(e.ts)}</td><td>${esc(e.sala)}</td><td><b>${esc(e.nombre)}</b><div class="ax-muted">${esc(e.personId && person(e.personId) ? rolLabel(person(e.personId)) : 'Plataforma')}</div></td><td>${evBadge(e)}</td><td>${esc(e.detalle)}</td></tr>`).join('') || '<tr class="empty-row"><td colspan="5">Ningún registro coincide con el filtro.</td></tr>'}</tbody>
        </table></div>
        ${rows.length > 200 ? '<div class="ax-muted" style="margin-top:10px;">Se muestran los 200 más recientes. El archivo exportado los incluye todos.</div>' : ''}
      </section>`;
  }

  function csv(rows, name) {
    const text = '﻿' + rows.map(r => r.map(v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"').join(';')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
    a.download = name; document.body.appendChild(a); a.click(); a.remove();
    showToast('Archivo descargado: ' + name);
  }

  // ── Movimiento en vivo ─────────────────────────────────────────────────
  function simTick() {
    const view = document.getElementById('view-rooms');
    if (!db || !db.sim || !state.currentUser || !view || !view.classList.contains('active')) return;
    const D = d(), now = Date.now();
    const live = D.classes.filter(c => c.start <= now && now <= c.end && room(c.roomId).open);
    const roll = Math.random();
    if (roll < 0.6 && live.length) {
      const c = live[Math.floor(Math.random() * live.length)];
      const pending = c.grupo.map(person).filter(p => p.activa && !p.demoAbsent && !c.att[p.id] && p.id !== D.demo.e1);
      if (pending.length) { const p = pending[Math.floor(Math.random() * pending.length)], r = room(c.roomId); register(p, r, evaluate(p, r)); }
    } else if (roll < 0.8) {
      const bib = D.rooms.find(r => r.tipo === 'biblioteca');
      const ids = bib ? occList(bib) : [];
      if (ids.length > 4) { const p = person(ids[Math.floor(Math.random() * ids.length)]); delete bib.occ[p.id]; pushLog({ ts: now, roomId: bib.id, sala: bib.nombre, personId: p.id, nombre: p.nombre, rol: p.rol, ok: true, tipo: 'salida', detalle: 'Salió de la sala' }); save(); }
    } else {
      const v = D.vehicles[Math.floor(Math.random() * D.vehicles.length)];
      if (v.vigente) { v.inside = !v.inside; v.since = v.inside ? now : null; D.vlog.push({ ts: now, patente: v.patente, titular: v.titular, dir: v.inside ? 'entrada' : 'salida', ok: true, detalle: 'Barrera abierta' }); save(); }
    }
    const m = document.getElementById('ax-modal');
    if (m && m.classList.contains('open')) return;
    const a = document.activeElement;
    if (a && (a.tagName === 'INPUT' || a.tagName === 'SELECT')) return;
    if (ui.page === 'reader') { const el = document.getElementById('rm-recent'); if (el) el.innerHTML = recentAt(ui.reader.roomId); return; }
    if (ui.page === 'live' || ui.page === 'attendance' || ui.page === 'log' || ui.page === 'vehicles') render();
  }

  // ── API pública ────────────────────────────────────────────────────────
  window.Rooms = {
    show, render, openRoom, closeModal, scan: () => scan(), book,
    remote(id, keepModal) { remoteOpen(id); render(); if (keepModal) openRoom(id); },
    close(id, keepModal) { closeRoom(id); render(); if (keepModal) openRoom(id); },
    filterLive(k, v) { ui.live[k] = v; render(); },
    setReaderRoom(id) { ui.reader.roomId = id; ui.reader.last = null; render(); },
    readerAt(id) { closeModal(); ui.reader.roomId = id; ui.reader.last = null; Shell.go('rooms-reader'); },
    tryCase(pid, rid) { ui.reader.roomId = rid; scan(person(pid).rut); },
    tryCode(code) { scan(code); },
    pickClass(id) { closeModal(); ui.att.classId = id; if (ui.page !== 'attendance') Shell.go('rooms-attendance'); else render(); const el = document.getElementById('rm-att-detail'); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); },
    bookFor(pid, rid) { ui.book = { personId: pid, roomId: rid, motivo: 'Uso de laboratorio' }; Shell.go('rooms-booking'); },
    prefill(rid) { ui.book = Object.assign({}, ui.book, { roomId: rid }); render(); },
    cancelBooking(id) { const D = d(); D.reservas = D.reservas.filter(x => x.id !== id); save(); render(); showToast('Reserva cancelada.'); },
    setVehDir(v) { ui.veh.dir = v; render(); },
    readPlate: code => readPlate(code),
    filterLog(k, v) { ui.log[k] = v; render(); if (k === 'q') { const i = document.getElementById('rm-log-q'); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } } },
    exportLog() { csv([['Hora', 'Sala', 'Persona', 'Perfil', 'Evento', 'Detalle']].concat(logRows().map(e => [hhmm(e.ts), e.sala, e.nombre, e.personId && person(e.personId) ? rolLabel(person(e.personId)) : 'Plataforma', (TIPO_EV[e.tipo] || ['', e.tipo])[1], e.detalle])), 'bitacora-salas.csv'); },
    exportAttendance() {
      const c = d().classes.find(x => x.id === ui.att.classId), now = Date.now();
      csv([['Clase', c.nombre + ' · ' + c.grupoNombre], ['Sala', room(c.roomId).nombre], ['Horario', hhmm(c.start) + ' a ' + hhmm(c.end)], [], ['Nombre', 'RUT', 'Estado', 'Hora de ingreso']].concat(c.grupo.map(person).map(p => [p.nombre, p.rut, c.att[p.id] ? (c.att[p.id] > c.start + LATE ? 'Atraso' : 'Presente') : now > c.end ? 'Ausente' : 'Aún no llega', c.att[p.id] ? hhmm(c.att[p.id]) : ''])), 'asistencia-' + c.nombre.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '.csv');
    },
    toggleSim() { db.sim = !db.sim; save(); render(); showToast(db.sim ? 'Movimiento en vivo activado.' : 'Movimiento en vivo en pausa.'); },
    reset() { localStorage.removeItem(KEY); db = null; load(); ui.reader.last = null; ui.veh.last = null; render(); showToast('Datos de demostración reiniciados.'); },
    fmtRut: formatRutInput, fmtPlate,
  };

  document.addEventListener('DOMContentLoaded', () => {
    setInterval(simTick, 5000);
    document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });
  });
})();
