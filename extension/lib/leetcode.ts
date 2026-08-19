import type { InterviewContext } from "./api";
import {
  problemSlugFromPath,
  readDifficulty,
  readProblemTitle,
} from "./leetcode-context";

export class LeetCodeAdapter {
  isSupportedPage(): boolean {
    return (
      (location.hostname === "leetcode.com" || location.hostname === "www.leetcode.com") &&
      location.pathname.startsWith("/problems/")
    );
  }

  getProblemSlug(): string {
    return problemSlugFromPath(location.pathname) || "unknown-problem";
  }

  getProblemTitle(): string {
    return readProblemTitle();
  }

  getDifficulty(): string | null {
    return readDifficulty() || null;
  }

  getContext(): InterviewContext {
    return {
      platform: "leetcode",
      problemSlug: this.getProblemSlug(),
      problemTitle: this.getProblemTitle(),
      difficulty: this.getDifficulty(),
    };
  }
}
