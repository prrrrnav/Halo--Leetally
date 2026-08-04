import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { browser } from "wxt/browser";

import {
  COMPANY_OPTIONS,
  ensureCompanyCatalog,
  findProblemCompanies,
  loadCompanyCatalog,
  refreshCompanyCatalog,
  type ProblemCompanyMatch,
} from "../../lib/company-problems.ts";

const DISMISSED_PROBLEMS_KEY = "leetally-dismissed-company-indicators-v1";
const INDICATOR_POSITION_KEY = "leetally-company-indicator-position-v1";
const MAX_VISIBLE_ICONS = 4;
const INDICATOR_WIDTH = 244;
const INDICATOR_HEIGHT = 58;
const VIEWPORT_MARGIN = 12;

type RadarStatus = "loading" | "ready" | "error";

interface Position {
  x: number;
  y: number;
}

const COMPANY_DOMAINS: Record<string, string> = {
  google: "google.com", amazon: "amazon.com", meta: "meta.com",
  netflix: "netflix.com", cisco: "cisco.com", microsoft: "microsoft.com",
  apple: "apple.com", nvidia: "nvidia.com", adobe: "adobe.com",
  salesforce: "salesforce.com", oracle: "oracle.com", uber: "uber.com",
  airbnb: "airbnb.com", atlassian: "atlassian.com", bloomberg: "bloomberg.com",
  bytedance: "bytedance.com", linkedin: "linkedin.com", paypal: "paypal.com",
  "walmart-labs": "walmart.com", "goldman-sachs": "goldmansachs.com",
  jpmorgan: "jpmorganchase.com", intel: "intel.com", accenture: "accenture.com",
  tcs: "tcs.com", infosys: "infosys.com", wipro: "wipro.com",
  cognizant: "cognizant.com", capgemini: "capgemini.com", hcl: "hcltech.com",
  "tech-mahindra": "techmahindra.com", lti: "ltimindtree.com",
  deloitte: "deloitte.com", ibm: "ibm.com",
};

function currentProblemSlug(): string {
  return location.pathname.match(/^\/problems\/([^/]+)/)?.[1]?.toLowerCase() ?? "";
}

function companyInitials(name: string): string {
  const words = name.split(/\s+/).filter(Boolean);
  return (words.length > 1
    ? words.map((word) => word[0]).join("")
    : name.slice(0, 2)).toUpperCase();
}

function companyLogoUrl(companyId: string): string {
  const domain = COMPANY_DOMAINS[companyId];
  return domain
    ? `https://www.google.com/s2/favicons?domain_url=https://${domain}&sz=64`
    : "";
}

function defaultPosition(): Position {
  return {
    x: Math.max(VIEWPORT_MARGIN, (window.innerWidth - INDICATOR_WIDTH) / 2),
    y: Math.max(VIEWPORT_MARGIN, window.innerHeight - INDICATOR_HEIGHT - 18),
  };
}

function clampPosition(position: Position): Position {
  return {
    x: Math.min(
      Math.max(VIEWPORT_MARGIN, position.x),
      Math.max(VIEWPORT_MARGIN, window.innerWidth - INDICATOR_WIDTH - VIEWPORT_MARGIN),
    ),
    y: Math.min(
      Math.max(VIEWPORT_MARGIN, position.y),
      Math.max(VIEWPORT_MARGIN, window.innerHeight - INDICATOR_HEIGHT - VIEWPORT_MARGIN),
    ),
  };
}

function CompanyLogo({ id, name }: { id: string; name: string }) {
  const [failed, setFailed] = useState(false);
  const logoUrl = companyLogoUrl(id);

  return failed || !logoUrl ? (
    <span>{companyInitials(name)}</span>
  ) : (
    <img
      src={logoUrl}
      alt=""
      draggable={false}
      onError={() => setFailed(true)}
    />
  );
}

async function dismissedProblems(): Promise<string[]> {
  const stored = await browser.storage.local.get(DISMISSED_PROBLEMS_KEY);
  return (stored[DISMISSED_PROBLEMS_KEY] as string[] | undefined) ?? [];
}

