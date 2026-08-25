-- MoonLobby v0.12.0 — grant DEV badge to the two reserved usernames.
-- Safe to run after both accounts exist.

begin;

delete from public.developer_claims
where username in ('stalinovskiy', 'palych')
   or user_id in (
     select id from public.profiles
     where username in ('stalinovskiy', 'palych')
   );

insert into public.developer_claims (username, user_id)
select username, id
from public.profiles
where username in ('stalinovskiy', 'palych')
on conflict (username) do update set user_id = excluded.user_id;

update public.profiles
set developer = true
where username in ('stalinovskiy', 'palych');

commit;

select id, username, display_name, developer
from public.profiles
where username in ('stalinovskiy', 'palych')
order by username;
