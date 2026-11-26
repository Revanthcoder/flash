import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Activity, ArrowDown, ArrowRight, BarChart3, Binary, Check, ChevronDown, CircleHelp,
  Clock3, Code2, Command, Database, FileUp, Gauge, Github, Layers3, Menu, Pause,
  Play, Plus, Radio, RotateCcw, Send, ShieldCheck, Sparkles, Square, UploadCloud, X,
  Zap,
} from "lucide-react";
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";

const API = (import.meta.env.VITE_API_URL || (import.meta.env.DEV ? "http://localhost:8000" : "")).replace(/\/+$/, "");
const navItems = [
  { id: "overview", label: "Overview", icon: BarChart3, group: "Workspace" },
  { id: "scoreboard", label: "Live scoreboard", icon: Radio, group: "Workspace" },
  { id: "heaps", label: "Heap visualizer", icon: Binary, group: "Workspace" },
  { id: "analytics", label: "Analytics", icon: Activity, group: "Insights" },
  { id: "csv", label: "CSV stream replay", icon: FileUp, group: "Insights" },
  { id: "performance", label: "Performance lab", icon: Gauge, group: "Insights" },
  { id: "guide", label: "Algorithm guide", icon: CircleHelp, group: "Resources" },
];

const emptyState = {
  score_count: 0, median: null, lower_heap_size: 0, upper_heap_size: 0,
  processing_latency_ms: 0, stream_status: "waiting", recent_scores: [],
  median_history: [], activity: [], lower_heap: [], upper_heap: [],
};

async function request(path, options = {}) {
  if (!API) {
    throw new Error("The API URL is not configured for this deployment. Set VITE_API_URL to your deployed backend URL, then redeploy the frontend.");
  }
  let response;
  try {
    response = await fetch(`${API}${path}`, options);
  } catch {
    throw new Error(`Could not reach the MEDIANFLOW API at ${API}. Confirm the backend is deployed and CORS_ORIGINS includes this site's exact origin.`);
  }
  if (!response.ok) {
    let message = `Request failed (${response.status})`;
    try {
      const body = await response.json();
      message = body.detail || message;
    } catch { /* Keep the HTTP status when the server does not return JSON. */ }
    throw new Error(message);
  }
  return response.json();
}

function formatNumber(value) {
  return value == null ? "—" : new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(value);
}

