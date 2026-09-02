import { browser } from "wxt/browser";

export type Difficulty = "easy" | "medium" | "hard";
export type InterviewType = "dsa" | "behavioral" | "lld" | "hld";
export type TargetCompanyId =
  "google" | "amazon" | "meta" | "ibm" | "accenture" | "tcs" | "hcltech" | "american-express" | "microsoft";

export const INTERVIEW_COMPANIES: Array<{
  id: TargetCompanyId;
  name: string;
  voice: string;
  gender: "Male" | "Female" | "Default";
}> = [
  { id: "google", name: "Google", voice: "Developer default", gender: "Default" },
  { id: "amazon", name: "Amazon", voice: "Jordan", gender: "Male" },
  { id: "meta", name: "Meta", voice: "Paula", gender: "Female" },
  { id: "microsoft", name: "Microsoft", voice: "Slax Host", gender: "Male" },
  { id: "ibm", name: "IBM", voice: "Slax", gender: "Male" },
  { id: "american-express", name: "American Express", voice: "Hannah", gender: "Female" },
  { id: "accenture", name: "Accenture", voice: "Laura", gender: "Female" },
  { id: "tcs", name: "TCS", voice: "Sarah", gender: "Female" },
  { id: "hcltech", name: "HCLTech", voice: "Adrian", gender: "Male" },
];

export interface SheetProgress {
  id: string;
  name: string;
  completed: number;
  total: number;
  color: string;
  url: string;
  selected?: boolean;
  problemSlugs?: string[];
  autoTracked?: boolean;
  listId?: string;
  dataFile?: string;
}

export interface LeetCodeProfile {
  username: string;
  verifiedOwner?: boolean;
  avatar?: string;
  ranking?: number;
  totalSolved: number;
  easySolved: number;
  mediumSolved: number;
  hardSolved: number;
  streak?: number;
  totalActiveDays?: number;
  syncedAt: string;
  acceptedSlugs?: string[];
  acceptedProblemIds?: number[];
  submissionActivity?: Record<string, number>;
  dailyChallengeActivity?: Record<string, boolean>;
}

export interface PlannerSettings {
  dailyProblemGoal: number;
  weeklyInterviewGoal: number;
  mockInterviewDate: string;
  interviewDate: string;
  reminders: boolean;
  targetCompany: TargetCompanyId;
  interviewType: InterviewType;
}

export interface InterviewHistoryRecord {
  id: string;
  userId: string;
  companyId: TargetCompanyId;
  interviewType: InterviewType;
  problemTitle: string;
  problemSlug: string;
  difficulty?: string | null;
  completedAt: string;
  durationSeconds: number;
  overallScore: number;
  communicationScore: number;
  problemSolvingScore: number;
  complexityScore: number;
  edgeCaseScore: number;
  strengths: string[];
  improvements: string[];
  summary: string;
}

export interface TrackedFriend {
  username: string;
  avatar?: string;
  ranking?: number;
  totalSolved: number;
  easySolved: number;
  mediumSolved: number;
  hardSolved: number;
  streak?: number;
  totalActiveDays?: number;
  syncedAt: string;
}

export interface ProgressData {
  solvedSlugs: Record<string, Difficulty>;
  activity: Record<string, number>;
  sheets: SheetProgress[];
  profile?: LeetCodeProfile;
  friends: TrackedFriend[];
  friendComparisonId?: string;
  planner: PlannerSettings;
  interviews: InterviewHistoryRecord[];
}

export const PROGRESS_STORAGE_KEY = "leetally-progress-v1";

