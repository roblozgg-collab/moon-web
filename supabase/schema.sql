-- MoonLobby v0.12.1 — Supabase bootstrap
-- Run this whole file once in Supabase Dashboard -> SQL Editor.
-- Safe to re-run: objects are created/updated idempotently where possible.

create extension if not exists pgcrypto;

create table if not exists public.developer_claims (
  username text primary key,
  user_id uuid not null unique,
  claimed_at timestamptz not null default now()
);

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique,
  display_name text not null,
  avatar_url text,
  banner_url text,
  bio text not null default '',
  profile_gradient jsonb not null default '{"from":"#5865f2","to":"#7c3aed","angle":180}'::jsonb,
  status text not null default 'online' check (status in ('online','idle','dnd','invisible','offline')),
  plus boolean not null default false,
  plus_badge_visible boolean not null default true,
  developer boolean not null default false,
  nickname_color text not null default '#f2f3f5',
  nickname_color_enabled boolean not null default true,
  nickname_font text not null default 'default' check (nickname_font in ('default','serif','mono','rounded')),
  nickname_font_enabled boolean not null default true,
  admin_name_gradient jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_username_format check (
    username = lower(username)
    and username ~ '^[a-z0-9_.]{2,32}$'
  )
);

alter table public.profiles add column if not exists admin_name_gradient jsonb;
alter table public.profiles add column if not exists nickname_color_enabled boolean not null default true;
alter table public.profiles add column if not exists nickname_font_enabled boolean not null default true;

create table if not exists public.moon_shared_state (
  id text primary key,
  payload jsonb not null default '{
    "servers":[],"members":[],"messages":[],"notices":[],
    "directMessages":[],"friendLinks":[],"calls":[],"invites":[],
    "deletedMessageIds":[],"updatedAt":0
  }'::jsonb,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

insert into public.moon_shared_state (id)
values ('global')
on conflict (id) do nothing;

-- Keep updated_at automatic and prevent browser clients from granting themselves
-- developer badge, Plus entitlement, or admin-only nickname gradient.
create or replace function public.moon_profile_before_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.id := old.id;
  -- Browser clients may not grant themselves developer/Plus/admin-only styling.
  -- Security-definer admin RPCs set a transaction-local override flag.
  if auth.uid() is not null and coalesce(current_setting('moon.admin_override', true), '0') <> '1' then
    new.developer := old.developer;
    new.plus := old.plus;
    new.admin_name_gradient := old.admin_name_gradient;
  end if;
  new.created_at := old.created_at;
  new.username := lower(trim(new.username));
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists moon_profile_before_update_trigger on public.profiles;
create trigger moon_profile_before_update_trigger
before update on public.profiles
for each row execute function public.moon_profile_before_update();

-- Create a Moon profile whenever Supabase Auth creates a user.
create or replace function public.moon_handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  wanted_username text;
  wanted_display_name text;
  is_dev boolean := false;
begin
  wanted_username := lower(trim(coalesce(new.raw_user_meta_data ->> 'username', '')));
  if wanted_username = '' then
    wanted_username := 'user_' || substr(replace(new.id::text, '-', ''), 1, 8);
  end if;

  if wanted_username !~ '^[a-z0-9_.]{2,32}$' then
    raise exception 'Invalid Moon username';
  end if;

  wanted_display_name := trim(coalesce(new.raw_user_meta_data ->> 'display_name', wanted_username));
  if wanted_display_name = '' then wanted_display_name := wanted_username; end if;

  if wanted_username in ('stalinovskiy', 'palych') then
    insert into public.developer_claims(username, user_id)
    values (wanted_username, new.id)
    on conflict (username) do nothing;

    select exists(
      select 1 from public.developer_claims
      where username = wanted_username and user_id = new.id
    ) into is_dev;
  end if;

  insert into public.profiles (
    id, username, display_name, developer
  ) values (
    new.id, wanted_username, wanted_display_name, is_dev
  );

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.moon_handle_new_user();

