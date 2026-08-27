-- Remove the earlier global username reservation. The user_id primary key still
-- keeps one active LeetCode profile per LeetAlly account, while the same username
-- may be connected to another LeetAlly account.
alter table public.leetcode_identity_links
  drop constraint if exists leetcode_identity_links_normalized_username_key;

create index if not exists leetcode_identity_links_username_idx
  on public.leetcode_identity_links(normalized_username);