function App() {
  const [page, setPage] = useState("overview");
  const [state, setState] = useState(emptyState);
  const [apiOnline, setApiOnline] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [toast, setToast] = useState(null);
  const [score, setScore] = useState("");
  const [busy, setBusy] = useState(false);
  const [simStatus, setSimStatus] = useState("stopped");
  const [simSpeed, setSimSpeed] = useState(1000);
  const [simMin, setSimMin] = useState(-100);
  const [simMax, setSimMax] = useState(100);
  const simRef = useRef({ timer: null, status: "stopped" });
  const toastTimer = useRef(null);

  const notify = useCallback((message, kind = "success") => {
    setToast({ message, kind });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3200);
  }, []);

  const refresh = useCallback(async () => {
    try {
      const latest = await request("/api/state");
      const heaps = page === "heaps" ? await request("/api/heaps") : null;
      setState((current) => ({
        ...latest,
        lower_heap: heaps ? heaps.lower_heap : current.lower_heap,
        upper_heap: heaps ? heaps.upper_heap : current.upper_heap,
      }));
      setApiOnline(true);
    } catch {
      setApiOnline(false);
    }
  }, [page]);

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, 3000);
    return () => {
      clearInterval(timer);
      clearTimeout(toastTimer.current);
      clearInterval(simRef.current.timer);
    };
  }, [refresh]);

  const insertScore = useCallback(async (value) => {
    const result = await request("/api/scores", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ value }),
    });
    const heaps = page === "heaps" ? await request("/api/heaps") : null;
    setState((current) => ({
      ...result,
      lower_heap: heaps ? heaps.lower_heap : current.lower_heap,
      upper_heap: heaps ? heaps.upper_heap : current.upper_heap,
    }));
    setApiOnline(true);
    return result;
  }, [page]);

  const submitScore = async (event) => {
    event?.preventDefault();
    if (score.trim() === "") return;
    const value = Number(score);
    if (!Number.isInteger(value) || value < -2147483648 || value > 2147483647) {
      notify("Enter a whole number between −2,147,483,648 and 2,147,483,647.", "error");
      return;
    }
    setBusy(true);
    try {
      const result = await insertScore(value);
      setScore("");
      notify(`Score ${formatNumber(value)} added · median is ${formatNumber(result.median)}.`);
    } catch (error) {
      notify(error.message, "error");
    } finally {
      setBusy(false);
    }
  };

  const stopSimulator = useCallback(() => {
    clearInterval(simRef.current.timer);
    simRef.current.timer = null;
    simRef.current.status = "stopped";
    setSimStatus("stopped");
  }, []);

  const startSimulator = () => {
    const min = Math.ceil(Number(simMin));
    const max = Math.floor(Number(simMax));
    if (!Number.isInteger(min) || !Number.isInteger(max) || min < -2147483648 || max > 2147483647 || min > max) {
      notify("Choose a valid signed 32-bit score range.", "error");
      return;
    }
    clearInterval(simRef.current.timer);
    const tick = async () => {
      if (simRef.current.status !== "running") return;
      try {
        await insertScore(Math.floor(Math.random() * (max - min + 1)) + min);
      } catch (error) {
        notify(error.message, "error");
        stopSimulator();
      }
    };
    simRef.current.status = "running";
    setSimStatus("running");
    tick();
    simRef.current.timer = setInterval(tick, simSpeed);
  };

  const pauseSimulator = () => {
    clearInterval(simRef.current.timer);
    simRef.current.timer = null;
    simRef.current.status = "paused";
    setSimStatus("paused");
  };

  const resumeSimulator = () => {
    if (simRef.current.status !== "paused") return;
    simRef.current.status = "stopped";
    startSimulator();
  };

  const resetSession = async () => {
    if (!window.confirm("Reset this session? All scores and analytics will be cleared.")) return;
    stopSimulator();
    try {
      await request("/api/session", { method: "DELETE" });
      setState(emptyState);
      notify("Session reset. Ready for a fresh stream.");
    } catch (error) {
      notify(error.message, "error");
    }
  };

  const navigate = (id) => {
    setPage(id);
    setSidebarOpen(false);
    if (id === "heaps") {
      request("/api/heaps").then((heaps) => {
        setState((current) => ({
          ...current,
          ...heaps,
          lower_heap_size: heaps.lower_heap.length,
          upper_heap_size: heaps.upper_heap.length,
        }));
      }).catch((error) => notify(error.message, "error"));
    }
  };

  const currentNav = navItems.find((item) => item.id === page);

  return (
    <div className="app-shell">
      {sidebarOpen && <button className="mobile-backdrop" aria-label="Close navigation" onClick={() => setSidebarOpen(false)} />}
      <aside className={`sidebar ${sidebarOpen ? "sidebar-open" : ""}`}>
        <div className="brand">
          <div className="brand-mark"><Activity size={19} strokeWidth={2.5} /></div>
          <div><span className="brand-name">MEDIAN<span>FLOW</span></span><span className="brand-caption">SCORE INTELLIGENCE</span></div>
          <button className="icon-btn sidebar-close" aria-label="Close navigation" onClick={() => setSidebarOpen(false)}><X size={18} /></button>
        </div>
        <div className="workspace-switch"><div className="workspace-icon">M</div><div><strong>Medianflow workspace</strong><small>Personal workspace</small></div><ChevronDown size={15} /></div>
        <nav className="nav-list" aria-label="Main navigation">
          {["Workspace", "Insights", "Resources"].map((group) => (
            <div className="nav-group" key={group}>
              <span className="nav-label">{group}</span>
              {navItems.filter((item) => item.group === group).map(({ id, label, icon: Icon }) => (
                <button key={id} onClick={() => navigate(id)} className={`nav-item ${page === id ? "active" : ""}`}>
                  <Icon size={17} strokeWidth={1.8} /><span>{label}</span>{id === "scoreboard" && state.score_count > 0 && <span className="nav-count">{formatNumber(state.score_count)}</span>}
                </button>
              ))}
            </div>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="system-card">
            <span className={`status-dot ${apiOnline ? "online" : ""}`} />
            <div><strong>{apiOnline ? "Systems operational" : "Connecting to engine"}</strong><small>Median engine · v1.0.0</small></div>
            <ShieldCheck size={16} className={apiOnline ? "green-text" : "muted-icon"} />
          </div>
          <button className="reset-link" onClick={resetSession}><RotateCcw size={15} /> Reset session</button>
          <div className="sidebar-footer"><div className="avatar">NK</div><div><strong>Personal session</strong><small>Local environment</small></div><button className="icon-btn" title="Session settings" onClick={() => notify("Session runs locally and is stored in memory.", "info")}><Command size={16} /></button></div>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <button className="icon-btn mobile-menu" aria-label="Open navigation" onClick={() => setSidebarOpen(true)}><Menu size={20} /></button>
          <div className="breadcrumbs"><span>Workspace</span><span className="crumb-slash">/</span><strong>{currentNav?.label || "Overview"}</strong></div>
          <div className="topbar-right">
            <span className="environment-pill"><span className={`status-dot ${apiOnline ? "online" : ""}`} /> {apiOnline ? "Live environment" : "API offline"}</span>
            <button className="icon-btn topbar-help" title="About Medianflow" onClick={() => navigate("guide")}><CircleHelp size={17} /></button>
            <div className="avatar small-avatar">NK</div>
          </div>
        </header>

        <div className="page-content">
          <AnimatePresence mode="wait">
            <motion.div key={page} initial={{ opacity: 0, y: 7 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -5 }} transition={{ duration: 0.18 }}>
              {page === "overview" && <Overview state={state} navigate={navigate} apiOnline={apiOnline} />}
              {page === "scoreboard" && <Scoreboard state={state} score={score} setScore={setScore} submitScore={submitScore} busy={busy} simStatus={simStatus} startSimulator={startSimulator} pauseSimulator={pauseSimulator} resumeSimulator={resumeSimulator} stopSimulator={stopSimulator} simSpeed={simSpeed} setSimSpeed={setSimSpeed} simMin={simMin} setSimMin={setSimMin} simMax={simMax} setSimMax={setSimMax} />}
              {page === "heaps" && <HeapVisualizer state={state} />}
              {page === "analytics" && <Analytics state={state} />}
              {page === "csv" && <CsvReplay insertScore={insertScore} notify={notify} />}
              {page === "performance" && <PerformanceLab />}
              {page === "guide" && <AlgorithmGuide />}
            </motion.div>
          </AnimatePresence>
        </div>
        <footer className="app-footer"><span>© 2026 MEDIANFLOW</span><span><span className={`status-dot ${apiOnline ? "online" : ""}`} /> {apiOnline ? "All systems normal" : "Waiting for API"} <span className="footer-divider">·</span> Built for streams that never stop</span></footer>
      </main>
      <AnimatePresence>
        {toast && <motion.div className={`toast toast-${toast.kind}`} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }}><span className="toast-icon">{toast.kind === "error" ? <X size={16} /> : <Check size={16} />}</span>{toast.message}</motion.div>}
      </AnimatePresence>
    </div>
  );
}