export function CompanyInterviewIndicator() {
  const [slug, setSlug] = useState(currentProblemSlug);
  const [matches, setMatches] = useState<ProblemCompanyMatch[]>([]);
  const [dismissed, setDismissed] = useState(false);
  const [status, setStatus] = useState<RadarStatus>("loading");
  const [expanded, setExpanded] = useState(false);
  const [position, setPosition] = useState<Position>(defaultPosition);
  const [dragging, setDragging] = useState(false);
  const dragOffset = useRef<Position>({ x: 0, y: 0 });
  const dragOrigin = useRef<Position>({ x: 0, y: 0 });
  const dragMoved = useRef(false);
  const activePointer = useRef<number | null>(null);

  useEffect(() => {
    void browser.storage.local.get(INDICATOR_POSITION_KEY).then((stored) => {
      const saved = stored[INDICATOR_POSITION_KEY] as Position | undefined;
      if (saved && Number.isFinite(saved.x) && Number.isFinite(saved.y)) {
        setPosition(clampPosition(saved));
      }
    });

    const handleResize = () => setPosition((current) => clampPosition(current));
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      const nextSlug = currentProblemSlug();
      setSlug((current) => nextSlug === current ? current : nextSlug);
    }, 750);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    let active = true;
    setMatches([]);
    setStatus("loading");
    setExpanded(false);

    if (!slug) return () => { active = false; };

    void (async () => {
      const hidden = (await dismissedProblems()).includes(slug);
      if (!active) return;
      setDismissed(hidden);

      const cached = await loadCompanyCatalog();
      if (!active) return;
      const cachedMatches = findProblemCompanies(cached, slug);
      setMatches(cachedMatches);
      if (cachedMatches.length > 0) setStatus("ready");

      const refreshed = await ensureCompanyCatalog();
      if (!active) return;
      setMatches(findProblemCompanies(refreshed, slug));
      setStatus("ready");
    })().catch((cause) => {
      console.debug("[LeetAlly] Interview Radar unavailable", cause);
      if (active) setStatus("error");
    });

    return () => { active = false; };
  }, [slug]);

  const accessibleCompanyList = matches.map(({ company }) => company.name).join(", ");
  const maxFrequency = Math.max(0, ...matches.map(({ problem }) => problem.frequency ?? 0));
  const signalScore = Math.min(99, Math.round(maxFrequency * 0.72 + matches.length * 7));
  const topics = [...new Set(matches.flatMap(({ problem }) => problem.topics))].slice(0, 5);

  async function dismiss(): Promise<void> {
    const current = await dismissedProblems();
    await browser.storage.local.set({
      [DISMISSED_PROBLEMS_KEY]: [...new Set([...current, slug])],
    });
    setDismissed(true);
    setExpanded(false);
  }

  async function restore(): Promise<void> {
    const current = await dismissedProblems();
    await browser.storage.local.set({
      [DISMISSED_PROBLEMS_KEY]: current.filter((item) => item !== slug),
    });
    setDismissed(false);
  }

  async function refresh(): Promise<void> {
    setStatus("loading");
    try {
      const catalog = await refreshCompanyCatalog(COMPANY_OPTIONS.map(({ id }) => id));
      setMatches(findProblemCompanies(catalog, slug));
      setStatus("ready");
    } catch (cause) {
      console.debug("[LeetAlly] Interview Radar refresh failed", cause);
      setStatus("error");
    }
  }

  function beginDrag(event: ReactPointerEvent<HTMLDivElement>): void {
    if (event.button !== 0) return;
    activePointer.current = event.pointerId;
    dragOrigin.current = { x: event.clientX, y: event.clientY };
    dragOffset.current = { x: event.clientX - position.x, y: event.clientY - position.y };
    dragMoved.current = false;
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging(true);
  }

  function moveDrag(event: ReactPointerEvent<HTMLDivElement>): void {
    if (activePointer.current !== event.pointerId) return;
    if (Math.hypot(event.clientX - dragOrigin.current.x, event.clientY - dragOrigin.current.y) > 4) {
      dragMoved.current = true;
    }
    setPosition(clampPosition({
      x: event.clientX - dragOffset.current.x,
      y: event.clientY - dragOffset.current.y,
    }));
  }

  function endDrag(event: ReactPointerEvent<HTMLDivElement>): void {
    if (activePointer.current !== event.pointerId) return;
    activePointer.current = null;
    setDragging(false);
    const nextPosition = clampPosition({
      x: event.clientX - dragOffset.current.x,
      y: event.clientY - dragOffset.current.y,
    });
    setPosition(nextPosition);
    void browser.storage.local.set({ [INDICATOR_POSITION_KEY]: nextPosition });
    if (!dragMoved.current) setExpanded((current) => !current);
  }

  function handleSummaryKey(event: ReactKeyboardEvent<HTMLDivElement>): void {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      setExpanded((current) => !current);
    }
  }

  function startMockInterview(): void {
    window.dispatchEvent(new CustomEvent("leetally:start-company-mock"));
    setExpanded(false);
  }

  if (!slug) return null;

  const opensDown = position.y < window.innerHeight / 2;

  if (dismissed) {
    return (
      <button
        className="leetally-radar-restore"
        type="button"
        style={{ left: position.x + INDICATOR_WIDTH / 2 - 23, top: position.y + 6 }}
        onClick={() => void restore()}
        title="Restore Interview Radar"
        aria-label="Restore Interview Radar"
      >
        <span>R</span>
      </button>
    );
  }

  const hasMatches = matches.length > 0;
  const label = status === "loading"
    ? "Scanning interview history"
    : status === "error"
      ? "Interview Radar is offline"
      : hasMatches
        ? "Asked in interviews"
        : "No recent company match";
  const detail = status === "loading"
    ? "Checking the latest company lists…"
    : status === "error"
      ? "Open Radar to retry"
      : hasMatches
        ? `${matches.length} ${matches.length === 1 ? "company" : "companies"} · ${signalScore}/99 signal`
        : "Open Radar for actions and details";

  return (
    <aside
      className={`leetally-company-indicator${dragging ? " is-dragging" : ""}${opensDown ? " opens-down" : ""}${expanded ? " is-open" : ""}`}
      aria-label={hasMatches ? `Asked by ${accessibleCompanyList}` : label}
      style={{ left: position.x, top: position.y }}
    >
      <button
        className="leetally-company-dismiss"
        type="button"
        aria-label="Minimize Interview Radar for this problem"
        title="Minimize for this problem"
        onClick={() => void dismiss()}
      >
        ×
      </button>

      <div
        className="leetally-company-summary"
        tabIndex={0}
        role="button"
        aria-expanded={expanded}
        aria-controls="leetally-company-tooltip"
        onKeyDown={handleSummaryKey}
        onPointerDown={beginDrag}
        onPointerMove={moveDrag}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <div className={`leetally-company-icons${hasMatches ? "" : " radar-empty"}`} aria-hidden="true">
          {hasMatches ? (
            <>
              {matches.slice(0, MAX_VISIBLE_ICONS).map(({ company }) => (
                <i key={company.id} style={{ "--company-color": company.color } as React.CSSProperties} title={company.name}>
                  <CompanyLogo id={company.id} name={company.name} />
                </i>
              ))}
              {matches.length > MAX_VISIBLE_ICONS && <b>+{matches.length - MAX_VISIBLE_ICONS}</b>}
            </>
          ) : (
            <i className={status === "loading" ? "radar-scanning" : ""}>R</i>
          )}
        </div>
        <span><strong>{label}</strong><small>{detail}</small></span>
      </div>

      <section className="leetally-company-tooltip" id="leetally-company-tooltip">
        <header>
          <span>INTERVIEW RADAR</span>
          <strong>{hasMatches ? "Why this problem matters" : "Company intelligence on this problem"}</strong>
        </header>

        {hasMatches ? (
          <>
            <div className="leetally-radar-score">
              <div style={{ "--radar-score": `${signalScore * 3.6}deg` } as React.CSSProperties}><b>{signalScore}</b><small>/99</small></div>
              <span><strong>{signalScore >= 70 ? "Strong signal" : signalScore >= 40 ? "Useful signal" : "Emerging signal"}</strong><small>Based on reported frequency and company coverage</small></span>
            </div>
            {topics.length > 0 && <div className="leetally-radar-topics">{topics.map((topic) => <span key={topic}>{topic}</span>)}</div>}
            <div className="leetally-company-match-list">
              {matches.map(({ company, problem }) => (
                <div key={company.id}>
                  <i style={{ "--company-color": company.color } as React.CSSProperties}><CompanyLogo id={company.id} name={company.name} /></i>
                  <span><strong>{company.name}</strong><small>{problem.frequency !== undefined ? `${problem.frequency}% reported frequency` : "Reported interview question"}</small></span>
                </div>
              ))}
            </div>
          </>
        ) : (
          <div className="leetally-radar-empty-state">
            <b>{status === "loading" ? "Scanning 30+ company lists…" : status === "error" ? "Could not reach the company index" : "No match in the recent three-month dataset"}</b>
            <p>This does not mean the problem is never asked. Radar only shows the current community-maintained signal.</p>
          </div>
        )}

        <div className="leetally-radar-actions">
          <button type="button" className="primary" onClick={startMockInterview}>Start AI mock</button>
          <button type="button" onClick={() => void refresh()} disabled={status === "loading"}>{status === "loading" ? "Scanning…" : "Refresh data"}</button>
        </div>
        <footer>Recent community data · AI receives these company signals</footer>
      </section>
    </aside>
  );
}
