import { browser } from "wxt/browser";
import { loadProgress, PROGRESS_STORAGE_KEY, saveProgress, type ProgressData } from "./progress";
import { supabase } from "./supabase";

let reconciling = false;

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
  const friends = [...local.friends, ...(remote.friends ?? [])]
    .filter((item, index, all) => all.findIndex((candidate) => candidate.username.toLowerCase() === item.username.toLowerCase()) === index);
  const remoteSheets = new Map((remote.sheets ?? []).map((sheet) => [sheet.id, sheet]));

  return {
    ...local,
    solvedSlugs: { ...(remote.solvedSlugs ?? {}), ...local.solvedSlugs },
    activity,
    friends,
    interviews,
    sheets: local.sheets.map((sheet) => {
      const cloudSheet = remoteSheets.get(sheet.id);
      return cloudSheet ? { ...cloudSheet, ...sheet, completed: Math.max(cloudSheet.completed, sheet.completed) } : sheet;
    }),
    profile: local.profile ?? remote.profile,
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

export async function reconcileProgressWithCloud(userId: string): Promise<ProgressData> {
  reconciling = true;
  try {
    const local = await loadProgress();
    const { data, error } = await supabase
      .from("user_progress")
      .select("progress")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw error;
    const merged = data?.progress
      ? mergeProgress(local, data.progress as Partial<ProgressData>)
      : local;
    await saveProgress(merged);
    await uploadProgress(userId, merged);
    return merged;
  } finally {
    reconciling = false;
  }
}

export function startCloudProgressSync(): () => void {
  let timer: number | undefined;
  const onChanged = (
    changes: Record<string, Browser.storage.StorageChange>,
    areaName: string,
  ) => {
    if (areaName !== "local" || !changes[PROGRESS_STORAGE_KEY] || reconciling) return;
    if (timer !== undefined) window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      void supabase.auth.getSession().then(async ({ data }) => {
        if (!data.session) return;
        await uploadProgress(data.session.user.id, await loadProgress());
      }).catch(() => undefined);
    }, 600);
  };
  browser.storage.onChanged.addListener(onChanged);
  return () => {
    if (timer !== undefined) window.clearTimeout(timer);
    browser.storage.onChanged.removeListener(onChanged);
  };
}
