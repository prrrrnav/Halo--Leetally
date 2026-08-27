# Friend connections and progress sharing

## User flow

1. Both people create or sign in to separate LeetAlly accounts.
2. Either person may link, unlink or change the LeetCode username on their own
   account. The LeetCode username is not the friendship identity.
3. In **Friends**, the requester enters the exact email used by the other
   LeetAlly account.
4. LeetAlly creates one pending relationship between the two account IDs.
   While pending, the requester sees only the address they entered and the
   recipient sees who sent the request. No LeetCode statistics are returned.
5. The recipient accepts or declines. A matching request sent in the opposite
   direction is treated as acceptance instead of creating a duplicate.
6. After acceptance, both accounts can see the other person's current linked
   LeetCode username, avatar, ranking and Easy/Medium/Hard/total solved counts.
7. When a person syncs a different LeetCode ID, their accepted friends see the
   new public summary on refresh. The account friendship itself is unchanged.
8. Either person can remove the connection. All shared statistics disappear
   immediately from the Friends API response.

## Privacy and authorization boundaries

- Relationships are keyed by immutable Supabase Auth user IDs, not email or
  LeetCode username.
- Email is used only to resolve the intended LeetAlly account on the server.
- `friend_connections` has RLS enabled and grants no direct access to `anon` or
  `authenticated`; only the backend service role can query or change it.
- Every API call validates the caller's Supabase access token.
- Only the addressee may accept a pending request.
- Only either participant may remove a relationship.
- Pending requests return no LeetCode data.
- Accepted responses are built from an allowlist of public summary fields.
  Accepted problem IDs/slugs, submission calendars, sheet selection/progress,
  planner settings, interview history, transcripts, scorecards and billing data
  are never included.
- A unique unordered-pair index prevents duplicate or crossed relationships.
- Each account is limited to 30 lookup attempts in a rolling 24-hour window and
  30 simultaneously pending outgoing requests. The API returns a neutral result
  when an email does not exist to reduce account enumeration.

## Release verification

Use two disposable LeetAlly accounts with different emails and LeetCode IDs.

1. Send a request from account A to B and verify A cannot see B's statistics.
2. Verify account C cannot accept or delete the A-B relationship ID.
3. Accept as B and verify only the public summary appears on both accounts.
4. Unlink B's LeetCode ID and verify the relationship remains while the profile
   summary becomes unavailable after B's next sync.
5. Link another LeetCode ID to B and verify A sees that new public summary.
6. Remove as either A or B and verify both accounts stop receiving the summary.
7. Export A's data and confirm its relationship row is included.
8. Delete one disposable account and verify the relationship cascades away.
