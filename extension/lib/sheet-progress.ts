import type { SheetProgress } from "./progress";
import { browser } from "wxt/browser";

interface SheetData {
  categories?: Array<{ problemIds?: Array<number | string> }>;
}

async function calculateBundledProgress(
  dataFile: string,
  acceptedProblemIds: number[],
): Promise<{ total: number; completed: number } | null> {
  try {
    const response = await fetch(
      browser.runtime.getURL(`data/${dataFile}` as never),
    );
    if (!response.ok) return null;
    const data = await response.json() as SheetData;
    const sheetIds = new Set<number>();
    for (const category of data.categories ?? []) {
      for (const id of category.problemIds ?? []) {
        const numericId = Number(id);
        if (Number.isFinite(numericId)) sheetIds.add(numericId);
      }
    }
    const completedSet = new Set(acceptedProblemIds);
    return {
      total: sheetIds.size,
      completed: [...sheetIds].filter((id) => completedSet.has(id)).length,
    };
  } catch {
    return null;
  }
}

async function fetchLeetCodeListSlugs(listId: string): Promise<string[]> {
  const response = await fetch("https://leetcode.com/graphql/", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      query: `query sheet($limit: Int, $skip: Int, $filters: QuestionListFilterInput) {
        problemsetQuestionList: questionList(categorySlug: "", limit: $limit, skip: $skip, filters: $filters) {
          questions: data { titleSlug }
        }
      }`,
      variables: { limit: 1000, skip: 0, filters: { listId } },
    }),
  });
  if (!response.ok) return [];
  const result = await response.json() as { data?: { problemsetQuestionList?: { questions?: Array<{ titleSlug: string }> } } };
  return result.data?.problemsetQuestionList?.questions?.map((question) => question.titleSlug) ?? [];
}

export async function updateSelectedSheetProgress(
  sheets: SheetProgress[],
  acceptedSlugs: string[],
  acceptedProblemIds: number[] = [],
): Promise<SheetProgress[]> {
  const accepted = new Set(acceptedSlugs);
  return Promise.all(sheets.map(async (sheet) => {
    if (!sheet.selected) return sheet;
    if (sheet.dataFile) {
      const bundled = await calculateBundledProgress(sheet.dataFile, acceptedProblemIds);
      if (bundled?.total) {
        return {
          ...sheet,
          total: bundled.total,
          completed: bundled.completed,
          autoTracked: true,
        };
      }
    }
    let slugs = sheet.problemSlugs ?? [];
    try {
      if (sheet.listId) {
        const listed = await fetchLeetCodeListSlugs(sheet.listId);
        if (listed.length) {
          slugs = listed;
          return {
            ...sheet,
            problemSlugs: slugs,
            total: slugs.length,
            completed: slugs.filter((slug) => accepted.has(slug)).length,
            autoTracked: true,
          };
        }
      }
    } catch {
      // Retain the last successfully discovered definition for offline use.
    }
    if (!slugs.length) return sheet;
    return {
      ...sheet,
      problemSlugs: slugs,
      total: slugs.length,
      completed: slugs.filter((slug) => accepted.has(slug)).length,
      autoTracked: true,
    };
  }));
}
