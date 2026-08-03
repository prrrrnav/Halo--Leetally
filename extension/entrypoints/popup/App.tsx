import { useEffect, useMemo, useState } from "react";
import { browser } from "wxt/browser";
import type { Session } from "@supabase/supabase-js";
import { getBillingEntitlement, type BillingEntitlement } from "../../lib/api";
import { POLICY_VERSION, recordPolicyAcceptance, sendPasswordReset, signInWithEmail, signInWithGoogle, signUpWithEmail } from "../../lib/auth";
import { reconcileProgressWithCloud, startCloudProgressSync } from "../../lib/cloud-progress";
import { COMPANY_OPTIONS, FEATURED_COMPANIES, loadCompanyCatalog, refreshCompanyCatalog, type CompanyGroup, type CompanyId, type CompanyProblem, type CompanyProblemList } from "../../lib/company-problems";
import { fetchLeetCodeFriend, syncLeetCodeProfile } from "../../lib/leetcode-profile";
import { updateSelectedSheetProgress } from "../../lib/sheet-progress";
import { calculateStreak, DEFAULT_PROGRESS, INTERVIEW_COMPANIES, loadProgress, localDateKey, saveProgress, type InterviewType, type ProgressData, type TargetCompanyId } from "../../lib/progress";
import { supabase } from "../../lib/supabase";

type View = "overview" | "interviews" | "planner" | "companies" | "friends" | "settings";
const TERMS_URL = import.meta.env.VITE_TERMS_URL as string | undefined;
const PRIVACY_URL = import.meta.env.VITE_PRIVACY_URL as string | undefined;
const INTERVIEW_TYPES: Array<{ id: InterviewType; label: string; description: string }> = [
  { id: "dsa", label: "DSA", description: "Algorithms, coding, tests and complexity" },
  { id: "behavioral", label: "Behavioral", description: "STAR stories, ownership and teamwork" },
  { id: "lld", label: "LLD", description: "Objects, interfaces and extensible design" },
  { id: "hld", label: "HLD", description: "Components, APIs, scale and trade-offs" },
];

