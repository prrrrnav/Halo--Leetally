import { browser } from "wxt/browser";

export type CompanyId = string;
export type CompanyGroup = "featured" | "major" | "mass-hiring";

export interface CompanyOption {
  id: CompanyId;
  name: string;
  color: string;
  group: CompanyGroup;
  sourceSlug?: string;
}

export interface CompanyProblem {
  id?: number;
  slug: string;
  title: string;
  url: string;
  difficulty: "Easy" | "Medium" | "Hard";
  frequency?: number;
  acceptance?: number;
  topics: string[];
}

export interface CompanyProblemList {
  company: CompanyId;
  questions: CompanyProblem[];
  fetchedAt: string;
  sourceRepo: string;
  sourceUrl: string;
}

export const COMPANY_OPTIONS: CompanyOption[] = [
  { id: "google", name: "Google", color: "#4285f4", group: "featured" },
  { id: "amazon", name: "Amazon", color: "#ff9900", group: "featured" },
  { id: "meta", name: "Meta", color: "#5b8cff", group: "featured" },
  { id: "netflix", name: "Netflix", color: "#e50914", group: "featured" },
  { id: "cisco", name: "Cisco", color: "#25a9e0", group: "featured" },
  { id: "microsoft", name: "Microsoft", color: "#00a4ef", group: "major" },
  { id: "apple", name: "Apple", color: "#a3aaae", group: "major" },
  { id: "nvidia", name: "NVIDIA", color: "#76b900", group: "major" },
  { id: "adobe", name: "Adobe", color: "#ff4b4b", group: "major" },
  { id: "salesforce", name: "Salesforce", color: "#00a1e0", group: "major" },
  { id: "oracle", name: "Oracle", color: "#f80000", group: "major" },
  { id: "uber", name: "Uber", color: "#c5f1e7", group: "major" },
  { id: "airbnb", name: "Airbnb", color: "#ff5a5f", group: "major" },
  { id: "atlassian", name: "Atlassian", color: "#2684ff", group: "major" },
  { id: "bloomberg", name: "Bloomberg", color: "#8a63d2", group: "major" },
  { id: "bytedance", name: "ByteDance", color: "#25f4ee", group: "major" },
  { id: "linkedin", name: "LinkedIn", color: "#0a66c2", group: "major" },
  { id: "paypal", name: "PayPal", color: "#0070ba", group: "major" },
  { id: "walmart-labs", name: "Walmart", color: "#ffc220", group: "major" },
  { id: "goldman-sachs", name: "Goldman Sachs", color: "#7399c6", group: "major" },
  { id: "jpmorgan", name: "JPMorgan", color: "#9db5d7", group: "major" },
  { id: "intel", name: "Intel", color: "#00c7fd", group: "major" },
  { id: "accenture", name: "Accenture", color: "#a100ff", group: "mass-hiring" },
  { id: "tcs", name: "TCS", color: "#4f86c6", group: "mass-hiring" },
  { id: "infosys", name: "Infosys", color: "#007cc3", group: "mass-hiring" },
  { id: "wipro", name: "Wipro", color: "#ec4d97", group: "mass-hiring" },
  { id: "cognizant", name: "Cognizant", color: "#5b80d6", group: "mass-hiring" },
  { id: "capgemini", name: "Capgemini", color: "#12abdb", group: "mass-hiring" },
  { id: "hcl", name: "HCLTech", color: "#5f7cff", group: "mass-hiring" },
  { id: "tech-mahindra", name: "Tech Mahindra", color: "#e31837", group: "mass-hiring" },
  { id: "lti", name: "LTIMindtree", color: "#ff6b35", group: "mass-hiring" },
  { id: "deloitte", name: "Deloitte", color: "#86bc25", group: "mass-hiring" },
  { id: "ibm", name: "IBM", color: "#648fff", group: "mass-hiring" },
];

export const FEATURED_COMPANIES = COMPANY_OPTIONS.filter((company) => company.group === "featured");

const CACHE_KEY = "leetally-company-catalog-v4-snehasishroy-three-months-metrics";
const SOURCE_REPOS = [
  {
    repo: "snehasishroy/leetcode-companywise-interview-questions",
    branch: "master",
    path: (company: CompanyId) => `${COMPANY_OPTIONS.find((item) => item.id === company)?.sourceSlug ?? company}/three-months.csv`,
  },
] as const;

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === '"') {
      if (quoted && text[index + 1] === '"') { value += '"'; index += 1; }
      else quoted = !quoted;
    } else if (character === "," && !quoted) {
      row.push(value.trim()); value = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && text[index + 1] === "\n") index += 1;
      row.push(value.trim()); value = "";
      if (row.some(Boolean)) rows.push(row);
      row = [];
    } else value += character;
  }
  if (value || row.length) { row.push(value.trim()); if (row.some(Boolean)) rows.push(row); }
  return rows;
}

