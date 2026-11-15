-- ============================================================================
-- Valtek Access conectado a la base de datos (etapa 3)
-- · Catálogo de documentos exigidos por institución (doc_types).
-- · Personas dentro ahora (access_presence), que solo escribe la base de datos.
-- · Motor de validación en el servidor (access_validate): revisa las reglas,
--   registra el intento en la bitácora y actualiza la presencia en un solo paso.
--   Desde ahora nadie puede escribir un acceso en la bitácora "a mano".
-- ============================================================================

-- ── Columnas nuevas ────────────────────────────────────────────────────────
alter table public.companies add column service text;            -- rubro o servicio que presta
alter table public.people add column host text;                  -- a quién visita (solo visitas)
alter table public.gates
  add column description text,
  add column sort_order int not null default 0,
  add column active boolean not null default true;
-- La bitácora guarda una copia del nombre del punto, de la empresa y de quien registró,
-- para que el registro siga completo aunque después se borren o cambien.
alter table public.access_logs
  add column gate_label text,
  add column company_name text,
  add column operator_name text;

-- ── Catálogo de documentos por institución ─────────────────────────────────
-- persona: documentos que se exigen a cada persona según su tipo (applies_to).
-- empresa: documentos que se exigen a cada empresa contratista.
-- certificacion: habilitaciones que pide un punto de control (gates.required_cert).
create table public.doc_types (
  org_id uuid not null references public.organizations on delete cascade,
  scope text not null check (scope in ('persona', 'empresa', 'certificacion')),
  code text not null,
  label text not null,
  short_label text,
  applies_to text[] not null default '{}',
  sort_order int not null default 0,
  primary key (org_id, scope, code)
);

create or replace function app.seed_doc_types(p_org uuid, p_type text)
returns void language sql security definer set search_path = '' as $$
  insert into public.doc_types (org_id, scope, code, label, short_label, applies_to, sort_order)
  select p_org, v.scope, v.code, v.label, v.short_label, v.applies_to, v.sort_order
  from (values
    -- Colegios, universidades e institutos
    ('educacion', 'persona', 'cedula', 'Cédula de identidad', 'CI', array['propio', 'contratista', 'visita'], 1),
    ('educacion', 'persona', 'antecedentes', 'Certificado de antecedentes (fines especiales)', 'Antecedentes', array['propio', 'contratista'], 2),
    ('educacion', 'persona', 'inhabilidades', 'Certificado de inhabilidades para trabajar con menores', 'Inhabilidades', array['propio', 'contratista'], 3),
    ('educacion', 'persona', 'psicologico', 'Certificado de idoneidad psicológica', 'Idoneidad', array['contratista'], 4),
    ('educacion', 'persona', 'licencia', 'Licencia de enseñanza media o certificaciones', 'Licencia', array['contratista'], 5),
    ('educacion', 'persona', 'das', 'Registro Derecho a Saber (DAS)', 'DAS', array['contratista'], 6),
    ('educacion', 'certificacion', 'cert_sec', 'Licencia SEC (instalaciones eléctricas)', 'SEC', array[]::text[], 1),
    ('educacion', 'certificacion', 'cert_altura', 'Certificación trabajo en altura', 'Altura', array[]::text[], 2),
    -- Industria, empresas, clínicas y centros comerciales
    ('industria', 'persona', 'cedula', 'Cédula de identidad', 'CI', array['propio', 'contratista', 'visita'], 1),
    ('industria', 'persona', 'contrato', 'Contrato de trabajo', 'Contrato', array['propio', 'contratista'], 2),
    ('industria', 'persona', 'examen', 'Examen pre-ocupacional', 'Examen', array['propio', 'contratista'], 3),
    ('industria', 'persona', 'induccion', 'Inducción de seguridad (ODI)', 'Inducción', array['propio', 'contratista', 'visita'], 4),
    ('industria', 'persona', 'mutual', 'Seguro Ley 16.744 (mutualidad)', 'Mutual', array['propio', 'contratista'], 5),
    ('industria', 'persona', 'epp', 'Entrega de EPP', 'EPP', array['propio', 'contratista'], 6),
    ('industria', 'certificacion', 'cert_sec', 'Licencia SEC (instalaciones eléctricas)', 'SEC', array[]::text[], 1),
    ('industria', 'certificacion', 'cert_sustancias', 'Curso manejo de sustancias peligrosas', 'SUSPEL', array[]::text[], 2),
    ('industria', 'certificacion', 'cert_altura', 'Certificación trabajo en altura', 'Altura', array[]::text[], 3),
    ('industria', 'certificacion', 'cert_grua', 'Licencia operador de grúa horquilla', 'Grúa', array[]::text[], 4),
    -- Todas las instituciones: Ley de Subcontratación
    ('todas', 'empresa', 'f30', 'Certificado F30 (antecedentes laborales)', 'F30', array[]::text[], 1),
    ('todas', 'empresa', 'f301', 'Certificado F30-1 (cumplimiento previsional)', 'F30-1', array[]::text[], 2),
    ('todas', 'empresa', 'mutual', 'Adhesión a mutualidad', 'Mutual', array[]::text[], 3),
    ('todas', 'empresa', 'contrato', 'Contrato de servicios', 'Contrato', array[]::text[], 4)
  ) as v(profile, scope, code, label, short_label, applies_to, sort_order)
  where v.profile = 'todas'
     or v.profile = case when p_type in ('colegio', 'universidad', 'instituto') then 'educacion' else 'industria' end
  on conflict do nothing
