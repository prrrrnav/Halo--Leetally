import type { LeetCodeProfile, TrackedFriend } from "./progress";

interface GraphQLResponse<T> {
  data?: T;
  errors?: Array<{ message: string }>;
}

interface DailyChallengeResponse {
  dailyCodingChallengeV2?: {
    challenges?: Array<{ date: string; userStatus: string | null }>;
  };
}

export interface DailyChallenge {
  date: string;
  questionFrontendId: string;
  title: string;
  titleSlug: string;
  difficulty: "Easy" | "Medium" | "Hard";
  url: string;
}

export interface ProblemSummary {
  title: string;
  titleSlug: string;
  difficulty: "Easy" | "Medium" | "Hard";
}

interface AcceptedQuestion {
  questionFrontendId: string;
  titleSlug: string;
}

async function queryLeetCode<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
  const response = await fetch("https://leetcode.com/graphql/", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  if (!response.ok) throw new Error(`LeetCode sync failed (${response.status})`);
  const result = (await response.json()) as GraphQLResponse<T>;
  if (!result.data || result.errors?.length)
    throw new Error(result.errors?.[0]?.message || "LeetCode account data unavailable");
  return result.data;
}

function uniqueAcceptedQuestions(questions: AcceptedQuestion[]): AcceptedQuestion[] {
  return questions.filter(
    (question, index, all) =>
      all.findIndex((candidate) => candidate.questionFrontendId === question.questionFrontendId) === index,
  );
}

