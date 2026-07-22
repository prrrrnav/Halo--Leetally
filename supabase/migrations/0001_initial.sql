create extension if not exists pgcrypto;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text, display_name text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.interviews (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  platform text not null, problem_slug text not null, problem_title text not null, difficulty text,
  status text not null default 'created' check (status in ('created','active','completed','abandoned')),
  started_at timestamptz, ended_at timestamptz, duration_seconds integer,
  created_at timestamptz not null default now()
);
create table public.interview_messages (
  id uuid primary key default gen_random_uuid(), interview_id uuid not null references public.interviews(id) on delete cascade,
  role text not null check (role in ('system','assistant','user')), content text not null, sequence_number integer not null,
  created_at timestamptz not null default now(), unique(interview_id, sequence_number)
);
create table public.interview_feedback (
  id uuid primary key default gen_random_uuid(), interview_id uuid not null unique references public.interviews(id) on delete cascade,
  communication_score integer check (communication_score between 0 and 10), problem_solving_score integer check (problem_solving_score between 0 and 10),
  complexity_score integer check (complexity_score between 0 and 10), edge_case_score integer check (edge_case_score between 0 and 10),
  summary text, strengths jsonb not null default '[]', improvements jsonb not null default '[]', created_at timestamptz not null default now()
);
create table public.usage_events (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  interview_id uuid references public.interviews(id) on delete set null, event_type text not null, quantity integer not null default 1,
  metadata jsonb not null default '{}', created_at timestamptz not null default now()
);
create index interviews_user_created_idx on public.interviews(user_id, created_at desc);
create index messages_interview_sequence_idx on public.interview_messages(interview_id, sequence_number);
create index usage_user_created_idx on public.usage_events(user_id, created_at desc);

alter table public.profiles enable row level security;
alter table public.interviews enable row level security;
alter table public.interview_messages enable row level security;
alter table public.interview_feedback enable row level security;
alter table public.usage_events enable row level security;
create policy "profiles own rows" on public.profiles for all using (auth.uid() = id) with check (auth.uid() = id);
create policy "interviews own rows" on public.interviews for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "messages through owned interview" on public.interview_messages for all using (exists(select 1 from public.interviews i where i.id=interview_id and i.user_id=auth.uid())) with check (exists(select 1 from public.interviews i where i.id=interview_id and i.user_id=auth.uid()));
create policy "feedback through owned interview" on public.interview_feedback for select using (exists(select 1 from public.interviews i where i.id=interview_id and i.user_id=auth.uid()));
create policy "usage own rows" on public.usage_events for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path=public as $$
begin insert into public.profiles(id,email) values(new.id,new.email); return new; end; $$;
create trigger on_auth_user_created after insert on auth.users for each row execute procedure public.handle_new_user();

