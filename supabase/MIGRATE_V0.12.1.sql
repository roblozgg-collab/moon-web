-- Moon Web v0.12.1 migration
-- Run in Supabase Dashboard -> SQL Editor before deploying v0.12.1.

alter table public.profiles add column if not exists nickname_color_enabled boolean not null default true;
alter table public.profiles add column if not exists nickname_font_enabled boolean not null default true;

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


-- Ask PostgREST to discover the new RPC functions immediately.
select pg_notify('pgrst', 'reload schema');
