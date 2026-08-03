import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import {
  cancelRenewal, createCheckout, getBillingPlans, getEntitlement, openCashfreeCheckout,
  type BillingEntitlement, type BillingPlan,
} from "./billing";

type Route = "/" | "/features" | "/pricing" | "/feedback" | "/contact" | "/login" | "/signup" | "/privacy" | "/terms";
const routeTitles: Record<Route, string> = {
  "/": "LeetAlly — Interview like it matters",
  "/features": "Features — LeetAlly",
  "/pricing": "Pricing — LeetAlly",
  "/feedback": "Feedback — LeetAlly",
  "/contact": "Contact — LeetAlly",
  "/login": "Login — LeetAlly",
  "/signup": "Sign Up — LeetAlly",
  "/privacy": "Privacy — LeetAlly",
  "/terms": "Terms — LeetAlly",
};
const extensionUrl = (import.meta.env.VITE_EXTENSION_URL as string | undefined) || "/contact";
const supportEmail = (import.meta.env.VITE_SUPPORT_EMAIL as string | undefined) || "watershaper9.1@gmail.com";

function useRoute() {
  const normalize = () => (["/", "/features", "/pricing", "/feedback", "/contact", "/login", "/signup", "/privacy", "/terms"].includes(location.pathname) ? location.pathname : "/") as Route;
  const [route, setRoute] = useState<Route>(normalize);
  useEffect(() => { const change = () => setRoute(normalize()); addEventListener("popstate", change); return () => removeEventListener("popstate", change); }, []);
  const go = (path: Route) => { history.pushState({}, "", path); setRoute(path); scrollTo({ top: 0, behavior: "smooth" }); };
  return [route, go] as const;
}

function Link({ to, go, children, className = "" }: { to: Route; go: (path: Route) => void; children: ReactNode; className?: string }) {
  return <a href={to} className={className} onClick={(event) => { event.preventDefault(); go(to); }}>{children}</a>;
}

function OrbitalHero({ go }: { go: (path: Route) => void }) {
  return <section className="hero">
    <div className="hero-copy">
      <div className="eyebrow"><i /> LEETCODE AI INTERVIEWER + COMPANY PREP</div>
      <h1>Solve the problem.<br /><em>Face the interview.</em></h1>
      <p>Open any LeetCode problem and practise it with one voice interviewer. Then drill company-focused question sets across DSA, LLD, HLD and behavioural rounds.</p>
      <div className="hero-actions"><a className="primary" href={extensionUrl}>Start on LeetCode <span>↗</span></a><button onClick={() => go("/features")}>Explore company prep</button></div>
      <div className="proof"><span><b>2,000+</b> LeetCoders</span><span><b>01</b> voice interviewer</span><span><b>04</b> interview tracks</span><span><b>02</b> focused prep modes</span></div>
    </div>
    <div className="cosmos" aria-label="LeetAlly system: LeetCode, Google, Meta, Amazon, Netflix, Atlassian and interview tracks orbit one AI voice interviewer">
      <div className="ambient" />
      <div className="orbit orbit-a"><span className="planet p-leetcode">LEETCODE</span><span className="planet company-logo p-google" aria-label="Google"><img src="https://cdn.simpleicons.org/google" alt="Google" /></span><span className="planet company-logo p-meta" aria-label="Meta"><img src="https://cdn.simpleicons.org/meta" alt="Meta" /></span></div>
      <div className="orbit orbit-b"><span className="planet p-lld">LLD</span><span className="planet p-hld">HLD</span><span className="planet p-dsa">DSA</span><span className="planet company-logo p-amazon" aria-label="Amazon"><img src="https://www.google.com/s2/favicons?domain=amazon.com&amp;sz=64" alt="Amazon" /></span><span className="planet company-logo p-netflix" aria-label="Netflix"><img src="https://cdn.simpleicons.org/netflix" alt="Netflix" /></span></div>
      <div className="orbit orbit-c"><span className="planet p-voice">BEHAVIOURAL</span><span className="planet p-behaviour">ONE VOICE</span><span className="planet p-sde">COMPANY SETS</span><span className="planet company-logo p-atlassian" aria-label="Atlassian"><img src="https://cdn.simpleicons.org/atlassian" alt="Atlassian" /></span></div>
      <div className="core" aria-label="Earth representing one AI voice interviewer"><div className="earth-surface" /><div className="core-label"><small>ONE VOICE</small><strong>AI INTERVIEWER</strong><i /></div></div>
      <div className="cosmos-caption"><span>CLARIFY</span><span>DESIGN</span><span>CODE</span><span>TEST</span></div>
    </div>
  </section>;
}

