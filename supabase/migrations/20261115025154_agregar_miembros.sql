-- Agrega (o cambia de rol) a una persona en una institución, usando su correo.
-- Solo lo puede hacer la administración de esa institución o el super admin.
create or replace function public.add_member(p_org uuid, p_email text, p_role text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare target uuid; new_id uuid;
begin
  if not app.has_role(p_org, array['admin']) then
    raise exception 'No tienes permiso para administrar esta institución.' using errcode = '42501';
  end if;
  select id into target from public.profiles where lower(email) = lower(trim(p_email));
  if target is null then
    raise exception 'Esa persona todavía no ha creado su cuenta en Valtek Optima. Pídele que se registre con ese correo y vuelve a intentarlo.';
  end if;
  insert into public.memberships (org_id, user_id, role) values (p_org, target, p_role)
  on conflict (org_id, user_id) do update set role = excluded.role
  returning id into new_id;
  return new_id;
end $$;
revoke execute on function public.add_member(uuid, text, text) from public, anon;
grant execute on function public.add_member(uuid, text, text) to authenticated;