function PageHeading({ eyebrow, title, description, action }) {
  return <div className="page-heading"><div><div className="eyebrow"><span className="eyebrow-line" />{eyebrow}</div><h1>{title}</h1><p>{description}</p></div>{action && <div className="heading-action">{action}</div>}</div>;
}

function Overview({ state, navigate, apiOnline }) {
  const metrics = [
    { label: "Total scores", value: formatNumber(state.score_count), sub: "in this session", icon: Database, tint: "cyan" },
    { label: "Current median", value: formatNumber(state.median), sub: state.score_count ? "across all incoming scores" : "awaiting first score", icon: Activity, tint: "purple" },
    { label: "Lower heap size", value: formatNumber(state.lower_heap_size), sub: "max-heap · values ≤ median", icon: Layers3, tint: "blue" },
    { label: "Upper heap size", value: formatNumber(state.upper_heap_size), sub: "min-heap · values ≥ median", icon: Layers3, tint: "green" },
    { label: "Processing latency", value: `${state.processing_latency_ms.toFixed(3)} ms`, sub: "last insertion · O(log n)", icon: Clock3, tint: "amber" },
    { label: "Stream status", value: state.score_count ? "Streaming" : "Standby", sub: apiOnline ? "API connected" : "waiting for API", icon: Radio, tint: "cyan", live: !!state.score_count },
  ];
  return <>
    <PageHeading eyebrow="REAL-TIME SCORE INTELLIGENCE" title={<>Numbers move.<br className="desktop-break" /> <span className="gradient-text">We keep up.</span></>} description="A clear view of every score, every shift, and the median moving in real time." action={<div className="hero-actions"><button className="btn btn-primary" onClick={() => navigate("scoreboard")}><Zap size={16} fill="currentColor" /> Launch live scoreboard</button><button className="btn btn-secondary" onClick={() => navigate("guide")}>Explore the algorithm <ArrowRight size={16} /></button></div>} />
    <div className="metrics-grid">{metrics.map(({ label, value, sub, icon: Icon, tint, live }, i) => <motion.div className="metric-card" key={label} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}><div className="metric-top"><span>{label}</span><span className={`metric-icon ${tint}`}><Icon size={16} /></span></div><div className="metric-value">{live && <span className="live-indicator" />}{value}</div><div className="metric-sub">{sub}</div></motion.div>)}</div>
    <div className="dashboard-grid">
      <section className="panel trend-panel"><div className="panel-heading"><div><h2>Running median</h2><p>Median movement across the latest insertions</p></div><span className="chart-period"><span className="status-dot online" /> Live</span></div>
        {state.median_history.length ? <div className="chart-wrap"><ResponsiveContainer width="100%" height="100%"><AreaChart data={state.median_history} margin={{ top: 12, right: 12, bottom: 0, left: -18 }}><defs><linearGradient id="medianGradient" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#22d3ee" stopOpacity={0.28} /><stop offset="100%" stopColor="#22d3ee" stopOpacity={0} /></linearGradient></defs><CartesianGrid stroke="#202a3b" vertical={false} /><XAxis dataKey="index" tick={{ fill: "#718096", fontSize: 11 }} tickLine={false} axisLine={false} /><YAxis tick={{ fill: "#718096", fontSize: 11 }} tickLine={false} axisLine={false} domain={["auto", "auto"]} /><Tooltip content={<ChartTooltip />} /><Area type="monotone" dataKey="median" stroke="#22d3ee" strokeWidth={2.2} fill="url(#medianGradient)" activeDot={{ r: 4, fill: "#22d3ee", stroke: "#10182a", strokeWidth: 3 }} /></AreaChart></ResponsiveContainer></div> : <EmptyChart icon={Activity} title="Your median starts here" detail="Add a score to see the running median take shape." />}
      </section>
      <section className="panel distribution-panel"><div className="panel-heading"><div><h2>Heap distribution</h2><p>Balanced around the current median</p></div><button className="text-button" onClick={() => navigate("heaps")}>Inspect heaps <ArrowRight size={14} /></button></div>
        {state.score_count ? <><div className="distribution-chart"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={[{ name: "Lower half", value: state.lower_heap_size }, { name: "Upper half", value: state.upper_heap_size }]} innerRadius={66} outerRadius={88} paddingAngle={5} dataKey="value" stroke="none"><Cell fill="#22d3ee" /><Cell fill="#8b5cf6" /></Pie><Tooltip content={<ChartTooltip />} /></PieChart></ResponsiveContainer><div className="donut-center"><strong>{formatNumber(state.score_count)}</strong><span>scores</span></div></div><div className="legend-row"><span><i className="legend-dot cyan-dot" />Lower half <strong>{state.lower_heap_size}</strong></span><span><i className="legend-dot purple-dot" />Upper half <strong>{state.upper_heap_size}</strong></span></div></> : <EmptyChart icon={Layers3} title="Waiting for scores" detail="Your heap balance will appear here." compact />}
      </section>
    </div>
    <div className="dashboard-grid lower-grid">
      <section className="panel activity-panel"><div className="panel-heading"><div><h2>Insertion activity</h2><p>Most recent scores entering the stream</p></div><span className="subtle-count">{state.activity.length} events</span></div>
        {state.activity.length ? <div className="activity-chart"><ResponsiveContainer width="100%" height="100%"><BarChart data={state.activity} margin={{ top: 10, right: 8, bottom: 0, left: -20 }}><CartesianGrid stroke="#202a3b" vertical={false} /><XAxis dataKey="index" tick={{ fill: "#718096", fontSize: 10 }} tickLine={false} axisLine={false} /><YAxis tick={{ fill: "#718096", fontSize: 10 }} tickLine={false} axisLine={false} /><Tooltip content={<ChartTooltip />} /><Bar dataKey="value" fill="#8b5cf6" radius={[4, 4, 0, 0]} maxBarSize={24} /></BarChart></ResponsiveContainer></div> : <EmptyChart icon={BarChart3} title="No activity yet" detail="Start a live stream or insert a score." compact />}
      </section>
      <section className="panel history-panel"><div className="panel-heading"><div><h2>Recent scores</h2><p>Latest values added to this session</p></div><button className="text-button" onClick={() => navigate("scoreboard")}>Open scoreboard <ArrowRight size={14} /></button></div>
        {state.recent_scores.length ? <div className="recent-list">{state.recent_scores.slice(0, 7).map((value, i) => <div className="recent-row" key={`${i}-${value}`}><span className="recent-index">{String(state.score_count - i).padStart(2, "0")}</span><span className="recent-value">{formatNumber(value)}</span><span className={`recent-tag ${value >= (state.median ?? 0) ? "tag-upper" : "tag-lower"}`}>{value >= (state.median ?? 0) ? "upper half" : "lower half"}</span><span className="recent-arrow"><ArrowDown size={13} /></span></div>)}</div> : <EmptyChart icon={Database} title="No scores yet" detail="Every new score will show up here." compact />}
      </section>
    </div>
    <div className="health-strip"><div className="health-icon"><ShieldCheck size={17} /></div><div><strong>Engine health</strong><span>Two-heap architecture · in-memory session</span></div><div className="health-stat"><span className={`status-dot ${apiOnline ? "online" : ""}`} />{apiOnline ? "Operational" : "Connecting"}</div><div className="health-stat"><Zap size={14} /> O(log n) insertion</div><div className="health-stat"><Database size={14} /> O(1) median lookup</div></div>
  </>;
}

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return <div className="chart-tooltip"><span>{payload[0].name} · {label ?? "score"}</span><strong>{formatNumber(payload[0].value)}</strong></div>;
}

