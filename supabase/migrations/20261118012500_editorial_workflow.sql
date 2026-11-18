create table public.redazione_members (
  user_id uuid primary key references auth.users on delete cascade,
  role text not null check (role in ('admin','editor'))
);
alter table public.redazione_members enable row level security;
grant select on public.redazione_members to authenticated;
create policy member_self on public.redazione_members for select to authenticated using (user_id = (select auth.uid()));

create schema if not exists editorial_private;
grant usage on schema editorial_private to authenticated;
create function editorial_private.staff() returns boolean language sql stable
set search_path = '' as $$
  select exists (select 1 from public.redazione_members where user_id = (select auth.uid()))
$$;
create function editorial_private.web_session() returns boolean language sql stable
set search_path = '' as $$ select (select auth.jwt())->>'client_id' is null $$;

create table public.submissions (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null default auth.uid() references auth.users,
  kind text not null check (kind in ('article','service')),
  club text not null check (length(trim(club)) between 1 and 300),
  district text not null default '',
  signature text not null default '',
  fields jsonb not null default '{}' check (jsonb_typeof(fields) = 'object' and octet_length(fields::text) < 100000),
  original text not null default '' check (length(original) <= 100000),
  status text not null default 'received' check (status in ('received','review','changes','approved','archived')),
  created_at timestamptz not null default now(),
  check (case kind when 'article' then trim(signature) <> '' and trim(original) <> ''
    else coalesce(trim(fields->>'cosa'),'') <> '' and coalesce(trim(fields->>'dove'),'') <> ''
      and coalesce(trim(fields->>'quando'),'') <> '' end)
);
create index submissions_author on public.submissions(author_id, created_at desc);
alter table public.submissions enable row level security;
grant select on public.submissions to authenticated;
grant insert (id,kind,club,district,signature,fields,original) on public.submissions to authenticated;
grant update (status) on public.submissions to authenticated;
create policy submission_read on public.submissions for select to authenticated using (author_id = (select auth.uid()) or (select editorial_private.staff()));
create policy submission_create on public.submissions for insert to authenticated with check (author_id = (select auth.uid()) and (select editorial_private.web_session()));
create policy submission_status on public.submissions for update to authenticated using ((select editorial_private.staff()) and (select editorial_private.web_session()));

create table public.revisions (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.submissions on delete cascade,
  created_by uuid not null default auth.uid() references auth.users,
  body text not null check (length(trim(body)) between 1 and 100000),
  note text not null default '' check (length(note) <= 4000),
  source text not null default 'editor' check (source in ('editor','ai')),
  shared boolean not null default false,
  created_at timestamptz not null default now(),
  unique(submission_id,id)
);
create index revisions_item on public.revisions(submission_id, created_at desc);
alter table public.revisions enable row level security;
grant select on public.revisions to authenticated;
grant insert (submission_id,body,note,source) on public.revisions to authenticated;
grant update (shared) on public.revisions to authenticated;
create policy revision_read on public.revisions for select to authenticated using ((select editorial_private.staff()) or (shared and exists (select 1 from public.submissions where id = submission_id)));
create policy revision_insert on public.revisions for insert to authenticated with check ((select editorial_private.staff()) and created_by = (select auth.uid()) and ((select editorial_private.web_session()) or source = 'ai'));
create policy revision_share on public.revisions for update to authenticated using ((select editorial_private.staff()) and (select editorial_private.web_session()));

create table public.comments (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.submissions on delete cascade,
  revision_id uuid,
  created_by uuid not null default auth.uid() references auth.users,
  body text not null check (length(trim(body)) between 1 and 8000),
  anchor text check (length(anchor) between 1 and 1000),
  anchor_start int check (anchor_start >= 0),
  staff_note boolean not null default false,
  from_staff boolean not null default false,
  created_at timestamptz not null default now(),
  foreign key (submission_id,revision_id) references public.revisions(submission_id,id),
  check ((anchor_start is null) = (anchor is null))
);
create index comments_item on public.comments(submission_id, created_at);
alter table public.comments enable row level security;
grant select on public.comments to authenticated;
grant insert (submission_id,revision_id,body,anchor,anchor_start,staff_note) on public.comments to authenticated;
create policy comment_read on public.comments for select to authenticated using (
  exists (select 1 from public.submissions where id = submission_id) and
  (not staff_note or (select editorial_private.staff())) and
  (revision_id is null or exists (select 1 from public.revisions where id = revision_id))
);
create policy comment_write on public.comments for insert to authenticated with check (
  created_by = (select auth.uid()) and exists (select 1 from public.submissions where id = submission_id)
  and (revision_id is null or exists (select 1 from public.revisions where id = revision_id))
  and (not staff_note or (select editorial_private.staff()))
  and ((select editorial_private.web_session()) or (staff_note and (select editorial_private.staff())))
);
create function editorial_private.comment_stamp() returns trigger language plpgsql set search_path = '' as $$
begin new.from_staff := editorial_private.staff(); return new; end;
$$;
create trigger comment_stamp before insert on public.comments for each row execute function editorial_private.comment_stamp();

