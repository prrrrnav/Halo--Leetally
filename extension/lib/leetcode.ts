import type { InterviewContext } from "./api";

export class LeetCodeAdapter {
  isSupportedPage(): boolean {
    return (
      location.hostname === "leetcode.com" &&
      location.pathname.startsWith("/problems/")
    );
  }

  getProblemSlug(): string {
    const parts = location.pathname.split("/").filter(Boolean);
    const index = parts.indexOf("problems");

    return parts[index + 1] ?? "unknown-problem";
  }

  getProblemTitle(): string {
    const selectors = [
      "[data-cy='question-title']",
      "div.text-title-large",
      "a[href^='/problems/']",
    ];

    for (const selector of selectors) {
      const element = document.querySelector<HTMLElement>(selector);
      const text = element?.innerText.trim();

      if (text && text.length < 300) {
        return text.replace(/^\d+\.\s*/, "");
      }
    }

    return this.getProblemSlug()
      .split("-")
      .map(
        (part) =>
          part.charAt(0).toUpperCase() + part.slice(1),
      )
      .join(" ");
  }

  getDifficulty(): string | null {
    const candidates = Array.from(
      document.querySelectorAll<HTMLElement>("div, span"),
    );

    for (const element of candidates) {
      const text = element.innerText.trim();

      if (text === "Easy") return "easy";
      if (text === "Medium") return "medium";
      if (text === "Hard") return "hard";
    }

    return null;
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