-- Moon Web v0.11.0 — Supabase bootstrap
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
  nickname_font text not null default 'default' check (nickname_font in ('default','serif','mono','rounded')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_username_format check (
    username = lower(username)
    and username ~ '^[a-z0-9_.]{2,32}$'
  )
);

create table if not exists public.moon_shared_state (
  id text primary key,
  payload jsonb not null default '{
    "servers":[],"members":[],"messages":[],"notices":[],
    "directMessages":[],"friendLinks":[],"calls":[],"invites":[],
    "updatedAt":0
  }'::jsonb,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

insert into public.moon_shared_state (id)
values ('global')
on conflict (id) do nothing;

-- Keep updated_at automatic and prevent browser clients from granting themselves
-- the developer badge. Plus remains intentionally user-controlled for the current
-- fake-purchase beta.
create or replace function public.moon_profile_before_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.id := old.id;
  new.developer := old.developer;
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
