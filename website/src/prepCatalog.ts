export type Difficulty = "Easy" | "Medium" | "Hard";
export type SheetQuestion = { id: string; title: string; difficulty: Difficulty; topic: string; url: string; frequency?: number };
export type Company = { id: string; name: string; mark: string; color: string; focus: string; fallback: string[]; sourceSlug?: string };

export const companies: Company[] = [
  { id: "google", name: "Google", mark: "G", color: "#4285f4", focus: "Graphs · DP · Design", fallback: ["Number of Islands", "Course Schedule", "LRU Cache", "Word Ladder", "Merge Intervals"] },
  { id: "amazon", name: "Amazon", mark: "a", color: "#ff9900", focus: "Trees · Arrays · Heaps", fallback: ["Two Sum", "K Closest Points to Origin", "Rotting Oranges", "Copy List with Random Pointer", "Top K Frequent Words"] },
  { id: "microsoft", name: "Microsoft", mark: "M", color: "#00a4ef", focus: "Strings · Trees · DP", fallback: ["Spiral Matrix", "Serialize and Deserialize Binary Tree", "Longest Palindromic Substring", "Reverse Linked List", "Coin Change"] },
  { id: "meta", name: "Meta", mark: "∞", color: "#5b8cff", focus: "Arrays · Graphs · Recursion", fallback: ["Valid Palindrome II", "Subarray Sum Equals K", "Binary Tree Vertical Order Traversal", "Clone Graph", "Remove Invalid Parentheses"] },
  { id: "apple", name: "Apple", mark: "A", color: "#aab2bd", focus: "Arrays · Strings · Trees", fallback: ["Group Anagrams", "Median of Two Sorted Arrays", "Product of Array Except Self", "Binary Tree Paths", "Design HashMap"] },
  { id: "netflix", name: "Netflix", mark: "N", color: "#e50914", focus: "Design · Graphs · Data", fallback: ["Design Twitter", "Task Scheduler", "Evaluate Division", "Time Based Key-Value Store", "All O`one Data Structure"] },
  { id: "uber", name: "Uber", mark: "U", color: "#d8fff5", focus: "Graphs · Geometry · Design", fallback: ["Bus Routes", "Minimum Cost to Connect Points", "Design Hit Counter", "Alien Dictionary", "The Skyline Problem"] },
  { id: "adobe", name: "Adobe", mark: "A", color: "#ff4b4b", focus: "Arrays · DP · Bit", fallback: ["Maximum Subarray", "House Robber", "Single Number", "Jump Game", "Decode Ways"] },
  { id: "atlassian", name: "Atlassian", mark: "▲", color: "#2684ff", focus: "Design · Queues · Trees", fallback: ["Logger Rate Limiter", "Design Snake Game", "Rank Teams by Votes", "Find Leaves of Binary Tree", "Meeting Rooms II"] },
  { id: "goldman-sachs", name: "Goldman Sachs", mark: "GS", color: "#7399c6", focus: "Arrays · Math · DP", fallback: ["Best Time to Buy and Sell Stock", "Trapping Rain Water", "Fraction to Recurring Decimal", "Unique Paths", "Maximum Product Subarray"] },
  { id: "tcs", name: "TCS", mark: "T", color: "#4f86c6", focus: "Fundamentals · Strings · Math", fallback: ["Palindrome Number", "Valid Anagram", "Move Zeroes", "Fibonacci Number", "Missing Number"] },
  { id: "infosys", name: "Infosys", mark: "I", color: "#00a8e0", focus: "Fundamentals · Arrays · Strings", fallback: ["Rotate Array", "First Unique Character in a String", "Majority Element", "Happy Number", "Pascal's Triangle"] },
  { id: "nvidia", name: "NVIDIA", mark: "N", color: "#76b900", focus: "Arrays · Bit · DP", fallback: [] },
  { id: "salesforce", name: "Salesforce", mark: "S", color: "#00a1e0", focus: "Design · Strings · Trees", fallback: [] },
  { id: "oracle", name: "Oracle", mark: "O", color: "#f80000", focus: "Arrays · SQL · Design", fallback: [] },
  { id: "airbnb", name: "Airbnb", mark: "A", color: "#ff5a5f", focus: "Graphs · Design · Strings", fallback: [] },
  { id: "bloomberg", name: "Bloomberg", mark: "B", color: "#8a63d2", focus: "Design · Arrays · Trees", fallback: [] },
  { id: "bytedance", name: "ByteDance", mark: "B", color: "#25f4ee", focus: "Graphs · DP · Strings", fallback: [] },
  { id: "linkedin", name: "LinkedIn", mark: "in", color: "#0a66c2", focus: "Design · Graphs · DP", fallback: [] },
  { id: "paypal", name: "PayPal", mark: "P", color: "#0070ba", focus: "Arrays · Strings · DP", fallback: [] },
  { id: "walmart-labs", name: "Walmart", mark: "W", color: "#ffc220", focus: "Arrays · Trees · Design", fallback: [] },
  { id: "jpmorgan", name: "JPMorgan", mark: "J", color: "#9db5d7", focus: "Arrays · Math · DP", fallback: [] },
  { id: "intel", name: "Intel", mark: "I", color: "#00c7fd", focus: "Bit · Arrays · DP", fallback: [] },
  { id: "cisco", name: "Cisco", mark: "C", color: "#25a9e0", focus: "Graphs · Bit · Design", fallback: [] },
  { id: "accenture", name: "Accenture", mark: ">", color: "#a100ff", focus: "Fundamentals · Arrays · Strings", fallback: [] },
  { id: "wipro", name: "Wipro", mark: "W", color: "#ec4d97", focus: "Fundamentals · Arrays · Math", fallback: [] },
  { id: "cognizant", name: "Cognizant", mark: "C", color: "#5b80d6", focus: "Fundamentals · Strings · SQL", fallback: [] },
  { id: "capgemini", name: "Capgemini", mark: "C", color: "#12abdb", focus: "Fundamentals · Arrays · Math", fallback: [] },
  { id: "hcl", name: "HCLTech", mark: "H", color: "#5f7cff", focus: "Fundamentals · Strings · Arrays", fallback: [] },
  { id: "tech-mahindra", name: "Tech Mahindra", mark: "T", color: "#e31837", focus: "Fundamentals · Arrays · SQL", fallback: [] },
  { id: "lti", name: "LTIMindtree", mark: "L", color: "#ff6b35", focus: "Fundamentals · Strings · Math", fallback: [] },
  { id: "deloitte", name: "Deloitte", mark: "D", color: "#86bc25", focus: "Arrays · SQL · Fundamentals", fallback: [] },
  { id: "ibm", name: "IBM", mark: "IBM", color: "#648fff", focus: "Arrays · Trees · Design", fallback: [] },
];

