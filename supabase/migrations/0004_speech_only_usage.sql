alter table public.billing_entitlements
  add column if not exists speech_seconds_used integer not null default 0
  check (speech_seconds_used >= 0);

alter table public.billing_usage_ledger
  drop constraint if exists billing_usage_ledger_interview_id_key;

alter table public.billing_usage_ledger
  add column if not exists event_id text;

update public.billing_usage_ledger
set event_id = id::text
where event_id is null;

alter table public.billing_usage_ledger
  alter column event_id set not null;

create unique index if not exists billing_usage_event_idx
  on public.billing_usage_ledger(event_id);

create or replace function public.reset_speech_usage_on_new_period()
returns trigger language plpgsql as $$
begin
  if new.period_start is distinct from old.period_start then
    new.speech_seconds_used := 0;
  end if;
  return new;
end;
$$;

drop trigger if exists reset_speech_usage_period on public.billing_entitlements;
create trigger reset_speech_usage_period
before update on public.billing_entitlements
for each row execute function public.reset_speech_usage_on_new_period();

create or replace function public.consume_speech_seconds(
  p_user_id text,
  p_event_id text,
  p_interview_id text,
  p_seconds integer
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  entitlement_row public.billing_entitlements%rowtype;
  next_seconds integer;
begin
  if p_seconds < 0 or p_seconds > 120 then
    raise exception 'Invalid speech segment duration';
  end if;

  select * into entitlement_row
  from public.billing_entitlements
  where user_id = p_user_id and status = 'active'
  for update;

  if not found then
    raise exception 'No active entitlement';
  end if;

  if exists(select 1 from public.billing_usage_ledger where event_id = p_event_id) then
    return greatest(0, entitlement_row.minutes_limit * 60 - entitlement_row.speech_seconds_used);
  end if;

  next_seconds := entitlement_row.speech_seconds_used + p_seconds;
  if next_seconds > entitlement_row.minutes_limit * 60 then
    raise exception 'Speech allowance exceeded';
  end if;

  insert into public.billing_usage_ledger(user_id, interview_id, event_id, seconds_used)
  values (p_user_id, p_interview_id, p_event_id, p_seconds);

  update public.billing_entitlements
  set speech_seconds_used = next_seconds,
      minutes_used = ceil(next_seconds / 60.0),
      updated_at = now()
  where user_id = p_user_id;

  return entitlement_row.minutes_limit * 60 - next_seconds;
end;
$$;

revoke all on function public.consume_speech_seconds(text, text, text, integer)
  from public, anon, authenticated;
grant execute on function public.consume_speech_seconds(text, text, text, integer)
  to service_role;

-- Remove the legacy wall-clock charging path so future code cannot use it.
drop function if exists public.consume_interview_seconds(text, text, integer);