const features = [
  ["01", "AI interviewer on LeetCode", "Open a supported LeetCode problem and start a realistic voice interview without leaving the page where you already practise."],
  ["02", "Company-focused questions", "Choose a target company, work through focused question sets and track the problems most relevant to your preparation."],
  ["03", "One interviewer, every round", "Use the same voice interviewer for DSA, LLD, HLD and behavioural practice so your preparation feels connected."],
  ["04", "Code-aware follow-ups", "LeetAlly sees the current problem, language, code revisions and visible output so each follow-up stays grounded."],
  ["05", "Evidence-backed scorecards", "See the reasoning, communication and technical evidence behind every score, plus the next drill to practise."],
  ["06", "Silence costs nothing", "Voice detection runs locally. Only recognized speaking segments reach paid providers or count toward usage."],
];

function Home({ go }: { go: (path: Route) => void }) {
  return <><OrbitalHero go={go} /><section className="marquee"><span>LEETCODE INTERVIEWS</span><i /> <span>COMPANY QUESTION SETS</span><i /> <span>ONE VOICE COACH</span><i /></section><section className="home-grid"><div><span className="kicker">TWO FOCUSED MODES</span><h2>Practise the problem. Prepare for the company.</h2></div><p>LeetAlly combines realistic interviews on the LeetCode problem in front of you with focused question sets for the companies you want to join.</p></section><section className="pillar-grid"><article><span>01 / PRIMARY</span><h3>LeetCode AI Interviewer</h3><p>One voice interviewer reads the active problem and your evolving code, asks follow-ups, challenges assumptions and scores the evidence from your round.</p><a href={extensionUrl}>Start an interview ↗</a></article><article><span>02 / PRIMARY</span><h3>Company-based Questions</h3><p>Choose your target, filter by difficulty and practise focused DSA questions with progress tracking before turning them into interview rounds.</p><button onClick={() => go("/features")}>Explore company prep ↗</button><small>Independent preparation sets. No company affiliation or endorsement.</small></article></section><section className="phase-strip">{["LeetCode", "Company sets", "DSA", "LLD", "HLD", "Behavioural"].map((item, index) => <div key={item}><b>0{index + 1}</b><span>{item}</span></div>)}</section><section className="cta"><span>ONE INTERVIEWER. YOUR WHOLE PREP LOOP.</span><h2>Go from solving company-focused questions to explaining them under real interview pressure.</h2><a href={extensionUrl}>Start on LeetCode <b>↗</b></a></section></>;
}

function Features() { return <><PageIntro index="01" label="FEATURES" title="LeetCode interviews meet company-focused prep." copy="One voice interviewer connects DSA, LLD, HLD and behavioural preparation." /><section className="feature-grid">{features.map(([number, title, copy]) => <article key={number}><span>{number}</span><h3>{title}</h3><p>{copy}</p></article>)}</section><section className="architecture"><div><span>CHOOSE</span><b>Company + question</b></div><i>→</i><div><span>INTERVIEW</span><b>Explain + build</b></div><i>→</i><div><span>IMPROVE</span><b>Evidence + next drill</b></div></section></>; }

const fallbackPlans: BillingPlan[] = [
  { id: "sde1_sprint", name: "SDE-1 Sprint", purchase_type: "one_time", amount_inr: 799, currency: "INR", interview_minutes_per_month: 240, interval: "month", supports_auto_renew: true, period_days: 30 },
  { id: "sde1_intensive", name: "SDE-1 Intensive", purchase_type: "one_time", amount_inr: 1199, currency: "INR", interview_minutes_per_month: 600, interval: "month", supports_auto_renew: true, period_days: 30 },
];

