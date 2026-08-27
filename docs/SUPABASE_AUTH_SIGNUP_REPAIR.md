# Supabase new-user signup repair

Symptom:

`error_code=unexpected_failure&error_description=Database+error+saving+new+user`

This response is generated after the identity provider succeeds but the
database transaction that inserts `auth.users` fails. LeetAlly mirrors new Auth
users into `public.profiles` using `public.handle_new_user()`, so schema drift,
function ownership or a profile constraint can block both Google and email
account creation.

## Apply the repair

1. Open Supabase Dashboard → project `wfpiyxepzmocwuowiadw`.
2. Open **SQL Editor** → **New query**.
3. Paste and run the complete contents of
   `supabase/migrations/0009_auth_signup_reliability.sql`.
4. Confirm the query completes without an error.

The migration is idempotent. It aligns the expected profile columns, restores
the RLS policy when missing, recreates the trigger as a `security definer`
function owned by `postgres`, and logs profile-mirror errors without rolling
back creation of the Auth user.

## Verify the database objects

Run this read-only query in SQL Editor:

```sql
select
  n.nspname as function_schema,
  p.proname as function_name,
  pg_get_userbyid(p.proowner) as function_owner,
  p.prosecdef as security_definer,
  p.proconfig as function_settings
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'handle_new_user';

select
  trigger_name,
  event_manipulation,
  event_object_schema,
  event_object_table,
  action_statement
from information_schema.triggers
where trigger_name = 'on_auth_user_created';

select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public' and table_name = 'profiles'
order by ordinal_position;
```

Expected results:

- `handle_new_user` is owned by `postgres` and `security_definer` is `true`.
- `on_auth_user_created` runs after insertion into `auth.users`.
- `profiles` includes `id`, `email`, `display_name`, `created_at`, and
  `updated_at`.

## Retest

Use a new test email/Google account that is not already listed under
Supabase Dashboard → Authentication → Users. A successful test must create the
Auth user, close the Chrome auth window, persist the extension session and show
the logged-in extension UI.

If it still fails, open **Logs → Auth Logs** and **Logs → Postgres Logs**, expand
the failed request at the matching time and copy the SQLSTATE plus database
message. Do not copy access tokens or provider credentials.