export const patternData: ReadonlyArray<readonly [string, string, readonly string[]]> = [
  ["Two Pointers", "Opposite ends or same-direction scans", ["Valid Palindrome", "Two Sum II - Input Array Is Sorted", "3Sum", "Container With Most Water", "Trapping Rain Water", "Remove Duplicates from Sorted Array", "Squares of a Sorted Array"]],
  ["Sliding Window", "Contiguous ranges with a moving boundary", ["Best Time to Buy and Sell Stock", "Longest Substring Without Repeating Characters", "Longest Repeating Character Replacement", "Permutation in String", "Minimum Size Subarray Sum", "Minimum Window Substring", "Sliding Window Maximum"]],
  ["Fast & Slow Pointers", "Cycles and middle-element detection", ["Linked List Cycle", "Linked List Cycle II", "Middle of the Linked List", "Happy Number", "Find the Duplicate Number", "Palindrome Linked List", "Reorder List"]],
  ["Merge Intervals", "Overlapping ranges and schedules", ["Merge Intervals", "Insert Interval", "Non-overlapping Intervals", "Meeting Rooms", "Meeting Rooms II", "Minimum Number of Arrows to Burst Balloons", "Employee Free Time"]],
  ["Cyclic Sort", "Numbers constrained to a known range", ["Missing Number", "Find All Numbers Disappeared in an Array", "Find the Duplicate Number", "Find All Duplicates in an Array", "Set Mismatch", "First Missing Positive", "Kth Missing Positive Number"]],
  ["In-place Linked List", "Reverse or reorder links with O(1) space", ["Reverse Linked List", "Reverse Linked List II", "Swap Nodes in Pairs", "Reverse Nodes in k-Group", "Rotate List", "Reorder List", "Palindrome Linked List"]],
  ["Monotonic Stack", "Next greater/smaller relationships", ["Daily Temperatures", "Next Greater Element I", "Next Greater Element II", "Online Stock Span", "Remove K Digits", "Largest Rectangle in Histogram", "Maximal Rectangle"]],
  ["Hash Map Counting", "Frequency, lookup and prefix state", ["Two Sum", "Valid Anagram", "Group Anagrams", "Top K Frequent Elements", "Longest Consecutive Sequence", "Subarray Sum Equals K", "Minimum Window Substring"]],
  ["Binary Search", "Sorted data or monotonic answer space", ["Binary Search", "Search a 2D Matrix", "Search in Rotated Sorted Array", "Find Minimum in Rotated Sorted Array", "Koko Eating Bananas", "Capacity To Ship Packages Within D Days", "Median of Two Sorted Arrays"]],
  ["Tree DFS", "Recursive path and subtree reasoning", ["Maximum Depth of Binary Tree", "Diameter of Binary Tree", "Balanced Binary Tree", "Path Sum II", "Binary Tree Maximum Path Sum", "Lowest Common Ancestor of a Binary Tree", "Serialize and Deserialize Binary Tree"]],
  ["Tree BFS", "Level-order and nearest-node problems", ["Binary Tree Level Order Traversal", "Binary Tree Right Side View", "Average of Levels in Binary Tree", "Minimum Depth of Binary Tree", "Binary Tree Zigzag Level Order Traversal", "Populating Next Right Pointers in Each Node", "All Nodes Distance K in Binary Tree"]],
  ["Graph DFS", "Connected components and reachability", ["Number of Islands", "Clone Graph", "Max Area of Island", "Pacific Atlantic Water Flow", "Surrounded Regions", "Evaluate Division", "Reconstruct Itinerary"]],
  ["Graph BFS", "Shortest unweighted path and spreading", ["Rotting Oranges", "Word Ladder", "Open the Lock", "Shortest Path in Binary Matrix", "01 Matrix", "Bus Routes", "Snakes and Ladders"]],
  ["Topological Sort", "Dependencies and valid ordering", ["Course Schedule", "Course Schedule II", "Alien Dictionary", "Minimum Height Trees", "Sequence Reconstruction", "Parallel Courses", "Find Eventual Safe States"]],
  ["Union Find", "Dynamic connectivity and grouping", ["Number of Provinces", "Redundant Connection", "Accounts Merge", "Graph Valid Tree", "Number of Connected Components in an Undirected Graph", "Satisfiability of Equality Equations", "Most Stones Removed with Same Row or Column"]],
  ["Heap / Top K", "Repeated min/max and streaming rank", ["Kth Largest Element in an Array", "Top K Frequent Elements", "K Closest Points to Origin", "Task Scheduler", "Find Median from Data Stream", "Merge k Sorted Lists", "IPO"]],
  ["Backtracking", "Enumerate choices with pruning", ["Subsets", "Combination Sum", "Permutations", "Subsets II", "Word Search", "Palindrome Partitioning", "N-Queens"]],
  ["Greedy", "Locally optimal choices with invariants", ["Maximum Subarray", "Jump Game", "Jump Game II", "Gas Station", "Hand of Straights", "Partition Labels", "Task Scheduler"]],
  ["1D Dynamic Programming", "State derived from earlier positions", ["Climbing Stairs", "Min Cost Climbing Stairs", "House Robber", "House Robber II", "Longest Palindromic Substring", "Palindromic Substrings", "Coin Change"]],
  ["2D Dynamic Programming", "Grid or two-sequence state", ["Unique Paths", "Longest Common Subsequence", "Best Time to Buy and Sell Stock with Cooldown", "Coin Change II", "Target Sum", "Interleaving String", "Edit Distance"]],
];