function problemSlug(url: string): string {
  return url.match(/leetcode\.com\/problems\/([^/?#]+)/i)?.[1]?.toLowerCase() ?? "";
}

function normalizeDifficulty(value: string): CompanyProblem["difficulty"] {
  const normalized = value.toLowerCase();
  if (normalized === "hard") return "Hard";
  if (normalized === "medium") return "Medium";
  return "Easy";
}

export function parseCompanyProblems(csv: string): CompanyProblem[] {
  const rows = parseCsv(csv);
  if (rows.length < 2) return [];
  const headers = rows[0].map((header) => header.replace(/^\uFEFF/, "").trim().toLowerCase());
  const indexOf = (...names: string[]) => headers.findIndex((header) => names.includes(header));
  const idIndex = indexOf("id");
  const urlIndex = indexOf("url", "link");
  const titleIndex = indexOf("title");
  const difficultyIndex = indexOf("difficulty");
  const frequencyIndex = indexOf("frequency %", "frequency");
  const acceptanceIndex = indexOf("acceptance %", "acceptance rate");
  const topicsIndex = indexOf("topics");
  if (urlIndex < 0 || titleIndex < 0 || difficultyIndex < 0) return [];
  const unique = new Map<string, CompanyProblem>();
  for (const row of rows.slice(1)) {
    const url = row[urlIndex]?.trim();
    const slug = problemSlug(url);
    if (!slug) continue;
    const numericId = idIndex >= 0 ? Number(row[idIndex]) : Number.NaN;
    const frequency = frequencyIndex >= 0 ? Number.parseFloat(row[frequencyIndex]) : Number.NaN;
    const acceptance = acceptanceIndex >= 0 ? Number.parseFloat(row[acceptanceIndex]) : Number.NaN;
    unique.set(slug, {
      id: Number.isFinite(numericId) ? numericId : undefined,
      slug,
      title: row[titleIndex]?.trim() || slug.replaceAll("-", " "),
      url,
      difficulty: normalizeDifficulty(row[difficultyIndex] ?? "Easy"),
      frequency: Number.isFinite(frequency) ? frequency : undefined,
      acceptance: Number.isFinite(acceptance) ? acceptance : undefined,
      topics: topicsIndex >= 0 ? (row[topicsIndex] ?? "").split(",").map((topic) => topic.trim()).filter(Boolean) : [],
    });
  }
  return [...unique.values()].sort((left, right) => (right.frequency ?? 0) - (left.frequency ?? 0));
}

function rawUrl(repo: string, branch: string, path: string): string {
  const encodedPath = path.split("/").map(encodeURIComponent).join("/");
  return `https://raw.githubusercontent.com/${repo}/${branch}/${encodedPath}`;
}

async function fetchCompany(company: CompanyId): Promise<CompanyProblemList> {
  for (const source of SOURCE_REPOS) {
    const path = source.path(company);
    const url = rawUrl(source.repo, source.branch, path);
    try {
      const response = await fetch(url, { cache: "no-store" });
      if (!response.ok) continue;
      const questions = parseCompanyProblems(await response.text());
      if (!questions.length) continue;
      return {
        company,
        questions,
        fetchedAt: new Date().toISOString(),
        sourceRepo: source.repo,
        sourceUrl: `https://github.com/${source.repo}/blob/${source.branch}/${path.split("/").map(encodeURIComponent).join("/")}`,
      };
    } catch {
      // The caller retains the last successful copy if the selected source is unavailable.
    }
  }
  throw new Error(`No three-month source is currently available for ${company}`);
}

export async function loadCompanyCatalog(): Promise<Partial<Record<CompanyId, CompanyProblemList>>> {
  return ((await browser.storage.local.get(CACHE_KEY))[CACHE_KEY] as Partial<Record<CompanyId, CompanyProblemList>> | undefined) ?? {};
}

export async function refreshCompanyCatalog(companyIds: CompanyId[] = FEATURED_COMPANIES.map(({ id }) => id)): Promise<Partial<Record<CompanyId, CompanyProblemList>>> {
  const cached = await loadCompanyCatalog();
  const results = await Promise.all([...new Set(companyIds)].map(async (id) => {
    try { return await fetchCompany(id); }
    catch { return cached[id]; }
  }));
  const updated = { ...cached };
  for (const result of results) if (result) updated[result.company] = result;
  await browser.storage.local.set({ [CACHE_KEY]: updated });
  return updated;
}
