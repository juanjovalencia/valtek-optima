-- Valtek Optima · permisos por rol (RLS), permisos de la API y buckets privados

-- ── Seguridad a nivel de fila ──────────────────────────────────────────────
alter table public.organizations enable row level security;
alter table public.org_modules enable row level security;
alter table public.sites enable row level security;
alter table public.profiles enable row level security;
alter table public.companies enable row level security;
alter table public.memberships enable row level security;
alter table public.zones enable row level security;
alter table public.cleaning_logs enable row level security;
alter table public.people enable row level security;
alter table public.contractor_documents enable row level security;
alter table public.gates enable row level security;
alter table public.events enable row level security;
alter table public.event_registrations enable row level security;
alter table public.credentials enable row level security;
alter table public.rooms enable row level security;
alter table public.room_sessions enable row level security;
alter table public.room_session_members enable row level security;
alter table public.room_reservations enable row level security;
alter table public.attendance enable row level security;
alter table public.vehicles enable row level security;
alter table public.access_logs enable row level security;

-- Instituciones y configuración
create policy org_select on public.organizations for select to authenticated using (app.is_member(id));
create policy org_write on public.organizations for all to authenticated using (app.is_superadmin()) with check (app.is_superadmin());
create policy mod_select on public.org_modules for select to authenticated using (app.is_member(org_id));
create policy mod_write on public.org_modules for all to authenticated using (app.is_superadmin()) with check (app.is_superadmin());
create policy site_select on public.sites for select to authenticated using (app.is_member(org_id));
create policy site_write on public.sites for all to authenticated using (app.has_role(org_id, array['admin'])) with check (app.has_role(org_id, array['admin']));

-- Perfiles y membresías
create policy profile_select on public.profiles for select to authenticated using (id = (select auth.uid()) or app.shares_org(id));
create policy profile_update on public.profiles for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));
create policy member_select on public.memberships for select to authenticated using (user_id = (select auth.uid()) or app.has_role(org_id, array['admin', 'jefe']));
create policy member_write on public.memberships for all to authenticated using (app.has_role(org_id, array['admin'])) with check (app.has_role(org_id, array['admin']));

-- Aseo
create policy zone_select on public.zones for select to authenticated using (app.has_role(org_id, array['admin', 'jefe']) or assigned_to = (select auth.uid()));
create policy zone_write on public.zones for all to authenticated using (app.has_role(org_id, array['admin', 'jefe'])) with check (app.has_role(org_id, array['admin', 'jefe']));
create policy clean_select on public.cleaning_logs for select to authenticated using (app.has_role(org_id, array['admin', 'jefe']) or worker_id = (select auth.uid()));
create policy clean_insert on public.cleaning_logs for insert to authenticated with check (
  worker_id = (select auth.uid()) and app.has_role(org_id, array['trabajador'])
  and exists (select 1 from public.zones z where z.id = zone_id and z.org_id = cleaning_logs.org_id and z.assigned_to = (select auth.uid())));
create policy clean_update on public.cleaning_logs for update to authenticated using (worker_id = (select auth.uid()) and finished_at is null) with check (worker_id = (select auth.uid()));

-- Empresas, personas y documentos
create policy company_select on public.companies for select to authenticated using (app.has_role(org_id, array['admin', 'jefe', 'porteria', 'seguridad', 'guardia']) or id = app.my_company(org_id));
create policy company_write on public.companies for all to authenticated using (app.has_role(org_id, array['admin', 'seguridad'])) with check (app.has_role(org_id, array['admin', 'seguridad']));
create policy people_select on public.people for select to authenticated using (
  app.has_role(org_id, array['admin', 'jefe', 'porteria', 'seguridad', 'guardia', 'campus'])
  or (company_id is not null and company_id = app.my_company(org_id)));
create policy people_insert on public.people for insert to authenticated with check (app.has_role(org_id, array['admin', 'seguridad', 'campus', 'proveedor']));
create policy people_update on public.people for update to authenticated using (
  app.has_role(org_id, array['admin', 'seguridad', 'campus']) or (company_id is not null and company_id = app.my_company(org_id)))
  with check (app.is_member(org_id));
create policy people_delete on public.people for delete to authenticated using (app.has_role(org_id, array['admin', 'seguridad']));
create policy doc_select on public.contractor_documents for select to authenticated using (
  app.has_role(org_id, array['admin', 'porteria', 'seguridad', 'guardia'])
  or company_id = app.my_company(org_id)
  or exists (select 1 from public.people p where p.id = person_id and p.company_id = app.my_company(contractor_documents.org_id)));
create policy doc_insert on public.contractor_documents for insert to authenticated with check (
  uploaded_by = (select auth.uid()) and status = 'pendiente' and (
    app.has_role(org_id, array['admin', 'seguridad'])
    or company_id = app.my_company(org_id)
    or exists (select 1 from public.people p where p.id = person_id and p.company_id = app.my_company(contractor_documents.org_id))));
create policy doc_review on public.contractor_documents for update to authenticated using (app.has_role(org_id, array['admin', 'seguridad'])) with check (app.has_role(org_id, array['admin', 'seguridad']));
create policy doc_delete on public.contractor_documents for delete to authenticated using (app.has_role(org_id, array['admin', 'seguridad']));

