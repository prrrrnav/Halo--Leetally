export interface LeetCodeContext {
  problemTitle: string;
  problemDescription: string;
  difficulty: string;
  programmingLanguage: string;
  code: string;
  visibleOutput: string;
  problemTopics: string[];
}

const LANGUAGE_NAMES = new Set([
  "C", "C++", "C#", "Dart", "Elixir", "Erlang", "Go", "Java",
  "JavaScript", "Kotlin", "PHP", "Python", "Python3", "Racket",
  "Ruby", "Rust", "Scala", "Swift", "TypeScript",
]);

function visibleText(element: Element | null | undefined): string {
  return element instanceof HTMLElement
    ? element.innerText.trim()
    : element?.textContent?.trim() ?? "";
}

function normalizedTitle(value: string): string {
  return value
    .replace(/\s+-\s+LeetCode.*$/i, "")
    .replace(/^\d+\.\s*/, "")
    .trim();
}

export function problemSlugFromPath(pathname: string): string {
  return pathname.match(/\/problems\/([^/]+)/i)?.[1]?.toLowerCase() ?? "";
}

export function readProblemTitle(
  root: Document = document,
  pathname: string = location.pathname,
): string {
  const slug = problemSlugFromPath(pathname);
  const stableTitle = visibleText(root.querySelector('[data-cy="question-title"]'));
  if (stableTitle) return normalizedTitle(stableTitle);

  if (slug) {
    const matchingLink = Array.from(root.querySelectorAll<HTMLAnchorElement>('a[href*="/problems/"]'))
      .find((link) => problemSlugFromPath(new URL(link.href, location.origin).pathname) === slug);
    const linkedTitle = visibleText(matchingLink);
    if (linkedTitle) return normalizedTitle(linkedTitle);
  }

  const documentTitle = normalizedTitle(root.title);
  if (documentTitle) return documentTitle;

  return slug.split("-").filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");
}

export function readProblemDescription(root: Document = document): string {
  const selectors = [
    '[data-track-load="description_content"]',
    '[data-cy="question-content"]',
    '[class*="HTMLContent_html"]',
  ];
  for (const selector of selectors) {
    const text = visibleText(root.querySelector(selector));
    if (text.length >= 40) return text.slice(0, 20_000);
  }
  return "";
}

export function readDifficulty(root: Document = document): string {
  const scopedCandidates = root.querySelectorAll<HTMLElement>(
    '[class*="text-difficulty-"], [class*="difficulty-easy"], [class*="difficulty-medium"], [class*="difficulty-hard"]',
  );
  for (const element of scopedCandidates) {
    const value = visibleText(element).toLowerCase();
    if (value === "easy" || value === "medium" || value === "hard") return value;
  }

  for (const element of root.querySelectorAll<HTMLElement>("div, span")) {
    const value = visibleText(element).toLowerCase();
    if (value === "easy" || value === "medium" || value === "hard") return value;
  }
  return "";
}

export function readProgrammingLanguage(root: Document = document): string {
  const buttons = root.querySelectorAll<HTMLButtonElement>(
    'button[aria-haspopup="dialog"], button[aria-haspopup="listbox"], button[id*="headlessui-listbox-button"]',
  );
  for (const button of buttons) {
    const value = visibleText(button).replace(/\s+/g, " ");
    if (LANGUAGE_NAMES.has(value)) return value;
  }
  return "";
}

export function readVisibleOutput(root: Document = document): string {
  const selectors = [
    '[data-e2e-locator="console-result"]',
    '[data-e2e-locator="console-test-result"]',
    '[data-e2e-locator*="result-container"]',
    '[data-cy="result-container"]',
    '[class*="console-result"]',
  ];
  const output = selectors
    .flatMap((selector) => Array.from(root.querySelectorAll(selector)))
    .map(visibleText)
    .filter(Boolean);
  return [...new Set(output)].join("\n").slice(0, 20_000);
}

export function readProblemTopics(root: Document = document): string[] {
  return [...new Set(
    Array.from(root.querySelectorAll<HTMLAnchorElement>('a[href*="/tag/"]'))
      .map(visibleText)
      .filter((topic) => topic.length > 0 && topic.length <= 80),
  )].slice(0, 30);
}

export function readLeetCodeContext(
  code = "",
  programmingLanguage = "",
  root: Document = document,
  pathname: string = location.pathname,
): LeetCodeContext {
  return {
    problemTitle: readProblemTitle(root, pathname),
    problemDescription: readProblemDescription(root),
    difficulty: readDifficulty(root),
    programmingLanguage: programmingLanguage || readProgrammingLanguage(root),
    code,
    visibleOutput: readVisibleOutput(root),
    problemTopics: readProblemTopics(root),
  };
}