const CACHE_PREFIX = "leetally-company-top-v1:";
const CACHE_AGE = 24 * 60 * 60 * 1000;

function parseCsv(text: string): string[][] {
  const rows: string[][] = []; let row: string[] = []; let value = ""; let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === '"') { if (quoted && text[index + 1] === '"') { value += '"'; index += 1; } else quoted = !quoted; }
    else if (character === "," && !quoted) { row.push(value.trim()); value = ""; }
    else if ((character === "\n" || character === "\r") && !quoted) { if (character === "\r" && text[index + 1] === "\n") index += 1; row.push(value.trim()); value = ""; if (row.some(Boolean)) rows.push(row); row = []; }
    else value += character;
  }
  if (value || row.length) { row.push(value.trim()); if (row.some(Boolean)) rows.push(row); }
  return rows;
}

function normalizeDifficulty(value: string): Difficulty {
  return value.toLowerCase() === "hard" ? "Hard" : value.toLowerCase() === "medium" ? "Medium" : "Easy";
}

function parseCompanyQuestions(csv: string, company: Company): SheetQuestion[] {
  const rows = parseCsv(csv); if (rows.length < 2) return [];
  const headers = rows[0].map(header => header.replace(/^\uFEFF/, "").toLowerCase());
  const at = (...names: string[]) => headers.findIndex(header => names.includes(header.trim()));
  const titleAt = at("title"), urlAt = at("url", "link"), difficultyAt = at("difficulty"), frequencyAt = at("frequency %", "frequency"), topicsAt = at("topics");
  if (titleAt < 0 || urlAt < 0 || difficultyAt < 0) return [];
  return rows.slice(1).map((row): SheetQuestion | null => {
    const title = row[titleAt]?.trim(), url = row[urlAt]?.trim(); if (!title || !url) return null;
    const frequency = Number.parseFloat(row[frequencyAt] || "");
    return { id: `company:${company.id}:${title}`, title, url, difficulty: normalizeDifficulty(row[difficultyAt] || "Easy"), topic: (row[topicsAt] || "").split(",")[0]?.trim() || company.focus.split(" · ")[0], frequency: Number.isFinite(frequency) ? frequency : undefined };
  }).filter((question): question is SheetQuestion => Boolean(question)).sort((left, right) => (right.frequency ?? 0) - (left.frequency ?? 0));
}

