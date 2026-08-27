-- Store the active LeetCode identity for each LeetAlly Auth account.
-- LeetCode usernames are intentionally not globally exclusive: a person may
-- use multiple LeetAlly accounts or change between multiple LeetCode accounts.
create table if not exists public.leetcode_identity_links (
  user_id uuid primary key references auth.users(id) on delete cascade,
  username text not null,
  normalized_username text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint leetcode_identity_username_not_blank check (length(trim(username)) > 0),
  constraint leetcode_identity_normalized check (normalized_username = lower(trim(username)))
);

alter table public.leetcode_identity_links enable row level security;

create policy "leetcode identity own row"
  on public.leetcode_identity_links
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

insert into public.leetcode_identity_links(user_id, username, normalized_username, created_at, updated_at)
select
  user_id,
  trim(leetcode_username),
  lower(trim(leetcode_username)),
  created_at,
  updated_at
from public.user_progress
where nullif(trim(leetcode_username), '') is not null
on conflict (user_id) do update set
  username = excluded.username,
  normalized_username = excluded.normalized_username,
  updated_at = excluded.updated_at;

create index if not exists leetcode_identity_links_username_idx
  on public.leetcode_identity_links(normalized_username);