-- Username availability can be checked before signup without exposing email data.
create or replace function public.moon_username_available(candidate text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    lower(trim(candidate)) ~ '^[a-z0-9_.]{2,32}$'
    and not exists (
      select 1 from public.profiles where username = lower(trim(candidate))
    );
$$;

grant execute on function public.moon_username_available(text) to anon, authenticated;

-- RLS -----------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.developer_claims enable row level security;
alter table public.moon_shared_state enable row level security;

grant select, update on table public.profiles to authenticated;
grant select, insert, update on table public.moon_shared_state to authenticated;

-- Profiles are visible to logged-in Moon users so friends/search/profile cards work.
drop policy if exists "profiles_select_authenticated" on public.profiles;
create policy "profiles_select_authenticated"
on public.profiles for select
to authenticated
using (true);

drop policy if exists "profiles_update_self" on public.profiles;
create policy "profiles_update_self"
on public.profiles for update
to authenticated
using (auth.uid() = id)
with check (auth.uid() = id);

-- developer_claims is intentionally not directly readable/writable by clients.
-- The security-definer signup trigger owns it.

-- v0.11 beta uses one persistent shared-state document so the existing Moon UI can
-- move from localStorage to cloud persistence without breaking features. All logged
-- in beta testers can read/update it. Normalize this into per-resource tables before
-- a public production launch.
drop policy if exists "moon_state_select_authenticated" on public.moon_shared_state;
create policy "moon_state_select_authenticated"
on public.moon_shared_state for select
to authenticated
using (true);

drop policy if exists "moon_state_insert_authenticated" on public.moon_shared_state;
create policy "moon_state_insert_authenticated"
on public.moon_shared_state for insert
to authenticated
with check (true);

drop policy if exists "moon_state_update_authenticated" on public.moon_shared_state;
create policy "moon_state_update_authenticated"
on public.moon_shared_state for update
to authenticated
using (true)
with check (true);

-- Realtime ------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'moon_shared_state'
  ) then
    alter publication supabase_realtime add table public.moon_shared_state;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'profiles'
  ) then
    alter publication supabase_realtime add table public.profiles;
  end if;
end $$;

-- Storage -------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'moon-media',
  'moon-media',
  true,
  26214400,
  null
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Anyone can view public Moon media; logged-in users may only write inside their
-- own UUID folder: moon-media/<auth.uid()>/...
drop policy if exists "moon_media_public_read" on storage.objects;
create policy "moon_media_public_read"
on storage.objects for select
using (bucket_id = 'moon-media');

drop policy if exists "moon_media_insert_own_folder" on storage.objects;
create policy "moon_media_insert_own_folder"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'moon-media'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "moon_media_update_own_folder" on storage.objects;
create policy "moon_media_update_own_folder"
on storage.objects for update
to authenticated
using (
  bucket_id = 'moon-media'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'moon-media'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "moon_media_delete_own_folder" on storage.objects;
create policy "moon_media_delete_own_folder"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'moon-media'
  and (storage.foldername(name))[1] = auth.uid()::text
);


-- Moon v0.12 moderation/admin --------------------------------------------------
create table if not exists public.moderation_bans (
  id uuid primary key default gen_random_uuid(),
  target_type text not null check (target_type in ('user','server')),
  target_id text not null,
  reason text not null default '',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  revoked_at timestamptz
);
create index if not exists moderation_bans_target_idx on public.moderation_bans(target_type, target_id, created_at desc);

create table if not exists public.moderation_notices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('avatar_removed','banner_removed','profile_media_removed','admin_message')),
  reason text not null default '',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  seen_at timestamptz
);
create index if not exists moderation_notices_user_idx on public.moderation_notices(user_id, created_at desc);