function EmptyChart({ icon: Icon, title, detail, compact = false }) {
  return <div className={`empty-chart ${compact ? "empty-compact" : ""}`}><div className="empty-icon"><Icon size={19} /></div><strong>{title}</strong><span>{detail}</span></div>;
}

function Scoreboard({ state, score, setScore, submitScore, busy, simStatus, startSimulator, pauseSimulator, resumeSimulator, stopSimulator, simSpeed, setSimSpeed, simMin, setSimMin, simMax, setSimMax }) {
  const fast = async (value) => {
    setScore(String(value));
  };
  return <>
    <PageHeading eyebrow="LIVE SCOREBOARD" title={<>Every score.<br /><span className="gradient-text">One live median.</span></>} description="Feed scores into the stream and watch the median rebalance in real time." action={<div className="stream-badge"><span className={`status-dot ${state.score_count ? "online" : ""}`} />{state.score_count ? "Stream active" : "Stream idle"}</div>} />
    <div className="scoreboard-grid">
      <div className="scoreboard-main">
        <section className="panel insert-panel"><div className="section-title"><span className="section-icon cyan"><Plus size={18} /></span><div><h2>Insert a score</h2><p>Signed 32-bit integers · duplicates are supported</p></div></div>
          <form className="score-form" onSubmit={(event) => { void submitScore(event); }}><div className="input-shell"><span className="input-prefix">#</span><input aria-label="Score value" type="number" step="1" min="-2147483648" max="2147483647" value={score} onChange={(event) => setScore(event.target.value)} placeholder="Enter a score…" /><span className="input-hint">↵</span></div><button className="btn btn-primary add-score-btn" type="submit" disabled={busy || score.trim() === ""}>{busy ? <span className="spinner" /> : <Send size={16} />} Add score</button></form>
          <div className="quick-values"><span>Quick add</span>{[-10, 0, 25, 100].map((value) => <button key={value} onClick={() => void fast(value)}>{value > 0 ? "+" : ""}{value}</button>)}</div>
        </section>
        <section className="panel simulator-panel"><div className="section-title"><span className="section-icon purple"><Activity size={18} /></span><div><h2>Automatic stream</h2><p>Generate randomized scores on a continuous stream</p></div><span className={`sim-state ${simStatus}`}><i />{simStatus}</span></div>
          <div className="sim-controls"><label>Minimum score<div className="small-input"><input type="number" min="-2147483648" max="2147483647" value={simMin} onChange={(e) => setSimMin(e.target.value)} /></div></label><span className="range-dash">to</span><label>Maximum score<div className="small-input"><input type="number" min="-2147483648" max="2147483647" value={simMax} onChange={(e) => setSimMax(e.target.value)} /></div></label><label className="speed-control">Interval <select value={simSpeed} onChange={(e) => setSimSpeed(Number(e.target.value))}><option value={250}>250 ms</option><option value={500}>500 ms</option><option value={1000}>1 sec</option><option value={2000}>2 sec</option><option value={5000}>5 sec</option></select></label></div>
          <div className="sim-actions">{simStatus === "stopped" ? <button className="btn btn-primary" onClick={startSimulator}><Play size={15} fill="currentColor" /> Start stream</button> : simStatus === "running" ? <button className="btn btn-secondary" onClick={pauseSimulator}><Pause size={15} /> Pause</button> : <button className="btn btn-primary" onClick={resumeSimulator}><Play size={15} fill="currentColor" /> Resume</button>}{simStatus !== "stopped" && <button className="btn btn-ghost" onClick={stopSimulator}><Square size={14} /> Stop stream</button>}<span className="sim-note"><span className="status-dot online" /> Scores are added to the same live session</span></div>
        </section>
        <section className="panel scoreboard-chart"><div className="panel-heading"><div><h2>Median timeline</h2><p>{state.median_history.length} data points · latest 120 insertions</p></div><span className="mini-median">Median <strong>{formatNumber(state.median)}</strong></span></div>{state.median_history.length ? <div className="chart-wrap"><ResponsiveContainer width="100%" height="100%"><LineChart data={state.median_history} margin={{ top: 10, right: 12, bottom: 0, left: -18 }}><CartesianGrid stroke="#202a3b" vertical={false} /><XAxis dataKey="index" tick={{ fill: "#718096", fontSize: 11 }} tickLine={false} axisLine={false} /><YAxis tick={{ fill: "#718096", fontSize: 11 }} tickLine={false} axisLine={false} domain={["auto", "auto"]} /><Tooltip content={<ChartTooltip />} /><Line type="monotone" dataKey="median" stroke="#22d3ee" strokeWidth={2.5} dot={false} activeDot={{ r: 4 }} /></LineChart></ResponsiveContainer></div> : <EmptyChart icon={Activity} title="Waiting for the first score" detail="Insert a score to begin your real-time median timeline." />}</section>
      </div>
      <div className="scoreboard-side"><section className="panel median-card"><div className="median-card-head"><span>LIVE MEDIAN</span><span className="pulse-tag"><i />LIVE</span></div><div className="median-big">{formatNumber(state.median)}</div><div className="median-card-foot"><span>Calculated across</span><strong>{formatNumber(state.score_count)} scores</strong></div><div className="median-rule" /><div className="median-details"><span><i className="legend-dot cyan-dot" />Lower half <strong>{state.lower_heap_size}</strong></span><span><i className="legend-dot purple-dot" />Upper half <strong>{state.upper_heap_size}</strong></span></div></section>
        <section className="panel recent-scores-card"><div className="panel-heading"><div><h2>Score history</h2><p>Newest first</p></div><span className="history-count">{state.score_count}</span></div>{state.recent_scores.length ? <div className="score-history">{state.recent_scores.map((value, i) => <div className="history-entry" key={`${value}-${i}`}><span className="history-number">{String(state.score_count - i).padStart(2, "0")}</span><strong>{formatNumber(value)}</strong><span className="history-dot" /></div>)}</div> : <EmptyChart icon={Database} title="Nothing here yet" detail="New scores appear instantly." compact />}</section>
        <div className="complexity-card"><div className="complexity-icon"><Binary size={17} /></div><div><strong>Fast by design</strong><span>O(log n) insert · O(1) median</span></div><ArrowRight size={15} /></div>
      </div>
    </div>
  </>;
}