$$;
revoke execute on function app.seed_doc_types(uuid, text) from public, authenticated;

-- Cada institución nueva nace con su catálogo de documentos.
create or replace function app.on_org_created()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform app.seed_doc_types(new.id, new.type);
  return new;
end $$;
create trigger organizations_seed after insert on public.organizations
  for each row execute function app.on_org_created();

select app.seed_doc_types(id, type) from public.organizations;

-- ── Personas dentro ahora ──────────────────────────────────────────────────
-- Una fila por cada persona que está dentro del recinto y en qué punto quedó.
-- Solo la escribe access_validate: nadie puede "meter" o "sacar" gente a mano.
create table public.access_presence (
  person_id uuid primary key references public.people on delete cascade,
  org_id uuid not null references public.organizations on delete cascade,
  gate_id uuid not null references public.gates on delete cascade,
  inside_since timestamptz not null default now(),
  location_since timestamptz not null default now()
);
create index on public.access_presence (org_id);
create index on public.access_presence (gate_id);

-- ── Documento vigente de cada persona y empresa ────────────────────────────
-- De cada tipo de documento vale el último aprobado. Sin fecha de vencimiento = no vence.
create view public.current_documents with (security_invoker = true) as
select distinct on (d.org_id, d.person_id, d.company_id, d.doc_type)
       d.id, d.org_id, d.person_id, d.company_id, d.doc_type, d.expires_at, d.file_path, d.reviewed_at, d.created_at
  from public.contractor_documents d
 where d.status = 'aprobado'
 order by d.org_id, d.person_id, d.company_id, d.doc_type, d.created_at desc, d.id desc;

-- ── Reglas de integridad: nada puede apuntar a datos de otra institución ───
create or replace function app.guard_people()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  new.rut := public.rut_normalize(new.rut);
  if tg_op = 'INSERT' then
    if not app.has_role(new.org_id, array['admin', 'seguridad', 'campus']) then
      new.status := 'activa'; new.status_reason := null; new.zones := '{}';
      new.company_id := app.my_company(new.org_id);
    end if;
    new.created_by := (select auth.uid());
  else
    new.org_id := old.org_id;
    if not app.has_role(new.org_id, array['admin', 'seguridad', 'campus']) then
      new.status := old.status; new.status_reason := old.status_reason;
      new.zones := old.zones; new.company_id := old.company_id;
    end if;
  end if;
  if new.company_id is not null
     and not exists (select 1 from public.companies c where c.id = new.company_id and c.org_id = new.org_id) then
    raise exception 'La empresa no pertenece a esta institución.' using errcode = '42501';
  end if;
  return new;
end $$;

