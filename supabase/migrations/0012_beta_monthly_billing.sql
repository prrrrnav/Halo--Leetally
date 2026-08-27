-- One honest paid beta tier. Tracking remains free; paid access covers AI interviews.
alter table public.billing_checkouts
  drop constraint if exists billing_checkouts_plan_id_check;
alter table public.billing_checkouts
  add constraint billing_checkouts_plan_id_check
  check (plan_id in ('beta_monthly', 'monthly_pro', 'lifetime', 'sde1_sprint', 'sde1_intensive'));

alter table public.billing_entitlements
  drop constraint if exists billing_entitlements_plan_id_check;
alter table public.billing_entitlements
  add constraint billing_entitlements_plan_id_check
  check (plan_id in ('beta_monthly', 'monthly_pro', 'lifetime', 'sde1_sprint', 'sde1_intensive'));

alter table public.interviews
  add column if not exists access_tier text not null default 'trial';
alter table public.interviews
  drop constraint if exists interviews_access_tier_check;
alter table public.interviews
  add constraint interviews_access_tier_check
  check (access_tier in ('trial', 'beta_monthly'));

create unique index if not exists billing_webhook_events_payload_once
  on public.billing_webhook_events(provider_reference, payload_sha256);

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
  current_entitlement public.billing_entitlements%rowtype;
  allowance integer;
  renewal_enabled boolean;
begin
  insert into public.billing_webhook_events(
    event_id, event_type, provider_reference, payload_sha256
  ) values (
    p_event_id, p_event_type, p_provider_reference, p_payload_sha256
  ) on conflict do nothing;
  if not found then return false; end if;

  select * into checkout_row from public.billing_checkouts
  where provider_reference = p_provider_reference for update;
  if not found then raise exception 'Unknown billing reference'; end if;

  select * into current_entitlement from public.billing_entitlements
  where user_id = checkout_row.user_id for update;
  if found
    and current_entitlement.status = 'active'
    and current_entitlement.period_end > now()
    and current_entitlement.provider_reference <> checkout_row.provider_reference
  then
    -- A delayed event from an older subscription must not overwrite a newer
    -- active subscription or reset its usage allowance.
    return false;
  end if;

  allowance := case checkout_row.plan_id
    when 'beta_monthly' then 240
    when 'sde1_sprint' then 240
    when 'sde1_intensive' then 600
    when 'monthly_pro' then 450
    when 'lifetime' then 900
    else 0
  end;
  if allowance <= 0 then raise exception 'Unsupported billing plan'; end if;

  -- A delayed success event may extend already-paid access after cancellation,
  -- but it must never silently turn automatic renewal back on.
  renewal_enabled := checkout_row.purchase_type = 'subscription'
    and checkout_row.status <> 'cancelled';

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
    checkout_row.provider_reference, renewal_enabled, now()
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

revoke all on function public.activate_billing_entitlement(text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.activate_billing_entitlement(text, text, text, text)
  to service_role;

create or replace function public.update_billing_lifecycle(
  p_event_id text,
  p_event_type text,
  p_provider_reference text,
  p_payload_sha256 text,
  p_entitlement_status text default null,
  p_auto_renew boolean default null
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.billing_webhook_events(
    event_id, event_type, provider_reference, payload_sha256
  ) values (
    p_event_id, p_event_type, p_provider_reference, p_payload_sha256
  ) on conflict do nothing;
  if not found then return false; end if;

  update public.billing_entitlements
  set status = coalesce(p_entitlement_status, status),
      auto_renew = coalesce(p_auto_renew, auto_renew),
      updated_at = now()
  where provider_reference = p_provider_reference;
  return found;
end;
$$;

revoke all on function public.update_billing_lifecycle(text, text, text, text, text, boolean)
  from public, anon, authenticated;
grant execute on function public.update_billing_lifecycle(text, text, text, text, text, boolean)
  to service_role;
