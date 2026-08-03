import type { LeetCodeProfile, TrackedFriend } from "./progress";

interface GraphQLResponse<T> { data?: T; errors?: Array<{ message: string }> }

interface DailyChallengeResponse {
  dailyCodingChallengeV2?: {
    challenges?: Array<{ date: string; userStatus: string | null }>;
  };
}

async function queryLeetCode<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
  const response = await fetch("https://leetcode.com/graphql/", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  if (!response.ok) throw new Error(`LeetCode sync failed (${response.status})`);
  const result = await response.json() as GraphQLResponse<T>;
  if (!result.data || result.errors?.length) throw new Error(result.errors?.[0]?.message || "LeetCode account data unavailable");
  return result.data;
}

function mergeSubmissionCalendar(target: Record<string, number>, rawCalendar?: string): void {
  if (!rawCalendar) return;
  try {
    const calendar = JSON.parse(rawCalendar) as Record<string, number>;
    for (const [timestamp, count] of Object.entries(calendar)) {
      if (!count) continue;
      const date = new Date(Number(timestamp) * 1000).toISOString().slice(0, 10);
      target[date] = (target[date] ?? 0) + Number(count);
    }
  } catch {
    // LeetCode occasionally returns an empty or malformed calendar payload.
  }
}

async function fetchDailyChallengeActivity(): Promise<Record<string, boolean>> {
  const now = new Date();
  const months = [
    { year: now.getFullYear(), month: now.getMonth() + 1 },
    { year: new Date(now.getFullYear(), now.getMonth() - 1, 1).getFullYear(), month: new Date(now.getFullYear(), now.getMonth() - 1, 1).getMonth() + 1 },
  ];
  const query = `
    query dailyCodingQuestionRecords($year: Int!, $month: Int!) {
      dailyCodingChallengeV2(year: $year, month: $month) {
        challenges { date userStatus }
      }
    }
  `;
  const results = await Promise.all(months.map(({ year, month }) =>
    queryLeetCode<DailyChallengeResponse>(query, { year, month }).catch((): DailyChallengeResponse => ({})),
  ));
  const activity: Record<string, boolean> = {};
  for (const result of results) {
    for (const challenge of result.dailyCodingChallengeV2?.challenges ?? []) {
      activity[challenge.date] = challenge.userStatus === "Finish";
    }
  }
  return activity;
}

async function fetchYearCalendars(username: string): Promise<Record<string, number>> {
  const currentYear = new Date().getFullYear();
  const query = `
    query submissionCalendar($username: String!, $year: Int) {
      matchedUser(username: $username) {
        userCalendar(year: $year) { submissionCalendar }
      }
    }
  `;
  const years = [currentYear - 1, currentYear];
  const results = await Promise.all(years.map((year) =>
    queryLeetCode<{ matchedUser?: { userCalendar?: { submissionCalendar?: string } } }>(query, { username, year })
      .catch((): { matchedUser?: { userCalendar?: { submissionCalendar?: string } } } => ({})),
  ));
  const activity: Record<string, number> = {};
  for (const result of results) mergeSubmissionCalendar(activity, result.matchedUser?.userCalendar?.submissionCalendar);
  return activity;
}

export async function fetchLeetCodeFriend(username: string): Promise<TrackedFriend> {
  const normalized = username.trim();
  if (!normalized) throw new Error("Enter a LeetCode username");
  const data = await queryLeetCode<{ matchedUser: null | { username: string; profile: { userAvatar: string; ranking: number }; submitStats: { acSubmissionNum: Array<{ difficulty: string; count: number }> } } }>(`
    query friendProfile($username: String!) {
      matchedUser(username: $username) {
        username
        profile { userAvatar ranking }
        submitStats { acSubmissionNum { difficulty count } }
      }
    }
  `, { username: normalized });
  if (!data.matchedUser) throw new Error("LeetCode user not found");
  const friend = data.matchedUser;
  const solved = Object.fromEntries(friend.submitStats.acSubmissionNum.map((item) => [item.difficulty, item.count]));
  return {
    username: friend.username,
    avatar: friend.profile?.userAvatar,
    ranking: friend.profile?.ranking,
    totalSolved: solved.All ?? 0,
    easySolved: solved.Easy ?? 0,
    mediumSolved: solved.Medium ?? 0,
    hardSolved: solved.Hard ?? 0,
    syncedAt: new Date().toISOString(),
  };
}