function Pricing({ go, session }: { go: (path: Route) => void; session: Session | null }) {
  const [plans, setPlans] = useState<BillingPlan[]>(fallbackPlans);
  const [entitlement, setEntitlement] = useState<BillingEntitlement | null>(null);
  const [selected, setSelected] = useState<BillingPlan | null>(null);
  const [details, setDetails] = useState({ customer_name: "", phone: "", auto_renew: false, accepted: false });
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  const refreshEntitlement = async () => {
    if (!session) return;
    try { setEntitlement(await getEntitlement(session.access_token)); } catch { /* Pricing remains usable if status is temporarily unavailable. */ }
  };
  useEffect(() => { void getBillingPlans().then(setPlans).catch(() => setPlans(fallbackPlans)); }, []);
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
        auto_renew: details.auto_renew,
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
    <PageIntro index="02" label="PRICING" title="Pay for practice. Never for silence." copy="Choose a 30-day pass or explicitly enable monthly AutoPay. Access starts only after Cashfree confirms payment to our server." />
    {entitlement && entitlement.status !== "none" && <section className={`billing-status ${active ? "active" : "attention"}`}>
      <div><span>YOUR ACCESS</span><h2>{active ? "Plan active" : "Payment required"}</h2><p>{active ? `${entitlement.minutes_remaining} of ${entitlement.minutes_limit} speaking minutes remain. Silence is never counted.` : "Your plan is inactive or has expired. Choose a plan below to continue."}</p></div>
      <div>{entitlement.period_end && <small>{active ? "Access through" : "Ended"}<b>{new Date(entitlement.period_end).toLocaleDateString("en-IN", { dateStyle: "medium" })}</b></small>}{entitlement.auto_renew && <button disabled={busy} onClick={() => void cancel()}>Cancel AutoPay</button>}</div>
    </section>}
    {notice && <p className="billing-notice">{notice}</p>}
    <section className="pricing-grid">
      <Price name="Free account" price="₹0" suffix="forever" items={["Create and sync your account", "Browse preparation modes", "Local progress tracking"]} action={session ? "Current free account" : "Create account"} onClick={() => session ? undefined : go("/signup")} />
      {plans.map((plan, index) => <Price key={plan.id} featured={index === 0} name={plan.name} price={`₹${plan.amount_inr.toLocaleString("en-IN")}`} suffix="30 days" items={[`${plan.interview_minutes_per_month} speaking minutes`, "DSA, LLD, HLD + behavioural rounds", "Company-focused preparation", "Pay only for detected speech"]} action={active && entitlement?.plan_id === plan.id ? "Extend or renew" : "Choose plan"} onClick={() => choose(plan)} />)}
    </section>
    <p className="pricing-note">One-time passes expire after 30 days. AutoPay is optional and never preselected. Taxes, if applicable, are shown by Cashfree before payment.</p>
    {selected && <div className="checkout-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) setSelected(null); }}><form className="checkout-card" role="dialog" aria-modal="true" aria-labelledby="checkout-title" onSubmit={pay}>
      <button type="button" className="checkout-close" aria-label="Close checkout" onClick={() => setSelected(null)}>×</button>
      <span>SECURE CHECKOUT</span><h2 id="checkout-title">{selected.name}</h2><p className="checkout-price">₹{selected.amount_inr.toLocaleString("en-IN")} <small>/ {details.auto_renew ? "month" : "30-day pass"}</small></p>
      <label>Full name<input required minLength={2} maxLength={100} value={details.customer_name} onChange={e => setDetails({ ...details, customer_name: e.target.value })} /></label>
      <label>Indian mobile number<input required inputMode="numeric" pattern="[6-9][0-9]{9}" placeholder="9876543210" value={details.phone} onChange={e => setDetails({ ...details, phone: e.target.value.replace(/\D/g, "").slice(0, 10) })} /></label>
      <label className="renew-choice"><input type="checkbox" checked={details.auto_renew} onChange={e => setDetails({ ...details, auto_renew: e.target.checked })} /><span><b>Enable monthly AutoPay</b>Cashfree will collect ₹{selected.amount_inr.toLocaleString("en-IN")} now to authorise the mandate, then every month until cancelled. UPI AutoPay, eligible cards or eNACH may be offered.</span></label>
      <label className="checkout-accept"><input type="checkbox" required checked={details.accepted} onChange={e => setDetails({ ...details, accepted: e.target.checked })} /><span>I accept the <a href="/terms" target="_blank">Terms</a>, including the selected renewal choice and refund conditions.</span></label>
      <button className="checkout-pay" disabled={busy || !details.accepted}>{busy ? "Opening secure checkout…" : `Pay ₹${selected.amount_inr.toLocaleString("en-IN")} securely →`}</button>
      <small className="checkout-trust">LeetAlly never receives or stores your card, bank or UPI credentials. Access is granted only after a verified Cashfree webhook.</small>
    </form></div>}
  </>;
}

