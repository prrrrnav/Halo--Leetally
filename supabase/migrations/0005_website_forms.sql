create table if not exists public.website_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  name text not null check (char_length(name) between 1 and 100),
  email text not null check (char_length(email) between 3 and 320),
  message text not null check (char_length(message) between 10 and 5000),
  rating integer not null check (rating between 1 and 5),
  created_at timestamptz not null default now()
);

create table if not exists public.contact_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  name text not null check (char_length(name) between 1 and 100),
  email text not null check (char_length(email) between 3 and 320),
  message text not null check (char_length(message) between 10 and 5000),
  created_at timestamptz not null default now()
);

alter table public.website_feedback enable row level security;
alter table public.contact_requests enable row level security;

create policy "anyone may submit website feedback" on public.website_feedback
  for insert to anon, authenticated with check (user_id is null or user_id = auth.uid());
create policy "anyone may submit contact requests" on public.contact_requests
  for insert to anon, authenticated with check (user_id is null or user_id = auth.uid());

-- Browser clients intentionally receive no select/update/delete policy.
