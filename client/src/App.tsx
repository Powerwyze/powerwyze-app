import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  Bot,
  CalendarClock,
  CheckCircle2,
  CircleAlert,
  KanbanSquare,
  Loader2,
  LogOut,
  Phone,
  Play,
  RefreshCw,
  Save,
  Send,
  Settings,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { Logo } from "@/components/Logo";

type ApiError = Error & {
  status?: number;
  payload?: any;
};

type User = {
  id: number;
  email: string;
  name: string;
  phone: string | null;
  standupTime: string;
  eodTime: string;
  timezone: string;
};

type Board = {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  kind: string;
};

type Column = {
  id: number;
  board_id: number;
  name: string;
  position: number;
};

type Card = {
  id: number;
  board_id: number;
  column_id: number;
  title: string;
  description: string | null;
  priority: string | null;
  due_date: string | null;
  source: string | null;
};

type CallRecord = {
  id: number;
  kind: string;
  status: string;
  scheduled_for?: string;
  scheduledFor?: string;
  summary: string | null;
  action_items_created?: number | null;
  actionItemsCreated?: number | null;
  twilio_call_sid?: string | null;
};

type BoardDetail = {
  board: Board;
  columns: Column[];
  cards: Card[];
};

type View = "home" | "boards" | "calls" | "profile";

const navItems: { id: View; label: string; icon: typeof KanbanSquare }[] = [
  { id: "home", label: "Command", icon: Sparkles },
  { id: "boards", label: "Boards", icon: KanbanSquare },
  { id: "calls", label: "Calls", icon: Phone },
  { id: "profile", label: "Profile", icon: Settings },
];

function normalizeUser(raw: any): User {
  return {
    id: raw.id,
    email: raw.email,
    name: raw.name,
    phone: raw.phone ?? null,
    standupTime: raw.standupTime ?? raw.standup_time ?? "09:00",
    eodTime: raw.eodTime ?? raw.eod_time ?? "17:00",
    timezone: raw.timezone ?? "America/New_York",
  };
}

async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    ...options,
    credentials: "include",
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.headers || {}),
    },
  });
  const text = await response.text();
  let payload: any = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = text;
  }

  if (!response.ok) {
    const message =
      typeof payload === "object" && payload?.message
        ? payload.message
        : typeof payload === "string" && payload
          ? payload
          : response.statusText;
    const err = new Error(message) as ApiError;
    err.status = response.status;
    err.payload = payload;
    throw err;
  }
  return payload as T;
}

function formatError(error: unknown) {
  const err = error as ApiError;
  if (!err) return "Unknown error";
  const details = err.payload && typeof err.payload === "object" ? err.payload : null;
  if (details?.code || details?.moreInfo || details?.status) {
    return [err.message, details.code && `code ${details.code}`, details.status && `status ${details.status}`, details.moreInfo]
      .filter(Boolean)
      .join(" | ");
  }
  return err.message || "Unknown error";
}

function App() {
  const [me, setMe] = useState<User | null>(null);
  const [view, setView] = useState<View>(() => {
    const hash = window.location.hash.replace("#/", "") as View;
    return navItems.some((item) => item.id === hash) ? hash : "home";
  });
  const [booting, setBooting] = useState(true);

  useEffect(() => {
    const syncHash = () => {
      const next = window.location.hash.replace("#/", "") as View;
      if (navItems.some((item) => item.id === next)) setView(next);
    };
    window.addEventListener("hashchange", syncHash);
    return () => window.removeEventListener("hashchange", syncHash);
  }, []);

  useEffect(() => {
    void refreshMe().finally(() => setBooting(false));
  }, []);

  async function refreshMe() {
    try {
      const data = await api<{ user: any }>("/api/auth/me");
      setMe(normalizeUser(data.user));
    } catch {
      setMe(null);
    }
  }

  function navigate(next: View) {
    setView(next);
    window.location.hash = `#/${next}`;
  }

  if (booting) {
    return (
      <main className="splash">
        <Logo className="splash-logo" />
        <Loader2 className="spin" />
      </main>
    );
  }

  if (!me) {
    return <LoginScreen onLogin={async () => refreshMe()} />;
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-lockup">
          <Logo className="brand-logo" />
          <div>
            <strong>PowerWyze</strong>
            <span>Operating console</span>
          </div>
        </div>

        <nav className="nav-list">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                className={`nav-button ${view === item.id ? "active" : ""}`}
                onClick={() => navigate(item.id)}
              >
                <Icon size={18} />
                {item.label}
              </button>
            );
          })}
        </nav>

        <div className="sidebar-footer">
          <div className="mini-label">Signed in</div>
          <div className="sidebar-user">{me.email}</div>
          <button
            className="ghost-button"
            onClick={async () => {
              await api("/api/auth/logout", { method: "POST" });
              setMe(null);
            }}
          >
            <LogOut size={16} />
            Log out
          </button>
        </div>
      </aside>

      <main className="workspace">
        <header className="topbar">
          <div>
            <p className="mini-label">Today</p>
            <h1>{viewTitle(view)}</h1>
          </div>
          <div className="status-pill">
            <ShieldCheck size={16} />
            Session protected
          </div>
        </header>

        {view === "home" && <HomeView me={me} go={navigate} />}
        {view === "boards" && <BoardsView />}
        {view === "calls" && <CallsView me={me} onUserRefresh={refreshMe} />}
        {view === "profile" && <ProfileView me={me} onSaved={refreshMe} />}
      </main>
    </div>
  );
}