create or replace function public.moon_is_developer(candidate uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists(select 1 from public.profiles where id = candidate and developer = true);
$$;

grant execute on function public.moon_is_developer(uuid) to authenticated;

create or replace function public.moon_admin_ban(target_kind text, target text, reason_text text default '', duration_hours integer default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  ban_id uuid;
begin
  if not public.moon_is_developer(auth.uid()) then raise exception 'Developer access required'; end if;
  if target_kind not in ('user','server') then raise exception 'Invalid target type'; end if;
  if coalesce(trim(target),'') = '' then raise exception 'Target ID is required'; end if;
  insert into public.moderation_bans(target_type,target_id,reason,created_by,expires_at)
  values(target_kind, trim(target), coalesce(reason_text,''), auth.uid(),
    case when duration_hours is null or duration_hours <= 0 then null else now() + make_interval(hours => duration_hours) end)
  returning id into ban_id;
  return ban_id;
end;
$$;

grant execute on function public.moon_admin_ban(text,text,text,integer) to authenticated;

create or replace function public.moon_admin_unban(ban_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.moon_is_developer(auth.uid()) then raise exception 'Developer access required'; end if;
  update public.moderation_bans set revoked_at = now() where id = ban_id and revoked_at is null;
end;
$$;

grant execute on function public.moon_admin_unban(uuid) to authenticated;

create or replace function public.moon_admin_set_plus(target_user_id uuid, enabled boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.moon_is_developer(auth.uid()) then raise exception 'Developer access required'; end if;
  perform set_config('moon.admin_override','1',true);
  update public.profiles set plus = enabled, plus_badge_visible = case when enabled then true else plus_badge_visible end where id = target_user_id;
end;
$$;

grant execute on function public.moon_admin_set_plus(uuid,boolean) to authenticated;

create or replace function public.moon_admin_moderate_profile(target_user_id uuid, remove_avatar boolean, remove_banner boolean, reason_text text default '')
returns void
language plpgsql
security definer
set search_path = public
as $$
declare notice_kind text;
begin
  if not public.moon_is_developer(auth.uid()) then raise exception 'Developer access required'; end if;
  if not remove_avatar and not remove_banner then raise exception 'Select avatar and/or banner'; end if;
  perform set_config('moon.admin_override','1',true);
  update public.profiles
  set avatar_url = case when remove_avatar then null else avatar_url end,
      banner_url = case when remove_banner then null else banner_url end
  where id = target_user_id;
  notice_kind := case when remove_avatar and remove_banner then 'profile_media_removed' when remove_avatar then 'avatar_removed' else 'banner_removed' end;
  insert into public.moderation_notices(user_id,kind,reason,created_by)
  values(target_user_id, notice_kind, coalesce(reason_text,''), auth.uid());
end;
$$;

grant execute on function public.moon_admin_moderate_profile(uuid,boolean,boolean,text) to authenticated;

create or replace function public.moon_admin_set_name_gradient(color_from text, color_to text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.moon_is_developer(auth.uid()) then raise exception 'Developer access required'; end if;
  if color_from !~ '^#[0-9A-Fa-f]{6}$' or color_to !~ '^#[0-9A-Fa-f]{6}$' then raise exception 'Invalid colors'; end if;
  perform set_config('moon.admin_override','1',true);
  update public.profiles set admin_name_gradient = jsonb_build_object('from',color_from,'to',color_to) where id = auth.uid();
end;
$$;

grant execute on function public.moon_admin_set_name_gradient(text,text) to authenticated;

alter table public.moderation_bans enable row level security;
alter table public.moderation_notices enable row level security;
grant select on public.moderation_bans to authenticated;
grant select, update on public.moderation_notices to authenticated;

drop policy if exists "moderation_bans_read" on public.moderation_bans;
create policy "moderation_bans_read" on public.moderation_bans for select to authenticated
using (
  public.moon_is_developer(auth.uid())
  or target_type = 'server'
  or (target_type = 'user' and target_id = auth.uid()::text)
);

drop policy if exists "moderation_notices_read" on public.moderation_notices;
create policy "moderation_notices_read" on public.moderation_notices for select to authenticated
using (user_id = auth.uid() or public.moon_is_developer(auth.uid()));

drop policy if exists "moderation_notices_mark_seen" on public.moderation_notices;
create policy "moderation_notices_mark_seen" on public.moderation_notices for update to authenticated
using (user_id = auth.uid()) with check (user_id = auth.uid());

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='moderation_bans') then
    alter publication supabase_realtime add table public.moderation_bans;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='moderation_notices') then
    alter publication supabase_realtime add table public.moderation_notices;
  end if;
end $$;

-- Server moderation ----------------------------------------------------------
-- These RPCs validate the caller's server role on the database side before
-- changing the shared beta state. The client still mirrors the change locally
-- for instant UI feedback, but it cannot use these moderation actions without
-- the required server permission.
create or replace function public.moon_server_has_permission(target_server_id text, permission_name text, candidate uuid default auth.uid())
returns boolean
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  target_server jsonb;
  assigned jsonb;
  role_row jsonb;
begin
  if candidate is null then return false; end if;
  select server_row into target_server
  from public.moon_shared_state state_row,
       lateral jsonb_array_elements(coalesce(state_row.payload->'servers','[]'::jsonb)) server_row
  where state_row.id = 'global' and server_row->>'id' = target_server_id
  limit 1;
  if target_server is null then return false; end if;
  if target_server->>'ownerId' = candidate::text then return true; end if;
  assigned := coalesce(target_server->'roleAssignments'->candidate::text, '[]'::jsonb);
  for role_row in select value from jsonb_array_elements(coalesce(target_server->'roles','[]'::jsonb)) loop
    if assigned ? (role_row->>'id') and ((coalesce(role_row->'permissions','[]'::jsonb)) ? 'ADMINISTRATOR' or (coalesce(role_row->'permissions','[]'::jsonb)) ? permission_name) then
      return true;
    end if;
  end loop;
  return false;
end;
$$;

grant execute on function public.moon_server_has_permission(text,text,uuid) to authenticated;

create or replace function public.moon_server_ban_member(target_server_id text, target_user_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  state_payload jsonb;
  next_servers jsonb := '[]'::jsonb;
  server_row jsonb;
  next_members jsonb;
  next_banned jsonb;
begin
  if not public.moon_server_has_permission(target_server_id, 'BAN_MEMBERS', auth.uid()) then raise exception 'Missing BAN_MEMBERS permission'; end if;
  select payload into state_payload from public.moon_shared_state where id='global' for update;
  for server_row in select value from jsonb_array_elements(coalesce(state_payload->'servers','[]'::jsonb)) loop
    if server_row->>'id' = target_server_id then
      if server_row->>'ownerId' = target_user_id then raise exception 'Server owner cannot be banned'; end if;
      select coalesce(jsonb_agg(value), '[]'::jsonb) into next_members
      from jsonb_array_elements(coalesce(server_row->'memberIds','[]'::jsonb))
      where value #>> '{}' <> target_user_id;
      next_banned := coalesce(server_row->'bannedMemberIds','[]'::jsonb);
      if not (next_banned ? target_user_id) then next_banned := next_banned || jsonb_build_array(target_user_id); end if;
      server_row := jsonb_set(jsonb_set(server_row,'{memberIds}',next_members,true),'{bannedMemberIds}',next_banned,true);
    end if;
    next_servers := next_servers || jsonb_build_array(server_row);
  end loop;
  update public.moon_shared_state set payload=jsonb_set(state_payload,'{servers}',next_servers,true), updated_by=auth.uid(), updated_at=now() where id='global';
end;
$$;

grant execute on function public.moon_server_ban_member(text,text) to authenticated;

create or replace function public.moon_server_mute_member(target_server_id text, target_user_id text, duration_minutes integer default 60)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  state_payload jsonb;
  next_servers jsonb := '[]'::jsonb;
  server_row jsonb;
  muted jsonb;
  until_ms bigint;
begin
  if not public.moon_server_has_permission(target_server_id, 'MANAGE_MESSAGES', auth.uid()) then raise exception 'Missing MANAGE_MESSAGES permission'; end if;
  select payload into state_payload from public.moon_shared_state where id='global' for update;
  until_ms := floor(extract(epoch from (now() + make_interval(mins => greatest(1, duration_minutes)))) * 1000)::bigint;
  for server_row in select value from jsonb_array_elements(coalesce(state_payload->'servers','[]'::jsonb)) loop
    if server_row->>'id' = target_server_id then
      if server_row->>'ownerId' = target_user_id then raise exception 'Server owner cannot be muted'; end if;
      muted := coalesce(server_row->'mutedMembers','{}'::jsonb);
      muted := jsonb_set(muted, array[target_user_id], to_jsonb(until_ms), true);
      server_row := jsonb_set(server_row,'{mutedMembers}',muted,true);
    end if;
    next_servers := next_servers || jsonb_build_array(server_row);
  end loop;
  update public.moon_shared_state set payload=jsonb_set(state_payload,'{servers}',next_servers,true), updated_by=auth.uid(), updated_at=now() where id='global';
end;
$$;

grant execute on function public.moon_server_mute_member(text,text,integer) to authenticated;

create or replace function public.moon_server_delete_message(target_server_id text, target_message_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  state_payload jsonb;
  next_messages jsonb;
  deleted_ids jsonb;
begin
  if not public.moon_server_has_permission(target_server_id, 'MANAGE_MESSAGES', auth.uid()) then raise exception 'Missing MANAGE_MESSAGES permission'; end if;
  select payload into state_payload from public.moon_shared_state where id='global' for update;
  select coalesce(jsonb_agg(value), '[]'::jsonb) into next_messages
  from jsonb_array_elements(coalesce(state_payload->'messages','[]'::jsonb))
  where value->>'id' <> target_message_id;
  deleted_ids := coalesce(state_payload->'deletedMessageIds','[]'::jsonb);
  if not (deleted_ids ? target_message_id) then deleted_ids := deleted_ids || jsonb_build_array(target_message_id); end if;
  state_payload := jsonb_set(state_payload,'{messages}',next_messages,true);
  state_payload := jsonb_set(state_payload,'{deletedMessageIds}',deleted_ids,true);
  update public.moon_shared_state set payload=state_payload, updated_by=auth.uid(), updated_at=now() where id='global';
end;
$$;

grant execute on function public.moon_server_delete_message(text,text) to authenticated;
