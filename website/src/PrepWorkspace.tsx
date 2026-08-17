import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { companies as catalogCompanies, fallbackCompanyQuestions, loadCompanyQuestions, patternData as catalogPatternData } from "./prepCatalog";

export type PrepRoute = "/preparation" | "/company-dsa" | "/dsa-patterns" | "/sql-sheet";
type Difficulty = "Easy" | "Medium" | "Hard";
type Question = { id: string; title: string; difficulty: Difficulty; topic: string; url: string; frequency?: number };

const sqlQuestions: Question[] = [
  ["second-highest-salary", "Second Highest Salary", "Medium", "Window functions"], ["duplicate-emails", "Duplicate Emails", "Easy", "Grouping"],
  ["department-top-three", "Department Top Three Salaries", "Hard", "Window functions"], ["customers-never-order", "Customers Who Never Order", "Easy", "Joins"],
  ["consecutive-numbers", "Consecutive Numbers", "Medium", "Self join"], ["managers-five-reports", "Managers with at Least 5 Direct Reports", "Medium", "Grouping"],
  ["rank-scores", "Rank Scores", "Medium", "Window functions"], ["rising-temperature", "Rising Temperature", "Easy", "Date functions"],
  ["trips-users", "Trips and Users", "Hard", "Conditional aggregation"], ["exchange-seats", "Exchange Seats", "Medium", "CASE expressions"],
  ["tree-node", "Tree Node", "Medium", "CASE expressions"], ["game-play-analysis", "Game Play Analysis IV", "Medium", "CTEs"],
  ["restaurant-growth", "Restaurant Growth", "Medium", "Rolling windows"], ["market-analysis", "Market Analysis I", "Medium", "Joins"],
  ["monthly-transactions", "Monthly Transactions I", "Medium", "Aggregation"], ["immediate-delivery", "Immediate Food Delivery II", "Medium", "CTEs"],
  ["product-sales", "Product Sales Analysis III", "Medium", "Window functions"], ["sales-person", "Sales Person", "Easy", "Anti join"],
  ["employees-bonus", "Employee Bonus", "Easy", "Left join"], ["nth-highest-salary", "Nth Highest Salary", "Medium", "Subqueries"],
].map(([id, title, difficulty, topic]) => ({ id, title, difficulty: difficulty as Difficulty, topic, url: `https://leetcode.com/problems/${id}/` }));

function Icon({ children }: { children: ReactNode }) { return <span className="prep-icon" aria-hidden="true">{children}</span>; }

function useProgress() {
  const [completed, setCompleted] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem("leetally-sheet-progress") || "[]") as string[]; } catch { return []; }
  });
  useEffect(() => { localStorage.setItem("leetally-sheet-progress", JSON.stringify(completed)); }, [completed]);
  const toggle = (id: string) => setCompleted(current => current.includes(id) ? current.filter(item => item !== id) : [...current, id]);
  return { completed, toggle };
}

function Sidebar({ route, go }: { route: PrepRoute; go: (route: PrepRoute) => void }) {
  const links: { route: PrepRoute; label: string; icon: string }[] = [
    { route: "/preparation", label: "Dashboard", icon: "⌂" },
    { route: "/company-dsa", label: "Company-wise DSA", icon: "▦" },
    { route: "/dsa-patterns", label: "20 DSA Patterns", icon: "◎" },
    { route: "/sql-sheet", label: "SQL Sheet", icon: "▤" },
  ];
  return <aside className="prep-sidebar">
    <div className="prep-side-heading">PREPARATION</div>
    <nav aria-label="Preparation sheets">{links.map(link => <button key={link.route} className={route === link.route ? "active" : ""} onClick={() => go(link.route)}><Icon>{link.icon}</Icon>{link.label}<span>›</span></button>)}</nav>
    <div className="prep-side-card"><span>INTERVIEW MODE</span><b>Ready to explain?</b><p>Turn any solved problem into a realistic voice interview.</p><a href="https://leetcode.com" target="_blank" rel="noreferrer">Open LeetCode ↗</a></div>
  </aside>;
}

function ProgressRing({ value, label }: { value: number; label: string }) {
  return <div className="progress-ring" style={{ "--progress": `${value * 3.6}deg` } as CSSProperties}><div><b>{value}%</b><span>{label}</span></div></div>;
}

