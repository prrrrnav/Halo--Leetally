-- Atomically enforce the temporary per-account AI interview allowance.
create table if not exists public.ai_interview_usage (
  user_id uuid primary key references auth.users(id) on delete cascade,
  interviews_started integer not null default 0 check (interviews_started >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.ai_interview_usage enable row level security;
revoke all on table public.ai_interview_usage from anon, authenticated;

create or replace function public.claim_ai_interview_trial(
  p_user_id uuid,
  p_limit integer default 1
) returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  claimed boolean;
begin
  if p_limit < 0 then
    return true;
  end if;

  insert into public.ai_interview_usage(user_id, interviews_started)
  values (p_user_id, 1)
  on conflict (user_id) do update
    set interviews_started = public.ai_interview_usage.interviews_started + 1,
        updated_at = now()
    where public.ai_interview_usage.interviews_started < p_limit
  returning true into claimed;

  return coalesce(claimed, false);
end;
$$;

revoke all on function public.claim_ai_interview_trial(uuid, integer) from public;
grant execute on function public.claim_ai_interview_trial(uuid, integer) to service_role;
