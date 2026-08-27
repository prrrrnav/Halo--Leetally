import { lazy, Suspense, useEffect, useState, type CSSProperties, type FormEvent, type ReactNode } from "react";
import type { Session, SupabaseClient } from "@supabase/supabase-js";
import {
  SiApple, SiAtlassian, SiGoogle, SiLeetcode, SiMeta, SiNetflix, SiNvidia,
} from "react-icons/si";
import { FaAmazon, FaMicrosoft } from "react-icons/fa";
import type { IconType } from "react-icons";
import {
  cancelRenewal, createCheckout, deleteAccount, exportAccountData, getBillingPlans, getEntitlement, getFriendConnections, openCashfreeCheckout,
  type BillingEntitlement, type BillingPlan,
} from "./billing";
import type { PrepRoute } from "./PrepWorkspace";

const PrepWorkspace = lazy(() => import("./PrepWorkspace"));

type Route = "/" | "/features" | "/pricing" | "/feedback" | "/contact" | "/login" | "/signup" | "/extension-auth" | "/privacy" | "/terms" | PrepRoute;
const routeTitles: Record<Route, string> = {
  "/": "LeetAlly — Interview like it matters",
  "/features": "Features — LeetAlly",
  "/pricing": "Pricing — LeetAlly",
  "/feedback": "Feedback — LeetAlly",
  "/contact": "Contact — LeetAlly",
  "/login": "Login — LeetAlly",
  "/signup": "Sign Up — LeetAlly",
  "/extension-auth": "Connect Extension — LeetAlly",
  "/privacy": "Privacy — LeetAlly",
  "/terms": "Terms — LeetAlly",
  "/preparation": "Preparation Dashboard — LeetAlly",
  "/company-dsa": "Company-wise DSA — LeetAlly",
  "/dsa-patterns": "20 DSA Patterns — LeetAlly",
  "/sql-sheet": "SQL Sheet — LeetAlly",
};
const routeDescriptions: Record<Route, string> = {
  "/": "Company-specific LeetCode question tracking, realistic AI interviews, and friends progress in one Chrome extension.",
  "/features": "Explore LeetAlly company question tracking, LeetCode interview practice, scorecards, and friends progress.",
  "/pricing": "Compare free LeetCode tracking with LeetAlly Beta Monthly interview access.",
  "/feedback": "Share product feedback with the LeetAlly team.",
  "/contact": "Contact LeetAlly for account, billing, accessibility, security, or product support.",
  "/login": "Sign in to manage LeetAlly cloud progress, interview history, and account settings.",
  "/signup": "Create a LeetAlly account to sync LeetCode preparation progress.",
  "/extension-auth": "Securely connect the LeetAlly Chrome extension to your account.",
  "/privacy": "Read how LeetAlly collects, uses, protects, exports, and deletes user data.",
  "/terms": "Read the LeetAlly service, interview, subscription, and cancellation terms.",
  "/preparation": "Open the LeetAlly preparation dashboard for focused interview practice.",
  "/company-dsa": "Practice company-specific LeetCode questions with difficulty filters and progress tracking.",
  "/dsa-patterns": "Build reusable problem-solving skill across twenty structured DSA patterns.",
  "/sql-sheet": "Practice interview SQL through joins, aggregations, subqueries, CTEs, and window functions.",
};
const configuredExtensionUrl = import.meta.env.VITE_EXTENSION_URL as string | undefined;
const extensionUrl = configuredExtensionUrl && !configuredExtensionUrl.includes("YOUR_EXTENSION_ID")
  ? configuredExtensionUrl
  : "https://chromewebstore.google.com/detail/kbmamkkghfaagfplfdgpdocmgakhjmlo";
const trustedExtensionId = (import.meta.env.VITE_EXTENSION_ID as string | undefined) || "kbmamkkghfaagfplfdgpdocmgakhjmlo";
const supportEmail = (import.meta.env.VITE_SUPPORT_EMAIL as string | undefined) || "watershaper9.1@gmail.com";
const billingEnabled = import.meta.env.VITE_BILLING_ENABLED === "true";

function useRoute() {
  const normalize = () => (["/", "/features", "/pricing", "/feedback", "/contact", "/login", "/signup", "/extension-auth", "/privacy", "/terms", "/preparation", "/company-dsa", "/dsa-patterns", "/sql-sheet"].includes(location.pathname) ? location.pathname : "/") as Route;
  const [route, setRoute] = useState<Route>(normalize);
  useEffect(() => { const change = () => setRoute(normalize()); addEventListener("popstate", change); return () => removeEventListener("popstate", change); }, []);
  const go = (path: Route) => { history.pushState({}, "", path); setRoute(path); scrollTo({ top: 0, behavior: "smooth" }); };
  return [route, go] as const;
}

function Link({ to, go, children, className = "" }: { to: Route; go: (path: Route) => void; children: ReactNode; className?: string }) {
  return <a href={to} className={className} onClick={(event) => { event.preventDefault(); go(to); }}>{children}</a>;
}

type OrbitItem = { name: string; icon?: IconType; mark?: string; color: string };
type OrbitStyle = CSSProperties & Record<`--${string}`, string | number>;

const orbitRings: OrbitItem[][] = [
  [
    { name: "LeetCode", icon: SiLeetcode, color: "#ffa116" },
    { name: "Company Prep", mark: "CO", color: "#8fb7ff" },
    { name: "LLD", mark: "LLD", color: "#9d8cff" },
    { name: "HLD", mark: "HLD", color: "#59c3ff" },
    { name: "System Design", mark: "SYS", color: "#5ce1b9" },
  ],
  [
    { name: "Google", icon: SiGoogle, color: "#4285f4" },
    { name: "Amazon", icon: FaAmazon, color: "#ff9900" },
    { name: "Microsoft", icon: FaMicrosoft, color: "#00a4ef" },
    { name: "Meta", icon: SiMeta, color: "#5b8cff" },
  ],
  [
    { name: "Atlassian", icon: SiAtlassian, color: "#2684ff" },
    { name: "Apple", icon: SiApple, color: "#f5f7fb" },
    { name: "NVIDIA", icon: SiNvidia, color: "#76b900" },
    { name: "Netflix", icon: SiNetflix, color: "#e50914" },
  ],
];

function CompanyOrbit({ companies, ring }: { companies: OrbitItem[]; ring: number }) {
  const duration = [28, 42, 58][ring];
  return <div className={`constellation-orbit constellation-orbit-${ring + 1}`} aria-hidden="true">
    <span className="orbit-index">0{ring + 1}</span>
    {companies.map((company, index) => {
      const style: OrbitStyle = {
        "--brand": company.color,
        "--delay": `${-(duration / companies.length) * index}s`,
        "--rest": `${(index / companies.length) * 100}%`,
      };
      const Icon = company.icon;
      return <span className="orbit-node" style={style} key={company.name}>
        <span className="orbit-node__badge">
          {Icon ? <Icon role="img" aria-label={company.name} /> : <b className="orbit-node__mark" aria-label={company.name}>{company.mark}</b>}
        </span>
        <span className="orbit-node__name">{company.name}</span>
      </span>;
    })}
  </div>;
}

function OrbitalHero({ go }: { go: (path: Route) => void }) {
  return <section className="hero">
    <div className="hero-copy">
      <div className="eyebrow"><i /> LEETCODE AI INTERVIEWER + COMPANY PREP</div>
      <h1>Practise with <FlipWords words={["purpose.", "structure.", "feedback.", "focus."]} /><br /><em>Interview with confidence.</em></h1>
      <p>Open any LeetCode problem and practise it with one voice interviewer. Then drill company-focused question sets across DSA, LLD, HLD and behavioural rounds.</p>
      <div className="hero-actions"><a className="primary" href={extensionUrl}>Start on LeetCode <span>↗</span></a><button onClick={() => go("/preparation")}>Explore prep sheets</button></div>
      <div className="proof"><span><b>30+</b> company catalogs</span><span><b>20</b> DSA patterns</span><span><b>04</b> interview tracks</span><span><b>03</b> prep sheets</span></div>
    </div>
    <div className="cosmos company-constellation" aria-label="Major technology companies orbit the LeetAlly AI interview preparation system">
      <div className="constellation-ambient" aria-hidden="true" />
      <div className="constellation-grid" aria-hidden="true" />
      {orbitRings.map((companies, ring) => <CompanyOrbit companies={companies} ring={ring} key={ring} />)}
      <div className="constellation-caption"><span>LEETCODE · COMPANY PREP · LLD · HLD · SYSTEM DESIGN</span><span>THREE CONTINUOUS ORBITS</span></div>
    </div>
  </section>;
}

