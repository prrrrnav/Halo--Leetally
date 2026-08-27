-- Consent-based, account-to-account friend connections.
-- LeetCode identities remain independently linkable; progress is disclosed by
-- the backend only after the receiving LeetAlly account accepts the request.
create table if not exists public.friend_connections (
  id uuid primary key default gen_random_uuid(),
  requester_user_id uuid not null references auth.users(id) on delete cascade,
  addressee_user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  constraint friend_connections_different_accounts
    check (requester_user_id <> addressee_user_id)
);

create unique index if not exists friend_connections_unique_pair
  on public.friend_connections (
    least(requester_user_id, addressee_user_id),
    greatest(requester_user_id, addressee_user_id)
  );
create index if not exists friend_connections_requester_idx
  on public.friend_connections(requester_user_id, status);
create index if not exists friend_connections_addressee_idx
  on public.friend_connections(addressee_user_id, status);

alter table public.friend_connections enable row level security;

-- Relationship and email lookups are intentionally server-only. The API uses
-- the service role after validating the caller's Supabase access token.
revoke all on table public.friend_connections from anon, authenticated;
grant select, insert, update, delete on table public.friend_connections to service_role;

create table if not exists public.friend_request_attempts (
  id uuid primary key default gen_random_uuid(),
  requester_user_id uuid not null references auth.users(id) on delete cascade,
  attempted_at timestamptz not null default now()
);
create index if not exists friend_request_attempts_user_time_idx
  on public.friend_request_attempts(requester_user_id, attempted_at desc);
alter table public.friend_request_attempts enable row level security;
revoke all on table public.friend_request_attempts from anon, authenticated;
grant select, insert, delete on table public.friend_request_attempts to service_role;

-- Normalize the profile mirror so exact email lookup cannot be confused by
-- casing. Supabase Auth itself prevents multiple accounts for the same email.
insert into public.profiles(id, email, display_name)
select
  id,
  lower(trim(email)),
  coalesce(
    raw_user_meta_data ->> 'full_name',
    raw_user_meta_data ->> 'name',
    raw_user_meta_data ->> 'preferred_username'
  )
from auth.users
on conflict (id) do update set
  email = excluded.email,
  display_name = coalesce(excluded.display_name, public.profiles.display_name),
  updated_at = now();

update public.profiles
set email = lower(trim(email))
where email is not null;

create unique index if not exists profiles_normalized_email_unique
  on public.profiles(lower(email))
  where email is not null;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles(id, email, display_name)
  values(
    new.id,
    lower(trim(new.email)),
    coalesce(
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'name',
      new.raw_user_meta_data ->> 'preferred_username'
    )
  )
  on conflict (id) do update set
    email = excluded.email,
    display_name = coalesce(excluded.display_name, public.profiles.display_name),
    updated_at = now();

  return new;
exception
  when others then
    raise warning 'LeetAlly profile mirror failed for auth user %: [%] %',
      new.id, sqlstate, sqlerrm;
    return new;
end;
$$;

alter function public.handle_new_user() owner to postgres;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert or update of email, raw_user_meta_data on auth.users
  for each row execute procedure public.handle_new_user();