-- Puntos de control, credenciales y bitácora
create policy gate_select on public.gates for select to authenticated using (app.is_member(org_id));
create policy gate_write on public.gates for all to authenticated using (app.has_role(org_id, array['admin', 'seguridad'])) with check (app.has_role(org_id, array['admin', 'seguridad']));
create policy cred_select on public.credentials for select to authenticated using (app.has_role(org_id, array['admin', 'porteria', 'seguridad', 'guardia', 'campus']));
create policy cred_write on public.credentials for all to authenticated using (app.has_role(org_id, array['admin', 'seguridad', 'campus'])) with check (app.has_role(org_id, array['admin', 'seguridad', 'campus']));
create policy log_select on public.access_logs for select to authenticated using (app.has_role(org_id, array['admin', 'jefe', 'porteria', 'seguridad', 'guardia', 'campus']));
create policy log_insert on public.access_logs for insert to authenticated with check (
  operator_id = (select auth.uid()) and app.has_role(org_id, array['admin', 'porteria', 'seguridad', 'guardia', 'campus']));

-- Eventos
create policy event_select on public.events for select to authenticated using (app.has_role(org_id, array['admin', 'porteria', 'seguridad', 'guardia']));
create policy event_write on public.events for all to authenticated using (app.has_role(org_id, array['admin'])) with check (app.has_role(org_id, array['admin']));
create policy reg_select on public.event_registrations for select to authenticated using (app.has_role(org_id, array['admin', 'porteria', 'seguridad', 'guardia']));
create policy reg_update on public.event_registrations for update to authenticated using (app.has_role(org_id, array['admin', 'porteria', 'seguridad', 'guardia'])) with check (app.has_role(org_id, array['admin', 'porteria', 'seguridad', 'guardia']));
create policy reg_delete on public.event_registrations for delete to authenticated using (app.has_role(org_id, array['admin']));

-- Salas y vehículos
create policy room_select on public.rooms for select to authenticated using (app.has_role(org_id, array['admin', 'jefe', 'porteria', 'seguridad', 'campus']));
create policy room_write on public.rooms for all to authenticated using (app.has_role(org_id, array['admin', 'campus'])) with check (app.has_role(org_id, array['admin', 'campus']));
create policy session_select on public.room_sessions for select to authenticated using (app.has_role(org_id, array['admin', 'campus']));
create policy session_write on public.room_sessions for all to authenticated using (app.has_role(org_id, array['admin', 'campus'])) with check (app.has_role(org_id, array['admin', 'campus']));
create policy smember_select on public.room_session_members for select to authenticated using (app.has_role(org_id, array['admin', 'campus']));
create policy smember_write on public.room_session_members for all to authenticated using (app.has_role(org_id, array['admin', 'campus'])) with check (app.has_role(org_id, array['admin', 'campus']));
create policy resv_select on public.room_reservations for select to authenticated using (app.has_role(org_id, array['admin', 'campus']));
create policy resv_write on public.room_reservations for all to authenticated using (app.has_role(org_id, array['admin', 'campus'])) with check (app.has_role(org_id, array['admin', 'campus']));
create policy att_select on public.attendance for select to authenticated using (app.has_role(org_id, array['admin', 'campus']));
create policy att_write on public.attendance for all to authenticated using (app.has_role(org_id, array['admin', 'campus'])) with check (app.has_role(org_id, array['admin', 'campus']));
create policy veh_select on public.vehicles for select to authenticated using (app.has_role(org_id, array['admin', 'porteria', 'seguridad', 'guardia', 'campus']));
create policy veh_write on public.vehicles for all to authenticated using (app.has_role(org_id, array['admin', 'seguridad', 'campus'])) with check (app.has_role(org_id, array['admin', 'seguridad', 'campus']));

-- ── Permisos de la API ─────────────────────────────────────────────────────
-- Sin sesión no se puede leer ni escribir ninguna tabla; solo inscribirse a un evento.
revoke all on all tables in schema public from anon;
grant usage on schema app to authenticated;
grant execute on all functions in schema app to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;
-- Un usuario solo puede editar su nombre; nunca su propio nivel de acceso.
revoke update on public.profiles from authenticated;
grant update (full_name) on public.profiles to authenticated;
revoke insert, delete on public.profiles from authenticated;
-- La bitácora no se edita ni se borra.
revoke update, delete on public.access_logs from authenticated;
revoke execute on function public.register_for_event(text, text, text, text, text, boolean) from public;
grant execute on function public.register_for_event(text, text, text, text, text, boolean) to anon, authenticated;

-- ── Almacenamiento de archivos (buckets privados) ──────────────────────────
-- Los archivos se guardan como "<org_id>/<carpeta>/<archivo>".
insert into storage.buckets (id, name, public, file_size_limit) values
  ('evidencias', 'evidencias', false, 8388608),
  ('documentos', 'documentos', false, 10485760),
  ('acreditaciones', 'acreditaciones', false, 8388608)
on conflict (id) do nothing;

create or replace function app.path_org(p_name text)
returns uuid language plpgsql immutable set search_path = '' as $$
begin
  return split_part(p_name, '/', 1)::uuid;
exception when others then
  return null;
end $$;
grant execute on function app.path_org(text) to authenticated;

create policy evidencias_read on storage.objects for select to authenticated using (
  bucket_id = 'evidencias' and (app.has_role(app.path_org(name), array['admin', 'jefe']) or owner_id = (select auth.uid())::text));
create policy evidencias_upload on storage.objects for insert to authenticated with check (
  bucket_id = 'evidencias' and app.has_role(app.path_org(name), array['admin', 'jefe', 'trabajador']));
create policy documentos_read on storage.objects for select to authenticated using (
  bucket_id = 'documentos' and (app.has_role(app.path_org(name), array['admin', 'porteria', 'seguridad', 'guardia']) or owner_id = (select auth.uid())::text));
create policy documentos_upload on storage.objects for insert to authenticated with check (
  bucket_id = 'documentos' and app.has_role(app.path_org(name), array['admin', 'seguridad', 'proveedor']));
create policy acreditaciones_read on storage.objects for select to authenticated using (
  bucket_id = 'acreditaciones' and app.has_role(app.path_org(name), array['admin', 'porteria', 'seguridad', 'guardia']));