function Dashboard({ completed, go }: { completed: string[]; go: (route: PrepRoute) => void }) {
  const cards = [
    { route: "/company-dsa" as const, eyebrow: "TARGETED PREP", title: "Company-wise DSA", copy: "Frequency-ranked questions from 30+ product and service companies.", meta: "Updated three-month lists", icon: "▦", accent: "blue" },
    { route: "/dsa-patterns" as const, eyebrow: "CORE PLAYBOOK", title: "20 DSA Patterns", copy: "Master the reusable patterns behind the majority of coding interview problems.", meta: "140 essential problems", icon: "◎", accent: "violet" },
    { route: "/sql-sheet" as const, eyebrow: "DATABASE TRACK", title: "SQL Sheet", copy: "Build confidence from joins and grouping through windows and advanced queries.", meta: "20 curated problems", icon: "▤", accent: "orange" },
  ];
  return <>
    <div className="prep-welcome"><div><span>PREPARATION / DASHBOARD</span><h1>Your interview prep,<br /><em>in one place.</em></h1><p>Pick a track, solve consistently, and keep your progress moving.</p></div><ProgressRing value={Math.min(100, Math.round(completed.length / 6))} label="overall" /></div>
    <div className="prep-stat-row"><div><span>PROBLEMS COMPLETED</span><b>{completed.length}</b><small>Saved on this device</small></div><div><span>ACTIVE TRACKS</span><b>{new Set(completed.map(id => id.split(":")[0])).size}</b><small>of 3 available</small></div><div><span>YOUR NEXT GOAL</span><b>{Math.max(0, 10 - completed.length)}</b><small>problems to first milestone</small></div></div>
    <section className="prep-dashboard-section"><div className="prep-section-title"><div><span>YOUR SHEETS</span><h2>Choose a track</h2></div><p>Every solved problem updates your progress automatically.</p></div><div className="prep-track-grid">{cards.map(card => <button className={`prep-track-card ${card.accent}`} key={card.route} onClick={() => go(card.route)}><Icon>{card.icon}</Icon><span>{card.eyebrow}</span><h3>{card.title}</h3><p>{card.copy}</p><div><small>{card.meta}</small><b>Start sheet →</b></div></button>)}</div></section>
  </>;
}

function CompanySheet({ completed, toggle }: { completed: string[]; toggle: (id: string) => void }) {
  const [company, setCompany] = useState(catalogCompanies[0]);
  const [questions, setQuestions] = useState<Question[]>(() => fallbackCompanyQuestions(catalogCompanies[0]));
  const [companySearch, setCompanySearch] = useState("");
  const [questionSearch, setQuestionSearch] = useState("");
  const [limit, setLimit] = useState(50);
  const [sourceState, setSourceState] = useState<"loading" | "live" | "fallback">("loading");
  useEffect(() => {
    let current = true;
    setSourceState("loading"); setQuestionSearch("");
    const fallback = fallbackCompanyQuestions(company);
    setQuestions(fallback);
    void loadCompanyQuestions(company).then(next => { if (current) { setQuestions(next); setSourceState("live"); } }).catch(() => { if (current) { setQuestions(fallback); setSourceState("fallback"); } });
    return () => { current = false; };
  }, [company]);
  const visibleCompanies = catalogCompanies.filter(item => item.name.toLowerCase().includes(companySearch.toLowerCase()));
  const visibleQuestions = questions.filter(question => `${question.title} ${question.topic}`.toLowerCase().includes(questionSearch.toLowerCase())).slice(0, limit);
  const completedCount = questions.filter(question => completed.includes(question.id)).length;
  return <SheetFrame eyebrow="TARGETED PREP" title="Company-wise DSA" copy="Top interview questions ranked by recent frequency, using the same three-month catalog as the extension." stats={`${catalogCompanies.length} companies · frequency ranked`}>
    <div className="company-browser"><div className="company-picker"><label>Find a company<input value={companySearch} onChange={event => setCompanySearch(event.target.value)} placeholder="Search companies..." /></label><div className="company-list">{visibleCompanies.map(item => <button key={item.id} onClick={() => setCompany(item)} className={item.id === company.id ? "active" : ""}><i style={{ background: `${item.color}18`, color: item.color }}>{item.mark}</i><span><b>{item.name}</b><small>{item.id === company.id && sourceState === "loading" ? "Loading top questions…" : "View top questions"}</small></span></button>)}</div></div>
    <div className="company-questions"><header><div><span>SELECTED COMPANY</span><h2><i style={{ color: company.color }}>{company.mark}</i>{company.name}</h2><p>{sourceState === "live" ? `Live three-month ranking · ${questions.length} questions` : sourceState === "loading" ? "Loading the latest frequency ranking…" : questions.length ? "Showing starter questions · live source unavailable" : "Question source is temporarily unavailable"}</p></div><b>{completedCount}/{questions.length} done</b></header><div className="company-question-tools"><label><span>SEARCH THIS LIST</span><input value={questionSearch} onChange={event => setQuestionSearch(event.target.value)} placeholder={`Search ${company.name} questions...`} /></label><div><span>SHOW TOP</span>{[25, 50, 100].map(value => <button key={value} className={limit === value ? "active" : ""} onClick={() => setLimit(value)}>{value}</button>)}</div></div><div className="company-table-scroll"><QuestionTable questions={visibleQuestions} completed={completed} toggle={toggle} /></div></div></div>
  </SheetFrame>;
}