create table public.editor_invites (
  email text primary key check (email = lower(trim(email)) and length(email) <= 320 and position('@' in email) > 1),
  created_at timestamptz not null default now()
);
alter table public.editor_invites enable row level security;
grant select, insert, delete on public.editor_invites to authenticated;
create policy invite_admin on public.editor_invites to authenticated using (
  (select editorial_private.web_session()) and exists (select 1 from public.redazione_members where role = 'admin')
) with check (
  (select editorial_private.web_session()) and exists (select 1 from public.redazione_members where role = 'admin')
);
-- A pending invitation grants access only to the holder of the verified address.
create function editorial_private.accept_invite() returns void language plpgsql security definer set search_path = '' as $$
declare verified_email text;
begin
  if auth.uid() is null or not editorial_private.web_session() then return; end if;
  select lower(email) into verified_email from auth.users where id = auth.uid() and email_confirmed_at is not null;
  if exists (select 1 from public.editor_invites where email = verified_email for update) then
    insert into public.redazione_members(user_id,role) values (auth.uid(),'editor') on conflict do nothing;
    delete from public.editor_invites where email = verified_email;
  end if;
end $$;
revoke all on function editorial_private.accept_invite() from public;
grant execute on function editorial_private.accept_invite() to authenticated;
create function public.accept_editor_invite() returns void language sql set search_path = '' as $$
  select editorial_private.accept_invite()
$$;
revoke all on function public.accept_editor_invite() from public;
grant execute on function public.accept_editor_invite() to authenticated;

create function editorial_private.editors() returns table(email text, role text) language sql security definer set search_path = '' as $$
  select u.email::text,m.role from public.redazione_members m join auth.users u on u.id = m.user_id
  where editorial_private.web_session() and exists (select 1 from public.redazione_members where user_id = auth.uid() and role = 'admin')
  order by u.email
$$;
create function editorial_private.remove_editor(address text) returns void language sql security definer set search_path = '' as $$
  delete from public.redazione_members m using auth.users u where m.user_id = u.id and m.role = 'editor'
    and lower(u.email) = lower(trim(address)) and editorial_private.web_session()
    and exists (select 1 from public.redazione_members where user_id = auth.uid() and role = 'admin')
$$;
revoke all on function editorial_private.editors(), editorial_private.remove_editor(text) from public;
grant execute on function editorial_private.editors(), editorial_private.remove_editor(text) to authenticated;
create function public.editor_list() returns table(email text, role text) language sql set search_path = '' as $$ select * from editorial_private.editors() $$;
create function public.revoke_editor(address text) returns void language sql set search_path = '' as $$ select editorial_private.remove_editor(address) $$;
revoke all on function public.editor_list(), public.revoke_editor(text) from public;
grant execute on function public.editor_list(), public.revoke_editor(text) to authenticated;

insert into storage.buckets(id,name,public,file_size_limit) values ('editorial-attachments','editorial-attachments',false,10485760);
create policy attachment_upload on storage.objects for insert to authenticated with check (
  bucket_id = 'editorial-attachments' and (storage.foldername(name))[1] = (select auth.uid())::text
  and (select editorial_private.web_session()) and array_length(storage.foldername(name),1) = 2
);
create policy attachment_read on storage.objects for select to authenticated using (
  bucket_id = 'editorial-attachments' and (
    (storage.foldername(name))[1] = (select auth.uid())::text or
    ((select editorial_private.staff()) and exists (
      select 1 from public.submissions s where s.id::text = (storage.foldername(name))[2]
      and s.author_id::text = (storage.foldername(name))[1]
    ))
  )
);
create policy attachment_cleanup on storage.objects for delete to authenticated using (
  bucket_id = 'editorial-attachments' and (storage.foldername(name))[1] = (select auth.uid())::text
  and (select editorial_private.web_session())
  and not exists (select 1 from public.submissions where id::text = (storage.foldername(name))[2])
);

-- Remove any broad grants inherited from project defaults.
revoke all on public.redazione_members, public.submissions, public.revisions, public.comments, public.editor_invites from anon, public, authenticated;
grant select on public.redazione_members, public.submissions, public.revisions, public.comments to authenticated;
grant insert (id,kind,club,district,signature,fields,original), update (status) on public.submissions to authenticated;
grant insert (submission_id,body,note,source), update (shared) on public.revisions to authenticated;
grant insert (submission_id,revision_id,body,anchor,anchor_start,staff_note) on public.comments to authenticated;
grant select,insert,delete on public.editor_invites to authenticated;
