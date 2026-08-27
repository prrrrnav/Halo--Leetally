import { useEffect, useMemo, useState } from "react";
import { browser } from "wxt/browser";
import type { Session } from "@supabase/supabase-js";
import { acceptFriendRequest, addFriendByEmail, getBillingEntitlement, listFriendConnections, removeFriendConnection, type AccountFriendConnection, type BillingEntitlement } from "../../lib/api";
import { POLICY_VERSION, recordPolicyAcceptance, sendPasswordReset, signInWithEmail, signInWithGoogle, signOutOfExtension, signUpWithEmail, syncWebsiteSession } from "../../lib/auth";
import { clearLocalAccountProgress, reconcileProgressWithCloud, removeLeetCodeIdentity, saveLinkedLeetCodeProgress, startCloudProgressSync, unlinkLeetCodeIdentity } from "../../lib/cloud-progress";
import { COMPANY_OPTIONS, FEATURED_COMPANIES, loadCompanyCatalog, refreshCompanyCatalog, type CompanyGroup, type CompanyId, type CompanyProblem, type CompanyProblemList } from "../../lib/company-problems";
import { syncLeetCodeProfile } from "../../lib/leetcode-profile";
import { updateAllSheetProgress } from "../../lib/sheet-progress";
import { calculateStreak, DEFAULT_PROGRESS, INTERVIEW_COMPANIES, loadProgress, localDateKey, saveProgress, type InterviewType, type ProgressData, type TargetCompanyId } from "../../lib/progress";
import { supabase } from "../../lib/supabase";

