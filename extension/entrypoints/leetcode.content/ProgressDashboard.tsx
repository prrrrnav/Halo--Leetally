import { useEffect, useMemo, useState } from "react";
import {
  calculateStreak,
  loadProgress,
  localDateKey,
  recordSolved,
  saveProgress,
  type Difficulty,
  type ProgressData,
} from "../../lib/progress";

interface Props {
  email?: string;
  problemSlug: string;
  problemTitle: string;
  difficulty: string | null;
  onClose: () => void;
  onOpenSettings: () => void;
}

function normalizedDifficulty(value: string | null): Difficulty {
  const normalized = value?.toLowerCase();
  return normalized === "easy" || normalized === "hard" ? normalized : "medium";
}

function initials(email?: string): string {
  return (email?.split("@")[0] || "LA").slice(0, 2).toUpperCase();
}

export default function ProgressDashboard(props: Props) {
  const [progress, setProgress] = useState<ProgressData | null>(null);

  useEffect(() => { void loadProgress().then(setProgress); }, []);

  const days = useMemo(() => Array.from({ length: 30 }, (_, index) => {
    const date = new Date();
    date.setDate(date.getDate() - (29 - index));
    return { key: localDateKey(date), date };
  }), []);

  if (!progress) return <aside className="leetally-dashboard"><div className="dashboard-loading">Loading progress…</div></aside>;

  const difficulties = Object.values(progress.solvedSlugs);
  const count = (difficulty: Difficulty) => difficulties.filter((item) => item === difficulty).length;
  const solvedToday = Boolean(progress.activity[localDateKey()]);

  function updateSheet(id: string, delta: number) {
    if (!progress) return;
    const updated = {
      ...progress,
      sheets: progress.sheets.map((sheet) => sheet.id === id
        ? { ...sheet, completed: Math.max(0, Math.min(sheet.total, sheet.completed + delta)) }
        : sheet),
    };
    setProgress(updated);
    void saveProgress(updated);
  }

  function markCurrentSolved() {
    if (!progress) return;
    const updated = recordSolved(progress, props.problemSlug, normalizedDifficulty(props.difficulty));
    setProgress(updated);
    void saveProgress(updated);
  }

  return (
    <aside className="leetally-dashboard" aria-label="LeetAlly progress dashboard">
      <div className="dashboard-topbar">
        <div className="dashboard-profile">
          <span className="dashboard-avatar">{initials(props.email)}</span>
          <div><strong>{props.email?.split("@")[0] || "LeetAlly Coder"}</strong><span>Daily LeetCode practice</span></div>
        </div>
        <div className="dashboard-actions">
          <span title="Problems solved today">🎯 {progress.activity[localDateKey()] ?? 0}</span>
          <span title="Daily streak">🔥 {calculateStreak(progress.activity)}</span>
          <button type="button" onClick={props.onOpenSettings} title="Settings">⚙</button>
          <button type="button" onClick={props.onClose} title="Close">×</button>
        </div>
      </div>

      <section className="dashboard-card solved-card">
        <span>Solved</span><strong>{difficulties.length}</strong>
        <div><b className="easy">{count("easy")}</b> Easy</div>
        <div><b className="medium">{count("medium")}</b> Med</div>
        <div><b className="hard">{count("hard")}</b> Hard</div>
      </section>

      <section className="dashboard-card activity-card">
        <header><strong>30-Day Activity</strong><span><b>{days.filter(({ key }) => progress.activity[key]).length}/30</b> · Less <i /> <i /> <i /> <i /> More</span></header>
        <div className="activity-grid">
          {days.map(({ key, date }) => {
            const amount = progress.activity[key] ?? 0;
            return <span key={key} className={`activity-cell level-${Math.min(3, amount)} ${key === localDateKey() ? "today" : ""}`} title={`${date.toLocaleDateString()}: ${amount} solved`} />;
          })}
        </div>
        <footer><span>{days[0].date.toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span><span>Today</span></footer>
      </section>

      <section className="dashboard-card sheets-card">
        <header><strong>Your Progress <small title="Use − and + to sync your existing sheet progress">ⓘ</small></strong><span>Track curated lists</span></header>
        {progress.sheets.map((sheet) => {
          const percent = Math.round((sheet.completed / sheet.total) * 100);
          return <div className="sheet-row" key={sheet.id}>
            <div className="sheet-heading"><a href={sheet.url} target="_blank" rel="noreferrer">{sheet.name} ↗</a><span>{sheet.completed}/{sheet.total} <b style={{ color: sheet.color }}>{percent}%</b></span></div>
            <div className="sheet-controls"><button type="button" onClick={() => updateSheet(sheet.id, -1)}>−</button><div className="sheet-track"><i style={{ width: `${percent}%`, background: sheet.color }} /></div><button type="button" onClick={() => updateSheet(sheet.id, 1)}>+</button></div>
          </div>;
        })}
      </section>

      <section className="dashboard-card daily-card">
        <header><strong>Daily Update</strong><span>{solvedToday ? "Goal complete ✓" : "Keep the streak alive"}</span></header>
        <a href={location.href}>{props.problemTitle || "Current LeetCode problem"} ↗</a>
        <div><span className={`difficulty ${normalizedDifficulty(props.difficulty)}`}>{normalizedDifficulty(props.difficulty)}</span><button type="button" disabled={Boolean(progress.solvedSlugs[props.problemSlug])} onClick={markCurrentSolved}>{progress.solvedSlugs[props.problemSlug] ? "Completed ✓" : "Mark solved"}</button></div>
      </section>
    </aside>
  );
}