export const DEFAULT_PROGRESS: ProgressData = {
  solvedSlugs: {},
  activity: {},
  friends: [],
  interviews: [],
  sheets: [
    {
      id: "blind-75",
      name: "Blind 75",
      completed: 0,
      total: 74,
      color: "#13c8b2",
      url: "https://neetcode.io/practice",
      selected: true,
      dataFile: "blind75.json",
    },
    {
      id: "neetcode-150",
      name: "NeetCode 150",
      completed: 0,
      total: 158,
      color: "#ff9f1a",
      url: "https://neetcode.io/practice",
      selected: true,
      dataFile: "neetcode150.json",
    },
    {
      id: "striver-sde",
      name: "Striver SDE Sheet",
      completed: 0,
      total: 121,
      color: "#ec4899",
      url: "https://takeuforward.org/interviews/strivers-sde-sheet-top-coding-interview-problems",
      selected: false,
      dataFile: "striversde.json",
    },
    {
      id: "leetcode-75",
      name: "LeetCode 75",
      completed: 0,
      total: 75,
      color: "#ff3e68",
      url: "https://leetcode.com/studyplan/leetcode-75/",
      selected: true,
      dataFile: "leetcode75.json",
    },
    {
      id: "striver-a2z",
      name: "Striver A2Z DSA",
      completed: 0,
      total: 206,
      color: "#8b5cf6",
      url: "https://takeuforward.org/strivers-a2z-dsa-course/strivers-a2z-dsa-course-sheet-2",
      selected: false,
      listId: "vmc1m9wv",
    },
    {
      id: "namaste-dsa",
      name: "Namaste DSA",
      completed: 0,
      total: 147,
      color: "#3b82f6",
      url: "https://namastedev.com/learn/namaste-dsa",
      selected: false,
      dataFile: "namastedsa.json",
    },
    {
      id: "fraz-dsa",
      name: "Fraz DSA Sheet",
      completed: 0,
      total: 305,
      color: "#f97316",
      url: "https://www.codingninjas.com/studio/problem-lists/frazs-dsa-sheet-problems",
      selected: false,
      dataFile: "frazdsa.json",
    },
    {
      id: "grind-75",
      name: "Grind 75",
      completed: 0,
      total: 75,
      color: "#22c55e",
      url: "https://www.techinterviewhandbook.org/grind75",
      selected: false,
      listId: "rab78cw1",
    },
  ],
  planner: {
    dailyProblemGoal: 1,
    weeklyInterviewGoal: 2,
    mockInterviewDate: "",
    interviewDate: "",
    reminders: false,
    targetCompany: "google",
    interviewType: "dsa",
  },
};

export function localDateKey(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export async function loadProgress(): Promise<ProgressData> {
  const stored = (await browser.storage.local.get(PROGRESS_STORAGE_KEY))[PROGRESS_STORAGE_KEY] as
    Partial<ProgressData> | undefined;
  const storedSheets = new Map((stored?.sheets ?? []).map((sheet) => [sheet.id, sheet]));
  return {
    solvedSlugs: stored?.solvedSlugs ?? {},
    activity: stored?.activity ?? {},
    sheets: DEFAULT_PROGRESS.sheets.map((sheet) => {
      const merged = { ...sheet, ...storedSheets.get(sheet.id) };
      if (!sheet.dataFile) return merged;
      return { ...merged, total: sheet.total, completed: Math.min(merged.completed, sheet.total) };
    }),
    profile: stored?.profile,
    friends: stored?.friends ?? [],
    friendComparisonId: stored?.friendComparisonId,
    planner: { ...DEFAULT_PROGRESS.planner, ...(stored?.planner ?? {}) },
    interviews: stored?.interviews ?? [],
  };
}

export async function saveProgress(progress: ProgressData): Promise<void> {
  await browser.storage.local.set({ [PROGRESS_STORAGE_KEY]: progress });
}

export function isTargetCompanyId(value: unknown): value is TargetCompanyId {
  return INTERVIEW_COMPANIES.some((company) => company.id === value);
}

export function recordSolved(progress: ProgressData, slug: string, difficulty: Difficulty): ProgressData {
  if (!slug || progress.solvedSlugs[slug]) return progress;
  const today = localDateKey();
  return {
    ...progress,
    solvedSlugs: { ...progress.solvedSlugs, [slug]: difficulty },
    activity: { ...progress.activity, [today]: (progress.activity[today] ?? 0) + 1 },
  };
}

export function calculateStreak(activity: Record<string, number>): number {
  let cursor = new Date();
  if (!activity[localDateKey(cursor)]) cursor.setDate(cursor.getDate() - 1);
  let streak = 0;
  while (activity[localDateKey(cursor)]) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}