export async function syncLeetCodeProfile(usernameOverride?: string): Promise<LeetCodeProfile> {
  let username = usernameOverride?.trim();
  let signedInUsername = "";
  try {
    const status = await queryLeetCode<{ userStatus: { isSignedIn: boolean; username: string } }>(`query userStatus { userStatus { isSignedIn username } }`);
    signedInUsername = status.userStatus?.isSignedIn ? status.userStatus.username : "";
    if (!username) username = signedInUsername;
  } catch {
    // Public profile sync can still work without session status.
  }
  if (!username) {
    throw new Error("Enter a LeetCode username or sign in to LeetCode first");
  }
  const data = await queryLeetCode<{ matchedUser: { username: string; profile: { userAvatar: string; ranking: number }; submitStats: { acSubmissionNum: Array<{ difficulty: string; count: number }> }; userCalendar: { streak: number; totalActiveDays: number; submissionCalendar?: string } }; recentAcSubmissionList: Array<{ titleSlug: string }> }>(`
    query profile($username: String!) {
      matchedUser(username: $username) {
        username profile { userAvatar ranking }
        submitStats { acSubmissionNum { difficulty count } }
        userCalendar { streak totalActiveDays submissionCalendar }
      }
      recentAcSubmissionList(username: $username, limit: 1000) { titleSlug }
    }`, { username });
  const user = data.matchedUser;
  const solved = Object.fromEntries(user.submitStats.acSubmissionNum.map((item) => [item.difficulty, item.count]));
  const [yearActivity, dailyChallengeActivity] = await Promise.all([
    fetchYearCalendars(username),
    fetchDailyChallengeActivity(),
  ]);
  const submissionActivity: Record<string, number> = {};
  mergeSubmissionCalendar(submissionActivity, user.userCalendar?.submissionCalendar);
  Object.assign(submissionActivity, yearActivity);
  let acceptedSlugs = [...new Set((data.recentAcSubmissionList ?? []).map((item) => item.titleSlug))];
  let acceptedProblemIds: number[] = [];
  if (signedInUsername.toLowerCase() === username.toLowerCase()) {
    try {
      const accepted = await queryLeetCode<{ problemsetQuestionList: { data: Array<{ questionFrontendId: string; titleSlug: string; status: string | null }> } }>(`
        query acceptedQuestions($limit: Int, $skip: Int, $filters: QuestionListFilterInput) {
          problemsetQuestionList: questionList(categorySlug: "", limit: $limit, skip: $skip, filters: $filters) {
            totalNum
            data { questionFrontendId titleSlug status }
          }
        }
      `, { limit: 3000, skip: 0, filters: {} });
      const complete = accepted.problemsetQuestionList?.data?.filter((question) => question.status === "ac") ?? [];
      acceptedProblemIds = [...new Set(complete.map((question) => Number(question.questionFrontendId)).filter(Number.isFinite))];
      if (complete.length) acceptedSlugs = [...new Set(complete.map((question) => question.titleSlug))];
    } catch {
      // Fall back to public recent accepts when the signed-in query is unavailable.
    }
  }
  return {
    username: user.username, avatar: user.profile?.userAvatar, ranking: user.profile?.ranking,
    totalSolved: solved.All ?? 0, easySolved: solved.Easy ?? 0, mediumSolved: solved.Medium ?? 0, hardSolved: solved.Hard ?? 0,
    streak: user.userCalendar?.streak ?? 0, totalActiveDays: user.userCalendar?.totalActiveDays ?? 0, syncedAt: new Date().toISOString(),
    acceptedSlugs,
    acceptedProblemIds,
    submissionActivity,
    dailyChallengeActivity,
  };
}
