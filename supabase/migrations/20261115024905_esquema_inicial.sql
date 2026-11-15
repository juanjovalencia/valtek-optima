-- ============================================================================
-- Valtek Optima · esquema inicial multi-cliente
-- Cada fila pertenece a una institución (org_id) y solo la ven las personas
-- con una membresía en esa institución, según su rol (Row Level Security).
-- ============================================================================

create schema if not exists app;

-- ── Utilidades ─────────────────────────────────────────────────────────────
-- Valida un RUT chileno (módulo 11). Acepta puntos y guion.
create or replace function public.rut_is_valid(p_rut text)
returns boolean language plpgsql immutable set search_path = '' as $$
declare
  c text := upper(regexp_replace(coalesce(p_rut, ''), '[^0-9kK]', '', 'g'));
  body text; dv text; s int := 0; m int := 2; r int; i int;
begin
  if length(c) < 2 then return false; end if;
  body := left(c, length(c) - 1); dv := right(c, 1);
  if body !~ '^[0-9]+$' then return false; end if;
  for i in reverse length(body)..1 loop
    s := s + substr(body, i, 1)::int * m;
    m := case when m = 7 then 2 else m + 1 end;
  end loop;
  r := 11 - (s % 11);
  return dv = case r when 11 then '0' when 10 then 'K' else r::text end;
end $$;

-- Deja el RUT en formato único "12345678-9" para guardar y comparar.
create or replace function public.rut_normalize(p_rut text)
returns text language sql immutable set search_path = '' as $$
  select case when length(c) < 2 then null else left(c, length(c) - 1) || '-' || right(c, 1) end
  from (select upper(regexp_replace(coalesce(p_rut, ''), '[^0-9kK]', '', 'g')) as c) t
$$;

-- ── Instituciones, usuarios y roles ────────────────────────────────────────
create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type text not null check (type in ('colegio', 'universidad', 'instituto', 'clinica', 'mall', 'industria', 'empresa')),
  city text,
  plan text not null default 'Profesional',
  created_at timestamptz not null default now()
);

create table public.org_modules (
  org_id uuid not null references public.organizations on delete cascade,
  module text not null check (module in ('aseo', 'acceso', 'contratistas', 'eventos', 'salas')),
  enabled boolean not null default true,
  primary key (org_id, module)
);

create table public.sites (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations on delete cascade,
  name text not null,
  address text,
  created_at timestamptz not null default now()
);
create index on public.sites (org_id);

-- Un perfil por cada cuenta de Supabase Auth.
create table public.profiles (
  id uuid primary key references auth.users on delete cascade,
  full_name text not null default '',
  email text,
  is_superadmin boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.companies (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations on delete cascade,
  name text not null,
  rut text,
  kind text not null default 'contratista' check (kind in ('propio', 'contratista', 'visitas')),
  status text not null default 'habilitada' check (status in ('habilitada', 'suspendida')),
  status_reason text,
  created_at timestamptz not null default now()
);
create index on public.companies (org_id);

-- Qué rol tiene cada usuario en cada institución.
create table public.memberships (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations on delete cascade,
  user_id uuid not null references public.profiles on delete cascade,
  role text not null check (role in ('admin', 'jefe', 'trabajador', 'proveedor', 'porteria', 'seguridad', 'guardia', 'campus')),
  company_id uuid references public.companies on delete set null, -- solo para el rol proveedor
  created_at timestamptz not null default now(),
  unique (org_id, user_id)
);
create index on public.memberships (user_id);

-- ── Funciones de permisos (usadas por las políticas) ───────────────────────
create or replace function app.is_superadmin()
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select p.is_superadmin from public.profiles p where p.id = (select auth.uid())), false)
$$;

create or replace function app.is_member(p_org uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select app.is_superadmin()
      or exists (select 1 from public.memberships m where m.org_id = p_org and m.user_id = (select auth.uid()))
$$;

create or replace function app.has_role(p_org uuid, p_roles text[])
returns boolean language sql stable security definer set search_path = '' as $$
  select app.is_superadmin()
      or exists (select 1 from public.memberships m where m.org_id = p_org and m.user_id = (select auth.uid()) and m.role = any (p_roles))
$$;

create or replace function app.my_company(p_org uuid)
returns uuid language sql stable security definer set search_path = '' as $$
  select m.company_id from public.memberships m where m.org_id = p_org and m.user_id = (select auth.uid())
$$;

create or replace function app.shares_org(p_user uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select app.is_superadmin() or exists (
    select 1 from public.memberships mine join public.memberships theirs on theirs.org_id = mine.org_id
    where mine.user_id = (select auth.uid()) and theirs.user_id = p_user)
$$;

-- Crea el perfil cuando se registra una cuenta nueva.
create or replace function app.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data ->> 'full_name', ''))
  on conflict (id) do nothing;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function app.handle_new_user();

