-- Roles are assigned to a specific account after direct verification.
create or replace function public.accept_editor_invite() returns void language sql set search_path = '' as $$ select null::void $$;
revoke execute on function editorial_private.accept_invite() from authenticated;
revoke insert on public.editor_invites from authenticated;

create function editorial_private.grant_editor(account_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not editorial_private.web_session() or not exists (
    select 1 from public.redazione_members where user_id = auth.uid() and role = 'admin'
  ) then
    raise exception 'Solo la Direzione può aggiungere redattori';
  end if;
  if not exists (select 1 from auth.users where id = account_id) then
    raise exception 'Codice account non trovato';
  end if;
  insert into public.redazione_members(user_id,role) values (account_id,'editor') on conflict do nothing;
end $$;
revoke all on function editorial_private.grant_editor(uuid) from public, anon;
grant execute on function editorial_private.grant_editor(uuid) to authenticated;
create function public.grant_editor(account_id uuid) returns void language sql set search_path = '' as $$
  select editorial_private.grant_editor(account_id)
$$;
revoke all on function public.grant_editor(uuid) from public, anon;
grant execute on function public.grant_editor(uuid) to authenticated;