type View = "overview" | "interviews" | "planner" | "companies" | "friends" | "settings";
const WEBSITE_URL = ((import.meta.env.VITE_WEBSITE_URL as string | undefined) || "https://leetally-web.vercel.app").replace(/\/$/, "");
const TERMS_URL = (import.meta.env.VITE_TERMS_URL as string | undefined) || `${WEBSITE_URL}/terms`;
const PRIVACY_URL = (import.meta.env.VITE_PRIVACY_URL as string | undefined) || `${WEBSITE_URL}/privacy`;
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
  const [authChecked, setAuthChecked] = useState(false);
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
  const [friendEmail, setFriendEmail] = useState("");
  const [friendConnections, setFriendConnections] = useState<AccountFriendConnection[]>([]);
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
    void (async () => {
      const initial = (await supabase.auth.getSession()).data.session;
      if (!initial) await syncWebsiteSession(false).catch(() => false);
      const current = (await supabase.auth.getSession()).data.session;
      setSession(current);
      setAuthUserId(current?.user.id ?? null);
      setAuthChecked(true);
      if (current) {
        void reconcileProgressWithCloud(current.user.id).then(setProgress).catch(() => undefined);
        void getBillingEntitlement().then(setEntitlement).catch(() => setEntitlement(null));
      }
    })();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setAuthUserId(nextSession?.user.id ?? null);
      setAuthChecked(true);
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

  const days = useMemo(() => {
    const now = new Date();
    const totalDays = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    return Array.from({ length: totalDays }, (_, index) => {
      const date = new Date(now.getFullYear(), now.getMonth(), index + 1);
      return { key: localDateKey(date), date };
    });
  }, []);

  useEffect(() => {
    if (!session) {
      setFriendConnections([]);
      return;
    }
    let active = true;
    void listFriendConnections()
      .then((connections) => { if (active) setFriendConnections(connections); })
      .catch(() => { if (active) setFriendNotice("Friend connections could not be loaded."); });
    return () => { active = false; };
  }, [session?.user.id]);
  const profile = progress.profile;
  const localSolved = Object.keys(progress.solvedSlugs).length;
  const selectedSheets = progress.sheets.filter((sheet) => sheet.selected);
  const todayCount = progress.activity[localDateKey()] ?? 0;
  const dailyPercent = Math.min(100, Math.round(todayCount / progress.planner.dailyProblemGoal * 100));
  const activeDays = days.filter(({ key }) => (progress.activity[key] ?? 0) > 0).length;
  const activityMonth = days[0]?.date.toLocaleDateString(undefined, { month: "long" });
  const firstActivityDate = days[0]?.date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  const lastActivityDate = days.at(-1)?.date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
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
      const sheets = await updateAllSheetProgress(nextSheets, profile.acceptedSlugs, profile.acceptedProblemIds ?? []);
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
      const sheets = synced.verifiedOwner
        ? await updateAllSheetProgress(progress.sheets, acceptedSlugs, acceptedProblemIds)
        : progress.sheets;
      const updated = {
        ...progress,
        profile: completeProfile,
        sheets,
        activity: {
          ...progress.activity,
          ...(completeProfile.submissionActivity ?? {}),
        },
      };
      if (session && synced.verifiedOwner) {
        await saveLinkedLeetCodeProgress(session.user.id, synced.username, updated);
      }
      persist(updated);
      setUsername(synced.username);
      if (acceptedProblemIds.length) {
        setNotice(`Synced ${acceptedProblemIds.length} accepted problems across ${sheets.filter((sheet) => sheet.autoTracked).length} sheets${session ? "." : " locally. Sign in to LeetAlly for cloud backup."}`);
      } else {
        setNotice(`Tracking @${synced.username} ${session ? "on your LeetAlly account" : "locally"}. Sign in to the same account on leetcode.com and refresh for exact sheet progress.`);
      }
    }
    catch (cause) { setNotice(cause instanceof Error ? cause.message : "Could not sync LeetCode"); }
    finally { setSyncing(false); }
  }

  async function unlinkLeetCode() {
    if (!profile) return;
    setSyncing(true); setNotice("");
    try {
      const updated = session
        ? await unlinkLeetCodeIdentity(session.user.id)
        : removeLeetCodeIdentity(progress);
      if (!session) await saveProgress(updated);
      setProgress(updated);
      setUsername("");
      setNotice(session
        ? "LeetCode ID unlinked. Your LeetAlly interviews and settings were kept."
        : "LeetCode tracking removed from this device.");
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : "Could not unlink the LeetCode ID.");
    } finally {
      setSyncing(false);
    }
  }

  async function requestFriend(friendAccountEmail: string) {
    if (!session) {
      setFriendNotice("Sign in to LeetAlly before adding friends.");
      return;
    }
    const normalized = friendAccountEmail.trim().toLowerCase();
    if (!normalized) return;
    setSyncingFriend(normalized); setFriendNotice("");
    try {
      setFriendConnections(await addFriendByEmail(normalized));
      setFriendEmail("");
      setFriendNotice("If that email has a LeetAlly account, a request is now waiting for their approval.");
    } catch (cause) {
      setFriendNotice(cause instanceof Error ? cause.message : "Could not send that friend request.");
    } finally {
      setSyncingFriend("");
    }
  }

  async function refreshFriends() {
    if (!session) return;
    setSyncingFriend("*"); setFriendNotice("");
    try {
      setFriendConnections(await listFriendConnections());
      setFriendNotice("Friend connections refreshed.");
    } catch (cause) {
      setFriendNotice(cause instanceof Error ? cause.message : "Could not refresh friends.");
    } finally { setSyncingFriend(""); }
  }

  async function acceptFriend(connection: AccountFriendConnection) {
    setSyncingFriend(connection.relationship_id); setFriendNotice("");
    try {
      setFriendConnections(await acceptFriendRequest(connection.relationship_id));
      setFriendNotice(`${connection.email} is now connected.`);
    } catch (cause) {
      setFriendNotice(cause instanceof Error ? cause.message : "Could not accept the request.");
    } finally { setSyncingFriend(""); }
  }

  async function removeFriend(connection: AccountFriendConnection) {
    if (!session) return;
    setSyncingFriend(connection.relationship_id); setFriendNotice("");
    try {
      await removeFriendConnection(connection.relationship_id);
      setFriendConnections((current) => current.filter((item) => item.relationship_id !== connection.relationship_id));
      setFriendNotice(connection.status === "accepted" ? "Friend removed." : "Friend request removed.");
    } catch (cause) {
      setFriendNotice(cause instanceof Error ? cause.message : "Could not remove the connection.");
    } finally { setSyncingFriend(""); }
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

  async function authenticateFromWebsite() {
    setAuthBusy(true); setAuthNotice("");
    try {
      await syncWebsiteSession(true);
      setAuthNotice("Signed in. Loading your stats…");
    } catch (cause) {
      setAuthNotice(cause instanceof Error ? cause.message : "Website login failed.");
    } finally { setAuthBusy(false); }
  }

  async function resetPassword() {
    if (!authEmail.trim()) { setAuthNotice("Enter your email address first."); return; }
    setAuthBusy(true); setAuthNotice("");
    try { await sendPasswordReset(authEmail); setAuthNotice("If an account exists for that email, a password reset link has been sent."); }
    catch (cause) { setAuthNotice(cause instanceof Error ? cause.message : "Could not send reset email."); }
    finally { setAuthBusy(false); }
  }

  function companyProblemSolved(problem: CompanyProblem): boolean {
    return Boolean(progress.profile?.acceptedSlugs?.includes(problem.slug)
      || (problem.id && progress.profile?.acceptedProblemIds?.includes(problem.id))
      || progress.solvedSlugs[problem.slug]);
  }

  if (!authChecked) return <main className="popup auth-gate"><div className="auth-gate-loading"><img src="/icon/96.png" alt="" /><strong>Connecting LeetAlly…</strong></div></main>;

  return <main className="popup">
    <header className="app-header">
      <div className="brand"><img className="brand-logo" src="/icon/48.png" alt="" width="30" height="30" /><h1>LeetAlly</h1><span className="beta-badge">BETA</span></div>
      {profile?.avatar ? <img className="profile-image" src={profile.avatar} alt="" /> : <button className="sync-small" onClick={() => setView("settings")}>Connect</button>}
    </header>

    {view === "overview" && <>
      {!profile && <section className="guest-track-card">
        <div><span>START WITHOUT AN ACCOUNT</span><strong>Track your LeetCode progress</strong><small>Enter a public username. Your stats stay on this device until you sign in.</small></div>
        <div className="guest-track-form"><input value={username} onChange={(event) => setUsername(event.target.value)} placeholder="LeetCode username" onKeyDown={(event) => { if (event.key === "Enter") void sync(username); }} /><button onClick={() => void sync(username)} disabled={syncing || !username.trim()}>{syncing ? "Loading…" : "Track"}</button></div>
        {notice && <p>{notice}</p>}
      </section>}
      {profile && !session && <section className="guest-upgrade"><div><strong>Saved on this device</strong><span>Sign in to back up progress, use Friends and keep interview history.</span></div><button onClick={() => setView("settings")}>Sign in</button></section>}
      <section className="hero">
        <div><span className="eyebrow">ONE VOICE · TODAY'S PLAN</span><h2>{todayCount >= progress.planner.dailyProblemGoal ? "Daily goal complete." : "One focused interview moves you forward."}</h2><p>{profile ? `@${profile.username} · Rank ${profile.ranking?.toLocaleString() ?? "—"}` : "Connect LeetCode to combine interview practice with company-focused progress."}</p></div>
        <div className="goal-ring" style={{ "--goal": `${dailyPercent * 3.6}deg` } as React.CSSProperties}><strong>{dailyPercent}%</strong><span>daily</span></div>
      </section>

      <section className="metric-row"><div><b>{profile?.totalSolved ?? localSolved}</b><span>Solved</span></div><div><b>{profile?.streak ?? calculateStreak(progress.activity)}</b><span>Day streak</span></div><div><b>{profile?.totalActiveDays ?? Object.keys(progress.activity).length}</b><span>Active days</span></div></section>

      <section className="difficulty-row"><div className="easy"><b>{difficultyCounts.easy}</b><span>Easy</span></div><div className="medium"><b>{difficultyCounts.medium}</b><span>Medium</span></div><div className="hard"><b>{difficultyCounts.hard}</b><span>Hard</span></div></section>

      <section className="panel activity-panel">
        <header><h3>{activityMonth} Activity</h3><div className="activity-legend"><b>{activeDays}/{days.length}</b><span>Less</span><i className="level-0" /><i className="level-1" /><i className="level-2" /><i className="level-3" /><span>More</span></div></header>
        <div className="heatmap" style={{ gridTemplateColumns: `repeat(${Math.ceil(days.length / 2)}, minmax(0, 1fr))` }}>{days.map(({ key, date }) => { const count = progress.activity[key] ?? 0; const dailyDone = Boolean(profile?.dailyChallengeActivity?.[key]); const label = `${date.toLocaleDateString()}: ${count} submission${count === 1 ? "" : "s"}${dailyDone ? " · daily challenge completed" : ""}`; return <i key={key} title={label} aria-label={label} aria-current={key === localDateKey() ? "date" : undefined} className={`level-${Math.min(3, count)} ${dailyDone ? "daily-done" : ""} ${key === localDateKey() ? "today" : ""}`} />; })}</div>
        <div className="activity-dates"><span>{firstActivityDate}</span><span>{lastActivityDate}</span></div>
      </section>

      <section className="panel focus-panel"><header><h3>Focus sheets</h3><button onClick={() => setView("settings")}>Manage</button></header>{profile && !profile.verifiedOwner ? <p className="empty">Sign in to @{profile.username} on leetcode.com, then Refresh for exact sheet completion.</p> : selectedSheets.length ? selectedSheets.map((sheet) => { const percent = sheet.total > 0 ? Math.round(sheet.completed / sheet.total * 100) : 0; return <div className="focus-row" key={sheet.id}><div><strong><i className="sheet-dot" style={{ background: sheet.color }} />{sheet.name}</strong><span>{sheet.completed}/{sheet.total} <b style={{ color: sheet.color }}>{percent}%</b></span></div><div className="focus-track"><i style={{ width: `${percent}%`, background: sheet.color }} /></div></div>; }) : <p className="empty">Choose your first DSA sheet in Settings.</p>}</section>

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
      <div className="page-title"><span>FRIEND TRACKER</span><h2>Compare with people you know</h2><p>Add their LeetAlly account email. Stats stay private until they accept.</p></div>
      {!session ? <section className="empty-friends"><strong>Sign in to manage friends</strong><p>Your friend list belongs to your LeetAlly email account and syncs across devices.</p></section> : <>
      <section className="panel friend-add">
        <div className="username-connect"><input type="email" autoComplete="email" value={friendEmail} onChange={(event) => setFriendEmail(event.target.value)} placeholder="Friend's LeetAlly email" aria-label="Friend's LeetAlly email" onKeyDown={(event) => { if (event.key === "Enter") void requestFriend(friendEmail); }} /><button onClick={() => void requestFriend(friendEmail)} disabled={Boolean(syncingFriend) || !friendEmail.trim()}>{syncingFriend && syncingFriend !== "*" ? "Sending…" : "Add"}</button></div>
        {friendNotice && <p className="notice">{friendNotice}</p>}
      </section>
      <div className="friends-heading"><strong>{friendConnections.filter((item) => item.status === "accepted").length} connected</strong><button onClick={() => void refreshFriends()} disabled={Boolean(syncingFriend)}>{syncingFriend === "*" ? "Refreshing…" : "Refresh"}</button></div>
      {friendConnections.length ? friendConnections.map((friend) => <section className={`friend-card ${friend.status === "pending" ? "pending" : ""}`} key={friend.relationship_id}>
        <header>{friend.avatar ? <img src={friend.avatar} alt="" /> : <span className="friend-avatar">{(friend.display_name || friend.email)[0]?.toUpperCase()}</span>}<div><strong>{friend.display_name || friend.email}</strong><small>{friend.status === "accepted" ? (friend.username ? `@${friend.username} · Rank ${friend.ranking?.toLocaleString() ?? "—"}` : "No LeetCode ID linked yet") : friend.direction === "received" ? `${friend.email} wants to connect` : `Waiting for ${friend.email}`}</small></div>{friend.status === "accepted" && <b>{friend.total_solved}<small>Solved</small></b>}</header>
        {friend.status === "accepted" && <div className="friend-difficulties"><span className="easy"><b>{friend.easy_solved}</b> Easy</span><span className="medium"><b>{friend.medium_solved}</b> Medium</span><span className="hard"><b>{friend.hard_solved}</b> Hard</span></div>}
        <footer><small>{friend.status === "accepted" ? (friend.synced_at ? `Updated ${new Date(friend.synced_at).toLocaleDateString()}` : "Waiting for their first LeetCode sync") : friend.direction === "received" ? "Approval required" : "Request pending"}</small><div>{friend.direction === "received" && <button onClick={() => void acceptFriend(friend)} disabled={Boolean(syncingFriend)}>Accept</button>}<button className="remove" onClick={() => void removeFriend(friend)} disabled={Boolean(syncingFriend)}>{friend.status === "accepted" ? "Remove" : friend.direction === "received" ? "Decline" : "Cancel"}</button></div></footer>
      </section>) : <section className="empty-friends"><strong>No friend connections yet</strong><p>Add the email they use for LeetAlly. They choose whether to share progress.</p></section>}
      </>}
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
      <div className="page-title"><span>PERSONALIZE</span><h2>Choose your path</h2><p>All sheets sync from LeetCode; selected sheets appear on your dashboard.</p></div>
      <section className="panel auth-panel">
        {session ? <>
          <header><div><h3>LeetAlly account</h3><span>Progress and interview access</span></div><i className={`account-status ${entitlement?.status === "active" ? "premium" : ""}`}>{entitlement?.status === "active" ? "Beta" : "Free"}</i></header>
          <div className="signed-account"><span>{(session.user.user_metadata?.avatar_url || session.user.user_metadata?.picture) ? <img src={session.user.user_metadata.avatar_url || session.user.user_metadata.picture} alt="" /> : (session.user.email?.[0] ?? "L").toUpperCase()}</span><div><strong>{session.user.user_metadata?.full_name || session.user.user_metadata?.name || session.user.email}</strong><small>{session.user.email}</small></div></div>
          <p className="cloud-note">Cloud progress sync is active. {entitlement?.status === "active" ? `${entitlement.minutes_remaining}/${entitlement.minutes_limit} speaking minutes remaining. Silence is never counted.` : "Free tracking, sheets and friends access is active. One AI interview trial is included."}</p>
          {entitlement?.status === "active" && <div className="billing-usage"><div><span>Monthly interview usage</span><b>{entitlement.usage_percent ?? 0}%</b></div><i><b style={{ transform: `scaleX(${(entitlement.usage_percent ?? 0) / 100})` }} /></i><small>{entitlement.period_end ? `Current access through ${new Date(entitlement.period_end).toLocaleDateString()}` : "Beta Monthly active"}</small></div>}
          <a className="manage-plan" href="https://leetally-web.vercel.app/pricing" target="_blank" rel="noreferrer">{entitlement?.status === "active" ? "Manage Beta Monthly ↗" : "See Beta Monthly ↗"}</a>
          <button className="signout-button" disabled={authBusy} onClick={() => {
            setAuthBusy(true); setAuthNotice("");
            void signOutOfExtension()
              .then(() => clearLocalAccountProgress())
              .catch((cause) => setAuthNotice(cause instanceof Error ? cause.message : "Sign out failed."))
              .finally(() => setAuthBusy(false));
          }}>{authBusy ? "Signing out…" : "Sign out"}</button>
        </> : <>
          <header><div><h3>{authMode === "signin" ? "Sign in" : "Create account"}</h3><span>Keep progress and interview history across devices</span></div></header>
          <div className="data-disclosure"><strong>Before you continue</strong><p>LeetAlly reads the current LeetCode problem, editor code and visible output. During an interview, detected speech segments—not silence—are sent to transcription and AI voice providers. This data is used only for interview practice, feedback and account sync.</p></div>
          <label className="policy-consent"><input type="checkbox" checked={policiesAccepted} onChange={(event) => setPoliciesAccepted(event.target.checked)} /><span>I agree to the <a href={TERMS_URL} target="_blank" rel="noreferrer">Terms</a> and acknowledge the <a href={PRIVACY_URL} target="_blank" rel="noreferrer">Privacy Policy</a> (version {POLICY_VERSION}).</span></label>
          <button className="google-auth" disabled={authBusy || !policiesAccepted} onClick={() => void authenticateWithGoogle()}><img src="/google.svg" alt="" aria-hidden="true" />Continue with Google</button>
          <div className="auth-divider"><span>or use email</span></div>
          <input className="auth-input" type="email" value={authEmail} onChange={(event) => setAuthEmail(event.target.value)} placeholder="Email address" />
          <input className="auth-input" type="password" minLength={8} value={authPassword} onChange={(event) => setAuthPassword(event.target.value)} placeholder="Password (8+ characters)" onKeyDown={(event) => { if (event.key === "Enter") void authenticateWithEmail(); }} />
          <button className="email-auth" disabled={authBusy || !policiesAccepted || !authEmail.trim() || authPassword.length < 8} onClick={() => void authenticateWithEmail()}>{authBusy ? "Please wait…" : authMode === "signin" ? "Sign in with email" : "Create email account"}</button>
          <div className="auth-links"><button onClick={() => { setAuthMode((mode) => mode === "signin" ? "signup" : "signin"); setAuthNotice(""); }}>{authMode === "signin" ? "Create account" : "Already have an account?"}</button>{authMode === "signin" && <button onClick={() => void resetPassword()}>Forgot password?</button>}</div>
          {authNotice && <p className="notice">{authNotice}</p>}
        </>}
      </section>
      <section className="panel account-panel">
        <header><div><h3>{profile ? `@${profile.username}` : "LeetCode account"}</h3><span>{profile ? `${session ? `Connected to ${session.user.email}` : "Tracking locally on this device"} · synced ${new Date(profile.syncedAt).toLocaleString()}` : "Enter a public LeetCode username—no LeetAlly login required"}</span></div></header>
        <div className="username-connect"><input value={profile?.username ?? username} onChange={(event) => setUsername(event.target.value)} placeholder="LeetCode username" disabled={syncing || Boolean(profile)} onKeyDown={(event) => { if (event.key === "Enter") void sync(username); }} /><button onClick={() => void sync(profile?.username ?? username)} disabled={syncing || (!profile && !username.trim())}>{syncing ? "Syncing…" : profile ? "Refresh" : "Track"}</button>{profile && <button className="unlink-account" onClick={() => void unlinkLeetCode()} disabled={syncing}>{session ? "Unlink" : "Remove"}</button>}</div>
        {!session && <p className="notice">Basic profile tracking is local. Sign in above for cloud backup, friends and interview history.</p>}
        {notice && <p className="notice">{notice}</p>}
      </section>
      <details className="sync-guide">
        <summary>How automatic tracking works</summary>
        <ol><li>Enter any public username for totals, streak and activity.</li><li>For exact sheet completion, sign in to that same account at leetcode.com and press Refresh.</li><li>Select sheets only to choose which ones appear on Overview.</li><li>Sign in to LeetAlly when you want cloud backup and detailed account features.</li></ol>
        <p>Guest progress stays in extension storage and is attached to your LeetAlly account when you sign in later.</p>
      </details>
      <section className="panel sheet-picker"><header><h3>DSA sheets</h3><span>{selectedSheets.length} selected</span></header>{progress.sheets.map((sheet) => { const percent = sheet.total > 0 ? Math.round(sheet.completed / sheet.total * 100) : 0; return <label key={sheet.id}><input type="checkbox" checked={Boolean(sheet.selected)} onChange={(event) => void toggleSheet(sheet.id, event.target.checked)} /><span className="checkmark" style={{ "--sheet-color": sheet.color } as React.CSSProperties}>✓</span><div><strong>{sheet.name}</strong><small>{sheet.autoTracked ? `${sheet.completed}/${sheet.total} completed · ${percent}%` : `${sheet.total} problems · sync to auto-track`}</small></div><b className="sheet-percent" style={{ color: sheet.color }}>{percent}%</b><a href={sheet.url} target="_blank">↗</a></label>; })}</section>
    </>}

    <nav><button className={view === "overview" ? "active" : ""} onClick={() => setView("overview")}><span>◫</span>Overview</button><button className={view === "interviews" ? "active" : ""} onClick={() => setView("interviews")}><span>◉</span>Interview</button>{/* Planner is intentionally hidden until the beta release. <button className={view === "planner" ? "active" : ""} onClick={() => setView("planner")}><span>◇</span>Planner</button> */}<button className={view === "companies" ? "active" : ""} onClick={() => setView("companies")}><span>▦</span>Companies</button><button className={view === "friends" ? "active" : ""} onClick={() => setView("friends")}><span>♙</span>Friends</button><button className={view === "settings" ? "active" : ""} onClick={() => setView("settings")}><span>⚙</span>Settings</button></nav>
  </main>;
}