function viewTitle(view: View) {
  switch (view) {
    case "boards":
      return "Boards";
    case "calls":
      return "Calls";
    case "profile":
      return "Profile";
    default:
      return "Command center";
  }
}

function LoginScreen({ onLogin }: { onLogin: () => Promise<void> }) {
  const [email, setEmail] = useState("bryan.stewart@powerwyze.com");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      await api("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      await onLogin();
    } catch (err) {
      setError(formatError(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="login-page">
      <section className="login-panel">
        <div className="brand-lockup">
          <Logo className="brand-logo" />
          <div>
            <strong>PowerWyze</strong>
            <span>Daily execution, without the mess.</span>
          </div>
        </div>
        <div className="login-copy">
          <h1>Run your boards, calls, and follow-through from one place.</h1>
          <p>Fresh rebuild. Same data. Cleaner workflow.</p>
        </div>
        <form className="form-stack" onSubmit={submit}>
          <label>
            Email
            <input value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" />
          </label>
          <label>
            Password
            <input
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              type="password"
              autoComplete="current-password"
              autoFocus
            />
          </label>
          {error && <div className="alert danger">{error}</div>}
          <button className="primary-button" disabled={loading || !email || !password}>
            {loading ? <Loader2 className="spin" size={18} /> : <ArrowRight size={18} />}
            Sign in
          </button>
        </form>
      </section>
      <section className="login-visual">
        <div className="orbital-card">
          <Phone size={28} />
          <strong>Voice standups</strong>
          <span>Dial, brief, capture, route.</span>
        </div>
        <div className="orbital-card">
          <KanbanSquare size={28} />
          <strong>Board focus</strong>
          <span>See priority and movement fast.</span>
        </div>
        <div className="orbital-card">
          <Bot size={28} />
          <strong>Agent memory</strong>
          <span>Calls turn into next actions.</span>
        </div>
      </section>
    </main>
  );
}

function HomeView({ me, go }: { me: User; go: (view: View) => void }) {
  return (
    <section className="content-grid">
      <div className="hero-panel">
        <div className="hero-text">
          <h2>Good to see you, {me.name.split(" ")[0] || "there"}.</h2>
          <p>
            Your rebuilt workspace is intentionally boring where it matters: fewer moving pieces, clearer failure states,
            and direct access to the phone-call controls.
          </p>
        </div>
        <div className="action-row">
          <button className="primary-button" onClick={() => go("calls")}>
            <Phone size={18} />
            Open call console
          </button>
          <button className="secondary-button" onClick={() => go("boards")}>
            <KanbanSquare size={18} />
            Review boards
          </button>
        </div>
      </div>

      <div className="metric-strip">
        <InfoTile icon={CalendarClock} label="Standup" value={me.standupTime} />
        <InfoTile icon={CalendarClock} label="EOD" value={me.eodTime} />
        <InfoTile icon={Phone} label="Phone" value={me.phone || "Not set"} />
      </div>
    </section>
  );
}

function InfoTile({ icon: Icon, label, value }: { icon: typeof Phone; label: string; value: string }) {
  return (
    <div className="info-tile">
      <Icon size={18} />
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function BoardsView() {
  const [boards, setBoards] = useState<Board[]>([]);
  const [selected, setSelected] = useState("");
  const [detail, setDetail] = useState<BoardDetail | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void loadBoards();
  }, []);

  useEffect(() => {
    if (selected) void loadBoard(selected);
  }, [selected]);

  async function loadBoards() {
    setLoading(true);
    setError("");
    try {
      const data = await api<{ boards: Board[] }>("/api/boards");
      setBoards(data.boards);
      setSelected((current) => current || data.boards[0]?.slug || "");
    } catch (err) {
      setError(formatError(err));
    } finally {
      setLoading(false);
    }
  }

  async function loadBoard(slug: string) {
    setError("");
    try {
      setDetail(await api<BoardDetail>(`/api/boards/${slug}`));
    } catch (err) {
      setDetail(null);
      setError(formatError(err));
    }
  }

  if (loading) return <LoadingBlock label="Loading boards" />;

  return (
    <section className="stack">
      {error && <div className="alert danger">{error}</div>}
      <div className="section-toolbar">
        <div className="segmented">
          {boards.map((board) => (
            <button key={board.id} className={selected === board.slug ? "active" : ""} onClick={() => setSelected(board.slug)}>
              {board.name}
            </button>
          ))}
        </div>
        <button className="icon-button" onClick={loadBoards} title="Refresh boards">
          <RefreshCw size={16} />
        </button>
      </div>
      {detail && <BoardColumns detail={detail} />}
    </section>
  );
}

function BoardColumns({ detail }: { detail: BoardDetail }) {
  const cardsByColumn = useMemo(() => {
    const groups = new Map<number, Card[]>();
    for (const card of detail.cards) {
      const key = card.column_id;
      groups.set(key, [...(groups.get(key) || []), card]);
    }
    return groups;
  }, [detail.cards]);

  return (
    <div className="board-lane-wrap">
      {detail.columns.map((column) => (
        <section className="lane" key={column.id}>
          <header>
            <strong>{column.name}</strong>
            <span>{cardsByColumn.get(column.id)?.length || 0}</span>
          </header>
          <div className="lane-cards">
            {(cardsByColumn.get(column.id) || []).map((card) => (
              <article className={`task-card priority-${card.priority || "medium"}`} key={card.id}>
                <strong>{card.title}</strong>
                {card.description && <p>{card.description}</p>}
                <footer>
                  <span>{card.source || "manual"}</span>
                  {card.due_date && <span>{new Date(card.due_date).toLocaleDateString()}</span>}
                </footer>
              </article>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function CallsView({ me, onUserRefresh }: { me: User; onUserRefresh: () => Promise<void> }) {
  const [calls, setCalls] = useState<CallRecord[]>([]);
  const [dialResult, setDialResult] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [dialing, setDialing] = useState<"standup" | "eod" | null>(null);
  const [simCallId, setSimCallId] = useState<number | null>(null);
  const [history, setHistory] = useState<{ role: "agent" | "user"; content: string }[]>([]);
  const [reply, setReply] = useState("");

  useEffect(() => {
    void loadCalls();
  }, []);

  async function loadCalls() {
    setLoading(true);
    setError("");
    try {
      const data = await api<{ calls: CallRecord[] }>("/api/calls");
      setCalls(data.calls || []);
    } catch (err) {
      setError(formatError(err));
    } finally {
      setLoading(false);
    }
  }

  async function dial(kind: "standup" | "eod") {
    setDialing(kind);
    setError("");
    setDialResult("");
    try {
      const data = await api<any>("/api/calls/dial", {
        method: "POST",
        body: JSON.stringify({ kind }),
      });
      setDialResult(`Dial started. Call ID ${data.callId}. Twilio SID ${data.twilioSid}.`);
      await loadCalls();
    } catch (err) {
      setError(formatError(err));
    } finally {
      setDialing(null);
    }
  }

  async function startBrowserCall(kind: "standup" | "eod") {
    setError("");
    setDialResult("");
    try {
      const data = await api<{ call: { id: number } }>("/api/calls/start", {
        method: "POST",
        body: JSON.stringify({ kind }),
      });
      setSimCallId(data.call.id);
      const first = await api<{ reply: string }>(`/api/calls/${data.call.id}/turn`, {
        method: "POST",
        body: JSON.stringify({ history: [] }),
      });
      setHistory([{ role: "agent", content: first.reply }]);
    } catch (err) {
      setError(formatError(err));
    }
  }

  async function sendReply(event: React.FormEvent) {
    event.preventDefault();
    if (!reply.trim() || !simCallId) return;
    const next = [...history, { role: "user" as const, content: reply.trim() }];
    setHistory(next);
    setReply("");
    try {
      const data = await api<{ reply: string }>(`/api/calls/${simCallId}/turn`, {
        method: "POST",
        body: JSON.stringify({ history: next }),
      });
      setHistory([...next, { role: "agent", content: data.reply }]);
    } catch (err) {
      setError(formatError(err));
    }
  }

  return (
    <section className="content-grid">
      <div className="call-console">
        <header>
          <div>
            <h2>Phone call console</h2>
            <p>Real phone dials through Twilio. Browser calls test the agent flow without using the phone network.</p>
          </div>
          <button className="icon-button" onClick={loadCalls} title="Refresh calls">
            <RefreshCw size={16} />
          </button>
        </header>

        <div className="call-target">
          <Phone size={22} />
          <div>
            <span>Dial target</span>
            <strong>{me.phone || "No phone number saved"}</strong>
          </div>
          <button className="secondary-button compact" onClick={() => void onUserRefresh()}>
            Refresh profile
          </button>
        </div>

        {!me.phone && (
          <div className="alert warning">
            Add your phone number in Profile before using Twilio dialing. Use E.164 format, like +18577076043.
          </div>
        )}
        {error && <div className="alert danger">{error}</div>}
        {dialResult && <div className="alert success">{dialResult}</div>}

        <div className="call-actions">
          <button className="primary-button" disabled={!me.phone || !!dialing} onClick={() => dial("standup")}>
            {dialing === "standup" ? <Loader2 className="spin" size={18} /> : <Phone size={18} />}
            Dial standup
          </button>
          <button className="primary-button" disabled={!me.phone || !!dialing} onClick={() => dial("eod")}>
            {dialing === "eod" ? <Loader2 className="spin" size={18} /> : <Phone size={18} />}
            Dial EOD
          </button>
          <button className="secondary-button" onClick={() => startBrowserCall("standup")}>
            <Play size={18} />
            Test standup in browser
          </button>
        </div>

        {simCallId && (
          <div className="sim-call">
            <div className="transcript">
              {history.map((turn, index) => (
                <div className={`bubble ${turn.role}`} key={`${turn.role}-${index}`}>
                  {turn.content}
                </div>
              ))}
            </div>
            <form className="reply-form" onSubmit={sendReply}>
              <input value={reply} onChange={(event) => setReply(event.target.value)} placeholder="Reply to the agent" />
              <button className="icon-button" type="submit">
                <Send size={16} />
              </button>
            </form>
          </div>
        )}
      </div>

      <aside className="history-panel">
        <h3>Recent calls</h3>
        {loading && <LoadingBlock label="Loading calls" />}
        {!loading && calls.length === 0 && <p className="muted">No calls recorded yet.</p>}
        {calls.map((call) => (
          <article className="call-row" key={call.id}>
            <div>
              <strong>{call.kind === "eod" ? "EOD" : "Standup"}</strong>
              <span>{new Date(call.scheduled_for || call.scheduledFor || Date.now()).toLocaleString()}</span>
            </div>
            <span className={`status-dot ${call.status}`}>{call.status}</span>
            {call.summary && <p>{call.summary}</p>}
          </article>
        ))}
      </aside>
    </section>
  );
}

function ProfileView({ me, onSaved }: { me: User; onSaved: () => Promise<void> }) {
  const [name, setName] = useState(me.name);
  const [phone, setPhone] = useState(me.phone || "");
  const [standupTime, setStandupTime] = useState(me.standupTime);
  const [eodTime, setEodTime] = useState(me.eodTime);
  const [timezone, setTimezone] = useState(me.timezone);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    setError("");
    try {
      await api("/api/profile", {
        method: "PATCH",
        body: JSON.stringify({ name, phone, standupTime, eodTime, timezone }),
      });
      await onSaved();
      setMessage("Profile saved.");
    } catch (err) {
      setError(formatError(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="profile-form" onSubmit={save}>
      <div className="form-header">
        <h2>Profile and call routing</h2>
        <p>These values drive the Twilio dial target and daily call schedule.</p>
      </div>
      {message && <div className="alert success">{message}</div>}
      {error && <div className="alert danger">{error}</div>}
      <div className="form-grid">
        <label>
          Full name
          <input value={name} onChange={(event) => setName(event.target.value)} />
        </label>
        <label>
          Email
          <input value={me.email} disabled />
        </label>
        <label>
          Phone number
          <input value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="+18577076043" />
        </label>
        <label>
          Timezone
          <input value={timezone} onChange={(event) => setTimezone(event.target.value)} />
        </label>
        <label>
          Standup time
          <input type="time" value={standupTime} onChange={(event) => setStandupTime(event.target.value)} />
        </label>
        <label>
          EOD time
          <input type="time" value={eodTime} onChange={(event) => setEodTime(event.target.value)} />
        </label>
      </div>
      <button className="primary-button" disabled={saving}>
        {saving ? <Loader2 className="spin" size={18} /> : <Save size={18} />}
        Save profile
      </button>
    </form>
  );
}

function LoadingBlock({ label }: { label: string }) {
  return (
    <div className="loading-block">
      <Loader2 className="spin" size={18} />
      {label}
    </div>
  );
}

export default App;