-- ── Módulo Aseo ────────────────────────────────────────────────────────────
create table public.zones (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations on delete cascade,
  site_id uuid references public.sites on delete set null,
  name text not null,
  sector text,
  sort_order int not null default 0,
  assigned_to uuid references public.profiles on delete set null,
  status text not null default 'pendiente' check (status in ('pendiente', 'en-proceso', 'limpio')),
  updated_at timestamptz not null default now()
);
create index on public.zones (org_id);
create index on public.zones (assigned_to);

create table public.cleaning_logs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations on delete cascade,
  zone_id uuid not null references public.zones on delete cascade,
  worker_id uuid not null references public.profiles on delete restrict,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  diagnosis text check (diagnosis in ('excelente', 'regular', 'malo')),
  comment text,
  photo_before text, -- ruta en el bucket "evidencias"
  photo_after text
);
create index on public.cleaning_logs (org_id, started_at desc);
-- Regla del negocio: una persona solo puede tener una zona "en proceso" a la vez.
create unique index cleaning_one_open_per_worker on public.cleaning_logs (worker_id) where finished_at is null;

create or replace function app.sync_zone_status()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.zones
     set status = case when new.finished_at is null then 'en-proceso' else 'limpio' end, updated_at = now()
   where id = new.zone_id;
  return new;
end $$;
create trigger cleaning_logs_sync after insert or update of finished_at on public.cleaning_logs
  for each row execute function app.sync_zone_status();

-- ── Módulo Acceso: personas, documentos, puntos de control y bitácora ──────
create table public.people (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations on delete cascade,
  company_id uuid references public.companies on delete set null,
  rut text not null check (public.rut_is_valid(rut)),
  full_name text not null,
  kind text not null default 'contratista' check (kind in ('propio', 'contratista', 'visita', 'estudiante', 'docente', 'funcionario')),
  job_title text,
  status text not null default 'activa' check (status in ('activa', 'suspendida')),
  status_reason text,
  zones text[] not null default '{}',
  valid_from date,
  valid_to date,
  created_by uuid references public.profiles on delete set null,
  created_at timestamptz not null default now(),
  unique (org_id, rut)
);
create index on public.people (org_id, company_id);

-- Solo administración, seguridad y dirección de campus pueden cambiar el estado o las zonas de una persona.
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
  elsif not app.has_role(new.org_id, array['admin', 'seguridad', 'campus']) then
    new.status := old.status; new.status_reason := old.status_reason;
    new.zones := old.zones; new.company_id := old.company_id; new.org_id := old.org_id;
  end if;
  return new;
end $$;
create trigger people_guard before insert or update on public.people
  for each row execute function app.guard_people();

create table public.contractor_documents (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations on delete cascade,
  person_id uuid references public.people on delete cascade,
  company_id uuid references public.companies on delete cascade,
  doc_type text not null,
  expires_at date,
  file_path text, -- ruta en el bucket "documentos"
  status text not null default 'pendiente' check (status in ('pendiente', 'aprobado', 'rechazado')),
  review_note text,
  reviewed_by uuid references public.profiles on delete set null,
  reviewed_at timestamptz,
  uploaded_by uuid references public.profiles on delete set null,
  created_at timestamptz not null default now(),
  check (num_nonnulls(person_id, company_id) = 1)
);
create index on public.contractor_documents (org_id, person_id);
create index on public.contractor_documents (org_id, company_id);

create table public.gates (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations on delete cascade,
  site_id uuid references public.sites on delete set null,
  code text not null,
  name text not null,
  kind text not null default 'puerta' check (kind in ('garita', 'torniquete', 'zona', 'puerta', 'barrera')),
  requires_gate uuid references public.gates on delete set null,
  zone text,
  required_cert text,
  unique (org_id, code)
);

-- ── Módulo Eventos ─────────────────────────────────────────────────────────
create table public.events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations on delete cascade,
  site_id uuid references public.sites on delete set null,
  name text not null,
  description text,
  starts_at timestamptz not null,
  ends_at timestamptz,
  capacity int,
  public_token text not null unique default replace(gen_random_uuid()::text, '-', ''),
  status text not null default 'abierto' check (status in ('abierto', 'cerrado')),
  created_by uuid references public.profiles on delete set null,
  created_at timestamptz not null default now()
);
create index on public.events (org_id, starts_at);

create table public.event_registrations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations on delete cascade,
  event_id uuid not null references public.events on delete cascade,
  rut text not null check (public.rut_is_valid(rut)),
  full_name text not null,
  email text,
  phone text,
  id_front_path text, -- rutas en el bucket "acreditaciones"
  id_back_path text,
  selfie_path text,
  consent_at timestamptz not null, -- consentimiento Ley 19.628
  status text not null default 'pendiente' check (status in ('pendiente', 'aprobado', 'rechazado')),
  reviewed_by uuid references public.profiles on delete set null,
  reviewed_at timestamptz,
  p1_at timestamptz,
  p2_at timestamptz,
  purge_after date, -- los datos del visitante se eliminan 30 días después del evento
  created_at timestamptz not null default now(),
  unique (event_id, rut)
);
create index on public.event_registrations (org_id, event_id);

