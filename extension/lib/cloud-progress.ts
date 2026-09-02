import { browser } from "wxt/browser";
import { DEFAULT_PROGRESS, loadProgress, PROGRESS_STORAGE_KEY, saveProgress, type ProgressData } from "./progress";
import { supabase } from "./supabase";

let reconciling = false;
export const PROGRESS_OWNER_STORAGE_KEY = "leetally-progress-owner-v1";

function freshProgress(): ProgressData {
  return {
    ...DEFAULT_PROGRESS,
    solvedSlugs: {},
    activity: {},
    friends: [],
    interviews: [],
    sheets: DEFAULT_PROGRESS.sheets.map((sheet) => ({ ...sheet })),
    planner: { ...DEFAULT_PROGRESS.planner },
  };
}

function mergeProgress(local: ProgressData, remote: Partial<ProgressData>): ProgressData {
  const remoteInterviews = remote.interviews ?? [];
  const interviews = [...local.interviews, ...remoteInterviews]
    .filter((item, index, all) => all.findIndex((candidate) => candidate.id === item.id) === index)
    .sort((left, right) => right.completedAt.localeCompare(left.completedAt))
    .slice(0, 100);
  const activity = { ...(remote.activity ?? {}) };
  for (const [date, count] of Object.entries(local.activity)) {
    activity[date] = Math.max(activity[date] ?? 0, count);
  }
  const friends = [...local.friends, ...(remote.friends ?? [])].filter(
    (item, index, all) =>
      all.findIndex((candidate) => candidate.username.toLowerCase() === item.username.toLowerCase()) === index,
  );
  const remoteSheets = new Map((remote.sheets ?? []).map((sheet) => [sheet.id, sheet]));

  return {
    ...local,
    solvedSlugs: { ...(remote.solvedSlugs ?? {}), ...local.solvedSlugs },
    activity,
    friends,
    interviews,
    sheets: local.sheets.map((sheet) => {
      const cloudSheet = remoteSheets.get(sheet.id);
      return cloudSheet
        ? { ...cloudSheet, ...sheet, completed: Math.max(cloudSheet.completed, sheet.completed) }
        : sheet;
    }),
    profile: local.profile ?? remote.profile,
    friendComparisonId: local.friendComparisonId ?? remote.friendComparisonId,
    // Preserve the current device's latest planner choice, including company voice.
    planner: { ...(remote.planner ?? local.planner), ...local.planner },
  };
}

async function uploadProgress(userId: string, progress: ProgressData): Promise<void> {
  const { error } = await supabase.from("user_progress").upsert({
    user_id: userId,
    progress,
    leetcode_username: progress.profile?.username ?? null,
    updated_at: new Date().toISOString(),
  });
  if (error) throw error;
}

/** Persist account-owned progress locally first, then confirm its cloud copy. */
export async function saveAccountProgress(userId: string, progress: ProgressData): Promise<void> {
  await saveProgress(progress);
  await uploadProgress(userId, progress);
  await browser.storage.local.set({ [PROGRESS_OWNER_STORAGE_KEY]: userId });
}

export function removeLeetCodeIdentity(progress: ProgressData): ProgressData {
  const importedDates = new Set(Object.keys(progress.profile?.submissionActivity ?? {}));
  return {
    ...progress,
    profile: undefined,
    activity: Object.fromEntries(Object.entries(progress.activity).filter(([date]) => !importedDates.has(date))),
    sheets: progress.sheets.map((sheet) =>
      sheet.autoTracked ? { ...sheet, completed: 0, autoTracked: false } : sheet,
    ),
  };
}

export async function saveLinkedLeetCodeProgress(
  userId: string,
  username: string,
  progress: ProgressData,
): Promise<void> {
  const normalizedUsername = username.trim().toLowerCase();
  const { error: linkError } = await supabase.from("leetcode_identity_links").upsert(
    {
      user_id: userId,
      username: username.trim(),
      normalized_username: normalizedUsername,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );
  if (linkError) {
    throw linkError;
  }
  await uploadProgress(userId, progress);
  await browser.storage.local.set({ [PROGRESS_OWNER_STORAGE_KEY]: userId });
}

export async function unlinkLeetCodeIdentity(userId: string): Promise<ProgressData> {
  const current = await loadProgress();
  const unlinked = removeLeetCodeIdentity(current);
  const { error } = await supabase.from("leetcode_identity_links").delete().eq("user_id", userId);
  if (error) throw error;
  await saveProgress(unlinked);
  await uploadProgress(userId, unlinked);
  await browser.storage.local.set({ [PROGRESS_OWNER_STORAGE_KEY]: userId });
  return unlinked;
}

export async function clearLocalAccountProgress(): Promise<void> {
  await browser.storage.local.remove([PROGRESS_STORAGE_KEY, PROGRESS_OWNER_STORAGE_KEY]);
}

export async function reconcileProgressWithCloud(userId: string): Promise<ProgressData> {
  reconciling = true;
  try {
    const local = await loadProgress();
    const owner = (await browser.storage.local.get(PROGRESS_OWNER_STORAGE_KEY))[PROGRESS_OWNER_STORAGE_KEY] as
      string | undefined;
    const { data, error } = await supabase.from("user_progress").select("progress").eq("user_id", userId).maybeSingle();
    if (error) throw error;
    const remote = data?.progress as Partial<ProgressData> | undefined;
    const merged = remote
      ? !owner || owner === userId
        ? mergeProgress(local, remote)
        : mergeProgress(freshProgress(), remote)
      : owner && owner !== userId
        ? freshProgress()
        : local;
    await saveProgress(merged);
    await uploadProgress(userId, merged);
    await browser.storage.local.set({ [PROGRESS_OWNER_STORAGE_KEY]: userId });
    return merged;
  } finally {
    reconciling = false;
  }
}

export function startCloudProgressSync(): () => void {
  let timer: number | undefined;
  const onChanged = (changes: Record<string, Browser.storage.StorageChange>, areaName: string) => {
    if (areaName !== "local" || !changes[PROGRESS_STORAGE_KEY] || reconciling) return;
    if (timer !== undefined) window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      void supabase.auth
        .getSession()
        .then(async ({ data }) => {
          if (!data.session) return;
          await uploadProgress(data.session.user.id, await loadProgress());
        })
        .catch(() => undefined);
    }, 600);
  };
  browser.storage.onChanged.addListener(onChanged);
  return () => {
    if (timer !== undefined) window.clearTimeout(timer);
    browser.storage.onChanged.removeListener(onChanged);
  };
}