function PatternSheet({ completed, toggle }: { completed: string[]; toggle: (id: string) => void }) {
  const [search, setSearch] = useState("");
  const filtered = catalogPatternData.filter(([name, signal, problems]) => `${name} ${signal} ${problems.join(" ")}`.toLowerCase().includes(search.toLowerCase()));
  return <SheetFrame eyebrow="CORE PLAYBOOK" title="20 DSA Patterns" copy="Learn the signal for each pattern, then build confidence with seven essential problems." stats={`${completed.filter(id => id.startsWith("pattern:")).length}/140 problems completed`}>
    <div className="sheet-toolbar"><input aria-label="Search patterns" value={search} onChange={event => setSearch(event.target.value)} placeholder="Search a pattern or problem..." /><span>{filtered.length} patterns</span></div>
    <div className="pattern-grid">{filtered.map(([name, signal, problems], index) => <article key={name}><header><span>{String(index + 1).padStart(2, "0")}</span><div><h3>{name}</h3><p>{signal}</p></div><b>{problems.length} problems</b></header>{problems.map((title, problemIndex) => { const id = `pattern:${name}:${title}`; const done = completed.includes(id); const stage = problemIndex < 2 ? "Foundation" : problemIndex < 5 ? "Practice" : "Challenge"; return <div className="pattern-problem" key={title}><button className={done ? "checked" : ""} aria-label={`Mark ${title} complete`} onClick={() => toggle(id)}>{done ? "✓" : ""}</button><span><b>{title}</b><small>{stage}</small></span><a href={`https://leetcode.com/problemset/?search=${encodeURIComponent(title)}`} target="_blank" rel="noreferrer" aria-label={`Open ${title}`}>↗</a></div>; })}</article>)}</div>
  </SheetFrame>;
}

function SqlSheet({ completed, toggle }: { completed: string[]; toggle: (id: string) => void }) {
  const [difficulty, setDifficulty] = useState<"All" | Difficulty>("All");
  const [search, setSearch] = useState("");
  const questions = useMemo(() => sqlQuestions.filter(question => (difficulty === "All" || question.difficulty === difficulty) && `${question.title} ${question.topic}`.toLowerCase().includes(search.toLowerCase())).map(question => ({ ...question, id: `sql:${question.id}` })), [difficulty, search]);
  return <SheetFrame eyebrow="DATABASE TRACK" title="SQL Sheet" copy="Practise the query patterns used in analytics, backend, and data interviews." stats={`${completed.filter(id => id.startsWith("sql:")).length}/${sqlQuestions.length} completed`}>
    <div className="sheet-toolbar"><input aria-label="Search SQL questions" value={search} onChange={event => setSearch(event.target.value)} placeholder="Search SQL questions..." /><div>{(["All", "Easy", "Medium", "Hard"] as const).map(level => <button className={difficulty === level ? "active" : ""} key={level} onClick={() => setDifficulty(level)}>{level}</button>)}</div></div>
    <div className="sql-table-card"><div className="sql-roadmap"><span>START HERE</span>{["SELECT + filtering", "Joins", "Grouping", "CTEs + subqueries", "Window functions"].map((item, index) => <div key={item}><b>{index + 1}</b>{item}</div>)}</div><QuestionTable questions={questions} completed={completed} toggle={toggle} /></div>
  </SheetFrame>;
}

function QuestionTable({ questions, completed, toggle }: { questions: Question[]; completed: string[]; toggle: (id: string) => void }) {
  return <div className="question-table"><div className="question-head"><span>STATUS</span><span>PROBLEM</span><span>TOPIC</span><span>FREQUENCY</span><span>LEVEL</span><span /></div>{questions.map(question => { const done = completed.includes(question.id); return <div className={done ? "question-row done" : "question-row"} key={question.id}><button className="question-check" onClick={() => toggle(question.id)} aria-label={`Mark ${question.title} complete`}>{done ? "✓" : ""}</button><b>{question.title}</b><span>{question.topic}</span><strong>{question.frequency === undefined ? "—" : `${question.frequency.toFixed(1)}%`}</strong><i className={question.difficulty.toLowerCase()}>{question.difficulty}</i><a href={question.url} target="_blank" rel="noreferrer" aria-label={`Open ${question.title}`}>Solve ↗</a></div>; })}{!questions.length && <p className="empty-state">No questions match your search, or this company list is unavailable.</p>}</div>;
}

function SheetFrame({ eyebrow, title, copy, stats, children }: { eyebrow: string; title: string; copy: string; stats: string; children: ReactNode }) {
  return <><header className="sheet-hero"><div><span>{eyebrow}</span><h1>{title}</h1><p>{copy}</p></div><div><small>SHEET PROGRESS</small><b>{stats}</b></div></header>{children}</>;
}

export default function PrepWorkspace({ route, go }: { route: PrepRoute; go: (route: PrepRoute) => void }) {
  const { completed, toggle } = useProgress();
  return <div className="prep-shell"><Sidebar route={route} go={go} /><main className="prep-content">{route === "/preparation" ? <Dashboard completed={completed} go={go} /> : route === "/company-dsa" ? <CompanySheet completed={completed} toggle={toggle} /> : route === "/dsa-patterns" ? <PatternSheet completed={completed} toggle={toggle} /> : <SqlSheet completed={completed} toggle={toggle} />}</main></div>;
}
