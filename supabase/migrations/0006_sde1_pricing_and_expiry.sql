alter table public.billing_checkouts
  drop constraint if exists billing_checkouts_plan_id_check;
alter table public.billing_checkouts
  add constraint billing_checkouts_plan_id_check
  check (plan_id in ('monthly_pro', 'lifetime', 'sde1_sprint', 'sde1_intensive'));

alter table public.billing_entitlements
  drop constraint if exists billing_entitlements_plan_id_check;
alter table public.billing_entitlements
  add constraint billing_entitlements_plan_id_check
  check (plan_id in ('monthly_pro', 'lifetime', 'sde1_sprint', 'sde1_intensive'));
alter table public.billing_entitlements
  add column if not exists auto_renew boolean not null default false;

create or replace function public.activate_billing_entitlement(
  p_event_id text,
  p_event_type text,
  p_provider_reference text,
  p_payload_sha256 text
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  checkout_row public.billing_checkouts%rowtype;
  allowance integer;
begin
  insert into public.billing_webhook_events(
    event_id, event_type, provider_reference, payload_sha256
  ) values (
    p_event_id, p_event_type, p_provider_reference, p_payload_sha256
  ) on conflict (event_id) do nothing;
  if not found then return false; end if;

  select * into checkout_row from public.billing_checkouts
  where provider_reference = p_provider_reference for update;
  if not found then raise exception 'Unknown billing reference'; end if;

  allowance := case checkout_row.plan_id
    when 'sde1_sprint' then 240
    when 'sde1_intensive' then 600
    when 'monthly_pro' then 450
    when 'lifetime' then 900
    else 0
  end;

  update public.billing_checkouts set status = 'paid', updated_at = now()
  where provider_reference = p_provider_reference;

  insert into public.billing_entitlements(
    user_id, plan_id, status, is_lifetime, minutes_limit, minutes_used,
    speech_seconds_used, period_start, period_end, provider_reference,
    auto_renew, updated_at
  ) values (
    checkout_row.user_id, checkout_row.plan_id, 'active',
    checkout_row.plan_id = 'lifetime', allowance, 0, 0, now(),
    case when checkout_row.plan_id = 'lifetime'
      then now() + interval '100 years'
      else now() + interval '30 days' end,
    checkout_row.provider_reference,
    checkout_row.purchase_type = 'subscription', now()
  ) on conflict (user_id) do update set
    plan_id = excluded.plan_id,
    status = 'active',
    is_lifetime = excluded.is_lifetime,
    minutes_limit = excluded.minutes_limit,
    minutes_used = 0,
    speech_seconds_used = 0,
    period_start = excluded.period_start,
    period_end = excluded.period_end,
    provider_reference = excluded.provider_reference,
    auto_renew = excluded.auto_renew,
    updated_at = now();
  return true;
end;
$$;

create or replace function public.expire_billing_entitlement(p_user_id text)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  update public.billing_entitlements
  set status = 'expired', auto_renew = false, updated_at = now()
  where user_id = p_user_id and status = 'active' and not is_lifetime and period_end <= now();
  return found;
end;
$$;

create or replace function public.update_billing_lifecycle(
  p_event_id text,
  p_event_type text,
  p_provider_reference text,
  p_payload_sha256 text,
  p_entitlement_status text default null,
  p_auto_renew boolean default null
) returns boolean language plpgsql security definer set search_path = public as $$
begin
  insert into public.billing_webhook_events(event_id, event_type, provider_reference, payload_sha256)
  values (p_event_id, p_event_type, p_provider_reference, p_payload_sha256)
  on conflict (event_id) do nothing;
  if not found then return false; end if;

  update public.billing_entitlements
  set status = coalesce(p_entitlement_status, status),
      auto_renew = coalesce(p_auto_renew, auto_renew),
      updated_at = now()
  where provider_reference = p_provider_reference;
  return found;
end;
$$;

create or replace function public.consume_speech_seconds(
  p_user_id text, p_event_id text, p_interview_id text, p_seconds integer
) returns integer language plpgsql security definer set search_path = public as $$
declare entitlement_row public.billing_entitlements%rowtype; next_seconds integer;
begin
  if p_seconds < 0 or p_seconds > 120 then raise exception 'Invalid speech segment duration'; end if;
  select * into entitlement_row from public.billing_entitlements
  where user_id = p_user_id and status = 'active'
    and (is_lifetime or period_end > now()) for update;
  if not found then raise exception 'No active entitlement'; end if;
  if exists(select 1 from public.billing_usage_ledger where event_id = p_event_id) then
    return greatest(0, entitlement_row.minutes_limit * 60 - entitlement_row.speech_seconds_used);
  end if;
  next_seconds := entitlement_row.speech_seconds_used + p_seconds;
  if next_seconds > entitlement_row.minutes_limit * 60 then raise exception 'Speech allowance exceeded'; end if;
  insert into public.billing_usage_ledger(user_id, interview_id, event_id, seconds_used)
  values (p_user_id, p_interview_id, p_event_id, p_seconds);
  update public.billing_entitlements set speech_seconds_used = next_seconds,
    minutes_used = ceil(next_seconds / 60.0), updated_at = now() where user_id = p_user_id;
  return entitlement_row.minutes_limit * 60 - next_seconds;
end;
$$;

revoke all on function public.expire_billing_entitlement(text) from public, anon, authenticated;
revoke all on function public.update_billing_lifecycle(text, text, text, text, text, boolean) from public, anon, authenticated;
grant execute on function public.expire_billing_entitlement(text) to service_role;
grant execute on function public.update_billing_lifecycle(text, text, text, text, text, boolean) to service_role;
