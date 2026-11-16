-- ============================================================================
-- Ajustes de Valtek Access después de la prueba con una cuenta real
-- 1. Permisos sobrantes: las cuentas ya no conservan TRUNCATE, REFERENCES ni
--    TRIGGER sobre las tablas (venían por defecto y la página no los usa), y las
--    tablas nuevas nacen sin ningún permiso para quien no ha iniciado sesión.
-- 2. Bitácora más clara: cuando se deniega por una certificación, el registro
--    dice cuál ("Licencia SEC: vencida el 01-11-2026"), y cuando la empresa está
--    suspendida lo dice explícitamente ("Empresa suspendida: motivo").
-- ============================================================================

-- ── 1 · Permisos sobrantes ─────────────────────────────────────────────────
revoke truncate, references, trigger on all tables in schema public from anon, authenticated;
alter default privileges in schema public revoke truncate, references, trigger on tables from authenticated;
-- Desde ahora, una tabla nueva solo queda visible sin sesión si una migración lo permite a propósito.
alter default privileges in schema public revoke all on tables from anon;

-- ── 2 · Motor de validación: detalle más claro en la bitácora ──────────────
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
  v_detail text; v_label text; v_loc text; v_state text; v_cert_label text; v_fail_label text;
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
        v_ok := false; v_detail := 'Empresa suspendida' || coalesce(': ' || nullif(c.status_reason, ''), ' por la institución');
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
      v_cert_label := coalesce(v_label, g.required_cert);
      v_checks := v_checks || jsonb_build_object('label', v_cert_label, 'ok', v_ok, 'detail',
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
  select x ->> 'label', x ->> 'detail' into v_fail_label, v_detail
    from jsonb_array_elements(v_checks) with ordinality as t(x, n)
   where not (x ->> 'ok')::boolean order by n limit 1;
  -- En la bitácora, una certificación que falla se anota con su nombre, para que el registro se entienda solo.
  if v_cert_label is not null and v_fail_label = v_cert_label then
    v_detail := v_cert_label || ': ' || lower(left(v_detail, 1)) || substr(v_detail, 2);
  end if;

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