-- Registro público a un evento con su enlace: es la única escritura permitida sin iniciar sesión.
create or replace function public.register_for_event(p_token text, p_rut text, p_full_name text, p_email text, p_phone text, p_consent boolean)
returns uuid language plpgsql security definer set search_path = '' as $$
declare ev public.events; new_id uuid;
begin
  select * into ev from public.events where public_token = p_token and status = 'abierto';
  if not found then raise exception 'El evento no existe o ya cerró sus inscripciones.'; end if;
  if not coalesce(p_consent, false) then raise exception 'Debes aceptar el tratamiento de tus datos.'; end if;
  if not public.rut_is_valid(p_rut) then raise exception 'El RUT no es válido.'; end if;
  if length(trim(coalesce(p_full_name, ''))) < 3 then raise exception 'Ingresa tu nombre completo.'; end if;
  insert into public.event_registrations (org_id, event_id, rut, full_name, email, phone, consent_at, purge_after)
  values (ev.org_id, ev.id, public.rut_normalize(p_rut), trim(p_full_name), nullif(trim(p_email), ''), nullif(trim(p_phone), ''),
          now(), (coalesce(ev.ends_at, ev.starts_at) + interval '30 days')::date)
  returning id into new_id;
  return new_id;
exception when unique_violation then
  raise exception 'Este RUT ya está inscrito en el evento.';
end $$;

-- ── Credenciales y bitácora de accesos ─────────────────────────────────────
create table public.credentials (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations on delete cascade,
  person_id uuid references public.people on delete cascade,
  registration_id uuid references public.event_registrations on delete cascade,
  kind text not null default 'qr' check (kind in ('qr', 'tarjeta', 'patente')),
  token_hash text not null, -- nunca se guarda el código en claro
  valid_from timestamptz not null default now(),
  valid_to timestamptz,
  status text not null default 'activa' check (status in ('activa', 'revocada')),
  created_at timestamptz not null default now(),
  unique (org_id, token_hash)
);

-- ── Módulo Salas: cerraduras con QR, clases, reservas, asistencia, vehículos ─
create table public.rooms (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations on delete cascade,
  site_id uuid references public.sites on delete set null,
  code text not null,
  name text not null,
  building text,
  floor int,
  kind text not null default 'sala' check (kind in ('sala', 'lab', 'estudio', 'reunion', 'biblioteca', 'auditorio', 'restringida')),
  capacity int not null default 30,
  is_open boolean not null default false,
  opened_by uuid references public.people on delete set null,
  opened_at timestamptz,
  unique (org_id, code)
);

create table public.room_sessions ( -- clases del horario
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations on delete cascade,
  room_id uuid not null references public.rooms on delete cascade,
  title text not null,
  group_name text,
  teacher_id uuid references public.people on delete set null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  check (ends_at > starts_at)
);
create index on public.room_sessions (org_id, room_id, starts_at);

create table public.room_session_members (
  session_id uuid not null references public.room_sessions on delete cascade,
  person_id uuid not null references public.people on delete cascade,
  org_id uuid not null references public.organizations on delete cascade,
  primary key (session_id, person_id)
);

create table public.room_reservations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations on delete cascade,
  room_id uuid not null references public.rooms on delete cascade,
  person_id uuid not null references public.people on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  reason text,
  created_by uuid references public.profiles on delete set null,
  created_at timestamptz not null default now(),
  check (ends_at > starts_at)
);
create index on public.room_reservations (org_id, room_id, starts_at);

create table public.attendance (
  session_id uuid not null references public.room_sessions on delete cascade,
  person_id uuid not null references public.people on delete cascade,
  org_id uuid not null references public.organizations on delete cascade,
  scanned_at timestamptz not null default now(),
  primary key (session_id, person_id)
);

create table public.vehicles (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations on delete cascade,
  plate text not null,
  holder text not null,
  person_id uuid references public.people on delete set null,
  company_id uuid references public.companies on delete set null,
  valid_to date,
  status text not null default 'activa' check (status in ('activa', 'suspendida')),
  unique (org_id, plate)
);

-- Bitácora única y auditable: solo se agregan filas, nadie las edita ni las borra.
create table public.access_logs (
  id bigint generated always as identity primary key,
  org_id uuid not null references public.organizations on delete cascade,
  kind text not null default 'acceso' check (kind in ('acceso', 'sala', 'vehiculo', 'evento')),
  gate_id uuid references public.gates on delete set null,
  room_id uuid references public.rooms on delete set null,
  person_id uuid references public.people on delete set null,
  registration_id uuid references public.event_registrations on delete set null,
  rut text,
  full_name text,
  plate text,
  direction text check (direction in ('entrada', 'salida')),
  allowed boolean not null,
  reason text,
  exception_reason text,
  operator_id uuid references public.profiles on delete set null,
  created_at timestamptz not null default now()
);
create index on public.access_logs (org_id, created_at desc);
create index on public.access_logs (org_id, person_id);