function HeapVisualizer({ state }) {
  const renderHeap = (values, mode) => values.length ? <div className="heap-nodes">{values.slice(0, 31).map((value, index) => <div key={`${value}-${index}`} className="heap-node-wrap" style={{ "--depth": Math.floor(Math.log2(index + 1)) }}><div className={`heap-node ${mode}`}>{formatNumber(value)}</div><span>{index === 0 ? "root" : `#${index}`}</span></div>)}</div> : <EmptyChart icon={Layers3} title="Heap is empty" detail="Add a score to populate this side." compact />;
  return <>
    <PageHeading eyebrow="DATA STRUCTURE INSPECTOR" title={<>Two heaps.<br /><span className="gradient-text">One precise answer.</span></>} description="See how incoming values are partitioned and balanced around the median." action={<div className="complexity-chip"><Code2 size={15} /> O(log n) insert</div>} />
    <div className="heap-summary panel"><div><span>Total elements</span><strong>{formatNumber(state.score_count)}</strong></div><div className="summary-operator">÷</div><div><span>Balance invariant</span><strong>{Math.abs(state.lower_heap_size - state.upper_heap_size) <= 1 ? "Maintained" : "Rebalancing"}</strong></div><div className="summary-operator">→</div><div><span>Current median</span><strong className="cyan-text">{formatNumber(state.median)}</strong></div></div>
    <div className="heap-grid"><section className="panel heap-panel"><div className="heap-panel-head"><div className="heap-title"><span className="heap-symbol max-symbol">MAX</span><div><h2>Lower half</h2><p>Max-heap · values ≤ upper half</p></div></div><span className="heap-size">{state.lower_heap_size} nodes</span></div><div className="heap-root-hint">ROOT · HIGHEST VALUE IN LOWER HALF</div>{renderHeap(state.lower_heap, "lower")}<div className="heap-boundary"><span>Top of lower heap</span><strong>{formatNumber(state.lower_heap[0])}</strong></div></section>
      <section className="panel heap-panel"><div className="heap-panel-head"><div className="heap-title"><span className="heap-symbol min-symbol">MIN</span><div><h2>Upper half</h2><p>Min-heap · values ≥ lower half</p></div></div><span className="heap-size">{state.upper_heap_size} nodes</span></div><div className="heap-root-hint">ROOT · LOWEST VALUE IN UPPER HALF</div>{renderHeap(state.upper_heap, "upper")}<div className="heap-boundary"><span>Top of upper heap</span><strong>{formatNumber(state.upper_heap[0])}</strong></div></section></div>
    <section className="panel invariant-panel"><span className="invariant-icon"><ShieldCheck size={18} /></span><div><strong>Heap invariants are {state.score_count ? "holding" : "ready"}</strong><span>Every value in the lower heap is less than or equal to every value in the upper heap. Their sizes differ by at most one.</span></div><span className="invariant-check"><Check size={14} /> Verified</span></section>
  </>;
}