function Price({ name, price, suffix, items, action, onClick, featured = false }: { name: string; price: string; suffix: string; items: string[]; action: string; onClick: () => void; featured?: boolean }) { return <article className={`price ${featured ? "featured" : ""}`}>{featured && <span className="popular">MOST FOCUSED</span>}<h3>{name}</h3><div><b>{price}</b><small> / {suffix}</small></div><ul>{items.map(item => <li key={item}>✓ {item}</li>)}</ul><button onClick={onClick}>{action} ↗</button></article>; }

function PageIntro({ index, label, title, copy }: { index: string; label: string; title: string; copy: string }) { return <section className="page-intro"><div><span>{index} / {label}</span><h1>{title}</h1></div><p>{copy}</p></section>; }

function FormPage({ kind }: { kind: "feedback" | "contact" }) {
  const [state, setState] = useState({ name: "", email: "", message: "", rating: 5 }); const [notice, setNotice] = useState(""); const [busy, setBusy] = useState(false);
  const submit = async (event: FormEvent) => { event.preventDefault(); setBusy(true); setNotice(""); if (!supabase) { setNotice("Forms are not configured yet. Email us directly instead."); setBusy(false); return; } const table = kind === "feedback" ? "website_feedback" : "contact_requests"; const payload = kind === "feedback" ? state : { name: state.name, email: state.email, message: state.message }; const { error } = await supabase.from(table).insert(payload); setNotice(error ? "Could not send this right now. Please email us instead." : "Received. Thank you—we’ll get back to you shortly."); if (!error) setState({ name: "", email: "", message: "", rating: 5 }); setBusy(false); };
  return <><PageIntro index={kind === "feedback" ? "03" : "04"} label={kind.toUpperCase()} title={kind === "feedback" ? "Help shape the interviewer you want." : "Let’s talk about your next interview."} copy={kind === "feedback" ? "Share what felt realistic, what broke immersion and what would make you return." : "Questions, partnerships, beta access or support—we read every useful message."} /><section className="form-layout"><form onSubmit={submit}>{kind === "feedback" && <label>Overall experience<select value={state.rating} onChange={e => setState({ ...state, rating: Number(e.target.value) })}>{[5,4,3,2,1].map(n => <option key={n} value={n}>{n} — {n === 5 ? "Excellent" : n === 1 ? "Needs work" : "Good"}</option>)}</select></label>}<label>Your name<input required value={state.name} onChange={e => setState({ ...state, name: e.target.value })} /></label><label>Email<input required type="email" value={state.email} onChange={e => setState({ ...state, email: e.target.value })} /></label><label>{kind === "feedback" ? "What should we improve?" : "How can we help?"}<textarea required minLength={10} value={state.message} onChange={e => setState({ ...state, message: e.target.value })} /></label><button disabled={busy}>{busy ? "Sending…" : "Send message ↗"}</button>{notice && <p className="form-notice">{notice}</p>}</form><aside><span>DIRECT</span><a href={`mailto:${supportEmail}`}>{supportEmail}</a><p>Never send passwords, API keys, payment credentials or confidential interview material.</p></aside></section></>;
}

