# Guest tracking and account conversion

## Product states

### 1. New guest

- The extension opens on the normal Overview screen.
- Solved totals, difficulty totals, activity, and focus-sheet cards remain visible.
- A compact prompt asks for a public LeetCode username.
- Interview history and Friends explain that LeetAlly sign-in is required.

### 2. Guest tracking a public profile

- Public LeetCode totals, ranking, streak, active days, avatar, and submission
  calendar are stored in extension-local storage.
- The Overview immediately renders those values.
- Data remains on that browser profile and is not uploaded to LeetAlly.
- Exact sheet completion is not claimed unless the browser is signed into the
  same LeetCode account.

### 3. Guest with verified LeetCode session

- When the entered username matches the active leetcode.com session, LeetAlly
  imports complete accepted problem IDs.
- Every sheet is recalculated locally from those IDs.
- Sheet selection controls dashboard visibility only.

### 4. Guest creates or signs into a LeetAlly account

- Existing local progress is treated as the user's intentional guest state.
- If the LeetAlly account is new, the entire guest state becomes its initial
  cloud progress.
- If cloud progress already exists, local and cloud activity, interviews,
  solved problems, and sheets are merged under the authenticated
  Supabase user ID.
- The locally selected LeetCode profile remains the active profile.
- Subsequent changes synchronize to that account across devices.

### 5. Signed-in account

- Cloud backup, Friends, interview history, and cross-device progress are active.
- Exact sheet history still requires the same account to be signed in at
  leetcode.com; LeetAlly email sign-in does not grant access to LeetCode cookies.

### 6. Sign out

- The private account copy is removed from extension-local storage.
- Cloud data remains owned by the Supabase Auth user.
- The extension returns to a clean guest Overview and can track another public
  LeetCode profile locally.

## Data ownership

- Guest state: `browser.storage.local` only.
- Account state: `public.user_progress`, keyed by the Supabase Auth `user_id`.
- Friend state: server-managed `public.friend_connections`, keyed by two
  Supabase Auth user IDs. Public profile totals are released only after acceptance.
- LeetCode username: tracking metadata, never an authorization key.
- Supabase RLS: only `auth.uid() = user_id` can read or write an account row.