function FlipWords({ words }: { words: string[] }) {
  const [active, setActive] = useState(0);

  useEffect(() => {
    if (words.length < 2 || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = window.setInterval(() => setActive(index => (index + 1) % words.length), 2800);
    return () => window.clearInterval(timer);
  }, [words.length]);

  return <span className="flip-words" role="status" aria-label={words[active]} aria-live="polite" aria-atomic="true">
    <span key={words[active]} aria-hidden="true">{words[active]}</span>
  </span>;
}

type TestimonialItem = {
  role: string;
  context: string;
  initials: string;
  quote: string;
  signal: string;
};

const earlyAccessTestimonials: TestimonialItem[] = [
  { role: "Backend developer", context: "Company-focused preparation", initials: "BD", quote: "I can choose a target, finish the highest-priority questions, and then practise explaining one in interview mode instead of jumping between random lists.", signal: "COMPANY SHEETS" },
  { role: "Final-year CS student", context: "Pattern-based revision", initials: "CS", quote: "Pattern practice makes revision easier because each problem has a reason for being in the set. I am learning the approach instead of memorising isolated solutions.", signal: "20 DSA PATTERNS" },
  { role: "Data analyst candidate", context: "SQL interview practice", initials: "DA", quote: "The SQL track gives me a clear route from joins and aggregations to window functions, with progress I can return to before an interview.", signal: "SQL SHEET" },
  { role: "Software engineer", context: "LeetCode interview rehearsal", initials: "SE", quote: "The interviewer stays on the problem I am already solving and pushes me to explain trade-offs, edge cases, and code changes out loud.", signal: "VOICE INTERVIEWER" },
];

function EarlyAccessTestimonials() {
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const total = earlyAccessTestimonials.length;

  useEffect(() => {
    if (paused || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = window.setInterval(() => setActive(index => (index + 1) % total), 6000);
    return () => window.clearInterval(timer);
  }, [paused, total]);

  const move = (direction: number) => setActive(index => (index + direction + total) % total);
  const current = earlyAccessTestimonials[active];

  return <section className="testimonials" aria-labelledby="testimonial-title" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} onFocusCapture={() => setPaused(true)} onBlurCapture={() => setPaused(false)}>
    <div className="testimonials-heading">
      <span className="kicker">EARLY-ACCESS WORKFLOWS</span>
      <h2 id="testimonial-title">Built around the feedback interview prep actually needs.</h2>
      <p>Representative themes from early-access use cases. Personal names and employer identities are omitted until explicit publishing consent is collected.</p>
    </div>
    <div className="testimonial-stage">
      <div className="testimonial-deck" aria-hidden="true">
        {earlyAccessTestimonials.map((item, index) => {
          const offset = (index - active + total) % total;
          const signedOffset = offset > total / 2 ? offset - total : offset;
          const depth = Math.abs(signedOffset);
          const style: CSSProperties = { zIndex: total - depth, opacity: depth > 2 ? 0 : 1 - depth * .2, transform: `translate3d(${signedOffset * 20}px, ${depth * 15}px, 0) rotate(${signedOffset * 3.5}deg) scale(${1 - depth * .055})` };
          return <div className="testimonial-visual" style={style} key={item.role}><span>{item.signal}</span><strong>{item.initials}</strong><small>{item.context}</small></div>;
        })}
      </div>
      <article className="testimonial-copy" key={current.role} aria-live="polite">
        <span>{current.signal}</span>
        <blockquote>“{current.quote}”</blockquote>
        <div><strong>{current.role}</strong><small>{current.context}</small></div>
        <nav aria-label="Testimonial controls"><button type="button" onClick={() => move(-1)} aria-label="Previous testimonial">←</button><span>{String(active + 1).padStart(2, "0")} / {String(total).padStart(2, "0")}</span><button type="button" onClick={() => move(1)} aria-label="Next testimonial">→</button></nav>
      </article>
    </div>
  </section>;
}

const showcaseCards: Array<{
  label: string;
  title: string;
  copy: string;
  route: Route;
  rows: Array<{ name: string; meta: string; progress: string }>;
}> = [
  {
    label: "Company Wise DSA",
    title: "Prepare for the companies on your shortlist",
    copy: "Move from broad practice to focused company question sets, difficulty filters and visible progress.",
    route: "/company-dsa",
    rows: [
      { name: "Google", meta: "Arrays · Graphs", progress: "78%" },
      { name: "Amazon", meta: "Trees · Heaps", progress: "64%" },
      { name: "Microsoft", meta: "DP · Strings", progress: "51%" },
    ],
  },
  {
    label: "20 DSA Patterns",
    title: "Recognise the pattern before writing the code",
    copy: "Build repeatable problem-solving instincts with structured patterns and seven or more drills in every track.",
    route: "/dsa-patterns",
    rows: [
      { name: "Sliding Window", meta: "7 focused drills", progress: "72%" },
      { name: "Two Pointers", meta: "8 focused drills", progress: "58%" },
      { name: "Binary Search", meta: "7 focused drills", progress: "43%" },
    ],
  },
  {
    label: "SQL Sheet",
    title: "Turn SQL concepts into interview-ready recall",
    copy: "Practise joins, aggregations, subqueries and window functions through a clear progression instead of random lists.",
    route: "/sql-sheet",
    rows: [
      { name: "JOINs", meta: "Core queries", progress: "86%" },
      { name: "Window Functions", meta: "Advanced queries", progress: "61%" },
      { name: "CTEs", meta: "Interview sets", progress: "47%" },
    ],
  },
  {
    label: "AI Interviewer",
    title: "Practise explaining the solution under pressure",
    copy: "Open a LeetCode problem and move from silent solving to a realistic voice interview with evidence-backed feedback.",
    route: "/features",
    rows: [
      { name: "Problem context", meta: "Live LeetCode tab", progress: "100%" },
      { name: "Follow-up depth", meta: "Adaptive questions", progress: "74%" },
      { name: "Communication", meta: "Evidence score", progress: "68%" },
    ],
  },
];

function PreparationShowcase({ go }: { go: (path: Route) => void }) {
  return <section className="relative overflow-hidden bg-[#05070b] py-20 text-white md:py-28">
    <div className="pointer-events-none absolute inset-0">
      <div className="absolute left-1/2 top-1/4 h-[520px] w-[520px] -translate-x-1/2 rounded-full bg-blue-500/8 blur-[120px]" />
      <div className="absolute bottom-8 right-8 h-[320px] w-[320px] rounded-full bg-sky-400/6 blur-[100px]" />
    </div>
    <div className="relative z-10 mx-auto max-w-6xl px-5 md:px-8">
      <div className="mb-14 grid grid-cols-1 items-end gap-7 lg:mb-18 lg:grid-cols-12 lg:gap-16">
        <div className="lg:col-span-7">
          <div className="mb-5 flex items-center gap-3 font-mono text-[10px] uppercase tracking-[0.24em] text-blue-300">
            <span className="h-2 w-2 rounded-full bg-blue-400 shadow-[0_0_16px_#60a5fa]" />
            One focused preparation system
          </div>
          <h2 className="text-left text-4xl font-extrabold leading-[0.98] tracking-[-0.045em] md:text-6xl">
            <span className="block text-slate-500">Less searching.</span>
            <span className="mt-2 block text-slate-50">More deliberate practice.</span>
          </h2>
        </div>
        <p className="max-w-xl text-sm leading-7 text-slate-400 md:text-base lg:col-span-5">
          Company questions, reusable DSA patterns, SQL practice and realistic interview rounds—connected in one preparation loop.
        </p>
      </div>

      <div className="grid grid-cols-1 overflow-hidden border-y border-slate-800/90 md:grid-cols-2">
        {showcaseCards.map((card, index) => {
          const tilt = index % 2 === 0
            ? "origin-bottom-left [transform:perspective(1200px)_rotateY(8deg)_rotateX(4deg)_rotateZ(-3deg)]"
            : "origin-bottom-right [transform:perspective(1200px)_rotateY(-8deg)_rotateX(4deg)_rotateZ(3deg)]";
          return <article className="group relative flex min-h-[520px] flex-col justify-between overflow-hidden border-b border-slate-800/90 px-6 pt-10 transition-colors duration-300 odd:md:border-r md:px-10 md:pt-14 md:[&:nth-last-child(-n+2)]:border-b-0 hover:bg-slate-900/25" key={card.label}>
            <div className="relative z-10">
              <span className="mb-3 block font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-blue-300">{card.label}</span>
              <h3 className="max-w-md text-2xl font-bold leading-tight tracking-[-0.025em] text-slate-50">{card.title}</h3>
              <p className="mt-4 max-w-lg text-sm leading-6 text-slate-400">{card.copy}</p>
              <button className="mt-5 inline-flex items-center gap-2 text-xs font-bold text-blue-200 transition-colors hover:text-white" onClick={() => go(card.route)}>
                Open this track <span aria-hidden="true">↗</span>
              </button>
            </div>

            <div className={`relative mt-10 aspect-[16/11] w-full overflow-hidden rounded-t-2xl border-x border-t border-slate-700/80 bg-[#080d16] shadow-[0_28px_70px_#0009] transition-transform duration-500 ease-out group-hover:[transform:perspective(1200px)_rotateY(0deg)_rotateX(0deg)_rotateZ(0deg)_scale(1.025)] ${tilt}`}>
              <div className="flex h-11 items-center justify-between border-b border-slate-800 px-4">
                <div className="flex gap-1.5"><i className="h-1.5 w-1.5 rounded-full bg-blue-400" /><i className="h-1.5 w-1.5 rounded-full bg-slate-600" /><i className="h-1.5 w-1.5 rounded-full bg-slate-700" /></div>
                <span className="font-mono text-[8px] uppercase tracking-[0.18em] text-slate-500">LeetAlly / {card.label}</span>
              </div>
              <div className="grid grid-cols-[88px_1fr] md:grid-cols-[112px_1fr]">
                <div className="min-h-[240px] border-r border-slate-800 bg-[#070b12] p-3">
                  {["Overview", "Practice", "Progress"].map((item, itemIndex) => <div className={`mb-2 rounded-md px-2 py-2 font-mono text-[7px] uppercase tracking-wide ${itemIndex === 1 ? "bg-blue-400/12 text-blue-300" : "text-slate-600"}`} key={item}>{item}</div>)}
                </div>
                <div className="space-y-3 p-4">
                  <div className="mb-4 flex items-end justify-between"><div><span className="font-mono text-[7px] uppercase tracking-widest text-blue-300">Active track</span><b className="mt-1 block text-sm text-slate-100">{card.label}</b></div><span className="rounded-full border border-blue-400/25 bg-blue-400/8 px-2 py-1 font-mono text-[7px] text-blue-200">IN PROGRESS</span></div>
                  {card.rows.map(row => <div className="rounded-xl border border-slate-800 bg-slate-900/45 p-3" key={row.name}>
                    <div className="flex items-center justify-between gap-3"><div><b className="block text-[10px] text-slate-200">{row.name}</b><small className="text-[8px] text-slate-500">{row.meta}</small></div><span className="font-mono text-[8px] text-blue-300">{row.progress}</span></div>
                    <div className="mt-2 h-1 overflow-hidden rounded-full bg-slate-800"><div className="h-full rounded-full bg-gradient-to-r from-blue-500 to-sky-300" style={{ width: row.progress }} /></div>
                  </div>)}
                </div>
              </div>
            </div>
          </article>;
        })}
      </div>
      <div className="mt-12 flex items-center justify-center gap-2 font-mono text-[9px] uppercase tracking-[0.2em] text-slate-600"><span className="text-blue-400">•••</span> More focused tracks coming</div>
    </div>
  </section>;
}

const features = [
  ["01", "AI interviewer on LeetCode", "Open a supported LeetCode problem and start a realistic voice interview without leaving the page where you already practise."],
  ["02", "Company-focused questions", "Choose a target company, work through focused question sets and track the problems most relevant to your preparation."],
  ["03", "Friends progress", "Add friends by account email and compare public LeetCode progress without exposing private account or interview data."],
  ["04", "One interviewer, every round", "Use the same voice interviewer for DSA, LLD, HLD and behavioural practice so your preparation feels connected."],
  ["05", "Code-aware scorecards", "LeetAlly uses the current problem, code revisions and visible output to produce evidence-backed feedback and next drills."],
  ["06", "Silence costs nothing", "Voice detection runs locally. Only recognized speaking segments reach interview providers or count toward usage."],
];

function Home({ go }: { go: (path: Route) => void }) {
  return <div className="landing-page"><div className="landing-scroll-progress" aria-hidden="true" /><OrbitalHero go={go} /><section className="marquee"><span>LEETCODE INTERVIEWS</span><i /> <span>COMPANY QUESTION SETS</span><i /> <span>FRIENDS PROGRESS</span><i /></section><PreparationShowcase go={go} /><EarlyAccessTestimonials /><section className="home-grid"><div><span className="kicker">THREE CONNECTED MOATS</span><h2>Practise the problem. Prepare for the company. Progress together.</h2></div><p>LeetAlly combines realistic interviews on the active LeetCode problem, focused company question sets, and email-connected friends progress.</p></section><section className="pillar-grid"><article><span>01 / PRIMARY</span><h3>LeetCode AI Interviewer</h3><p>One voice interviewer reads the active problem and your evolving code, asks follow-ups, challenges assumptions and scores the evidence from your round.</p><a href={extensionUrl}>Start an interview ↗</a></article><article><span>02 / PRIMARY</span><h3>Company-based Questions</h3><p>Choose your target, filter by difficulty and practise focused DSA questions with progress tracking before turning them into interview rounds.</p><button onClick={() => go("/preparation")}>Open prep sheets ↗</button><small>Independent preparation sets. No company affiliation or endorsement.</small></article><article><span>03 / PRIMARY</span><h3>Friends Progress Tracking</h3><p>Add a friend using their LeetAlly account email. Their connection stays account-based even if either person links, unlinks, or changes a public LeetCode username.</p><button onClick={() => go("/signup")}>Connect your account ↗</button><small>Only public coding progress is shared; private account and interview data stays private.</small></article></section><section className="phase-strip">{["LeetCode", "Company sets", "Friends", "DSA", "System design", "Behavioural"].map((item, index) => <div key={item}><b>0{index + 1}</b><span>{item}</span></div>)}</section><section className="cta"><span>ONE CONNECTED PREPARATION LOOP.</span><h2>Solve company-focused questions, explain them under pressure, and stay accountable with friends.</h2><a href={extensionUrl}>Start on LeetCode <b>↗</b></a></section></div>;
}

function Features() { return <><PageIntro index="01" label="FEATURES" title="LeetCode interviews meet company-focused prep." copy="One voice interviewer connects DSA, LLD, HLD and behavioural preparation." /><section className="feature-grid">{features.map(([number, title, copy]) => <article key={number}><span>{number}</span><h3>{title}</h3><p>{copy}</p></article>)}</section><section className="architecture"><div><span>CHOOSE</span><b>Company + question</b></div><i>→</i><div><span>INTERVIEW</span><b>Explain + build</b></div><i>→</i><div><span>IMPROVE</span><b>Evidence + next drill</b></div></section></>; }

const fallbackPlans: BillingPlan[] = [
  { id: "beta_monthly", name: "LeetAlly Beta Monthly", purchase_type: "subscription", amount_inr: 799, currency: "INR", interview_minutes_per_month: 240, interval: "month", supports_auto_renew: true, period_days: 30, features: ["company_specific_interviews", "dsa_lld_hld_behavioral", "interview_scorecards", "interview_history", "monthly_usage_dashboard"] },
];

function Pricing({ go, session }: { go: (path: Route) => void; session: Session | null }) {
  const [plans, setPlans] = useState<BillingPlan[]>(fallbackPlans);
  const [entitlement, setEntitlement] = useState<BillingEntitlement | null>(null);
  const [selected, setSelected] = useState<BillingPlan | null>(null);
  const [details, setDetails] = useState({ customer_name: "", phone: "", accepted: false });
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  const refreshEntitlement = async () => {
    if (!billingEnabled || !session) return;
    try { setEntitlement(await getEntitlement(session.access_token)); } catch { /* Pricing remains usable if status is temporarily unavailable. */ }
  };
  useEffect(() => {
    if (!billingEnabled) return;
    void getBillingPlans().then(setPlans).catch(() => setPlans(fallbackPlans));
  }, []);
  useEffect(() => { void refreshEntitlement(); }, [session?.access_token]);
  useEffect(() => {
    if (!new URLSearchParams(location.search).has("payment")) return;
    setNotice("Payment received. We are waiting for secure server confirmation before unlocking access.");
    if (!session) return;
    let attempts = 0;
    const timer = setInterval(() => {
      attempts += 1;
      void getEntitlement(session.access_token).then(next => {
        setEntitlement(next);
        if (next.status === "active" || attempts >= 8) clearInterval(timer);
      }).catch(() => { if (attempts >= 8) clearInterval(timer); });
    }, 2000);
    return () => clearInterval(timer);
  }, [session?.access_token]);

  const choose = (plan: BillingPlan) => {
    if (!billingEnabled) { setNotice("Paid plans are disabled for the initial public release."); return; }
    if (!session) { go("/signup"); return; }
    setNotice("");
    setSelected(plan);
  };
  const pay = async (event: FormEvent) => {
    event.preventDefault();
    if (!session || !selected || !details.accepted) return;
    setBusy(true); setNotice("");
    try {
      const checkout = await createCheckout(session.access_token, {
        plan_id: selected.id,
        customer_name: details.customer_name,
        phone: details.phone,
      });
      await openCashfreeCheckout(checkout);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Checkout could not start.");
      setBusy(false);
    }
  };
  const cancel = async () => {
    if (!session || !confirm("Stop automatic renewal? Your paid access will continue until the current period ends.")) return;
    setBusy(true); setNotice("");
    try {
      const result = await cancelRenewal(session.access_token);
      setNotice(`Automatic renewal is off. Access continues until ${new Date(result.access_until).toLocaleDateString("en-IN")}.`);
      await refreshEntitlement();
    } catch (error) { setNotice(error instanceof Error ? error.message : "Renewal could not be cancelled."); }
    setBusy(false);
  };
  const active = entitlement?.status === "active";
  return <>
    <PageIntro index="02" label="BETA PRICING" title={billingEnabled ? "Track for free. Interview deeply with Beta Monthly." : "Start with tracking and a free interview."} copy={billingEnabled ? "A focused monthly beta for company-specific LeetCode interviews. Access starts only after Cashfree confirms payment to our server." : "Payments are not configured in this build. Tracking remains available without a paid plan."} />
    {!billingEnabled && <p className="billing-notice">Launch access includes one free AI interview trial. Paid plans and checkout are currently unavailable.</p>}
    {billingEnabled && entitlement && entitlement.status !== "none" && <section className={`billing-status ${active ? "active" : "attention"}`}>
      <div><span>BETA MONTHLY ACCESS</span><h2>{active ? "Plan active" : "Payment required"}</h2><p>{active ? `${entitlement.minutes_remaining} of ${entitlement.minutes_limit} detected speaking minutes remain (${entitlement.usage_percent}% used). Silence is never counted.` : "Your plan is inactive or has expired. Activate Beta Monthly to continue AI interviews."}</p><div className="usage-meter" aria-label={`${entitlement.usage_percent}% of monthly speaking allowance used`}><i style={{ transform: `scaleX(${entitlement.usage_percent / 100})` }} /></div></div>
      <div>{entitlement.period_end && <small>{active ? "Access through" : "Ended"}<b>{new Date(entitlement.period_end).toLocaleDateString("en-IN", { dateStyle: "medium" })}</b></small>}{entitlement.auto_renew && <button disabled={busy} onClick={() => void cancel()}>Cancel AutoPay</button>}</div>
    </section>}
    {notice && <p className="billing-notice">{notice}</p>}
    <section className="pricing-grid">
      <Price name="Free tracking" price="₹0" suffix="forever" items={["LeetCode profile and sheet tracking", "Friends progress tracking", "Cloud sync with an account", "One free AI interview trial"]} action={session ? "Included in your account" : "Create free account"} onClick={() => session ? undefined : go("/signup")} />
      {billingEnabled && plans.map((plan, index) => <Price key={plan.id} featured={index === 0} name={plan.name} price={`₹${plan.amount_inr.toLocaleString("en-IN")}`} suffix="month" items={[`${plan.interview_minutes_per_month} detected speaking minutes`, "Company-specific LeetCode interviews", "DSA, LLD, HLD + behavioural rounds", "Scorecards, history and usage dashboard"]} action={active && entitlement?.plan_id === plan.id ? "Your plan is active" : "Start Beta Monthly"} onClick={() => active ? undefined : choose(plan)} />)}
    </section>
    {billingEnabled && <p className="pricing-note"><b>Beta:</b> tracking and friends progress are available now. The paid plan renews monthly and covers the interview features listed above; unfinished future features are not part of this purchase. Cancel AutoPay any time and retain access through the paid period. Taxes, if applicable, are shown by Cashfree before payment.</p>}
    {billingEnabled && selected && <div className="checkout-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) setSelected(null); }}><form className="checkout-card" role="dialog" aria-modal="true" aria-labelledby="checkout-title" onSubmit={pay}>
      <button type="button" className="checkout-close" aria-label="Close checkout" onClick={() => setSelected(null)}>×</button>
      <span>SECURE BETA CHECKOUT</span><h2 id="checkout-title">{selected.name}</h2><p className="checkout-price">₹{selected.amount_inr.toLocaleString("en-IN")} <small>/ month</small></p>
      <label>Full name<input required minLength={2} maxLength={100} value={details.customer_name} onChange={e => setDetails({ ...details, customer_name: e.target.value })} /></label>
      <label>Indian mobile number<input required inputMode="numeric" pattern="[6-9][0-9]{9}" placeholder="9876543210" value={details.phone} onChange={e => setDetails({ ...details, phone: e.target.value.replace(/\D/g, "").slice(0, 10) })} /></label>
      <div className="renew-choice"><span><b>Monthly AutoPay</b>Cashfree collects ₹{selected.amount_inr.toLocaleString("en-IN")} to authorise and start the monthly plan, then renews it each month until cancelled. Available payment methods depend on Cashfree and your bank.</span></div>
      <label className="checkout-accept"><input type="checkbox" required checked={details.accepted} onChange={e => setDetails({ ...details, accepted: e.target.checked })} /><span>I understand this is a recurring beta subscription and accept the <a href="/terms" target="_blank">Terms</a>, renewal and refund conditions.</span></label>
      <button className="checkout-pay" disabled={busy || !details.accepted}>{busy ? "Opening secure checkout…" : `Subscribe for ₹${selected.amount_inr.toLocaleString("en-IN")}/month →`}</button>
      <small className="checkout-trust">LeetAlly never receives or stores your card, bank or UPI credentials. Access is granted only after a verified Cashfree webhook.</small>
    </form></div>}
  </>;
}

function Price({ name, price, suffix, items, action, onClick, featured = false }: { name: string; price: string; suffix: string; items: string[]; action: string; onClick: () => void; featured?: boolean }) { return <article className={`price ${featured ? "featured" : ""}`}>{featured && <span className="popular">MOST FOCUSED</span>}<h3>{name}</h3><div><b>{price}</b><small> / {suffix}</small></div><ul>{items.map(item => <li key={item}>✓ {item}</li>)}</ul><button onClick={onClick}>{action} ↗</button></article>; }

function PageIntro({ index, label, title, copy }: { index: string; label: string; title: string; copy: string }) { return <section className="page-intro"><div><span>{index} / {label}</span><h1>{title}</h1></div><p>{copy}</p></section>; }

function FormPage({ kind, client }: { kind: "feedback" | "contact"; client: SupabaseClient | null }) {
  const [state, setState] = useState({ name: "", email: "", message: "", rating: 5 }); const [notice, setNotice] = useState(""); const [busy, setBusy] = useState(false);
  const submit = async (event: FormEvent) => { event.preventDefault(); setBusy(true); setNotice(""); if (!client) { setNotice("Forms are still loading. Please try again or email us directly."); setBusy(false); return; } const table = kind === "feedback" ? "website_feedback" : "contact_requests"; const payload = kind === "feedback" ? state : { name: state.name, email: state.email, message: state.message }; const { error } = await client.from(table).insert(payload); setNotice(error ? "Could not send this right now. Please email us instead." : "Received. Thank you—we’ll get back to you shortly."); if (!error) setState({ name: "", email: "", message: "", rating: 5 }); setBusy(false); };
  return <><PageIntro index={kind === "feedback" ? "03" : "04"} label={kind.toUpperCase()} title={kind === "feedback" ? "Help shape the interviewer you want." : "Let’s talk about your next interview."} copy={kind === "feedback" ? "Share what felt realistic, what broke immersion and what would make you return." : "Questions, partnerships, beta access or support—we read every useful message."} /><section className="form-layout"><form onSubmit={submit}><p className="collection-notice">We use your name, email and message only to respond, provide support and improve LeetAlly. See the <a href="/privacy">Privacy Policy</a> for retention and rights.</p>{kind === "feedback" && <label>Overall experience<select value={state.rating} onChange={e => setState({ ...state, rating: Number(e.target.value) })}>{[5,4,3,2,1].map(n => <option key={n} value={n}>{n} — {n === 5 ? "Excellent" : n === 1 ? "Needs work" : "Good"}</option>)}</select></label>}<label>Your name<input required autoComplete="name" value={state.name} onChange={e => setState({ ...state, name: e.target.value })} /></label><label>Email<input required autoComplete="email" type="email" value={state.email} onChange={e => setState({ ...state, email: e.target.value })} /></label><label>{kind === "feedback" ? "What should we improve?" : "How can we help?"}<textarea required minLength={10} value={state.message} onChange={e => setState({ ...state, message: e.target.value })} /></label><button disabled={busy}>{busy ? "Sending…" : "Send message ↗"}</button>{notice && <p className="form-notice" role="status">{notice}</p>}</form><aside><span>DIRECT</span><a href={`mailto:${supportEmail}`}>{supportEmail}</a><p>Never send passwords, API keys, payment credentials or confidential interview material.</p></aside></section></>;
}

type AccountSheet = { id: string; name: string; completed: number; total: number; color: string; url: string; selected?: boolean };
type AccountInterview = { id: string; companyId: string; interviewType?: string; problemTitle: string; difficulty?: string | null; completedAt: string; durationSeconds: number; overallScore: number; communicationScore: number; problemSolvingScore: number; complexityScore: number; edgeCaseScore: number; summary?: string };
type AccountPlanner = { dailyProblemGoal: number; weeklyInterviewGoal: number; mockInterviewDate: string; interviewDate: string; reminders: boolean; targetCompany: string; interviewType: string };
type AccountProgress = {
  solvedSlugs?: Record<string, string>;
  activity?: Record<string, number>;
  sheets?: AccountSheet[];
  profile?: { username: string; ranking?: number; totalSolved: number; easySolved: number; mediumSolved: number; hardSolved: number; streak?: number; totalActiveDays?: number; syncedAt?: string };
  planner?: Partial<AccountPlanner>;
  interviews?: AccountInterview[];
};

const defaultAccountPlanner: AccountPlanner = { dailyProblemGoal: 1, weeklyInterviewGoal: 2, mockInterviewDate: "", interviewDate: "", reminders: false, targetCompany: "google", interviewType: "dsa" };
const accountCompanies = ["google", "amazon", "microsoft", "meta", "ibm", "american-express", "accenture", "tcs", "hcltech"];
const companyLabel = (value: string) => value.split("-").map(part => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
const dateLabel = (value?: string | null) => value ? new Date(value).toLocaleDateString("en-IN", { dateStyle: "medium" }) : "Not set";

function activityStreak(activity: Record<string, number>): number {
  const localKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  const cursor = new Date();
  if (!activity[localKey(cursor)]) cursor.setDate(cursor.getDate() - 1);
  let streak = 0;
  while (activity[localKey(cursor)]) { streak += 1; cursor.setDate(cursor.getDate() - 1); }
  return streak;
}

function AccountDashboard({ session, client }: { session: Session; client: SupabaseClient | null }) {
  const [record, setRecord] = useState<{ progress: AccountProgress; updated_at?: string | null } | null>(null);
  const [entitlement, setEntitlement] = useState<BillingEntitlement | null>(null);
  const [connectedFriends, setConnectedFriends] = useState(0);
  const [planner, setPlanner] = useState<AccountPlanner>(defaultAccountPlanner);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [websiteCompleted] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem("leetally-sheet-progress") || "[]") as string[]; } catch { return []; }
  });

  useEffect(() => {
    if (!client) return;
    let active = true;
    setLoading(true);
    void client.from("user_progress").select("progress, updated_at").eq("user_id", session.user.id).maybeSingle().then(({ data, error }) => {
      if (!active) return;
      if (error) setNotice("Extension progress could not be loaded right now.");
      const next = data ? { progress: (data.progress || {}) as AccountProgress, updated_at: data.updated_at as string | null } : null;
      setRecord(next);
      setPlanner({ ...defaultAccountPlanner, ...(next?.progress.planner || {}) });
      setLoading(false);
    });
    return () => { active = false; };
  }, [client, session.user.id]);

  useEffect(() => {
    if (!billingEnabled) return;
    let active = true;
    void getEntitlement(session.access_token)
      .then(next => { if (active) setEntitlement(next); })
      .catch(() => { if (active) setNotice("Plan usage could not be loaded right now."); });
    return () => { active = false; };
  }, [session.access_token]);

  useEffect(() => {
    let active = true;
    void getFriendConnections(session.access_token)
      .then(connections => {
        if (active) setConnectedFriends(connections.filter(item => item.status === "accepted").length);
      })
      .catch(() => { if (active) setConnectedFriends(0); });
    return () => { active = false; };
  }, [session.access_token]);

  const progress = record?.progress || {};
  const selectedSheets = (progress.sheets || []).filter(sheet => sheet.selected);
  const interviews = [...(progress.interviews || [])].sort((left, right) => right.completedAt.localeCompare(left.completedAt));
  const solved = Object.keys(progress.solvedSlugs || {}).length || progress.profile?.totalSolved || 0;
  const streak = progress.profile?.streak || activityStreak(progress.activity || {});
  const websiteTracks = [
    { name: "Company-wise DSA", count: websiteCompleted.filter(id => !id.startsWith("pattern:") && !id.startsWith("sql:")).length, href: "/company-dsa", color: "#60a5fa" },
    { name: "20 DSA Patterns", count: websiteCompleted.filter(id => id.startsWith("pattern:")).length, href: "/dsa-patterns", color: "#a78bfa" },
    { name: "SQL Sheet", count: websiteCompleted.filter(id => id.startsWith("sql:")).length, href: "/sql-sheet", color: "#fb923c" },
  ];
  const displayName = String(session.user.user_metadata?.full_name || session.user.user_metadata?.name || session.user.email?.split("@")[0] || "LeetAlly user");
  const initial = displayName.charAt(0).toUpperCase();

  const savePlanner = async () => {
    if (!client || saving) return;
    setSaving(true); setNotice("");
    const { data: latest, error: refreshError } = await client.from("user_progress").select("progress").eq("user_id", session.user.id).maybeSingle();
    if (refreshError) { setNotice("Settings could not be saved. Please try again."); setSaving(false); return; }
    const currentProgress = (latest?.progress || progress) as AccountProgress;
    const nextProgress: AccountProgress = { ...currentProgress, planner };
    const { error } = await client.from("user_progress").upsert({ user_id: session.user.id, progress: nextProgress, leetcode_username: nextProgress.profile?.username || null, updated_at: new Date().toISOString() });
    if (error) setNotice("Settings could not be saved. Please try again.");
    else { setRecord({ progress: nextProgress, updated_at: new Date().toISOString() }); setNotice("Settings saved. The extension will receive them through cloud sync."); }
    setSaving(false);
  };

  const downloadAccountData = async () => {
    setNotice("");
    try {
      const data = await exportAccountData(session.access_token);
      const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `leetally-data-${new Date().toISOString().slice(0, 10)}.json`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : "Your data export could not be created.");
    }
  };

  const removeAccount = async () => {
    const confirmed = window.confirm("Permanently delete your LeetAlly account and interview data? This cannot be undone.");
    if (!confirmed) return;
    setNotice("");
    try {
      await deleteAccount(session.access_token);
      await client?.auth.signOut();
      location.assign("/");
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : "Your account could not be deleted.");
    }
  };

  return <section className="mx-auto w-full max-w-[1320px] px-5 pb-28 pt-16 text-slate-100 md:px-8 md:pt-24">
    <div className="mb-10 flex flex-col justify-between gap-8 border-b border-slate-800 pb-10 lg:flex-row lg:items-end">
      <div className="flex items-center gap-5">
        <div className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl border border-blue-300/25 bg-blue-400/12 text-2xl font-extrabold text-blue-200 shadow-[0_0_40px_#3b82f622]">{initial}</div>
        <div><span className="font-mono text-[9px] uppercase tracking-[0.24em] text-blue-300">Connected account</span><h1 className="mt-2 text-4xl font-bold tracking-[-0.04em] md:text-5xl">Welcome back, {displayName.split(" ")[0]}.</h1><p className="mt-2 text-sm text-slate-400">{session.user.email}</p></div>
      </div>
      <div className={`flex w-fit items-center gap-3 rounded-full border px-4 py-2 text-xs ${record ? "border-emerald-400/25 bg-emerald-400/8 text-emerald-200" : "border-amber-400/25 bg-amber-400/8 text-amber-200"}`}><i className={`h-2 w-2 rounded-full ${record ? "bg-emerald-400 shadow-[0_0_10px_#34d399]" : "bg-amber-400"}`} /><span>{record ? `Extension synced · ${dateLabel(record.updated_at)}` : loading ? "Checking extension sync…" : "Open the extension once to start cloud sync"}</span></div>
    </div>

    <div className="mb-8 grid grid-cols-2 gap-3 md:grid-cols-4">
      {[{ label: "Problems solved", value: solved }, { label: "Current streak", value: `${streak}d` }, { label: "Interviews", value: interviews.length }, { label: "Connected friends", value: connectedFriends }].map(stat => <div className="rounded-2xl border border-slate-800 bg-[#090e17] p-5" key={stat.label}><span className="font-mono text-[8px] uppercase tracking-[0.16em] text-slate-500">{stat.label}</span><b className="mt-3 block text-3xl tracking-[-0.04em] text-slate-100">{stat.value}</b></div>)}
    </div>

    {notice && <p className="mb-6 rounded-xl border border-blue-400/20 bg-blue-400/8 px-4 py-3 text-sm text-blue-100" role="status">{notice}</p>}

    <div className="grid gap-7 xl:grid-cols-[minmax(0,1.65fr)_minmax(330px,.75fr)]">
      <div className="space-y-7">
        <section className="rounded-3xl border border-slate-800 bg-[#080d15] p-6 md:p-8">
          <header className="mb-6 flex items-end justify-between gap-4"><div><span className="font-mono text-[9px] uppercase tracking-[0.2em] text-blue-300">Extension sheets</span><h2 className="mt-2 text-2xl font-bold">Sheets you follow</h2></div><small className="text-slate-500">{selectedSheets.length} selected</small></header>
          {loading ? <p className="py-10 text-center text-sm text-slate-500">Loading extension progress…</p> : selectedSheets.length ? <div className="grid gap-3 md:grid-cols-2">{selectedSheets.map(sheet => { const percent = sheet.total ? Math.round(sheet.completed / sheet.total * 100) : 0; return <a className="group rounded-2xl border border-slate-800 bg-slate-900/35 p-4 transition hover:-translate-y-0.5 hover:border-slate-700" href={sheet.url} target="_blank" rel="noreferrer" key={sheet.id}><div className="flex items-start justify-between gap-4"><div><b className="text-sm text-slate-200">{sheet.name}</b><small className="mt-1 block text-[10px] text-slate-500">{sheet.completed}/{sheet.total} completed</small></div><strong className="font-mono text-xs" style={{ color: sheet.color }}>{percent}%</strong></div><div className="mt-4 h-1.5 overflow-hidden rounded-full bg-slate-800"><i className="block h-full rounded-full" style={{ width: `${percent}%`, background: sheet.color }} /></div></a>; })}</div> : <div className="rounded-2xl border border-dashed border-slate-700 px-5 py-10 text-center"><b className="text-sm">No followed sheets synced yet</b><p className="mt-2 text-xs text-slate-500">Choose sheets in the extension Settings page, then keep the extension open briefly.</p></div>}
        </section>

        <section className="rounded-3xl border border-slate-800 bg-[#080d15] p-6 md:p-8">
          <header className="mb-6"><span className="font-mono text-[9px] uppercase tracking-[0.2em] text-blue-300">Website preparation</span><h2 className="mt-2 text-2xl font-bold">LeetAlly sheets on this device</h2><p className="mt-2 text-xs text-slate-500">Website checkmarks are currently stored locally in this browser.</p></header>
          <div className="grid gap-3 md:grid-cols-3">{websiteTracks.map(track => <a className="rounded-2xl border border-slate-800 bg-slate-900/35 p-4 transition hover:border-slate-700" href={track.href} key={track.name}><span className="block h-2 w-2 rounded-full" style={{ background: track.color, boxShadow: `0 0 12px ${track.color}` }} /><b className="mt-5 block text-sm">{track.name}</b><strong className="mt-2 block text-2xl" style={{ color: track.color }}>{track.count}</strong><small className="text-[9px] text-slate-500">completed questions</small></a>)}</div>
        </section>

        <section className="rounded-3xl border border-slate-800 bg-[#080d15] p-6 md:p-8">
          <header className="mb-6 flex items-end justify-between"><div><span className="font-mono text-[9px] uppercase tracking-[0.2em] text-blue-300">Interview history</span><h2 className="mt-2 text-2xl font-bold">Recent scorecards</h2></div><small className="text-slate-500">Latest {Math.min(5, interviews.length)}</small></header>
          {interviews.length ? <div className="space-y-3">{interviews.slice(0, 5).map(interview => <article className="grid gap-4 rounded-2xl border border-slate-800 bg-slate-900/35 p-4 md:grid-cols-[1fr_auto] md:items-center" key={interview.id}><div><span className="font-mono text-[8px] uppercase tracking-wider text-blue-300">{companyLabel(interview.companyId)} · {interview.interviewType || "DSA"}</span><b className="mt-1 block text-sm">{interview.problemTitle}</b><small className="mt-1 block text-[9px] text-slate-500">{dateLabel(interview.completedAt)} · {Math.max(1, Math.round(interview.durationSeconds / 60))} min · {interview.difficulty || "Practice"}</small></div><div className="flex items-center gap-4"><div className="hidden gap-3 text-center md:flex">{[["COMM", interview.communicationScore], ["SOLVE", interview.problemSolvingScore], ["EDGE", interview.edgeCaseScore]].map(([label, value]) => <span className="font-mono text-[7px] text-slate-600" key={label as string}><b className="block text-[10px] text-slate-300">{value}</b>{label}</span>)}</div><strong className="grid h-12 w-12 place-items-center rounded-full border border-blue-400/25 bg-blue-400/8 text-blue-200">{interview.overallScore}<small className="text-[7px] text-slate-500">/10</small></strong></div></article>)}</div> : <div className="rounded-2xl border border-dashed border-slate-700 px-5 py-10 text-center"><b className="text-sm">No completed interviews yet</b><p className="mt-2 text-xs text-slate-500">Finish an interview from a supported LeetCode problem to create your first scorecard.</p></div>}
        </section>
      </div>

      <aside className="space-y-7">
        {billingEnabled && <section className="rounded-3xl border border-blue-400/20 bg-[#080d15] p-6">
          <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-blue-300">Beta access</span>
          <div className="mt-2 flex items-start justify-between gap-4"><div><h2 className="text-xl font-bold">{entitlement?.status === "active" ? entitlement.plan_name || "Beta Monthly" : "Free plan"}</h2><p className="mt-2 text-xs leading-5 text-slate-500">{entitlement?.status === "active" ? "Company-specific interviews, scorecards and history are unlocked." : "Tracking, sheets and friends remain free. One interview trial is included."}</p></div><b className={`rounded-full border px-3 py-1 font-mono text-[8px] uppercase tracking-wider ${entitlement?.status === "active" ? "border-emerald-400/25 bg-emerald-400/8 text-emerald-200" : "border-slate-700 text-slate-400"}`}>{entitlement?.status === "active" ? "Active" : "Free"}</b></div>
          {entitlement?.status === "active" && <><div className="mt-6 flex items-end justify-between"><span className="text-[10px] text-slate-500">Detected speaking usage</span><b className="text-sm text-blue-200">{entitlement.minutes_remaining}/{entitlement.minutes_limit} min left</b></div><div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-800" role="progressbar" aria-label="Monthly interview speaking usage" aria-valuemin={0} aria-valuemax={100} aria-valuenow={entitlement.usage_percent}><i className="block h-full w-full origin-left rounded-full bg-blue-300" style={{ transform: `scaleX(${entitlement.usage_percent / 100})` }} /></div><p className="mt-3 text-[9px] text-slate-600">{entitlement.usage_percent}% used · silence is not counted{entitlement.period_end ? ` · renews ${dateLabel(entitlement.period_end)}` : ""}</p></>}
          <a className="mt-6 flex items-center justify-between rounded-full border border-slate-700 px-4 py-3 text-xs text-slate-200 hover:border-blue-300" href="/pricing">{entitlement?.status === "active" ? "Manage subscription" : "View Beta Monthly"}<span>↗</span></a>
        </section>}
        <section className="rounded-3xl border border-slate-800 bg-[#080d15] p-6">
          <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-blue-300">LeetCode profile</span><h2 className="mt-2 text-xl font-bold">{progress.profile?.username || "Not connected"}</h2>
          {progress.profile ? <><div className="mt-5 grid grid-cols-2 gap-2">{[["Easy", progress.profile.easySolved], ["Medium", progress.profile.mediumSolved], ["Hard", progress.profile.hardSolved], ["Ranking", progress.profile.ranking ? `#${progress.profile.ranking.toLocaleString()}` : "—"]].map(([label, value]) => <span className="rounded-xl border border-slate-800 bg-slate-900/40 p-3 text-[9px] text-slate-500" key={label as string}><b className="mb-1 block text-sm text-slate-200">{value}</b>{label}</span>)}</div><p className="mt-4 text-[10px] text-slate-500">Last synced {dateLabel(progress.profile.syncedAt)}</p></> : <p className="mt-4 text-xs leading-5 text-slate-500">Add your LeetCode username in extension Settings to import accepted history and sheet completion.</p>}
        </section>

        <section className="rounded-3xl border border-slate-800 bg-[#080d15] p-6">
          <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-blue-300">Planner settings</span><h2 className="mt-2 text-xl font-bold">Interview preparation</h2>
          <div className="mt-6 space-y-4">
            <label className="block text-[10px] text-slate-500">Target company<select className="mt-2 w-full rounded-xl border border-slate-700 bg-[#050911] px-3 py-3 text-sm text-slate-200 outline-none focus:border-blue-400" value={planner.targetCompany} onChange={event => setPlanner({ ...planner, targetCompany: event.target.value })}>{accountCompanies.map(company => <option value={company} key={company}>{companyLabel(company)}</option>)}</select></label>
            <label className="block text-[10px] text-slate-500">Next interview type<select className="mt-2 w-full rounded-xl border border-slate-700 bg-[#050911] px-3 py-3 text-sm text-slate-200 outline-none focus:border-blue-400" value={planner.interviewType} onChange={event => setPlanner({ ...planner, interviewType: event.target.value })}>{["dsa", "behavioral", "lld", "hld"].map(type => <option value={type} key={type}>{type.toUpperCase()}</option>)}</select></label>
            <div className="grid grid-cols-2 gap-3"><label className="block text-[10px] text-slate-500">Daily problems<input className="mt-2 w-full rounded-xl border border-slate-700 bg-[#050911] px-3 py-3 text-sm text-slate-200 outline-none focus:border-blue-400" type="number" min="1" max="5" value={planner.dailyProblemGoal} onChange={event => setPlanner({ ...planner, dailyProblemGoal: Number(event.target.value) })} /></label><label className="block text-[10px] text-slate-500">Weekly interviews<input className="mt-2 w-full rounded-xl border border-slate-700 bg-[#050911] px-3 py-3 text-sm text-slate-200 outline-none focus:border-blue-400" type="number" min="1" max="7" value={planner.weeklyInterviewGoal} onChange={event => setPlanner({ ...planner, weeklyInterviewGoal: Number(event.target.value) })} /></label></div>
            <label className="block text-[10px] text-slate-500">Next mock interview<input className="mt-2 w-full rounded-xl border border-slate-700 bg-[#050911] px-3 py-3 text-sm text-slate-200 outline-none [color-scheme:dark] focus:border-blue-400" type="date" value={planner.mockInterviewDate} onChange={event => setPlanner({ ...planner, mockInterviewDate: event.target.value })} /></label>
            <label className="block text-[10px] text-slate-500">Target interview date<input className="mt-2 w-full rounded-xl border border-slate-700 bg-[#050911] px-3 py-3 text-sm text-slate-200 outline-none [color-scheme:dark] focus:border-blue-400" type="date" value={planner.interviewDate} onChange={event => setPlanner({ ...planner, interviewDate: event.target.value })} /></label>
            <label className="flex items-center justify-between gap-4 rounded-xl border border-slate-800 bg-slate-900/35 p-3 text-xs text-slate-300">Reminders<input className="h-4 w-4 accent-blue-400" type="checkbox" checked={planner.reminders} onChange={event => setPlanner({ ...planner, reminders: event.target.checked })} /></label>
            <button className="w-full rounded-full bg-blue-300 px-5 py-3 text-sm font-bold text-[#07101f] transition hover:bg-blue-200 disabled:opacity-50" disabled={!client || saving} onClick={() => void savePlanner()}>{saving ? "Saving…" : "Save settings"}</button>
          </div>
        </section>

        <section className="rounded-3xl border border-slate-800 bg-[#080d15] p-6">
          <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-blue-300">Account</span><div className="mt-5 space-y-2"><a className="flex items-center justify-between rounded-xl border border-slate-800 px-4 py-3 text-xs text-slate-300 hover:border-slate-700" href="/preparation">Preparation dashboard <span>↗</span></a><a className="flex items-center justify-between rounded-xl border border-slate-800 px-4 py-3 text-xs text-slate-300 hover:border-slate-700" href="/privacy">Privacy and data rights <span>↗</span></a><a className="flex items-center justify-between rounded-xl border border-slate-800 px-4 py-3 text-xs text-slate-300 hover:border-slate-700" href={`mailto:${supportEmail}?subject=LeetAlly account support`}>Account support <span>↗</span></a><button className="w-full rounded-full border border-slate-700 px-5 py-3 text-sm font-bold text-slate-200 hover:border-slate-500" onClick={() => void downloadAccountData()}>Download my data</button><button className="mt-4 w-full rounded-full border border-red-400/25 bg-red-400/5 px-5 py-3 text-sm font-bold text-red-200 hover:bg-red-400/10" onClick={() => void client?.auth.signOut()}>Sign out</button><button className="w-full rounded-full px-5 py-2 text-xs text-red-300 hover:bg-red-400/5" onClick={() => void removeAccount()}>Delete account permanently</button></div>
          <p className="mt-5 text-[9px] leading-4 text-slate-600">Account created {dateLabel(session.user.created_at)} · Provider {String(session.user.app_metadata?.provider || "email")}</p>
        </section>
      </aside>
    </div>
  </section>;
}

function Login({ session, client, initialMode = "signin", returnPath = "/login", recoveryMode = false, onRecoveryComplete }: { session: Session | null; client: SupabaseClient | null; initialMode?: "signin" | "signup"; returnPath?: string; recoveryMode?: boolean; onRecoveryComplete?: () => void }) {
  const [mode, setMode] = useState<"signin" | "signup">(initialMode); const [email, setEmail] = useState(""); const [password, setPassword] = useState(""); const [confirmPassword, setConfirmPassword] = useState(""); const [notice, setNotice] = useState(""); const [busy, setBusy] = useState(false);
  useEffect(() => { setMode(initialMode); setNotice(""); setPassword(""); setConfirmPassword(""); }, [initialMode]);
  const friendlyError = (message: string) => {
    const normalized = message.toLowerCase();
    if (normalized.includes("invalid login credentials")) return "Email or password is incorrect.";
    if (normalized.includes("email not confirmed")) return "Confirm your email before signing in.";
    if (normalized.includes("already registered") || normalized.includes("already exists")) return "An account with this email already exists. Sign in instead.";
    if (normalized.includes("rate limit") || normalized.includes("too many")) return "Too many attempts. Please wait a moment and try again.";
    if (normalized.includes("password")) return "Use a password with at least 8 characters.";
    return "We couldn't complete that request. Please try again.";
  };
  const emailAuth = async (event: FormEvent) => {
    event.preventDefault();
    if (!client || busy) return;
    setBusy(true); setNotice("");
    try {
      const result = mode === "signup"
        ? await client.auth.signUp({ email: email.trim(), password, options: { emailRedirectTo: `${location.origin}${returnPath}`, data: { policy_version: "2026-08-17", policy_accepted_at: new Date().toISOString() } } })
        : await client.auth.signInWithPassword({ email: email.trim(), password });
      if (result.error) setNotice(friendlyError(result.error.message));
      else if (mode === "signup" && !result.data.session) setNotice("Check your inbox to finish creating your account.");
    } catch { setNotice("We couldn't complete that request. Please try again."); }
    finally { setBusy(false); }
  };
  const google = async () => {
    if (!client || busy) return;
    setBusy(true); setNotice("");
    try {
      const { error } = await client.auth.signInWithOAuth({ provider: "google", options: { redirectTo: `${location.origin}${returnPath}` } });
      if (error) { setNotice("Couldn't continue with Google. Please try again."); setBusy(false); }
    } catch { setNotice("Couldn't continue with Google. Please try again."); setBusy(false); }
  };
  const forgotPassword = async () => {
    if (!client || busy) return;
    if (!email.trim()) { setNotice("Enter your email address first."); return; }
    setBusy(true); setNotice("");
    try {
      const { error } = await client.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${location.origin}/login?recovery=1` });
      if (error) setNotice(friendlyError(error.message));
      else setNotice("If an account exists for that email, a password reset link has been sent.");
    } catch { setNotice("We couldn't send the reset link. Please try again."); }
    finally { setBusy(false); }
  };
  const updatePassword = async (event: FormEvent) => {
    event.preventDefault();
    if (!client || !session || busy) return;
    if (password.length < 8) { setNotice("Use a password with at least 8 characters."); return; }
    if (password !== confirmPassword) { setNotice("The passwords do not match."); return; }
    setBusy(true); setNotice("");
    try {
      const { error } = await client.auth.updateUser({ password });
      if (error) { setNotice(friendlyError(error.message)); return; }
      await client.auth.signOut({ scope: "local" });
      setPassword(""); setConfirmPassword("");
      setNotice("Password updated. Sign in with your new password.");
      onRecoveryComplete?.();
    } catch { setNotice("We couldn't update your password. Please request a new reset link."); }
    finally { setBusy(false); }
  };
  const authReady = Boolean(client);
  if (recoveryMode) return <section className="auth-card"><span>RESET PASSWORD</span><h1>Choose a new password.</h1>{!client ? <p className="form-notice" role="status">Checking your reset link…</p> : !session ? <p className="form-notice" role="alert">This reset link is invalid or expired. Return to sign in and request a new one.</p> : <form onSubmit={updatePassword}><label>New password<input required autoComplete="new-password" minLength={8} type="password" value={password} onChange={e => setPassword(e.target.value)} /></label><label>Confirm new password<input required autoComplete="new-password" minLength={8} type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} /></label><button disabled={busy}>{busy ? "Updating…" : "Update password"}</button></form>}{notice && <p className="form-notice" role="status">{notice}</p>}</section>;
  if (session) return <AccountDashboard session={session} client={client} />;
  return <section className="auth-card"><span>LEETALLY ACCOUNT</span><h1>{mode === "signin" ? "Continue your signal." : "Start with one real round."}</h1><button className="google" disabled={!authReady || busy} onClick={() => void google()}><img src="/google.svg" alt="" aria-hidden="true" />{busy ? "Please wait…" : "Continue with Google"}</button><div className="divider">OR</div><form onSubmit={emailAuth}><label>Email<input required autoComplete="email" type="email" value={email} onChange={e => setEmail(e.target.value)} /></label><label>Password<input required autoComplete={mode === "signin" ? "current-password" : "new-password"} minLength={8} type="password" value={password} onChange={e => setPassword(e.target.value)} /></label><button disabled={!authReady || busy}>{busy ? "Please wait…" : mode === "signin" ? "Sign in" : "Create account"}</button></form><div className="auth-secondary-actions"><button type="button" className="switch" disabled={busy} onClick={() => { setMode(mode === "signin" ? "signup" : "signin"); setNotice(""); setPassword(""); }}>{mode === "signin" ? "Create a new account" : "Already have an account?"}</button>{mode === "signin" && <button type="button" className="switch" disabled={!authReady || busy} onClick={() => void forgotPassword()}>Forgot password?</button>}</div><p className="auth-terms">By continuing, you confirm you are 18+ and agree to the <a href="/terms">Terms</a> and <a href="/privacy">Privacy Policy</a>.</p>{notice && <p className="form-notice" role="status">{notice}</p>}</section>;
}

function validExtensionRedirect(): string | null {
  const candidate = new URLSearchParams(location.search).get("redirect_uri");
  if (!candidate) return null;
  try {
    const target = new URL(candidate);
    const chromeExtensionHost = target.hostname === `${trustedExtensionId}.chromiumapp.org`;
    if (target.protocol !== "https:" || !chromeExtensionHost || target.pathname !== "/auth/callback") return null;
    return target.toString();
  } catch {
    return null;
  }
}

function ExtensionAuth({ session, client }: { session: Session | null; client: SupabaseClient | null }) {
  const redirectUri = validExtensionRedirect();
  const provider = new URLSearchParams(location.search).get("provider");
  const [providerBusy, setProviderBusy] = useState(false);
  const [providerError, setProviderError] = useState("");
  useEffect(() => {
    if (!session || !redirectUri) return;
    const callback = new URL(redirectUri);
    callback.hash = new URLSearchParams({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      token_type: session.token_type,
      expires_in: String(session.expires_in ?? 3600),
    }).toString();
    location.replace(callback.toString());
  }, [redirectUri, session]);

  useEffect(() => {
    if (!client || session || !redirectUri || provider !== "google" || providerBusy) return;
    setProviderBusy(true);
    void client.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: location.href,
        queryParams: { prompt: "select_account" },
      },
    }).then(({ error }) => {
      if (error) {
        setProviderError("Could not continue with Google. Please try again.");
        setProviderBusy(false);
      }
    }).catch(() => {
      setProviderError("Could not continue with Google. Please try again.");
      setProviderBusy(false);
    });
  }, [client, provider, providerBusy, redirectUri, session]);

  if (!redirectUri) return <section className="auth-card"><span>LEETALLY EXTENSION</span><h1>This login link is invalid.</h1><p>Open LeetAlly from the Chrome extension and try again.</p></section>;
  if (session) return <section className="auth-card"><span>CONNECTED</span><h1>Opening LeetAlly…</h1><p>Your account is ready.</p></section>;
  if (provider === "google" && !providerError) return <section className="auth-card"><span>LEETALLY EXTENSION</span><h1>Continue with Google…</h1><p>Please finish signing in.</p></section>;
  return <Login session={session} client={client} returnPath={`${location.pathname}${location.search}`} />;
}

function Legal({ type }: { type: "privacy" | "terms" }) {
  const privacy = type === "privacy";
  return <>
    <PageIntro index="05" label={type.toUpperCase()} title={privacy ? "Your practice stays yours." : "Clear rules. Honest preparation."} copy="Effective 17 August 2026 · Version 2026-08-17" />
    <article className="legal">
      <h2>{privacy ? "Privacy Policy" : "Terms of Service"}</h2>
      <p>LeetAlly is currently an unincorporated product operated by an individual based in India. LeetAlly is a product and trade name, not currently a registered company or separate legal entity.</p>
      {privacy ? <>
        <h3>Information and purpose</h3>
        <p>LeetAlly processes account details, supported LeetCode problem and editor context, detected speech segments, transcripts, progress, assessments, technical logs and billing records only to authenticate users, conduct interview practice, provide feedback, synchronize progress, secure the service and administer plans.</p>
        <h3>Legal bases and sources</h3>
        <p>Where EU or UK data-protection law applies, processing is based on performing the service contract, your consent for optional Google sign-in and microphone-initiated voice features, legitimate interests in security and service reliability, and legal obligations for billing, tax and valid requests. Data comes from you, your chosen Google account, the supported page you activate LeetAlly on and public LeetCode profile information.</p>
        <h3>Retention</h3>
        <p>Account data is retained while active and for up to 30 days after deletion. Interview records are retained for up to 90 days. Ordinary security logs are retained for up to 180 days, while processing and traffic logs are kept for at least one year where Indian data-protection rules require it. Billing records may be retained for up to eight years, and deleted data leaves backups within 30 days unless legal preservation is required.</p>
        <h3>Your choices</h3>
        <p>You can stop an interview, revoke microphone permission, sign out, request access or deletion, and uninstall the extension. LeetAlly does not sell personal data or use unrelated browsing data for advertising.</p>
        <h3>Processors</h3>
        <p>Production services may include Supabase, Google, Deepgram, Groq, Fish Audio and Cashfree. Raw audio is not intentionally retained by LeetAlly after processing.</p>
        <h3>Chrome Web Store Limited Use</h3>
        <p>LeetAlly’s use and transfer of information received from Chrome extension APIs and supported page content complies with the Chrome Web Store User Data Policy, including its Limited Use requirements. We use it only to provide, maintain, secure and measure the disclosed interview-practice and progress features. We do not use or transfer it for targeted advertising, creditworthiness, lending or unrelated profiling. Humans may access private interview content only with your specific support consent, when necessary for security or abuse investigation, when required by law, or after aggregation and anonymization for internal operations.</p>
        <h3>International transfers</h3>
        <p>Providers may process data in India, the United States or other countries. LeetAlly must use applicable provider agreements and approved transfer safeguards before intentionally offering regulated processing in a region that requires them. Contact us to request available safeguard information.</p>
        <h3>Cookies and device storage</h3>
        <p>The website and extension use browser storage required for authentication, security, preferences and progress. LeetAlly does not currently use advertising or non-essential analytics cookies. If that changes, non-essential storage will remain disabled in regions requiring consent until a user opts in.</p>
        <h3>Regional privacy rights</h3>
        <p>Depending on location, you may request access, correction, deletion, restriction, portability or objection; withdraw consent; appeal a denied request; or complain to your local regulator. LeetAlly does not sell or share personal information for cross-context behavioural advertising and does not use it for targeted advertising. Applicable opt-out preference signals, including Global Privacy Control, will be treated as an opt-out request. We do not discriminate against users for exercising privacy rights.</p>
        <h3>AI transparency</h3>
        <p>The interviewer, feedback, scores, transcripts and synthesized voice may be generated by AI. They are practice tools, not employment decisions, and users are told when they are interacting with the AI interviewer.</p>
        <h3>Age requirement</h3>
        <p>LeetAlly is restricted to users aged 18 or older because it does not currently provide a verifiable parental-consent mechanism.</p>
      </> : <>
        <h3>Eligibility and acceptable use</h3>
        <p>You must be at least 18 and legally capable of entering this agreement. LeetAlly is for authorized practice only. Do not use it in real interviews, proctored assessments or competitions where outside assistance is prohibited.</p>
        <h3>AI limitations</h3>
        <p>Scores and recommendations may be inaccurate and do not guarantee employment or interview success.</p>
        <h3>Plans, cancellation and refunds</h3>
        <p>Paid access begins only after Cashfree confirms payment. AutoPay is optional and can be cancelled to stop future renewals. Contact us within seven days regarding duplicate charges, unauthorized transactions or a verified technical failure. Consumed speaking minutes and partially used digital plans are otherwise non-refundable except where law requires.</p>
        <h3>Liability and disputes</h3>
        <p>To the maximum extent permitted by law, aggregate liability is limited to the greater of fees paid during the preceding six months or INR 1,000. Indian law applies, and courts with competent jurisdiction in India have jurisdiction. This does not remove mandatory consumer, privacy, accessibility or dispute rights that apply where you live.</p>
      </>}
      <h3>Contact and grievances</h3>
        <p>The individual operator currently acts as the LeetAlly privacy, security, billing, accessibility and grievance contact. To access, correct, export or delete data, object or opt out, appeal a decision, report an accessibility barrier or raise a billing/security issue, email <a href={`mailto:${supportEmail}`}>{supportEmail}</a>.</p>
    </article>
  </>;
}

export default function App() {
  const [route, go] = useRoute(); const [session, setSession] = useState<Session | null>(null); const [client, setClient] = useState<SupabaseClient | null>(null); const [passwordRecovery, setPasswordRecovery] = useState(() => new URLSearchParams(location.search).get("recovery") === "1"); const [menu, setMenu] = useState(false); const [navCompact, setNavCompact] = useState(() => scrollY > 48);
  useEffect(() => {
    let active = true;
    let unsubscribe: (() => void) | undefined;
    void import("./supabase").then(async ({ supabase }) => {
      if (!active || !supabase) return;
      const subscription = supabase.auth.onAuthStateChange((event, next) => {
        if (active) {
          setSession(next);
          if (event === "PASSWORD_RECOVERY") setPasswordRecovery(true);
        }
      }).data.subscription;
      unsubscribe = () => subscription.unsubscribe();
      const { data } = await supabase.auth.getSession();
      if (active) {
        // Do not expose the client to ExtensionAuth until Supabase has consumed
        // the OAuth callback. Otherwise it starts another OAuth request while
        // the returned session is still being restored, causing a sign-in loop.
        setSession(data.session);
        setClient(supabase);
      }
    });
    return () => {
      active = false;
      unsubscribe?.();
    };
  }, []);
  const finishPasswordRecovery = () => {
    history.replaceState({}, "", "/login");
    setPasswordRecovery(false);
    setSession(null);
  };
  useEffect(() => {
    document.title = routeTitles[route];
    const canonicalUrl = new URL(route, "https://leetally-web.vercel.app").href;
    document.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.setAttribute("href", canonicalUrl);
    document.querySelector<HTMLMetaElement>('meta[name="description"]')?.setAttribute("content", routeDescriptions[route]);
    document.querySelector<HTMLMetaElement>('meta[property="og:title"]')?.setAttribute("content", routeTitles[route]);
    document.querySelector<HTMLMetaElement>('meta[property="og:description"]')?.setAttribute("content", routeDescriptions[route]);
    document.querySelector<HTMLMetaElement>('meta[property="og:url"]')?.setAttribute("content", canonicalUrl);
    setMenu(false);
  }, [route]);
  useEffect(() => {
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => setNavCompact(current => current ? scrollY > 12 : scrollY > 48));
    };
    update();
    addEventListener("scroll", update, { passive: true });
    return () => { removeEventListener("scroll", update); cancelAnimationFrame(frame); };
  }, []);
  useEffect(() => {
    const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const selector = [
      ".home-grid > *", ".pillar-grid > *", ".phase-strip > *", ".cta", ".page-intro > *",
      ".feature-grid > article", ".architecture > *", ".pricing-grid > article",
      ".pricing-note", ".form-layout > *", ".auth-card", ".legal > *", "footer > *",
    ].join(",");
    const frame = requestAnimationFrame(() => {
      const elements = Array.from(document.querySelectorAll<HTMLElement>(selector));
      elements.forEach((element, index) => {
        element.classList.add("scroll-reveal");
        element.style.setProperty("--reveal-delay", `${(index % 6) * 70}ms`);
      });
      if (reduceMotion) {
        elements.forEach(element => element.classList.add("is-visible"));
        return;
      }
      const observer = new IntersectionObserver(entries => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            observer.unobserve(entry.target);
          }
        });
      }, { threshold: 0.14, rootMargin: "0px 0px -7%" });
      elements.forEach(element => observer.observe(element));
      document.documentElement.dataset.revealObserver = "active";
      (document.documentElement as HTMLElement & { _leetallyObserver?: IntersectionObserver })._leetallyObserver = observer;
    });
    return () => {
      cancelAnimationFrame(frame);
      const root = document.documentElement as HTMLElement & { _leetallyObserver?: IntersectionObserver };
      root._leetallyObserver?.disconnect();
      delete root._leetallyObserver;
      delete root.dataset.revealObserver;
    };
  }, [route]);
  const isPrepRoute = (["/preparation", "/company-dsa", "/dsa-patterns", "/sql-sheet"] as Route[]).includes(route);
  const page = isPrepRoute ? <Suspense fallback={<div className="route-loading" role="status">Loading preparation workspace…</div>}><PrepWorkspace route={route as PrepRoute} go={go} /></Suspense> : route === "/" ? <Home go={go} /> : route === "/features" ? <Features /> : route === "/pricing" ? <Pricing go={go} session={session} /> : route === "/feedback" ? <FormPage kind="feedback" client={client} /> : route === "/contact" ? <FormPage kind="contact" client={client} /> : route === "/login" ? <Login session={session} client={client} recoveryMode={passwordRecovery} onRecoveryComplete={finishPasswordRecovery} /> : route === "/signup" ? <Login session={session} client={client} initialMode="signup" /> : route === "/extension-auth" ? <ExtensionAuth session={session} client={client} /> : <Legal type={route === "/privacy" ? "privacy" : "terms"} />;
  const accountName = session
    ? String(session.user.user_metadata?.given_name || session.user.user_metadata?.full_name || session.user.email?.split("@")[0] || "Account")
    : "";
  const accountInitial = accountName.charAt(0).toUpperCase() || "A";
  const authActions = <>{session ? <Link to="/login" go={go} className="nav-login nav-account"><span className="nav-account-avatar" aria-hidden="true">{accountInitial}</span><span className="nav-account-copy"><small>Signed in</small><b>{accountName}</b></span></Link> : <Link to="/login" go={go} className="nav-login">Login</Link>}<a className="nav-install" href={extensionUrl}>Add Chrome extension <span>↗</span></a></>;
  return <div className={`site theme-blue ${isPrepRoute ? "prep-site" : ""}`}><header className={`nav ${route === "/" || navCompact ? "is-scrolled" : ""}`}><Link to="/" go={go} className="logo header-logo"><b className="logo-wordmark">LeetAlly</b></Link><button className="menu" aria-label="Toggle menu" aria-expanded={menu} onClick={() => setMenu(!menu)}>☰</button><nav className={menu ? "open" : ""} onClick={() => setMenu(false)}><Link to="/" go={go}>Home</Link><Link to="/features" go={go}>Features</Link><Link to="/pricing" go={go}>Pricing</Link><Link to="/feedback" go={go}>Feedback</Link><Link to="/contact" go={go}>Contact</Link><div className="mobile-nav-actions">{authActions}</div></nav><div className="nav-actions">{authActions}</div></header><main>{page}</main>{!isPrepRoute && <footer><div className="footer-brand"><p>Built for honest preparation.<br />Not affiliated with LeetCode.</p></div><div className="footer-links"><Link to="/features" go={go}>Features</Link><Link to="/pricing" go={go}>Pricing</Link><Link to="/privacy" go={go}>Privacy</Link><Link to="/terms" go={go}>Terms</Link><a href={`mailto:${supportEmail}`}>Support</a></div><small>© 2026 LeetAlly</small></footer>}</div>;
}
