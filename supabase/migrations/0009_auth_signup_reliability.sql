-- Keep the public profile mirror compatible with every supported auth provider.
-- A failure in this optional mirror must never roll back creation of auth.users.
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles add column if not exists email text;
alter table public.profiles add column if not exists display_name text;
alter table public.profiles add column if not exists created_at timestamptz default now();
alter table public.profiles add column if not exists updated_at timestamptz default now();
alter table public.profiles alter column created_at set default now();
alter table public.profiles alter column updated_at set default now();
alter table public.profiles enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'profiles'
      and policyname = 'profiles own rows'
  ) then
    create policy "profiles own rows"
      on public.profiles
      for all
      to authenticated
      using ((select auth.uid()) = id)
      with check ((select auth.uid()) = id);
  end if;
end
$$;

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
    new.email,
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
    -- Profiles are a convenience mirror. Log the database cause for repair,
    -- but do not turn a profile-side issue into a failed Auth signup.
    raise warning 'LeetAlly profile mirror failed for auth user %: [%] %',
      new.id, sqlstate, sqlerrm;
    return new;
end;
$$;

alter function public.handle_new_user() owner to postgres;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
