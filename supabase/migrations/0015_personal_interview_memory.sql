-- Compact, per-account semantic memory derived from completed scorecards.
-- Raw audio and full transcripts are deliberately excluded.
create extension if not exists vector with schema extensions;

alter table public.interviews
  add column if not exists personal_memory jsonb not null default '[]'::jsonb;

create table if not exists public.interview_memories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  interview_id uuid not null unique references public.interviews(id) on delete cascade,
  memory_type text not null default 'interview_scorecard'
    check (memory_type in ('interview_scorecard')),
  summary text not null check (char_length(summary) between 1 and 2000),
  metadata jsonb not null default '{}'::jsonb,
  embedding extensions.vector(1536) not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists interview_memories_user_created_idx
  on public.interview_memories(user_id, created_at desc);

alter table public.interview_memories enable row level security;
revoke all on table public.interview_memories from anon, authenticated;
grant select, insert, update, delete on table public.interview_memories to service_role;

create or replace function public.match_interview_memories(
  p_user_id uuid,
  p_query_embedding extensions.vector(1536),
  p_match_threshold double precision default 0.2,
  p_match_count integer default 3
)
returns table (
  id uuid,
  summary text,
  metadata jsonb,
  similarity double precision
)
language sql
stable
security definer
set search_path = public, extensions
as $$
  select
    memory.id,
    memory.summary,
    memory.metadata,
    1 - (memory.embedding <=> p_query_embedding) as similarity
  from public.interview_memories as memory
  where memory.user_id = p_user_id
    and 1 - (memory.embedding <=> p_query_embedding) >= p_match_threshold
  order by memory.embedding <=> p_query_embedding
  limit least(greatest(p_match_count, 1), 5);
$$;

revoke all on function public.match_interview_memories(
  uuid, extensions.vector, double precision, integer
) from public, anon, authenticated;
grant execute on function public.match_interview_memories(
  uuid, extensions.vector, double precision, integer
) to service_role;