function Login({ session, initialMode = "signin" }: { session: Session | null; initialMode?: "signin" | "signup" }) {
  const [mode, setMode] = useState<"signin" | "signup">(initialMode); const [email, setEmail] = useState(""); const [password, setPassword] = useState(""); const [accepted, setAccepted] = useState(false); const [notice, setNotice] = useState("");
  if (session) return <section className="auth-card"><span>CONNECTED</span><h1>Welcome back.</h1><p>{session.user.email}</p><button onClick={() => void supabase?.auth.signOut()}>Sign out</button></section>;
  const emailAuth = async (event: FormEvent) => { event.preventDefault(); if (!supabase) { setNotice("Authentication is not configured yet."); return; } const result = mode === "signup" ? await supabase.auth.signUp({ email, password, options: { data: { policy_version: "2026-08-03", policy_accepted_at: new Date().toISOString() } } }) : await supabase.auth.signInWithPassword({ email, password }); setNotice(result.error?.message || (mode === "signup" ? "Check your email to confirm your account." : "Signed in.")); };
  const google = async () => { if (!supabase) return setNotice("Authentication is not configured yet."); const { error } = await supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: `${location.origin}/login` } }); if (error) setNotice(error.message); };
  return <section className="auth-card"><span>LEETALLY ACCOUNT</span><h1>{mode === "signin" ? "Continue your signal." : "Start with one real round."}</h1><div className="auth-disclosure"><b>Before you continue</b><p>LeetAlly reads supported LeetCode problem, editor and output data. During interviews, detected speech segments are sent to transcription and AI voice providers to provide the service.</p></div><label className="accept"><input type="checkbox" checked={accepted} onChange={e => setAccepted(e.target.checked)} /> <span>I agree to the <a href="/terms">Terms</a> and acknowledge the <a href="/privacy">Privacy Policy</a>.</span></label><button className="google" disabled={!accepted} onClick={() => void google()}>Continue with Google</button><div className="divider">OR</div><form onSubmit={emailAuth}><label>Email<input required type="email" value={email} onChange={e => setEmail(e.target.value)} /></label><label>Password<input required minLength={8} type="password" value={password} onChange={e => setPassword(e.target.value)} /></label><button disabled={!accepted}>{mode === "signin" ? "Sign in" : "Create account"}</button></form><button className="switch" onClick={() => setMode(mode === "signin" ? "signup" : "signin")}>{mode === "signin" ? "Create a new account" : "Already have an account?"}</button>{notice && <p className="form-notice">{notice}</p>}</section>;
}

function Legal({ type }: { type: "privacy" | "terms" }) { return <><PageIntro index="05" label={type.toUpperCase()} title={type === "privacy" ? "Your practice stays yours." : "Clear rules. Honest preparation."} copy={`Effective 3 August 2026 · Version 2026-08-03`} /><article className="legal"><h2>{type === "privacy" ? "Privacy summary" : "Terms of service"}</h2>{type === "privacy" ? <><p>LeetAlly processes account data, supported LeetCode problem and editor context, detected speech segments, transcripts, progress, assessment and billing records only to provide and secure the service.</p><h3>Your choices</h3><p>You can stop an interview, revoke microphone permission, sign out, request access or deletion, and uninstall the extension. LeetAlly does not sell data or use browsing data for advertising.</p><h3>Processors</h3><p>Production services may include Supabase, Google, Deepgram, Groq, Fish Audio and Cashfree. Raw audio is not intentionally retained by LeetAlly after processing.</p></> : <><p>LeetAlly is for authorized practice. Do not use it in real interviews, proctored assessments or competitions where outside assistance is prohibited.</p><h3>AI limitations</h3><p>Scores and recommendations may be inaccurate and do not guarantee employment or interview success.</p><h3>Plans and access</h3><p>Paid access begins only after Cashfree confirms a successful payment to LeetAlly. A 30-day pass expires at the stated end time. Unused speaking minutes do not roll over unless the checkout page expressly says otherwise. Silence is not charged; only detected speaking segments count toward the allowance.</p><h3>AutoPay and cancellation</h3><p>AutoPay is optional and is enabled only when you select it during checkout and authorise a Cashfree mandate. The displayed plan price is then charged each month until cancellation. You may cancel from your LeetAlly pricing page; cancellation stops future charges and access continues through the already-paid period. A failed renewal may suspend access, and access ends when the paid period expires.</p><h3>Refunds</h3><p>Contact us within seven days for duplicate charges, unauthorised transactions or a verified technical failure that prevented material use of the paid service. Except where law requires otherwise, partially used plans, consumed speaking minutes and changes of mind are not refundable. Approved refunds are returned through the original payment method and may take the payment provider’s stated processing time.</p><h3>Account responsibility</h3><p>Keep your account secure. Attempts to bypass quotas, share or resell paid access, interfere with billing verification or use the service unlawfully may result in suspension.</p></>}<p>This policy is written for the current beta and should receive founder and legal review before a public paid launch. Contact <a href={`mailto:${supportEmail}`}>{supportEmail}</a>.</p></article></>; }