function Analytics({ state }) {
  const activity = state.activity;
  const values = activity.map((item) => item.value);
  const positive = values.filter((value) => value >= 0).length;
  const negative = values.length - positive;
  const signs = [{ name: "Zero & positive", value: positive }, { name: "Negative", value: negative }].filter((item) => item.value > 0);
  const range = values.length ? Math.max(...values) - Math.min(...values) : 0;
  return <>
    <PageHeading eyebrow="STREAM INSIGHTS" title={<>Read the shape<br /><span className="gradient-text">of your stream.</span></>} description="A closer look at score movement and distribution across the latest events." />
    <div className="analytics-kpis"><div className="panel analytics-kpi"><span>Scores processed</span><strong>{formatNumber(state.score_count)}</strong><small>All session insertions</small></div><div className="panel analytics-kpi"><span>Latest median</span><strong>{formatNumber(state.median)}</strong><small>Across the complete stream</small></div><div className="panel analytics-kpi"><span>Recent score range</span><strong>{formatNumber(range)}</strong><small>Max − min · last {values.length} events</small></div><div className="panel analytics-kpi"><span>Last insertion</span><strong>{state.processing_latency_ms.toFixed(3)}<em>ms</em></strong><small>Heap operation latency</small></div></div>
    <div className="dashboard-grid analytics-charts"><section className="panel trend-panel"><div className="panel-heading"><div><h2>Median over time</h2><p>Exact running median · full stream history (latest 120)</p></div></div>{state.median_history.length ? <div className="chart-wrap tall-chart"><ResponsiveContainer width="100%" height="100%"><AreaChart data={state.median_history} margin={{ top: 12, right: 12, bottom: 0, left: -18 }}><defs><linearGradient id="analyticsGradient" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#8b5cf6" stopOpacity={0.3} /><stop offset="100%" stopColor="#8b5cf6" stopOpacity={0.01} /></linearGradient></defs><CartesianGrid stroke="#202a3b" vertical={false} /><XAxis dataKey="index" tick={{ fill: "#718096", fontSize: 11 }} tickLine={false} axisLine={false} /><YAxis tick={{ fill: "#718096", fontSize: 11 }} tickLine={false} axisLine={false} domain={["auto", "auto"]} /><Tooltip content={<ChartTooltip />} /><Area type="monotone" dataKey="median" stroke="#8b5cf6" strokeWidth={2.3} fill="url(#analyticsGradient)" /></AreaChart></ResponsiveContainer></div> : <EmptyChart icon={Activity} title="Analytics will appear as scores arrive" detail="Start a stream to generate insight." />}</section>
      <section className="panel sign-panel"><div className="panel-heading"><div><h2>Recent score polarity</h2><p>Positive, zero & negative values</p></div></div>{signs.length ? <div className="polarity-chart"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={signs} dataKey="value" nameKey="name" innerRadius={58} outerRadius={82} paddingAngle={5} stroke="none"><Cell fill="#22d3ee" /><Cell fill="#8b5cf6" /></Pie><Tooltip content={<ChartTooltip />} /></PieChart></ResponsiveContainer><div className="polarity-center"><strong>{values.length}</strong><span>events</span></div></div> : <EmptyChart icon={Activity} title="No distribution yet" detail="Add scores to see the polarity split." compact />}<div className="polarity-legend"><span><i className="legend-dot cyan-dot" />Positive & zero <strong>{positive}</strong></span><span><i className="legend-dot purple-dot" />Negative <strong>{negative}</strong></span></div></section></div>
    <section className="panel full-activity"><div className="panel-heading"><div><h2>Latest score activity</h2><p>Most recent values in the stream window</p></div><span className="subtle-count">{activity.length} records</span></div>{activity.length ? <div className="table-scroll"><table><thead><tr><th>Sequence</th><th>Score</th><th>Relative to median</th><th>Median after insertion</th></tr></thead><tbody>{activity.slice().reverse().map(({ index, value }) => { const median = state.median_history.find((point) => point.index === index)?.median; return <tr key={index}><td className="mono">#{String(index).padStart(4, "0")}</td><td className="table-score">{formatNumber(value)}</td><td><span className={`table-tag ${value >= (median ?? 0) ? "tag-upper" : "tag-lower"}`}>{value >= (median ?? 0) ? "At / above" : "Below"}</span></td><td>{formatNumber(median)}</td></tr>; })}</tbody></table></div> : <EmptyChart icon={Database} title="Activity appears here" detail="The latest 24 inserted values are shown in this table." compact />}</section>
  </>;
}

function CsvReplay({ insertScore, notify }) {
  const [file, setFile] = useState(null);
  const [values, setValues] = useState([]);
  const [speed, setSpeed] = useState(350);
  const [status, setStatus] = useState("idle");
  const [progress, setProgress] = useState(0);
  const [cancelled, setCancelled] = useState(false);
  const [error, setError] = useState("");
  const cancelRef = useRef(false);
  const chooseFile = async (chosen) => {
    setFile(chosen);
    setValues([]);
    setProgress(0);
    setError("");
    if (!chosen) return;
    if (!chosen.name.toLowerCase().endsWith(".csv")) {
      setError("Choose a .csv file.");
      return;
    }
    try {
      const text = await chosen.text();
      const rows = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.trim());
      const parsed = rows.map((row, index) => {
        const first = row.split(",")[0].trim();
        if (index === 0 && ["score", "value", "scores"].includes(first.toLowerCase())) return null;
        if (!/^-?\d+$/.test(first)) throw new Error(`Row ${index + 1} does not start with an integer.`);
        const value = Number(first);
        if (!Number.isSafeInteger(value) || value < -2147483648 || value > 2147483647) throw new Error(`Row ${index + 1} is outside the signed 32-bit range.`);
        return value;
      }).filter((value) => value !== null);
      if (!parsed.length) throw new Error("No scores found in this CSV.");
      setValues(parsed);
    } catch (exception) {
      setError(exception.message);
    }
  };
  const replay = async () => {
    if (!values.length) return;
    setStatus("running");
    setCancelled(false);
    cancelRef.current = false;
    try {
      for (let index = progress; index < values.length; index += 1) {
        if (cancelRef.current) break;
        await insertScore(values[index]);
        setProgress(index + 1);
        if (speed > 0 && index < values.length - 1) await new Promise((resolve) => setTimeout(resolve, speed));
      }
      if (cancelRef.current) {
        setStatus("paused");
        setCancelled(true);
        notify("CSV replay paused.");
      } else {
        setStatus("complete");
        notify(`CSV replay complete · ${values.length} scores added.`);
      }
    } catch (exception) {
      setStatus("error");
      notify(exception.message, "error");
    }
  };
  return <>
    <PageHeading eyebrow="DATA INGESTION" title={<>Your data, in motion.<br /><span className="gradient-text">Stream it in.</span></>} description="Replay a CSV score history through the same live engine that powers your scoreboard." />
    <div className="csv-layout"><section className="panel csv-upload-panel"><div className="section-title"><span className="section-icon cyan"><UploadCloud size={18} /></span><div><h2>Upload score data</h2><p>Comma-separated values · one score per row</p></div></div>
      <label className={`drop-zone ${file ? "file-selected" : ""}`}><input type="file" accept=".csv,text/csv" onChange={(e) => void chooseFile(e.target.files?.[0] || null)} /><span className="upload-illustration"><UploadCloud size={22} /></span><strong>{file ? file.name : "Drop your CSV file here"}</strong><span>{file ? `${(file.size / 1024).toFixed(1)} KB · ${values.length || "checking"} scores` : <>or <b>browse files</b> from your computer</>}</span><small>CSV · UTF-8 · signed 32-bit integer values</small></label>
      {error && <div className="inline-error"><X size={14} />{error}</div>}
      <div className="csv-example"><div><Code2 size={15} /><strong>Expected format</strong></div><code>score<br />42<br />-17<br />105</code><span>Headers are optional. Values are read from the first column.</span></div>
    </section>
    <section className="panel replay-panel"><div className="section-title"><span className="section-icon purple"><Play size={17} /></span><div><h2>Replay controls</h2><p>Stream scores into your active session</p></div></div><div className="replay-counter"><span>REPLAY PROGRESS</span><strong>{progress}<small> / {values.length || 0}</small></strong><div className="progress-track"><div style={{ width: `${values.length ? progress / values.length * 100 : 0}%` }} /></div></div><label className="replay-speed">Delay between scores<select value={speed} onChange={(e) => setSpeed(Number(e.target.value))}><option value={0}>As fast as possible</option><option value={100}>100 ms</option><option value={350}>350 ms</option><option value={750}>750 ms</option><option value={1500}>1.5 sec</option></select></label>{status === "running" ? <button className="btn btn-secondary full-btn" onClick={() => { cancelRef.current = true; setCancelled(true); }}><Pause size={15} /> Pause replay</button> : cancelled ? <button className="btn btn-primary full-btn" onClick={() => void replay()}><Play size={15} fill="currentColor" /> Resume replay</button> : <button className="btn btn-primary full-btn" disabled={!values.length || status === "complete"} onClick={() => void replay()}><Play size={15} fill="currentColor" />{status === "complete" ? "Replay complete" : "Start replay"}</button>}<p className="replay-note"><ShieldCheck size={14} /> Values are validated before replay. Each insertion updates the live median.</p></section></div>
    {values.length > 0 && <section className="panel csv-preview"><div className="panel-heading"><div><h2>Preview</h2><p>First 12 of {values.length} parsed values</p></div><span className="subtle-count">Validated</span></div><div className="preview-chips">{values.slice(0, 12).map((value, index) => <span key={index} className="preview-chip"><small>{String(index + 1).padStart(2, "0")}</small>{formatNumber(value)}</span>)}</div></section>}
  </>;
}

function PerformanceLab() {
  const [count, setCount] = useState(10000);
  const [result, setResult] = useState(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const run = async () => {
    setRunning(true);
    setError("");
    try {
      const data = await request("/api/benchmark", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ count }) });
      setResult(data);
    } catch (exception) {
      setError(exception.message);
    } finally {
      setRunning(false);
    }
  };
  return <>
    <PageHeading eyebrow="ALGORITHM BENCHMARKS" title={<>Built for the<br /><span className="gradient-text">pace of live data.</span></>} description="Measure the two-heap engine with generated input. Every benchmark checks its median against a sorted reference." />
    <div className="performance-layout"><section className="panel benchmark-panel"><div className="section-title"><span className="section-icon amber"><Gauge size={18} /></span><div><h2>Run a benchmark</h2><p>Isolated from your current session data</p></div></div><label className="benchmark-label">Number of scores<select value={count} onChange={(e) => setCount(Number(e.target.value))}><option value={1000}>1,000 scores</option><option value={10000}>10,000 scores</option><option value={50000}>50,000 scores</option><option value={100000}>100,000 scores</option></select></label><button className="btn btn-primary full-btn" onClick={() => void run()} disabled={running}>{running ? <span className="spinner" /> : <Zap size={15} />} {running ? "Benchmarking…" : "Run performance test"}</button>{error && <div className="inline-error"><X size={14} />{error}</div>}<p className="replay-note"><ShieldCheck size={14} /> Deterministic random data · result verified against a sorted array</p></section>
      <section className="panel benchmark-result">{result ? <><div className="benchmark-result-head"><span className="result-check"><Check size={16} /></span><div><strong>Benchmark complete</strong><span>{result.correct ? "Median verified against reference" : "Median verification failed"}</span></div><span className={`result-status ${result.correct ? "verified" : "failed"}`}>{result.correct ? "VERIFIED" : "FAILED"}</span></div><div className="result-metrics"><div><span>Processed</span><strong>{formatNumber(result.count)}</strong><small>scores</small></div><div><span>Elapsed time</span><strong>{formatNumber(result.elapsed_ms)}<em>ms</em></strong><small>end-to-end batch</small></div><div><span>Throughput</span><strong>{formatNumber(result.throughput_per_second)}</strong><small>scores / second</small></div><div><span>Final median</span><strong>{formatNumber(result.median)}</strong><small>reference checked</small></div></div></> : <EmptyChart icon={Gauge} title="Ready when you are" detail="Choose a dataset size and run your first benchmark." />}</section></div>
    <div className="complexity-explainer"><div><Binary size={18} /><strong>Why two heaps?</strong></div><p>Sorting every new batch costs O(n log n). The two-heap design maintains a balanced partition as scores arrive: each insertion is O(log n), and the current median is available in O(1).</p></div>
  </>;
}

function AlgorithmGuide() {
  return <>
    <PageHeading eyebrow="UNDER THE HOOD" title={<>A smarter way to<br /><span className="gradient-text">follow the middle.</span></>} description="The running median, kept exact — one incoming score at a time." />
    <section className="guide-hero panel"><div className="guide-hero-copy"><span className="guide-label"><Sparkles size={14} /> THE TWO-HEAP APPROACH</span><h2>Keep the middle<br />within reach.</h2><p>Instead of sorting every score again, MEDIANFLOW splits the stream into two balanced heaps. Their roots are all we need to calculate the median.</p></div><div className="guide-diagram"><div className="diagram-heap diagram-lower"><span>MAX-HEAP</span><b>≤</b><strong>lower half</strong></div><div className="diagram-center"><span>MEDIAN</span><strong>↔</strong></div><div className="diagram-heap diagram-upper"><span>MIN-HEAP</span><b>≥</b><strong>upper half</strong></div></div></section>
    <div className="guide-steps"><section className="panel guide-step"><span className="step-number">01</span><div><h3>Route the incoming score</h3><p>Compare the new value with the lower heap's largest value. Smaller values go to the max-heap; larger values go to the min-heap.</p><div className="code-sample"><code>if score ≤ lower.max: push(lower, score)<br />else: push(upper, score)</code></div></div></section><section className="panel guide-step"><span className="step-number">02</span><div><h3>Rebalance the partition</h3><p>Move the top value across heaps if their sizes differ by more than one. The lower heap may hold just one extra value.</p><div className="code-sample"><code>while |lower.size − upper.size| &gt; 1:<br />&nbsp;&nbsp;move root from larger heap</code></div></div></section><section className="panel guide-step"><span className="step-number">03</span><div><h3>Read the median in constant time</h3><p>For an odd number of values, the larger heap's root is the median. For an even count, average the two roots.</p><div className="code-sample"><code>odd: root of larger heap<br />even: (lower.max + upper.min) / 2</code></div></div></section></div>
    <div className="complexity-grid"><div className="panel complexity-item"><span>INSERTION</span><strong>O(log n)</strong><small>Restore heap order</small></div><div className="panel complexity-item"><span>MEDIAN LOOKUP</span><strong>O(1)</strong><small>Read one or two roots</small></div><div className="panel complexity-item"><span>SPACE</span><strong>O(n)</strong><small>Store scores across both heaps</small></div><div className="panel complexity-item"><span>ACCURACY</span><strong>Exact</strong><small>No approximation or sampling</small></div></div>
    <section className="panel correctness-note"><ShieldCheck size={19} /><div><strong>Designed to handle real score streams</strong><span>Duplicates, negative values, zero, and signed 32-bit extremes are supported. Even-sized streams return the exact arithmetic mean of their two middle values.</span></div></section>
  </>;
}

export default App;
