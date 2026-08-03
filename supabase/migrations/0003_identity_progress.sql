-- Private cross-device extension state owned by the Supabase Auth user.
create table if not exists public.user_progress (
  user_id uuid primary key references auth.users(id) on delete cascade,
  leetcode_username text,
  progress jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists user_progress_leetcode_idx
  on public.user_progress(leetcode_username)
  where leetcode_username is not null;

alter table public.user_progress enable row level security;

create policy "user progress own row"
  on public.user_progress
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Keep profile identity metadata useful for Google and email/password accounts.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  insert into public.profiles(id, email, display_name)
  values(
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name')
  )
  on conflict (id) do update set
    email = excluded.email,
    display_name = coalesce(excluded.display_name, public.profiles.display_name),
    updated_at = now();
  return new;
end;
$$;