export default function App() {
  const [progress, setProgress] = useState<ProgressData>(() => ({
    ...DEFAULT_PROGRESS,
    solvedSlugs: {},
    activity: {},
    friends: [],
    sheets: DEFAULT_PROGRESS.sheets.map((sheet) => ({ ...sheet })),
    planner: { ...DEFAULT_PROGRESS.planner },
  }));
  const [view, setView] = useState<View>("overview");
  const [authUserId, setAuthUserId] = useState<string | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [authMode, setAuthMode] = useState<"signin" | "signup">("signin");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [authNotice, setAuthNotice] = useState("");
  const [policiesAccepted, setPoliciesAccepted] = useState(false);
  const [entitlement, setEntitlement] = useState<BillingEntitlement | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [notice, setNotice] = useState("");
  const [username, setUsername] = useState("");
  const [friendUsername, setFriendUsername] = useState("");
  const [friendNotice, setFriendNotice] = useState("");
  const [syncingFriend, setSyncingFriend] = useState("");
  const [selectedCompany, setSelectedCompany] = useState<CompanyId>("google");
  const [companyCatalog, setCompanyCatalog] = useState<Partial<Record<CompanyId, CompanyProblemList>>>({});
  const [companyLoading, setCompanyLoading] = useState(false);
  const [companyNotice, setCompanyNotice] = useState("");
  const [showAllCompanyProblems, setShowAllCompanyProblems] = useState(false);
  const [companyDifficulty, setCompanyDifficulty] = useState<"All" | CompanyProblem["difficulty"]>("All");
  const [companySort, setCompanySort] = useState<"frequency" | "acceptance-high" | "acceptance-low">("frequency");
  const [currentProblem, setCurrentProblem] = useState<{ title: string; url: string } | null>(null);

  useEffect(() => {
    void loadProgress().then(setProgress).catch(() => {
      setNotice("Local progress could not be loaded. Reload the extension.");
    });
    void browser.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
      if (tab?.url?.includes("leetcode.com/problems/")) setCurrentProblem({ title: (tab.title || "Current problem").replace(/ - LeetCode.*$/, ""), url: tab.url });
    }).catch(() => undefined);
    const changed = (changes: Record<string, Browser.storage.StorageChange>) => {
      void loadProgress().then(setProgress).catch(() => undefined);
      if (Object.keys(changes).some((key) => key.startsWith("sb-") && key.endsWith("-auth-token"))) {
        void supabase.auth.getSession().then(({ data }) => {
          setSession(data.session);
          setAuthUserId(data.session?.user.id ?? null);
        });
      }
    };
    browser.storage.onChanged.addListener(changed);
    void supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setAuthUserId(data.session?.user.id ?? null);
      if (data.session) {
        void reconcileProgressWithCloud(data.session.user.id).then(setProgress).catch(() => undefined);
        void getBillingEntitlement().then(setEntitlement).catch(() => setEntitlement(null));
      }
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setAuthUserId(nextSession?.user.id ?? null);
      if (nextSession) {
        void reconcileProgressWithCloud(nextSession.user.id).then(setProgress).catch(() => undefined);
        void getBillingEntitlement().then(setEntitlement).catch(() => setEntitlement(null));
      } else setEntitlement(null);
    });
    const stopCloudSync = startCloudProgressSync();
    return () => {
      browser.storage.onChanged.removeListener(changed);
      subscription.unsubscribe();
      stopCloudSync();
    };
  }, []);

  useEffect(() => {
    if (view !== "companies") return;
    let active = true;
    void loadCompanyCatalog().then((catalog) => { if (active) setCompanyCatalog(catalog); });
    setCompanyLoading(true); setCompanyNotice("");
    void refreshCompanyCatalog()
      .then((catalog) => { if (active) setCompanyCatalog(catalog); })
      .catch(() => { if (active) setCompanyNotice("Could not refresh GitHub. Showing the last cached lists."); })
      .finally(() => { if (active) setCompanyLoading(false); });
    return () => { active = false; };
  }, [view]);

  const days = useMemo(() => Array.from({ length: 30 }, (_, index) => { const date = new Date(); date.setDate(date.getDate() - (29 - index)); return { key: localDateKey(date), date }; }), []);
  const profile = progress.profile;
  const localSolved = Object.keys(progress.solvedSlugs).length;
  const selectedSheets = progress.sheets.filter((sheet) => sheet.selected);
  const todayCount = progress.activity[localDateKey()] ?? 0;
  const dailyPercent = Math.min(100, Math.round(todayCount / progress.planner.dailyProblemGoal * 100));
  const activeDays = days.filter(({ key }) => (progress.activity[key] ?? 0) > 0).length;
  const firstActivityDate = days[0]?.date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  const localDifficulties = Object.values(progress.solvedSlugs).reduce((counts, difficulty) => ({ ...counts, [difficulty]: counts[difficulty] + 1 }), { easy: 0, medium: 0, hard: 0 });
  const difficultyCounts = profile
    ? { easy: profile.easySolved, medium: profile.mediumSolved, hard: profile.hardSolved }
    : localDifficulties;
  const userInterviews = progress.interviews.filter((interview) => interview.userId === authUserId);
  const selectedInterviewType = progress.planner.interviewType ?? "dsa";
  const filteredInterviews = userInterviews.filter((interview) => (interview.interviewType ?? "dsa") === selectedInterviewType);
  const averageInterviewScore = filteredInterviews.length
    ? (filteredInterviews.reduce((total, interview) => total + interview.overallScore, 0) / filteredInterviews.length).toFixed(1)
    : "—";
  const interviewMinutes = Math.round(filteredInterviews.reduce((total, interview) => total + interview.durationSeconds, 0) / 60);
  const selectedInterviewCompany = INTERVIEW_COMPANIES.find((company) => company.id === progress.planner.targetCompany) ?? INTERVIEW_COMPANIES[0];

  function persist(updated: ProgressData) { setProgress(updated); void saveProgress(updated); }
  function updateSheet(id: string, patch: Partial<ProgressData["sheets"][number]>) {
    persist({ ...progress, sheets: progress.sheets.map((sheet) => sheet.id === id ? { ...sheet, ...patch } : sheet) });
  }
  function updatePlanner(patch: Partial<ProgressData["planner"]>) {
    persist({ ...progress, planner: { ...progress.planner, ...patch } });
  }
  async function selectTargetCompany(targetCompany: TargetCompanyId) {
    setProgress((current) => ({ ...current, planner: { ...current.planner, targetCompany } }));
    const latest = await loadProgress();
    await saveProgress({ ...latest, planner: { ...latest.planner, targetCompany } });
  }
  async function toggleSheet(id: string, selected: boolean) {
    const nextSheets = progress.sheets.map((sheet) => sheet.id === id ? { ...sheet, selected } : sheet);
    persist({ ...progress, sheets: nextSheets });
    if (selected && profile?.acceptedSlugs?.length) {
      setSyncing(true);
      const sheets = await updateSelectedSheetProgress(nextSheets, profile.acceptedSlugs, profile.acceptedProblemIds ?? []);
      persist({ ...progress, sheets });
      setSyncing(false);
    }
  }
  async function sync(usernameOverride?: string) {
    setSyncing(true); setNotice("");
    try {
      const synced = await syncLeetCodeProfile(usernameOverride);
      const previousSlugs = progress.profile?.username.toLowerCase() === synced.username.toLowerCase()
        ? progress.profile.acceptedSlugs ?? []
        : [];
      const acceptedSlugs = (synced.acceptedSlugs?.length ?? 0) >= previousSlugs.length
        ? synced.acceptedSlugs ?? []
        : previousSlugs;
      const completeProfile = { ...synced, acceptedSlugs };
      const previousIds = progress.profile?.username.toLowerCase() === synced.username.toLowerCase()
        ? progress.profile.acceptedProblemIds ?? []
        : [];
      const acceptedProblemIds = (synced.acceptedProblemIds?.length ?? 0) >= previousIds.length
        ? synced.acceptedProblemIds ?? []
        : previousIds;
      completeProfile.acceptedProblemIds = acceptedProblemIds;
      const sheets = await updateSelectedSheetProgress(progress.sheets, acceptedSlugs, acceptedProblemIds);
      persist({
        ...progress,
        profile: completeProfile,
        sheets,
        activity: {
          ...progress.activity,
          ...(completeProfile.submissionActivity ?? {}),
        },
      });
      setUsername(synced.username);
      setNotice(
        acceptedProblemIds.length
          ? `Synced ${acceptedProblemIds.length} accepted problems and ${sheets.filter((sheet) => sheet.selected && sheet.autoTracked).length} sheets`
          : "Profile loaded, but detailed history needs the same account signed in on leetcode.com.",
      );
    }
    catch (cause) { setNotice(cause instanceof Error ? cause.message : "Could not sync LeetCode"); }
    finally { setSyncing(false); }
  }

  async function syncFriend(friendName: string) {
    const normalized = friendName.trim();
    if (!normalized) return;
    setSyncingFriend(normalized.toLowerCase()); setFriendNotice("");
    try {
      const friend = await fetchLeetCodeFriend(normalized);
      const friends = [...progress.friends.filter((item) => item.username.toLowerCase() !== friend.username.toLowerCase()), friend]
        .sort((left, right) => right.totalSolved - left.totalSolved);
      persist({ ...progress, friends });
      setFriendUsername("");
      setFriendNotice(`Updated @${friend.username}`);
    } catch (cause) {
      setFriendNotice(cause instanceof Error ? cause.message : "Could not load that LeetCode profile");
    } finally {
      setSyncingFriend("");
    }
  }

  async function refreshFriends() {
    if (!progress.friends.length) return;
    setSyncingFriend("*"); setFriendNotice("");
    const refreshed = await Promise.all(progress.friends.map(async (friend) => {
      try { return await fetchLeetCodeFriend(friend.username); }
      catch { return friend; }
    }));
    persist({ ...progress, friends: refreshed.sort((left, right) => right.totalSolved - left.totalSolved) });
    setFriendNotice("Friend stats refreshed");
    setSyncingFriend("");
  }

  function removeFriend(friendName: string) {
    persist({ ...progress, friends: progress.friends.filter((friend) => friend.username.toLowerCase() !== friendName.toLowerCase()) });
  }

  async function refreshCompanies() {
    setCompanyLoading(true); setCompanyNotice("");
    try { setCompanyCatalog(await refreshCompanyCatalog([selectedCompany])); }
    catch { setCompanyNotice("Could not refresh GitHub. Showing the last cached lists."); }
    finally { setCompanyLoading(false); }
  }

  async function chooseCompany(company: CompanyId) {
    setSelectedCompany(company); setShowAllCompanyProblems(false); setCompanyDifficulty("All"); setCompanySort("frequency"); setCompanyLoading(true); setCompanyNotice("");
    try { setCompanyCatalog(await refreshCompanyCatalog([company])); }
    catch { setCompanyNotice("Could not refresh this company. Showing its last cached list."); }
    finally { setCompanyLoading(false); }
  }

  async function authenticateWithEmail() {
    setAuthBusy(true); setAuthNotice("");
    try {
      if (authMode === "signup") {
        const needsConfirmation = await signUpWithEmail(authEmail, authPassword);
        setAuthNotice(needsConfirmation ? "Check your inbox to confirm your email, then sign in." : "Account created and signed in.");
        if (needsConfirmation) setAuthMode("signin");
      } else {
        await signInWithEmail(authEmail, authPassword);
        await recordPolicyAcceptance();
        setAuthNotice("Signed in. Your local LeetCode progress is being attached to this account.");
      }
      setAuthPassword("");
    } catch (cause) {
      setAuthNotice(cause instanceof Error ? cause.message : "Authentication failed.");
    } finally { setAuthBusy(false); }
  }

  async function authenticateWithGoogle() {
    setAuthBusy(true); setAuthNotice("");
    try {
      await signInWithGoogle();
      await recordPolicyAcceptance();
      setAuthNotice("Google account connected. Your progress and premium access now use this identity.");
    } catch (cause) {
      setAuthNotice(cause instanceof Error ? cause.message : "Google sign-in failed.");
    } finally { setAuthBusy(false); }
  }

  async function resetPassword() {
    if (!authEmail.trim()) { setAuthNotice("Enter your email address first."); return; }
    setAuthBusy(true); setAuthNotice("");
    try { await sendPasswordReset(authEmail); setAuthNotice("Password reset email sent."); }
    catch (cause) { setAuthNotice(cause instanceof Error ? cause.message : "Could not send reset email."); }
    finally { setAuthBusy(false); }
  }

  function companyProblemSolved(problem: CompanyProblem): boolean {
    return Boolean(progress.profile?.acceptedSlugs?.includes(problem.slug)
      || (problem.id && progress.profile?.acceptedProblemIds?.includes(problem.id))
      || progress.solvedSlugs[problem.slug]);
  }

  return <main className="popup">
    <header className="app-header">
      <div className="brand"><h1>LeetAlly</h1></div>
      {profile?.avatar ? <img className="profile-image" src={profile.avatar} alt="" /> : <button className="sync-small" onClick={() => setView("settings")}>Connect</button>}
    </header>

    {view === "overview" && <>
      <section className="hero">
        <div><span className="eyebrow">ONE VOICE · TODAY'S PLAN</span><h2>{todayCount >= progress.planner.dailyProblemGoal ? "Daily goal complete." : "One focused interview moves you forward."}</h2><p>{profile ? `@${profile.username} · Rank ${profile.ranking?.toLocaleString() ?? "—"}` : "Connect LeetCode to combine interview practice with company-focused progress."}</p></div>
        <div className="goal-ring" style={{ "--goal": `${dailyPercent * 3.6}deg` } as React.CSSProperties}><strong>{dailyPercent}%</strong><span>daily</span></div>
      </section>

      <section className="metric-row"><div><b>{profile?.totalSolved ?? localSolved}</b><span>Solved</span></div><div><b>{profile?.streak ?? calculateStreak(progress.activity)}</b><span>Day streak</span></div><div><b>{profile?.totalActiveDays ?? Object.keys(progress.activity).length}</b><span>Active days</span></div></section>

      <section className="difficulty-row"><div className="easy"><b>{difficultyCounts.easy}</b><span>Easy</span></div><div className="medium"><b>{difficultyCounts.medium}</b><span>Medium</span></div><div className="hard"><b>{difficultyCounts.hard}</b><span>Hard</span></div></section>

      <section className="panel activity-panel">
        <header><h3>30-Day Activity</h3><div className="activity-legend"><b>{activeDays}/30</b><span>Less</span><i className="level-0" /><i className="level-1" /><i className="level-2" /><i className="level-3" /><span>More</span></div></header>
        <div className="heatmap">{days.map(({ key }) => { const count = progress.activity[key] ?? 0; const dailyDone = Boolean(profile?.dailyChallengeActivity?.[key]); return <i key={key} title={`${key}: ${count} submission${count === 1 ? "" : "s"}${dailyDone ? " · daily challenge completed" : ""}`} className={`level-${Math.min(3, count)} ${dailyDone ? "daily-done" : ""} ${key === localDateKey() ? "today" : ""}`} />; })}</div>
        <div className="activity-dates"><span>{firstActivityDate}</span><span>Today</span></div>
      </section>

      <section className="panel focus-panel"><header><h3>Focus sheets</h3><button onClick={() => setView("settings")}>Manage</button></header>{selectedSheets.length ? selectedSheets.map((sheet) => { const percent = sheet.total > 0 ? Math.round(sheet.completed / sheet.total * 100) : 0; return <div className="focus-row" key={sheet.id}><div><strong><i className="sheet-dot" style={{ background: sheet.color }} />{sheet.name}</strong><span>{sheet.completed}/{sheet.total} <b style={{ color: sheet.color }}>{percent}%</b></span></div><div className="focus-track"><i style={{ width: `${percent}%`, background: sheet.color }} /></div></div>; }) : <p className="empty">Choose your first DSA sheet in Settings.</p>}</section>

      <section className="next-card"><div><span>NEXT ACTION</span><strong>{currentProblem?.title || "Open a LeetCode problem"}</strong><small>{currentProblem ? "Explain your approach aloud before coding." : "Your planner activates on a problem page."}</small></div>{currentProblem && <a href={currentProblem.url} target="_blank">Continue →</a>}</section>
    </>}

    {view === "planner" && <>
      <div className="page-title"><span>PREP ROADMAP</span><h2>Your path to interview day</h2><p>Turn daily practice into scheduled interview readiness.</p></div>
      <section className="roadmap-card">
        <header><span>YOUR ROADMAP</span><strong>{progress.planner.interviewDate ? `${Math.max(0, Math.ceil((new Date(progress.planner.interviewDate).getTime() - Date.now()) / 86400000))} days left` : "Set your target date"}</strong></header>
        <div className="roadmap-step active"><i>1</i><div><b>Daily DSA practice</b><small>{progress.planner.dailyProblemGoal} accepted {progress.planner.dailyProblemGoal === 1 ? "solution" : "solutions"} each day</small></div></div>
        <div className={progress.planner.mockInterviewDate ? "roadmap-step active" : "roadmap-step"}><i>2</i><div><b>Mock interview</b><small>{progress.planner.mockInterviewDate ? new Date(`${progress.planner.mockInterviewDate}T00:00:00`).toLocaleDateString() : "Choose your next practice round"}</small></div></div>
        <div className={progress.planner.interviewDate ? "roadmap-step active" : "roadmap-step"}><i>3</i><div><b>Target interview</b><small>{progress.planner.interviewDate ? new Date(`${progress.planner.interviewDate}T00:00:00`).toLocaleDateString() : "Add the date you are preparing for"}</small></div></div>
      </section>
      <section className="panel company-voice-panel">
        <header><div><h3>Target company</h3><span>Sets the permanent interview voice and style</span></div></header>
        <select value={progress.planner.targetCompany} onChange={(event) => void selectTargetCompany(event.target.value as TargetCompanyId)}>
          {INTERVIEW_COMPANIES.map((company) => <option key={company.id} value={company.id}>{company.name} — {company.voice} ({company.gender})</option>)}
        </select>
        <div className="selected-voice"><span>{selectedInterviewCompany.gender}</span><strong>{selectedInterviewCompany.voice}</strong><small>0.9× measured pace</small></div>
        <p>The selected voice applies when the next interview starts. Google keeps the developer-configured default; every other company has a fixed, unique Fish Audio voice.</p>
      </section>
      <section className="panel goal-panel"><header><h3>Daily problems</h3><b>{todayCount}/{progress.planner.dailyProblemGoal}</b></header><input type="range" min="1" max="5" value={progress.planner.dailyProblemGoal} onChange={(event) => updatePlanner({ dailyProblemGoal: Number(event.target.value) })} /><p>Target {progress.planner.dailyProblemGoal} accepted {progress.planner.dailyProblemGoal === 1 ? "solution" : "solutions"} each day.</p></section>
      <section className="panel date-panel"><label>Next mock interview<input type="date" value={progress.planner.mockInterviewDate} onChange={(event) => updatePlanner({ mockInterviewDate: event.target.value })} /></label>{progress.planner.mockInterviewDate && <strong>Practice round scheduled for {new Date(`${progress.planner.mockInterviewDate}T00:00:00`).toLocaleDateString()}</strong>}</section>
      <section className="panel date-panel"><label>Target interview date<input type="date" value={progress.planner.interviewDate} onChange={(event) => updatePlanner({ interviewDate: event.target.value })} /></label>{progress.planner.interviewDate && <strong>{Math.max(0, Math.ceil((new Date(progress.planner.interviewDate).getTime() - Date.now()) / 86400000))} days to prepare</strong>}</section>
      <section className="coach-note"><span>✦ ROADMAP NOTE</span><p>Use one interviewer across DSA, LLD, HLD and behavioural practice. Schedule the next mock round before the target date so every scorecard creates the next step.</p></section>
    </>}

    {view === "interviews" && <>
        <div className="page-title"><span>INTERVIEW HISTORY</span><h2>Review every round</h2><p>Scores, evidence and the next improvement to practise.</p></div>
        <div className="interview-type-tabs" role="tablist" aria-label="Choose interview type">{INTERVIEW_TYPES.map((type) => <button key={type.id} role="tab" aria-selected={selectedInterviewType === type.id} className={selectedInterviewType === type.id ? "active" : ""} onClick={() => updatePlanner({ interviewType: type.id })}>{type.label}<b>{userInterviews.filter((interview) => (interview.interviewType ?? "dsa") === type.id).length}</b></button>)}</div>
        <section className="selected-interview-type"><span>NEXT INTERVIEW</span><strong>{INTERVIEW_TYPES.find((type) => type.id === selectedInterviewType)?.label}</strong><p>{INTERVIEW_TYPES.find((type) => type.id === selectedInterviewType)?.description}. This selection is sent to the AI when the next interview starts.</p></section>
        <section className="interview-summary">
          <div><b>{filteredInterviews.length}</b><span>Sessions</span></div>
          <div><b>{averageInterviewScore}</b><span>Avg score</span></div>
          <div><b>{interviewMinutes}</b><span>Minutes</span></div>
        </section>
        {!authUserId ? <section className="empty-friends"><strong>Sign in to view interviews</strong><p>Interview history is separated by your LeetAlly account.</p></section>
          : filteredInterviews.length ? filteredInterviews.map((interview) => {
            const company = INTERVIEW_COMPANIES.find((item) => item.id === interview.companyId)?.name ?? interview.companyId;
            return <details className="interview-card" key={interview.id}>
              <summary><div><span>{company} · {interview.difficulty || "Practice"}</span><strong>{interview.problemTitle}</strong><small>{new Date(interview.completedAt).toLocaleDateString()} · {Math.max(1, Math.round(interview.durationSeconds / 60))} min</small></div><b>{interview.overallScore}<small>/10</small></b></summary>
              <div className="score-grid"><span><b>{interview.communicationScore}</b>Communication</span><span><b>{interview.problemSolvingScore}</b>Problem solving</span><span><b>{interview.complexityScore}</b>Complexity</span><span><b>{interview.edgeCaseScore}</b>Edge cases</span></div>
              <p className="interview-summary-text">{interview.summary}</p>
              <div className="feedback-list strength-list"><strong>Strengths</strong>{interview.strengths.map((item) => <p key={item}>✓ {item}</p>)}</div>
              <div className="feedback-list improvement-list"><strong>Improve next</strong>{interview.improvements.map((item) => <p key={item}>→ {item}</p>)}</div>
            </details>;
          }) : <section className="empty-friends"><strong>No completed {INTERVIEW_TYPES.find((type) => type.id === selectedInterviewType)?.label} interviews yet</strong><p>Select this interview type, then start the interviewer from a LeetCode problem.</p></section>}
    </>}

    {view === "friends" && <>
      <div className="page-title"><span>FRIEND TRACKER</span><h2>Compare your progress</h2><p>Track public LeetCode totals by difficulty.</p></div>
      <section className="panel friend-add">
        <div className="username-connect"><input value={friendUsername} onChange={(event) => setFriendUsername(event.target.value)} placeholder="Friend's LeetCode username" onKeyDown={(event) => { if (event.key === "Enter") void syncFriend(friendUsername); }} /><button onClick={() => void syncFriend(friendUsername)} disabled={Boolean(syncingFriend) || !friendUsername.trim()}>{syncingFriend && syncingFriend !== "*" ? "Adding…" : "Add"}</button></div>
        {friendNotice && <p className="notice">{friendNotice}</p>}
      </section>
      <div className="friends-heading"><strong>{progress.friends.length} tracked</strong><button onClick={() => void refreshFriends()} disabled={Boolean(syncingFriend) || !progress.friends.length}>{syncingFriend === "*" ? "Refreshing…" : "Refresh all"}</button></div>
      {progress.friends.length ? progress.friends.map((friend) => <section className="friend-card" key={friend.username}>
        <header>{friend.avatar ? <img src={friend.avatar} alt="" /> : <span className="friend-avatar">{friend.username[0]?.toUpperCase()}</span>}<div><strong>@{friend.username}</strong><small>Rank {friend.ranking?.toLocaleString() ?? "—"}</small></div><b>{friend.totalSolved}<small>Solved</small></b></header>
        <div className="friend-difficulties"><span className="easy"><b>{friend.easySolved}</b> Easy</span><span className="medium"><b>{friend.mediumSolved}</b> Medium</span><span className="hard"><b>{friend.hardSolved}</b> Hard</span></div>
        <footer><small>Updated {new Date(friend.syncedAt).toLocaleDateString()}</small><div><button onClick={() => void syncFriend(friend.username)} disabled={Boolean(syncingFriend)}>Refresh</button><button className="remove" onClick={() => removeFriend(friend.username)}>Remove</button></div></footer>
      </section>) : <section className="empty-friends"><strong>No friends tracked yet</strong><p>Add a LeetCode username to compare solved totals.</p></section>}
    </>}

    {view === "companies" && (() => {
      const selected = COMPANY_OPTIONS.find((company) => company.id === selectedCompany)!;
      const list = companyCatalog[selectedCompany];
      const questions = list?.questions ?? [];
      const solved = questions.filter(companyProblemSolved).length;
      const difficultyTotals = questions.reduce((counts, question) => ({ ...counts, [question.difficulty]: counts[question.difficulty] + 1 }), { Easy: 0, Medium: 0, Hard: 0 });
      const filteredQuestions = (companyDifficulty === "All" ? questions : questions.filter((question) => question.difficulty === companyDifficulty)).slice().sort((left, right) => {
        if (companySort === "acceptance-high") return (right.acceptance ?? -1) - (left.acceptance ?? -1);
        if (companySort === "acceptance-low") return (left.acceptance ?? Number.MAX_SAFE_INTEGER) - (right.acceptance ?? Number.MAX_SAFE_INTEGER);
        return (right.frequency ?? -1) - (left.frequency ?? -1);
      });
      const visibleQuestions = showAllCompanyProblems ? filteredQuestions : filteredQuestions.slice(0, 15);
      const percent = questions.length ? Math.round(solved / questions.length * 100) : 0;
      return <>
        <div className="page-title company-title"><span>COMPANY PREP</span><h2>Past 3 months</h2><p>Live community-maintained GitHub lists.</p></div>
        <div className="company-tabs">{FEATURED_COMPANIES.map((company) => <button key={company.id} className={selectedCompany === company.id ? "active" : ""} style={{ "--company-color": company.color } as React.CSSProperties} onClick={() => void chooseCompany(company.id)}>{company.name}</button>)}</div>
        <label className="company-browser"><span>Browse companies</span><select value={selectedCompany} onChange={(event) => void chooseCompany(event.target.value)}>{(["featured", "major", "mass-hiring"] as CompanyGroup[]).map((group) => <optgroup key={group} label={group === "mass-hiring" ? "Mass Hiring" : group === "major" ? "Major Companies" : "Featured"}>{COMPANY_OPTIONS.filter((company) => company.group === group).map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}</optgroup>)}</select></label>
        <section className="company-summary" style={{ "--company-color": selected.color } as React.CSSProperties}>
          <header><div><span>{selected.name.toUpperCase()} READINESS</span><strong>{solved}/{questions.length} solved</strong></div><b>{percent}%</b></header>
          <div className="company-progress"><i style={{ width: `${percent}%` }} /></div>
          <div className="company-breakdown"><span className="easy"><b>{difficultyTotals.Easy}</b> Easy</span><span className="medium"><b>{difficultyTotals.Medium}</b> Medium</span><span className="hard"><b>{difficultyTotals.Hard}</b> Hard</span></div>
        </section>
        <div className="company-filters">{(["All", "Easy", "Medium", "Hard"] as const).map((difficulty) => <button key={difficulty} className={`${difficulty.toLowerCase()} ${companyDifficulty === difficulty ? "active" : ""}`} onClick={() => { setCompanyDifficulty(difficulty); setShowAllCompanyProblems(false); }}>{difficulty}<b>{difficulty === "All" ? questions.length : difficultyTotals[difficulty]}</b></button>)}</div>
        <label className="company-sort"><span>Sort problems</span><select value={companySort} onChange={(event) => { setCompanySort(event.target.value as typeof companySort); setShowAllCompanyProblems(false); }}><option value="frequency">Highest frequency</option><option value="acceptance-high">Highest acceptance</option><option value="acceptance-low">Lowest acceptance</option></select></label>
        <div className="source-row"><span>{companyLoading ? "Checking GitHub for changes…" : list ? `Fetched ${new Date(list.fetchedAt).toLocaleString()}` : "No cached list yet"}</span><button onClick={() => void refreshCompanies()} disabled={companyLoading}>{companyLoading ? "Syncing…" : "Refresh"}</button></div>
        {companyNotice && <p className="notice">{companyNotice}</p>}
        {filteredQuestions.length ? <section className="company-list">
          {visibleQuestions.map((problem, index) => { const isSolved = companyProblemSolved(problem); return <a href={problem.url} target="_blank" className={isSolved ? "solved" : ""} key={problem.slug}><span className="problem-rank">{index + 1}</span><div><strong>{problem.title}</strong><small className="problem-metrics"><span>Freq <b>{problem.frequency !== undefined ? `${problem.frequency}%` : "—"}</b></span><span>Accept <b>{problem.acceptance !== undefined ? `${problem.acceptance}%` : "—"}</b></span></small></div><span className={`difficulty ${problem.difficulty.toLowerCase()}`}>{problem.difficulty}</span><b>{isSolved ? "✓" : "↗"}</b></a>; })}
          {filteredQuestions.length > 15 && <button className="show-more" onClick={() => setShowAllCompanyProblems((shown) => !shown)}>{showAllCompanyProblems ? "Show top 15" : `Show all ${filteredQuestions.length}`}</button>}
        </section> : <section className="empty-friends"><strong>{companyLoading ? "Loading company list…" : questions.length ? `No ${companyDifficulty} problems` : "No three-month list available"}</strong><p>{companyLoading ? "Fetching the newest public CSV." : questions.length ? "Choose another difficulty filter." : "Connect once while online to cache this company."}</p></section>}
        {list && <a className="source-link" href={list.sourceUrl} target="_blank">Source: {list.sourceRepo} ↗</a>}
      </>;
    })()}

    {view === "settings" && <>
      <div className="page-title"><span>PERSONALIZE</span><h2>Choose your path</h2><p>Only selected sheets appear on your dashboard.</p></div>
      <section className="panel auth-panel">
        {session ? <>
          <header><div><h3>LeetAlly account</h3><span>Progress and premium identity</span></div><i className={`account-status ${entitlement?.status === "active" ? "premium" : ""}`}>{entitlement?.status === "active" ? "Premium" : "Free"}</i></header>
          <div className="signed-account"><span>{(session.user.user_metadata?.avatar_url || session.user.user_metadata?.picture) ? <img src={session.user.user_metadata.avatar_url || session.user.user_metadata.picture} alt="" /> : (session.user.email?.[0] ?? "L").toUpperCase()}</span><div><strong>{session.user.user_metadata?.full_name || session.user.user_metadata?.name || session.user.email}</strong><small>{session.user.email}</small></div></div>
          <p className="cloud-note">Cloud progress sync is active. {entitlement?.status === "active" ? `${entitlement.minutes_remaining}/${entitlement.minutes_limit} speaking minutes remaining. Silence is never counted.` : "Premium purchases will attach to this account."}</p>
          <button className="signout-button" onClick={() => void supabase.auth.signOut()}>Sign out</button>
        </> : <>
          <header><div><h3>{authMode === "signin" ? "Sign in" : "Create account"}</h3><span>Keep progress and premium access across devices</span></div></header>
          <div className="data-disclosure"><strong>Before you continue</strong><p>LeetAlly reads the current LeetCode problem, editor code and visible output. During an interview, detected speech segments—not silence—are sent to transcription and AI voice providers. This data is used only for interview practice, feedback, account sync and billing.</p></div>
          <label className="policy-consent"><input type="checkbox" checked={policiesAccepted} onChange={(event) => setPoliciesAccepted(event.target.checked)} /><span>I agree to the {TERMS_URL ? <a href={TERMS_URL} target="_blank">Terms</a> : "Terms"} and acknowledge the {PRIVACY_URL ? <a href={PRIVACY_URL} target="_blank">Privacy Policy</a> : "Privacy Policy"} (version {POLICY_VERSION}).</span></label>
          <button className="google-auth" disabled={authBusy || !policiesAccepted} onClick={() => void authenticateWithGoogle()}><b>G</b>Continue with Google</button>
          <div className="auth-divider"><span>or use email</span></div>
          <input className="auth-input" type="email" value={authEmail} onChange={(event) => setAuthEmail(event.target.value)} placeholder="Email address" />
          <input className="auth-input" type="password" minLength={8} value={authPassword} onChange={(event) => setAuthPassword(event.target.value)} placeholder="Password (8+ characters)" onKeyDown={(event) => { if (event.key === "Enter") void authenticateWithEmail(); }} />
          <button className="email-auth" disabled={authBusy || !policiesAccepted || !authEmail.trim() || authPassword.length < 8} onClick={() => void authenticateWithEmail()}>{authBusy ? "Please wait…" : authMode === "signin" ? "Sign in with email" : "Create email account"}</button>
          <div className="auth-links"><button onClick={() => { setAuthMode((mode) => mode === "signin" ? "signup" : "signin"); setAuthNotice(""); }}>{authMode === "signin" ? "Create account" : "Already have an account?"}</button>{authMode === "signin" && <button onClick={() => void resetPassword()}>Forgot password?</button>}</div>
          {authNotice && <p className="notice">{authNotice}</p>}
        </>}
      </section>
      <section className="panel account-panel">
        <header><div><h3>{profile ? `@${profile.username}` : "LeetCode account"}</h3><span>{profile ? `Synced ${new Date(profile.syncedAt).toLocaleString()}` : "Enter any public LeetCode username"}</span></div></header>
        <div className="username-connect"><input value={username} onChange={(event) => setUsername(event.target.value)} placeholder="LeetCode username" onKeyDown={(event) => { if (event.key === "Enter") void sync(username); }} /><button onClick={() => void sync(username)} disabled={syncing || !username.trim()}>{syncing ? "Syncing…" : profile ? "Refresh" : "Connect"}</button></div>
        {notice && <p className="notice">{notice}</p>}
      </section>
      <details className="sync-guide">
        <summary>How automatic tracking works</summary>
        <ol><li>Sign in at leetcode.com.</li><li>Enter that same LeetCode username above.</li><li>Press Refresh to import your full accepted history and activity.</li><li>Select any sheets below; percentages update from exact problem IDs.</li></ol>
        <p>Public usernames show profile totals, but LeetCode only returns the complete accepted-problem list to the signed-in owner.</p>
      </details>
      <section className="panel sheet-picker"><header><h3>DSA sheets</h3><span>{selectedSheets.length} selected</span></header>{progress.sheets.map((sheet) => { const percent = sheet.total > 0 ? Math.round(sheet.completed / sheet.total * 100) : 0; return <label key={sheet.id}><input type="checkbox" checked={Boolean(sheet.selected)} onChange={(event) => void toggleSheet(sheet.id, event.target.checked)} /><span className="checkmark" style={{ "--sheet-color": sheet.color } as React.CSSProperties}>✓</span><div><strong>{sheet.name}</strong><small>{sheet.autoTracked ? `${sheet.completed}/${sheet.total} completed · ${percent}%` : `${sheet.total} problems · sync to auto-track`}</small></div><b className="sheet-percent" style={{ color: sheet.color }}>{percent}%</b><a href={sheet.url} target="_blank">↗</a></label>; })}</section>
    </>}

    <nav><button className={view === "overview" ? "active" : ""} onClick={() => setView("overview")}><span>◫</span>Overview</button><button className={view === "interviews" ? "active" : ""} onClick={() => setView("interviews")}><span>◉</span>Interview</button><button className={view === "planner" ? "active" : ""} onClick={() => setView("planner")}><span>◇</span>Planner</button><button className={view === "companies" ? "active" : ""} onClick={() => setView("companies")}><span>▦</span>Companies</button><button className={view === "friends" ? "active" : ""} onClick={() => setView("friends")}><span>♙</span>Friends</button><button className={view === "settings" ? "active" : ""} onClick={() => setView("settings")}><span>⚙</span>Settings</button></nav>
  </main>;
}