create or replace function app.guard_documents()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' then
    new.org_id := old.org_id; new.person_id := old.person_id; new.company_id := old.company_id;
  end if;
  if new.person_id is not null
     and not exists (select 1 from public.people p where p.id = new.person_id and p.org_id = new.org_id) then
    raise exception 'La persona no pertenece a esta institución.' using errcode = '42501';
  end if;
  if new.company_id is not null
     and not exists (select 1 from public.companies c where c.id = new.company_id and c.org_id = new.org_id) then
    raise exception 'La empresa no pertenece a esta institución.' using errcode = '42501';
  end if;
  -- Quién aprobó o rechazó y cuándo lo anota la base de datos, no la página.
  if tg_op = 'INSERT' then
    if new.status = 'pendiente' then
      new.reviewed_by := null; new.reviewed_at := null;
    else
      new.reviewed_by := (select auth.uid()); new.reviewed_at := now();
    end if;
  elsif new.status is distinct from old.status then
    new.reviewed_by := (select auth.uid()); new.reviewed_at := now();
  end if;
  return new;
end $$;
create trigger documents_guard before insert or update on public.contractor_documents
  for each row execute function app.guard_documents();

create or replace function app.guard_gates()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' then new.org_id := old.org_id; end if;
  new.code := upper(trim(new.code));
  new.name := trim(new.name);
  new.zone := nullif(trim(new.zone), '');
  new.required_cert := nullif(trim(new.required_cert), '');
  if new.requires_gate is not null and (
       new.requires_gate = new.id
       or not exists (select 1 from public.gates g where g.id = new.requires_gate and g.org_id = new.org_id)) then
    raise exception 'El punto anterior no es válido.' using errcode = '23514';
  end if;
  return new;
end $$;
create trigger gates_guard before insert or update on public.gates
  for each row execute function app.guard_gates();

-- Si se le cambia el nombre a una zona, las personas autorizadas conservan su permiso.
create or replace function app.rename_gate_zone()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if old.zone is not null and new.zone is not null and old.zone <> new.zone
     and not exists (select 1 from public.gates g where g.org_id = new.org_id and g.zone = old.zone) then
    update public.people set zones = array_replace(zones, old.zone, new.zone)
     where org_id = new.org_id and old.zone = any (zones);
  end if;
  return null;
end $$;
create trigger gates_zone_rename after update of zone on public.gates
  for each row execute function app.rename_gate_zone();

