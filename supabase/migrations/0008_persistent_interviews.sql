-- Durable state required when the API runs across independent function invocations.
alter table public.interviews
  add column if not exists problem_description text not null default '',
  add column if not exists programming_language text,
  add column if not exists code text,
  add column if not exists visible_output text,
  add column if not exists problem_topics jsonb not null default '[]'::jsonb,
  add column if not exists interview_companies jsonb not null default '[]'::jsonb,
  add column if not exists target_company text,
  add column if not exists interview_type text not null default 'dsa',
  add column if not exists level text not null default 'sde1',
  add column if not exists phase text not null default 'clarification',
  add column if not exists assessment jsonb,
  add column if not exists code_snapshots jsonb not null default '[]'::jsonb;

alter table public.interview_messages
  add column if not exists code text not null default '';

create index if not exists interviews_user_status_idx
  on public.interviews(user_id, status, created_at desc);