export default function App() {
  const [route, go] = useRoute(); const [session, setSession] = useState<Session | null>(null); const [menu, setMenu] = useState(false);
  useEffect(() => { void supabase?.auth.getSession().then(({ data }) => setSession(data.session)); const subscription = supabase?.auth.onAuthStateChange((_event, next) => setSession(next)).data.subscription; return () => subscription?.unsubscribe(); }, []);
  useEffect(() => { document.title = routeTitles[route]; setMenu(false); }, [route]);
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
  useEffect(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      const distance = Math.min(scrollY, 1100);
      document.documentElement.style.setProperty("--scroll-shift", `${distance * 0.065}px`);
      document.documentElement.style.setProperty("--scroll-glow", `${distance * -0.025}px`);
    };
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(update); };
    update();
    addEventListener("scroll", onScroll, { passive: true });
    return () => { removeEventListener("scroll", onScroll); if (frame) cancelAnimationFrame(frame); };
  }, []);
  const page = route === "/" ? <Home go={go} /> : route === "/features" ? <Features /> : route === "/pricing" ? <Pricing go={go} session={session} /> : route === "/feedback" ? <FormPage kind="feedback" /> : route === "/contact" ? <FormPage kind="contact" /> : route === "/login" ? <Login session={session} /> : route === "/signup" ? <Login session={session} initialMode="signup" /> : <Legal type={route === "/privacy" ? "privacy" : "terms"} />;
  const authActions = <>{session ? <Link to="/login" go={go} className="nav-login">Account</Link> : <><Link to="/login" go={go} className="nav-login">Login</Link><Link to="/signup" go={go} className="nav-signup">Sign Up</Link></>}<a className="nav-install" href={extensionUrl}>Add Chrome extension <span>↗</span></a></>;
  return <div className="site"><header className="nav"><Link to="/" go={go} className="logo header-logo"><b>LEETALLY</b></Link><button className="menu" aria-label="Toggle menu" aria-expanded={menu} onClick={() => setMenu(!menu)}>☰</button><nav className={menu ? "open" : ""} onClick={() => setMenu(false)}><Link to="/features" go={go}>Features</Link><Link to="/pricing" go={go}>Pricing</Link><Link to="/feedback" go={go}>Feedback</Link><Link to="/contact" go={go}>Contact</Link><div className="mobile-nav-actions">{authActions}</div></nav><div className="nav-actions">{authActions}</div></header><main>{page}</main><footer><div className="footer-brand"><Link to="/" go={go} className="logo"><b>LEETALLY</b></Link><p>Built for honest preparation.<br />Not affiliated with LeetCode.</p></div><div className="footer-links"><Link to="/features" go={go}>Features</Link><Link to="/pricing" go={go}>Pricing</Link><Link to="/privacy" go={go}>Privacy</Link><Link to="/terms" go={go}>Terms</Link><a href={`mailto:${supportEmail}`}>Support</a></div><small>© 2026 LeetAlly</small></footer></div>;
}