export function fallbackCompanyQuestions(company: Company): SheetQuestion[] {
  return company.fallback.map((title, index) => ({ id: `company:${company.id}:${title}`, title, difficulty: (["Easy", "Medium", "Medium", "Hard", "Medium"] as Difficulty[])[index] || "Medium", topic: company.focus.split(" · ")[index % 3], url: `https://leetcode.com/problemset/?search=${encodeURIComponent(title)}` }));
}

export async function loadCompanyQuestions(company: Company): Promise<SheetQuestion[]> {
  const cacheKey = `${CACHE_PREFIX}${company.id}`;
  try {
    const cached = JSON.parse(localStorage.getItem(cacheKey) || "null") as { savedAt: number; questions: SheetQuestion[] } | null;
    if (cached && Date.now() - cached.savedAt < CACHE_AGE && cached.questions.length) return cached.questions;
  } catch { /* Ignore malformed cache data. */ }
  const path = `${company.sourceSlug ?? company.id}/three-months.csv`.split("/").map(encodeURIComponent).join("/");
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(`https://raw.githubusercontent.com/snehasishroy/leetcode-companywise-interview-questions/master/${path}`, { signal: controller.signal });
    if (!response.ok) throw new Error("Top-question source is unavailable");
    const questions = parseCompanyQuestions(await response.text(), company);
    if (!questions.length) throw new Error("No ranked questions were returned");
    localStorage.setItem(cacheKey, JSON.stringify({ savedAt: Date.now(), questions }));
    return questions;
  } finally {
    window.clearTimeout(timeout);
  }
}
