create table public.billing_checkouts (
  provider_reference text primary key,
  user_id text not null,
  plan_id text not null check (plan_id in ('monthly_pro', 'lifetime')),
  purchase_type text not null check (purchase_type in ('subscription', 'one_time')),
  amount_inr integer not null check (amount_inr > 0),
  currency text not null check (currency = 'INR'),
  status text not null default 'created' check (status in ('created', 'paid', 'cancelled', 'failed')),
  provider_session_id text not null,
  idempotency_key uuid not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.billing_webhook_events (
  event_id text primary key,
  event_type text not null,
  provider_reference text references public.billing_checkouts(provider_reference),
  payload_sha256 text not null,
  processed_at timestamptz not null default now()
);

create table public.billing_entitlements (
  user_id text primary key,
  plan_id text not null check (plan_id in ('monthly_pro', 'lifetime')),
  status text not null check (status in ('active', 'past_due', 'cancelled', 'expired')),
  is_lifetime boolean not null default false,
  minutes_limit integer not null check (minutes_limit >= 0),
  minutes_used integer not null default 0 check (minutes_used >= 0),
  period_start timestamptz not null,
  period_end timestamptz not null,
  provider_reference text not null references public.billing_checkouts(provider_reference),
  updated_at timestamptz not null default now()
);

create table public.billing_usage_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  interview_id text not null unique,
  seconds_used integer not null check (seconds_used >= 0),
  created_at timestamptz not null default now()
);

create index billing_checkouts_user_idx on public.billing_checkouts(user_id, created_at desc);
create index billing_usage_user_idx on public.billing_usage_ledger(user_id, created_at desc);

alter table public.billing_checkouts enable row level security;
alter table public.billing_webhook_events enable row level security;
alter table public.billing_entitlements enable row level security;
alter table public.billing_usage_ledger enable row level security;

-- There are intentionally no browser/client policies. Only the backend service role
-- can access billing records, webhook events, or usage balances.

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

  if not found then
    return false;
  end if;

  select * into checkout_row
  from public.billing_checkouts
  where provider_reference = p_provider_reference
  for update;

  if not found then
    raise exception 'Unknown billing reference';
  end if;

  allowance := case checkout_row.plan_id
    when 'monthly_pro' then 450
    when 'lifetime' then 900
    else 0
  end;

  update public.billing_checkouts
  set status = 'paid', updated_at = now()
  where provider_reference = p_provider_reference;

  insert into public.billing_entitlements(
    user_id, plan_id, status, is_lifetime, minutes_limit, minutes_used,
    period_start, period_end, provider_reference, updated_at
  ) values (
    checkout_row.user_id,
    checkout_row.plan_id,
    'active',
    checkout_row.purchase_type = 'one_time',
    allowance,
    0,
    now(),
    now() + interval '1 month',
    checkout_row.provider_reference,
    now()
  ) on conflict (user_id) do update set
    plan_id = excluded.plan_id,
    status = excluded.status,
    is_lifetime = excluded.is_lifetime,
    minutes_limit = excluded.minutes_limit,
    minutes_used = 0,
    period_start = excluded.period_start,
    period_end = excluded.period_end,
    provider_reference = excluded.provider_reference,
    updated_at = now();

  return true;
end;
$$;

create or replace function public.consume_interview_seconds(
  p_user_id text,
  p_interview_id text,
  p_seconds integer
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  entitlement_row public.billing_entitlements%rowtype;
  charge_minutes integer;
begin
  if p_seconds < 0 then
    raise exception 'Seconds cannot be negative';
  end if;

  select * into entitlement_row
  from public.billing_entitlements
  where user_id = p_user_id and status = 'active'
  for update;

  if not found then
    raise exception 'No active entitlement';
  end if;

  charge_minutes := ceil(p_seconds / 60.0);
  if entitlement_row.minutes_used + charge_minutes > entitlement_row.minutes_limit then
    raise exception 'Interview minute allowance exceeded';
  end if;

  insert into public.billing_usage_ledger(user_id, interview_id, seconds_used)
  values (p_user_id, p_interview_id, p_seconds)
  on conflict (interview_id) do nothing;

  if found then
    update public.billing_entitlements
    set minutes_used = minutes_used + charge_minutes, updated_at = now()
    where user_id = p_user_id;
  end if;

  select minutes_limit - minutes_used into charge_minutes
  from public.billing_entitlements where user_id = p_user_id;
  return charge_minutes;
end;
$$;

revoke all on function public.activate_billing_entitlement(text, text, text, text) from public, anon, authenticated;
revoke all on function public.consume_interview_seconds(text, text, integer) from public, anon, authenticated;
grant execute on function public.activate_billing_entitlement(text, text, text, text) to service_role;
grant execute on function public.consume_interview_seconds(text, text, integer) to service_role;