async function fetchAcceptedQuestionHistory(expectedAcceptedCount: number): Promise<AcceptedQuestion[]> {
  try {
    const response = await fetch("https://leetcode.com/api/problems/all/", {
      credentials: "include",
      headers: { Accept: "application/json" },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const result = (await response.json()) as {
      stat_status_pairs?: Array<{
        status?: string | null;
        stat?: { frontend_question_id?: number | string; question__title_slug?: string };
      }>;
    };
    if (!Array.isArray(result.stat_status_pairs)) throw new Error("Missing stat_status_pairs");
    const accepted = uniqueAcceptedQuestions(
      result.stat_status_pairs
        .filter((question) => question.status === "ac")
        .map((question) => ({
          questionFrontendId: String(question.stat?.frontend_question_id ?? ""),
          titleSlug: question.stat?.question__title_slug ?? "",
        }))
        .filter((question) => question.questionFrontendId && question.titleSlug),
    );
    if (expectedAcceptedCount > 0 && accepted.length === 0) {
      throw new Error("Authenticated endpoint returned no accepted rows");
    }
    return accepted;
  } catch (cause) {
    console.warn("[LeetAlly sync] Accepted-history endpoint unavailable; using paginated GraphQL.", {
      error: cause instanceof Error ? cause.message : String(cause),
    });
  }

  const pageSize = 100;
  const maximumQuestions = 5000;
  const questions: AcceptedQuestion[] = [];
  let skip = 0;
  while (skip < maximumQuestions) {
    const page = await queryLeetCode<{
      problemsetQuestionList: {
        totalNum: number;
        data: Array<AcceptedQuestion & { status: string | null }>;
      };
    }>(
      `
      query acceptedQuestions($limit: Int, $skip: Int, $filters: QuestionListFilterInput) {
        problemsetQuestionList: questionList(categorySlug: "", limit: $limit, skip: $skip, filters: $filters) {
          totalNum
          data { questionFrontendId titleSlug status }
        }
      }
    `,
      { limit: pageSize, skip, filters: {} },
    );
    const rows = page.problemsetQuestionList?.data ?? [];
    questions.push(...rows.filter((question) => question.status === "ac"));
    if (!rows.length || skip + rows.length >= (page.problemsetQuestionList?.totalNum ?? 0)) break;
    skip += rows.length;
  }
  return uniqueAcceptedQuestions(questions);
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
    {
      year: new Date(now.getFullYear(), now.getMonth() - 1, 1).getFullYear(),
      month: new Date(now.getFullYear(), now.getMonth() - 1, 1).getMonth() + 1,
    },
  ];
  const query = `
    query dailyCodingQuestionRecords($year: Int!, $month: Int!) {
      dailyCodingChallengeV2(year: $year, month: $month) {
        challenges { date userStatus }
      }
    }
  `;
  const results = await Promise.all(
    months.map(({ year, month }) =>
      queryLeetCode<DailyChallengeResponse>(query, { year, month }).catch((): DailyChallengeResponse => ({})),
    ),
  );
  const activity: Record<string, boolean> = {};
  for (const result of results) {
    for (const challenge of result.dailyCodingChallengeV2?.challenges ?? []) {
      activity[challenge.date] = challenge.userStatus === "Finish";
    }
  }
  return activity;
}

export async function fetchDailyChallenge(): Promise<DailyChallenge> {
  const data = await queryLeetCode<{
    activeDailyCodingChallengeQuestion?: {
      date: string;
      link?: string;
      question?: {
        questionFrontendId: string;
        title: string;
        titleSlug: string;
        difficulty: "Easy" | "Medium" | "Hard";
      };
    };
  }>(`
    query questionOfToday {
      activeDailyCodingChallengeQuestion {
        date
        link
        question { questionFrontendId title titleSlug difficulty }
      }
    }
  `);
  const challenge = data.activeDailyCodingChallengeQuestion;
  const question = challenge?.question;
  if (!challenge || !question) throw new Error("Daily problem unavailable");
  const path = challenge.link || `/problems/${question.titleSlug}/`;
  return {
    ...question,
    date: challenge.date,
    url: new URL(path, "https://leetcode.com").toString(),
  };
}

export async function fetchProblemSummary(titleSlug: string): Promise<ProblemSummary> {
  const data = await queryLeetCode<{ question?: ProblemSummary }>(
    `
      query problemSummary($titleSlug: String!) {
        question(titleSlug: $titleSlug) { title titleSlug difficulty }
      }
    `,
    { titleSlug },
  );
  if (!data.question) throw new Error("Problem details unavailable");
  return data.question;
}

export async function fetchPublicLeetCodeProfile(usernameInput: string): Promise<TrackedFriend> {
  const username = usernameInput.trim().replace(/^@/, "");
  if (!username) throw new Error("Enter a LeetCode username");
  const data = await queryLeetCode<{
    matchedUser?: {
      username: string;
      profile?: { userAvatar?: string; ranking?: number };
      submitStats?: { acSubmissionNum?: Array<{ difficulty: string; count: number }> };
      submitStatsGlobal?: { acSubmissionNum?: Array<{ difficulty: string; count: number }> };
    } | null;
  }>(
    `
      query publicProfile($username: String!) {
        matchedUser(username: $username) {
          username
          profile { userAvatar ranking }
          submitStats { acSubmissionNum { difficulty count } }
          submitStatsGlobal { acSubmissionNum { difficulty count } }
        }
      }
    `,
    { username },
  );
  const user = data.matchedUser;
  if (!user) throw new Error(`LeetCode user @${username} was not found.`);
  const rows = user.submitStatsGlobal?.acSubmissionNum ?? user.submitStats?.acSubmissionNum ?? [];
  const solved = Object.fromEntries(rows.map((item) => [item.difficulty, item.count]));
  return {
    username: user.username,
    avatar: user.profile?.userAvatar,
    ranking: user.profile?.ranking,
    totalSolved: solved.All ?? 0,
    easySolved: solved.Easy ?? 0,
    mediumSolved: solved.Medium ?? 0,
    hardSolved: solved.Hard ?? 0,
    syncedAt: new Date().toISOString(),
  };
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
  const results = await Promise.all(
    years.map((year) =>
      queryLeetCode<{ matchedUser?: { userCalendar?: { submissionCalendar?: string } } }>(query, {
        username,
        year,
      }).catch((): { matchedUser?: { userCalendar?: { submissionCalendar?: string } } } => ({})),
    ),
  );
  const activity: Record<string, number> = {};
  for (const result of results) mergeSubmissionCalendar(activity, result.matchedUser?.userCalendar?.submissionCalendar);
  return activity;
}

export async function syncLeetCodeProfile(usernameOverride?: string): Promise<LeetCodeProfile> {
  let username = usernameOverride?.trim();
  let signedInUsername = "";
  try {
    const status = await queryLeetCode<{ userStatus: { isSignedIn: boolean; username: string } }>(
      `query userStatus { userStatus { isSignedIn username } }`,
    );
    signedInUsername = status.userStatus?.isSignedIn ? status.userStatus.username : "";
    if (!username) username = signedInUsername;
  } catch {
    // Public profile sync can still work without session status.
  }
  if (!username) {
    throw new Error("Enter a LeetCode username or sign in to LeetCode first");
  }
  if (!signedInUsername || signedInUsername.toLowerCase() !== username.toLowerCase()) {
    const publicProfile = await fetchPublicLeetCodeProfile(username);
    return {
      ...publicProfile,
      verifiedOwner: false,
      streak: undefined,
      totalActiveDays: undefined,
      acceptedSlugs: [],
      acceptedProblemIds: [],
      submissionActivity: {},
      dailyChallengeActivity: {},
    };
  }
  const data = await queryLeetCode<{
    matchedUser: {
      username: string;
      profile: { userAvatar: string; ranking: number };
      submitStats: { acSubmissionNum: Array<{ difficulty: string; count: number }> };
      userCalendar: { streak: number; totalActiveDays: number; submissionCalendar?: string };
    };
    recentAcSubmissionList: Array<{ titleSlug: string }>;
  }>(
    `
    query profile($username: String!) {
      matchedUser(username: $username) {
        username profile { userAvatar ranking }
        submitStats { acSubmissionNum { difficulty count } }
        userCalendar { streak totalActiveDays submissionCalendar }
      }
      recentAcSubmissionList(username: $username, limit: 1000) { titleSlug }
    }`,
    { username },
  );
  const user = data.matchedUser;
  const solved = Object.fromEntries(user.submitStats.acSubmissionNum.map((item) => [item.difficulty, item.count]));
  const verifiedOwner = signedInUsername.toLowerCase() === username.toLowerCase();
  const [yearActivity, dailyChallengeActivity] = await Promise.all([
    fetchYearCalendars(username),
    verifiedOwner ? fetchDailyChallengeActivity() : Promise.resolve({}),
  ]);
  const submissionActivity: Record<string, number> = {};
  mergeSubmissionCalendar(submissionActivity, user.userCalendar?.submissionCalendar);
  Object.assign(submissionActivity, yearActivity);
  let acceptedSlugs = [...new Set((data.recentAcSubmissionList ?? []).map((item) => item.titleSlug))];
  let acceptedProblemIds: number[] = [];
  if (verifiedOwner) {
    try {
      const complete = await fetchAcceptedQuestionHistory(solved.All ?? 0);
      acceptedProblemIds = [
        ...new Set(complete.map((question) => Number(question.questionFrontendId)).filter(Number.isFinite)),
      ];
      if (complete.length) acceptedSlugs = [...new Set(complete.map((question) => question.titleSlug))];
      if ((solved.All ?? 0) > 0 && acceptedProblemIds.length === 0) {
        throw new Error("LeetCode returned no accepted-question history for this signed-in account.");
      }
    } catch (cause) {
      console.error("[LeetAlly sync] Full accepted history import failed.", {
        error: cause instanceof Error ? cause.message : String(cause),
        totalSolved: solved.All ?? 0,
      });
      throw new Error(
        "Your profile loaded, but LeetCode accepted history could not be imported. Reload leetcode.com and press Refresh again.",
      );
    }
  }
  return {
    username: user.username,
    avatar: user.profile?.userAvatar,
    ranking: user.profile?.ranking,
    verifiedOwner: verifiedOwner && username.toLowerCase() === user.username.toLowerCase(),
    totalSolved: solved.All ?? 0,
    easySolved: solved.Easy ?? 0,
    mediumSolved: solved.Medium ?? 0,
    hardSolved: solved.Hard ?? 0,
    streak: user.userCalendar?.streak ?? 0,
    totalActiveDays: user.userCalendar?.totalActiveDays ?? 0,
    syncedAt: new Date().toISOString(),
    acceptedSlugs,
    acceptedProblemIds,
    submissionActivity,
    dailyChallengeActivity,
  };
}
