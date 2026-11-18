create table editorial_private.mcp_keys (
  user_id uuid primary key references auth.users on delete cascade,
  key_hash bytea not null unique,
  expires_at timestamptz not null
);
create function public.manage_mcp_key(revoke_key boolean default false)
returns text language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid(); token text;
begin
  if not editorial_private.web_session() or not exists(select 1 from public.redazione_members where user_id=actor) then
    raise exception 'Accesso riservato alla redazione';
  end if;
  if revoke_key then
    delete from editorial_private.mcp_keys where user_id=actor;
    return null;
  end if;
  token := 'lion_mcp_' || encode(extensions.gen_random_bytes(32),'hex');
  insert into editorial_private.mcp_keys values(actor,extensions.digest(token,'sha256'),now()+interval '90 days')
  on conflict(user_id) do update set key_hash=excluded.key_hash,expires_at=excluded.expires_at;
  return token;
end $$;
revoke all on function public.manage_mcp_key(boolean) from public,anon;
grant execute on function public.manage_mcp_key(boolean) to authenticated;

create function public.editorial_mcp(mcp_key text, operation text, args jsonb default '{}')
returns jsonb language plpgsql security definer set search_path = '' as $$
declare actor uuid; item_id uuid; output jsonb; pattern text;
begin
  if mcp_key !~ '^lion_mcp_[a-f0-9]{64}$' then return null; end if;
  select k.user_id into actor from editorial_private.mcp_keys k join public.redazione_members m using(user_id)
    where k.key_hash=extensions.digest(mcp_key,'sha256') and k.expires_at>now();
  if actor is null then return null; end if;
  if operation='verify' then return 'true'::jsonb; end if;
  if operation='search' then
    pattern := coalesce(left(args->>'query',200),'');
    return jsonb_build_object('results',coalesce((select jsonb_agg(to_jsonb(t)) from (
      select id,left(split_part(coalesce(nullif(original,''),fields->>'cosa',club),chr(10),1),120) as title
      from public.submissions where strpos(lower(club),lower(pattern))>0 order by created_at desc limit 25
    ) t),'[]'::jsonb));
  end if;
  item_id := (args->>'id')::uuid;
  case operation
    when 'fetch' then
      select jsonb_build_object('item',to_jsonb(s)-'author_id',
        'versions',coalesce((select jsonb_agg(to_jsonb(r)-'created_by') from
          (select * from public.revisions where submission_id=item_id order by created_at desc limit 10) r),'[]'::jsonb),
        'comments',coalesce((select jsonb_agg(to_jsonb(c)-'created_by') from
          (select * from public.comments where submission_id=item_id order by created_at desc limit 50) c),'[]'::jsonb))
      into output from public.submissions s where s.id=item_id;
      if output is null then raise exception 'Invio non disponibile'; end if;
    when 'salva_revisione' then
      insert into public.revisions(submission_id,body,note,source,created_by)
        values(item_id,trim(args->>'testo'),coalesce(args->>'nota',''),'ai',actor)
        returning jsonb_build_object('id',id,'shared',shared) into output;
    when 'aggiungi_nota' then
      insert into public.comments(submission_id,revision_id,body,staff_note,created_by)
        values(item_id,(args->>'revisione')::uuid,trim(args->>'nota'),true,actor)
        returning jsonb_build_object('id',id) into output;
    else raise exception 'Operazione non disponibile';
  end case;
  return output;
end $$;
revoke all on function public.editorial_mcp(text,text,jsonb) from public,authenticated;
grant execute on function public.editorial_mcp(text,text,jsonb) to anon;