-- ── Motor de validación ────────────────────────────────────────────────────
-- Valida a una persona en un punto de control con las mismas reglas de la demostración:
-- credencial activa, empresa contratista habilitada, período autorizado, inducción,
-- documentación vigente, zona autorizada, certificación del punto y secuencia de acceso.
-- Siempre deja el intento en la bitácora. Con p_exception, un ingreso denegado se
-- permite y queda marcado como excepción, con el motivo y quién la registró.
create or replace function public.access_validate(p_gate uuid, p_rut text, p_direction text, p_exception text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  g public.gates; req public.gates; cur public.gates;
  p public.people; c public.companies; pr public.access_presence;
  d record;
  v_today date := (now() at time zone 'America/Santiago')::date;
  v_rut text := public.rut_normalize(p_rut);
  v_exc text := nullif(trim(coalesce(p_exception, '')), '');
  v_checks jsonb := '[]'::jsonb;
  v_org text; v_operator text; v_company text; v_kind text;
  v_in boolean := false; v_perimeter boolean; v_ok boolean; v_is_exc boolean := false;
  v_detail text; v_label text; v_loc text; v_state text;
  v_issues text[] := '{}'; v_induction text; v_has_induction boolean := false; v_required int := 0;
  v_log bigint;
begin
  select * into g from public.gates where id = p_gate;
  if not found then raise exception 'El punto de control no existe.'; end if;
  if not app.has_role(g.org_id, array['admin', 'seguridad', 'guardia', 'porteria']) then
    raise exception 'No tienes permiso para operar este punto de control.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.org_modules m where m.org_id = g.org_id and m.module = 'acceso' and m.enabled) then
    raise exception 'Tu institución no tiene activo el módulo de control de acceso.';
  end if;
  if not g.active then raise exception 'Este punto de control está desactivado.'; end if;
  if p_direction is null or p_direction not in ('entrada', 'salida') then raise exception 'Indica si es entrada o salida.'; end if;
  if v_rut is null or not public.rut_is_valid(v_rut) then raise exception 'El RUT ingresado no es válido.'; end if;

  select o.name into v_org from public.organizations o where o.id = g.org_id;
  select coalesce(nullif(pf.full_name, ''), pf.email) into v_operator from public.profiles pf where pf.id = (select auth.uid());
  v_perimeter := g.requires_gate is null;

  -- La fila de la persona queda tomada hasta terminar: dos validaciones simultáneas no se pisan.
  select * into p from public.people where org_id = g.org_id and rut = v_rut for update;
  if not found then
    v_checks := v_checks || jsonb_build_object('label', 'Persona registrada', 'ok', false,
      'detail', 'El RUT no está registrado en esta institución');
    insert into public.access_logs (org_id, kind, gate_id, gate_label, rut, direction, allowed, reason, operator_id, operator_name)
    values (g.org_id, 'acceso', g.id, g.code || ' · ' || g.name, v_rut, p_direction, false,
            'RUT no registrado en la base de datos', (select auth.uid()), v_operator)
    returning id into v_log;
    return jsonb_build_object('ok', false, 'allowed', false, 'exception', false, 'checks', v_checks,
      'person_id', null, 'rut', v_rut, 'log_id', v_log, 'at', now());
  end if;

  if p.company_id is not null then
    select * into c from public.companies where id = p.company_id and org_id = g.org_id;
  end if;
  v_kind := case p.kind when 'propio' then 'Personal propio' when 'contratista' then 'Contratista' when 'visita' then 'Visita'
                        when 'estudiante' then 'Estudiante' when 'docente' then 'Docente' else 'Funcionario' end;
  v_company := coalesce(c.name, case p.kind when 'visita' then 'Visitas' when 'contratista' then null else v_org end);
  v_checks := v_checks || jsonb_build_object('label', 'Persona registrada', 'ok', true,
    'detail', v_kind || coalesce(' · ' || v_company, ''));

  select * into pr from public.access_presence where person_id = p.id;
  if found then
    v_in := true;
    select * into cur from public.gates where id = pr.gate_id;
    v_loc := coalesce(cur.zone, case when cur.requires_gate is null then 'el recinto' else cur.name end);
  end if;

  if p_direction = 'salida' then
    v_ok := v_in and (v_perimeter or pr.gate_id = g.id);
    v_checks := v_checks || jsonb_build_object('label', 'Registro de salida', 'ok', v_ok, 'detail',
      case when v_ok then 'Se encuentra en ' || v_loc || ' desde las ' || to_char(pr.location_since at time zone 'America/Santiago', 'HH24:MI')
           when v_in then 'Está registrada en ' || v_loc || ', no en este punto'
           else 'No tiene un ingreso abierto' end);
  else
    -- 1 · Credencial
    v_checks := v_checks || jsonb_build_object('label', 'Credencial activa', 'ok', p.status <> 'suspendida', 'detail',
      case when p.status = 'suspendida' then 'Suspendida: ' || coalesce(nullif(p.status_reason, ''), 'sin motivo registrado') else 'Credencial vigente' end);

    -- 2 · Empresa contratista
    if p.kind = 'contratista' then
      if c.id is null then
        v_ok := false; v_detail := 'No tiene una empresa contratista asignada';
      elsif c.status = 'suspendida' then
        v_ok := false; v_detail := coalesce(nullif(c.status_reason, ''), 'Empresa suspendida por la institución');
      else
        select array_agg(t.label order by t.sort_order, t.code) into v_issues
          from public.doc_types t
          left join public.current_documents cd
            on cd.org_id = t.org_id and cd.company_id = c.id and cd.doc_type = t.code
         where t.org_id = g.org_id and t.scope = 'empresa'
           and (cd.id is null or cd.expires_at < v_today);
        v_ok := v_issues is null;
        v_detail := case when v_ok then 'Documentación de la empresa al día'
                         else 'Empresa con documentos vencidos o pendientes: ' || array_to_string(v_issues, ', ') end;
      end if;
      v_checks := v_checks || jsonb_build_object('label', 'Empresa contratista habilitada', 'ok', v_ok, 'detail', v_detail);
    end if;

    -- 3 · Período autorizado
    if p.valid_from is not null or p.valid_to is not null then
      v_ok := (p.valid_from is null or p.valid_from <= v_today) and (p.valid_to is null or p.valid_to >= v_today);
      v_detail := case
        when p.valid_from is null then 'hasta el ' || to_char(p.valid_to, 'DD-MM-YYYY')
        when p.valid_to is null then 'desde el ' || to_char(p.valid_from, 'DD-MM-YYYY')
        else 'del ' || to_char(p.valid_from, 'DD-MM-YYYY') || ' al ' || to_char(p.valid_to, 'DD-MM-YYYY') end;
      v_checks := v_checks || jsonb_build_object(
        'label', case when p.kind = 'visita' then 'Visita programada' else 'Período autorizado vigente' end, 'ok', v_ok, 'detail',
        case when not v_ok then 'Fuera del período autorizado (' || v_detail || ')'
             when p.valid_from = p.valid_to then 'Autorizada para hoy' || coalesce(' · Anfitrión: ' || nullif(p.host, ''), '')
             else upper(left(v_detail, 1)) || substr(v_detail, 2) end);
    end if;

    -- 4 · Inducción y documentación exigida a su tipo de persona
    v_issues := '{}';
    for d in
      select t.code, t.label, cd.id as doc_id, cd.expires_at
        from public.doc_types t
        left join public.current_documents cd
          on cd.org_id = t.org_id and cd.person_id = p.id and cd.doc_type = t.code
       where t.org_id = g.org_id and t.scope = 'persona' and p.kind = any (t.applies_to)
       order by t.sort_order, t.code
    loop
      v_required := v_required + 1;
      v_state := case when d.doc_id is null then 'pendiente'
                      when d.expires_at < v_today then 'vencido el ' || to_char(d.expires_at, 'DD-MM-YYYY') end;
      if d.code = 'induccion' then
        v_has_induction := true; v_induction := v_state;
      elsif v_state is not null then
        v_issues := v_issues || (d.label || ' ' || v_state);
      end if;
    end loop;
    if v_has_induction then
      v_checks := v_checks || jsonb_build_object('label', 'Inducción de seguridad', 'ok', v_induction is null,
        'detail', coalesce('Inducción ' || replace(v_induction, 'vencido', 'vencida'), 'Vigente'));
    end if;
    if v_required > 0 then
      v_checks := v_checks || jsonb_build_object('label', 'Documentación vigente', 'ok', cardinality(v_issues) = 0, 'detail',
        case when cardinality(v_issues) = 0 then v_required || case when v_required = 1 then ' documento al día' else ' documentos al día' end
             else array_to_string(v_issues, ' · ') end);
    end if;

    -- 5 · Zona del punto de control
    if g.zone is not null then
      v_ok := g.zone = any (p.zones);
      v_checks := v_checks || jsonb_build_object('label', 'Zona autorizada', 'ok', v_ok, 'detail',
        case when v_ok then 'Autorizado para ' || g.zone else 'No tiene autorización para ' || g.zone end);
    end if;

    -- 6 · Certificación que exige el punto
    if g.required_cert is not null then
      select t.label into v_label from public.doc_types t
       where t.org_id = g.org_id and t.scope = 'certificacion' and t.code = g.required_cert;
      select cd.id as doc_id, cd.expires_at into d from public.current_documents cd
       where cd.org_id = g.org_id and cd.person_id = p.id and cd.doc_type = g.required_cert;
      v_ok := found and (d.expires_at is null or d.expires_at >= v_today);
      v_checks := v_checks || jsonb_build_object('label', coalesce(v_label, g.required_cert), 'ok', v_ok, 'detail',
        case when not found then 'Sin certificación registrada'
             when d.expires_at is null then 'Vigente, sin vencimiento'
             when d.expires_at < v_today then 'Vencida el ' || to_char(d.expires_at, 'DD-MM-YYYY')
             else 'Vigente hasta el ' || to_char(d.expires_at, 'DD-MM-YYYY') end);
    end if;

    -- 7 · Secuencia de acceso (anti-passback)
    if v_perimeter then
      v_ok := not v_in;
      v_detail := case when v_ok then 'Sin ingresos abiertos' else 'Ya registra un ingreso sin salida (anti-passback)' end;
    else
      select * into req from public.gates where id = g.requires_gate;
      -- Si el punto anterior es una entrada al recinto, sirve haber entrado por cualquiera de ellas.
      v_ok := v_in and (pr.gate_id = g.requires_gate or (req.requires_gate is null and cur.requires_gate is null));
      v_detail := case when v_ok then 'Validó antes en ' || req.name
                       when v_in and pr.gate_id = g.id then 'Ya está dentro de esta zona (anti-passback)'
                       else 'Debe validar primero en ' || req.name end;
    end if;
    v_checks := v_checks || jsonb_build_object('label', 'Secuencia de acceso', 'ok', v_ok, 'detail', v_detail);
  end if;

  select coalesce(bool_and((x ->> 'ok')::boolean), true) into v_ok from jsonb_array_elements(v_checks) x;
  select x ->> 'detail' into v_detail
    from jsonb_array_elements(v_checks) with ordinality as t(x, n)
   where not (x ->> 'ok')::boolean order by n limit 1;

  if not v_ok and v_exc is not null and p_direction = 'entrada' then
    if length(v_exc) < 5 then raise exception 'Indica el motivo y quién autoriza la excepción.'; end if;
    v_is_exc := true;
  end if;

  insert into public.access_logs (org_id, kind, gate_id, gate_label, person_id, rut, full_name, company_name,
                                  direction, allowed, reason, exception_reason, operator_id, operator_name)
  values (g.org_id, 'acceso', g.id, g.code || ' · ' || g.name, p.id, p.rut, p.full_name, v_company,
          p_direction, v_ok or v_is_exc, case when v_ok then null else v_detail end,
          case when v_is_exc then v_exc end, (select auth.uid()), v_operator)
  returning id into v_log;

  if v_ok or v_is_exc then
    if p_direction = 'entrada' then
      insert into public.access_presence (person_id, org_id, gate_id, inside_since, location_since)
      values (p.id, g.org_id, g.id, now(), now())
      on conflict (person_id) do update
        set gate_id = excluded.gate_id, location_since = excluded.location_since,
            inside_since = case when v_perimeter then excluded.inside_since else public.access_presence.inside_since end;
    elsif v_perimeter then
      delete from public.access_presence where person_id = p.id;
    else
      update public.access_presence set gate_id = g.requires_gate, location_since = now() where person_id = p.id;
    end if;
  end if;

  return jsonb_build_object('ok', v_ok, 'allowed', v_ok or v_is_exc, 'exception', v_is_exc, 'checks', v_checks,
    'person_id', p.id, 'rut', p.rut, 'log_id', v_log, 'at', now());
end $$;

-- ── Permisos por fila ──────────────────────────────────────────────────────
alter table public.doc_types enable row level security;
alter table public.access_presence enable row level security;

create policy doctype_select on public.doc_types for select to authenticated using (app.is_member(org_id));
create policy doctype_write on public.doc_types for all to authenticated
  using (app.has_role(org_id, array['admin', 'seguridad'])) with check (app.has_role(org_id, array['admin', 'seguridad']));
create policy presence_select on public.access_presence for select to authenticated
  using (app.has_role(org_id, array['admin', 'jefe', 'porteria', 'seguridad', 'guardia', 'campus']));

-- Administración y seguridad registran un documento ya revisado (queda aprobado de inmediato);
-- la empresa contratista solo puede subirlo como pendiente de revisión.
drop policy doc_insert on public.contractor_documents;
create policy doc_insert on public.contractor_documents for insert to authenticated with check (
  uploaded_by = (select auth.uid()) and (
    app.has_role(org_id, array['admin', 'seguridad'])
    or (status = 'pendiente' and (
      company_id = app.my_company(org_id)
      or exists (select 1 from public.people p where p.id = person_id and p.company_id = app.my_company(contractor_documents.org_id))))));

-- Los accesos por garita solo entran a la bitácora a través de access_validate.
drop policy log_insert on public.access_logs;
create policy log_insert on public.access_logs for insert to authenticated with check (
  kind <> 'acceso' and operator_id = (select auth.uid())
  and app.has_role(org_id, array['admin', 'porteria', 'seguridad', 'guardia', 'campus']));

-- ── Permisos de la API ─────────────────────────────────────────────────────
revoke all on public.doc_types, public.access_presence, public.current_documents from public, anon, authenticated;
grant select, insert, update, delete on public.doc_types to authenticated;
grant select on public.access_presence, public.current_documents to authenticated;
revoke execute on function public.access_validate(uuid, text, text, text) from public, anon;
grant execute on function public.access_validate(uuid, text, text, text) to authenticated;
