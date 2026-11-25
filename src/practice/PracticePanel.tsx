import { useEffect, useMemo, useRef, useState } from "react";
import { DIFFICULTY_LABEL, PracticePrompt, promptBrief, promptById } from "./prompts";
import {
  CHECKLIST, PHASES, PracticeReview, PracticeState,
  budgetMs, finish, formatClock, formatMinutes, goToPhase, isFinished, liveSpent, pause, resume, totalSpent,
} from "./session";
import { DEFAULT_INPUT, EstimateInput, estimate, formatBytes, formatCount, formatRate, parseQuantity, summarize } from "./estimate";
import { insertTextAtViewport } from "./canvas";

type Tab = "brief" | "estimate" | "review";

/** Re-renders every second while `active`, returning the current time. */
function useNow(active: boolean) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [active]);
  return now;
}

export function PracticePanel({ noteId, state, onChange, apiRef, collapsed, onCollapse, onExpand }: {
  noteId: string;
  state: PracticeState;
  onChange: (s: PracticeState) => void;
  apiRef: React.MutableRefObject<any>;
  collapsed: boolean;
  onCollapse: () => void;
  onExpand: () => void;
}) {
  const prompt = promptById(state.promptId);
  const finished = isFinished(state);
  const [tab, setTab] = useState<Tab>(finished ? "review" : "brief");
  const now = useNow(state.runningSince !== null);

  // Leaving the note or backgrounding the app pauses the clock, so time away doesn't count.
  const latest = useRef(state);
  latest.current = state;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  useEffect(() => {
    const pauseIfRunning = () => {
      if (latest.current.runningSince !== null) onChangeRef.current(pause(latest.current));
    };
    const onHide = () => document.visibilityState === "hidden" && pauseIfRunning();
    document.addEventListener("visibilitychange", onHide);
    return () => { document.removeEventListener("visibilitychange", onHide); pauseIfRunning(); };
  }, []);

  // Collapsed: a small floating clock, so the timer keeps going while the canvas gets the full width.
  if (collapsed) {
    const left = state.durationMin * 60_000 - totalSpent(state, now);
    return (
      <button className="practice-chip" onClick={onExpand} title="Show the practice panel">
        🎯 {finished ? "Review" : formatClock(left)}{!finished && state.runningSince === null ? " ⏸" : ""}
      </button>
    );
  }

  if (!prompt) {
    return (
      <aside className="practice">
        <div className="practice-head"><b>Unknown prompt</b><button className="icon" onClick={onCollapse} aria-label="Hide panel">»</button></div>
        <p className="hint">This session uses a prompt that isn't in this version of the app.</p>
      </aside>
    );
  }

  const end = () => { onChange(finish(state)); setTab("review"); };

  return (
    <aside className="practice" aria-label="Practice interview">
      <div className="practice-head">
        <div className="practice-title">
          <span className={`badge ${prompt.difficulty}`}>{DIFFICULTY_LABEL[prompt.difficulty]}</span>
          <b>{prompt.title}</b>
        </div>
        <button className="icon" onClick={onCollapse} aria-label="Hide practice panel" title="Hide panel">»</button>
      </div>

      <Timer state={state} now={now} onChange={onChange} onEnd={end} />

      <div className="tabs" role="tablist">
        {(["brief", "estimate", "review"] as Tab[]).map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} className={tab === t ? "on" : ""} onClick={() => setTab(t)}>
            {t === "brief" ? "Brief" : t === "estimate" ? "Estimate" : "Review"}
          </button>
        ))}
      </div>

      <div className="practice-body">
        {tab === "brief" && <Brief prompt={prompt} state={state} onChange={onChange} apiRef={apiRef} />}
        {tab === "estimate" && <Estimator key={noteId} noteId={noteId} prompt={prompt} apiRef={apiRef} />}
        {tab === "review" && <Review state={state} now={now} onChange={onChange} onEnd={end} />}
      </div>
    </aside>
  );
}

// ---------- timer and phase strip ----------
function Timer({ state, now, onChange, onEnd }: {
  state: PracticeState; now: number; onChange: (s: PracticeState) => void; onEnd: () => void;
}) {
  const spent = liveSpent(state, now);
  const total = spent.reduce((a, b) => a + b, 0);
  const remaining = state.durationMin * 60_000 - total;
  const finished = isFinished(state);
  const running = state.runningSince !== null;

  if (finished) {
    return (
      <div className="timer done">
        <div className="clock">{formatClock(total)}</div>
        <div className="timer-sub">Finished · planned {state.durationMin} min</div>
      </div>
    );
  }

  const phase = PHASES[state.phase];
  const phaseLeft = budgetMs(state.phase, state.durationMin) - spent[state.phase];
  return (
    <div className="timer">
      <div className="timer-row">
        <div>
          <div className={"clock" + (remaining < 0 ? " over" : "")} aria-live="off">{formatClock(remaining)}</div>
          <div className="timer-sub">{remaining < 0 ? "over time" : "left overall"}</div>
        </div>
        <div className="timer-controls">
          <button onClick={() => onChange(running ? pause(state) : resume(state))} aria-label={running ? "Pause" : "Resume"}>
            {running ? "⏸" : "▶"}
          </button>
          <button onClick={onEnd} className="danger-text">End</button>
        </div>
      </div>

      <div className="phases" role="list">
        {PHASES.map((p, i) => {
          const budget = budgetMs(i, state.durationMin);
          const fill = Math.min(1, spent[i] / budget);
          const cls = i === state.phase ? "current" : i < state.phase ? "past" : "";
          return (
            <button key={p.id} role="listitem" className={"phase " + cls + (spent[i] > budget ? " over" : "")}
              style={{ flexGrow: p.share }} onClick={() => onChange(goToPhase(state, i))}
              title={`${p.name}: ${formatMinutes(spent[i])} of ${formatMinutes(budget)}`} aria-label={`Go to ${p.name}`}>
              <span className="phase-fill" style={{ width: `${fill * 100}%` }} />
            </button>
          );
        })}
      </div>

      <div className="phase-now">
        <div className="timer-row">
          <b>{state.phase + 1}. {phase.name}</b>
          <span className={phaseLeft < 0 ? "over" : "muted"}>
            {phaseLeft < 0 ? `${formatClock(phaseLeft)} over` : `${formatClock(phaseLeft)} left`}
          </span>
        </div>
        <p className="phase-tip">{phase.tip}</p>
        <div className="timer-row">
          <button disabled={state.phase === 0} onClick={() => onChange(goToPhase(state, state.phase - 1))}>‹ Back</button>
          {state.phase < PHASES.length - 1
            ? <button className="primary" onClick={() => onChange(goToPhase(state, state.phase + 1))}>Next: {PHASES[state.phase + 1].name} ›</button>
            : <button className="primary" onClick={onEnd}>Finish ›</button>}
        </div>
      </div>
    </div>
  );
}

// ---------- brief ----------
function Brief({ prompt, state, onChange, apiRef }: {
  prompt: PracticePrompt; state: PracticeState; onChange: (s: PracticeState) => void; apiRef: React.MutableRefObject<any>;
}) {
  const deepDivePhase = PHASES.findIndex((p) => p.id === "deep-dive");
  const showDeepDives = state.phase >= deepDivePhase;
  return (
    <>
      <p>{prompt.summary}</p>
      <h4>Functional requirements</h4>
      <ul>{prompt.functional.map((f) => <li key={f}>{f}</li>)}</ul>
      <h4>Non-functional requirements</h4>
      <ul>{prompt.nonFunctional.map((f) => <li key={f}>{f}</li>)}</ul>
      <button className="wide" onClick={() => insertTextAtViewport(apiRef.current, promptBrief(prompt), 18)}>
        ＋ Put requirements on the canvas
      </button>

      <h4>Hints <span className="muted">({state.hintsShown} / {prompt.hints.length})</span></h4>
      {state.hintsShown === 0 && <p className="muted small">Try on your own first. Hints are counted in your review.</p>}
      <ol className="hints">{prompt.hints.slice(0, state.hintsShown).map((h) => <li key={h}>{h}</li>)}</ol>
      {state.hintsShown < prompt.hints.length && (
        <button className="wide" onClick={() => onChange({ ...state, hintsShown: state.hintsShown + 1 })}>💡 Show a hint</button>
      )}

      <h4>Deep-dive topics</h4>
      {showDeepDives
        ? <ul>{prompt.deepDives.map((d) => <li key={d}>{d}</li>)}</ul>
        : <p className="muted small">Shown when you reach the deep-dive phase. An interviewer would usually pick one.</p>}
    </>
  );
}

// ---------- estimate calculator ----------
type Field = { key: keyof EstimateInput; label: string; bytes?: boolean };
const FIELDS: Field[] = [
  { key: "dau", label: "Daily active users" },
  { key: "writesPerUser", label: "Writes per user per day" },
  { key: "readsPerWrite", label: "Reads per write" },
  { key: "objectBytes", label: "Size per write", bytes: true },
  { key: "retentionYears", label: "Keep data for (years)" },
  { key: "peakFactor", label: "Peak ÷ average" },
  { key: "replication", label: "Replicas" },
];

const showValue = (f: Field, v: number) => (f.bytes ? formatBytes(v).replace(" ", "") : formatCount(v));

function Estimator({ noteId, prompt, apiRef }: { noteId: string; prompt: PracticePrompt; apiRef: React.MutableRefObject<any> }) {
  const storeKey = `practice:estimate:${noteId}`;
  const [input, setInput] = useState<EstimateInput>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(storeKey) ?? "null");
      if (saved) return { ...DEFAULT_INPUT, ...prompt.scale, ...saved };
    } catch { /* ignore a bad saved value */ }
    return { ...DEFAULT_INPUT, ...prompt.scale };
  });
  const [text, setText] = useState<Record<string, string>>(() =>
    Object.fromEntries(FIELDS.map((f) => [f.key, showValue(f, input[f.key])])));
  useEffect(() => {
    try { localStorage.setItem(storeKey, JSON.stringify(input)); } catch { /* storage full or blocked */ }
  }, [input, storeKey]);
  const result = useMemo(() => estimate(input), [input]);

  const edit = (f: Field, value: string) => {
    setText((t) => ({ ...t, [f.key]: value }));
    const n = parseQuantity(value);
    if (n !== null) setInput((i) => ({ ...i, [f.key]: n }));
  };
  const reset = () => {
    const fresh = { ...DEFAULT_INPUT, ...prompt.scale };
    setInput(fresh);
    setText(Object.fromEntries(FIELDS.map((f) => [f.key, showValue(f, fresh[f.key])])));
  };

  return (
    <>
      <p className="muted small">Starts from typical assumptions for this prompt. Type values like 10M, 1.5k or 2KB.</p>
      <div className="est-grid">
        {FIELDS.map((f) => (
          <label key={f.key}>
            <span>{f.label}</span>
            <input inputMode="decimal" value={text[f.key]} onChange={(e) => edit(f, e.target.value)}
              className={parseQuantity(text[f.key]) === null ? "invalid" : ""} />
          </label>
        ))}
      </div>
      <table className="est-out">
        <tbody>
          <tr><th>Writes / day</th><td>{formatCount(result.writesPerDay)}</td></tr>
          <tr><th>Write QPS</th><td>{formatCount(result.writeQps)} <span className="muted">peak {formatCount(result.peakWriteQps)}</span></td></tr>
          <tr><th>Read QPS</th><td>{formatCount(result.readQps)} <span className="muted">peak {formatCount(result.peakReadQps)}</span></td></tr>
          <tr><th>New data / day</th><td>{formatBytes(result.storagePerDay)}</td></tr>
          <tr><th>Total storage</th><td>{formatBytes(result.storageTotal)}</td></tr>
          <tr><th>Bandwidth in</th><td>{formatRate(result.ingressBps)}</td></tr>
          <tr><th>Bandwidth out</th><td>{formatRate(result.egressBps)}</td></tr>
        </tbody>
      </table>
      <div className="row-split">
        <button onClick={reset}>Reset</button>
        <button className="primary" onClick={() => insertTextAtViewport(apiRef.current, summarize(input, result), 16)}>
          ＋ Put on canvas
        </button>
      </div>
      <details className="cheats">
        <summary>Handy numbers</summary>
        <ul>
          <li>1 day ≈ 86,400 s ≈ 10⁵ s</li>
          <li>1M requests/day ≈ 12 QPS</li>
          <li>1B requests/day ≈ 12K QPS</li>
          <li>Memory read ~100 ns · SSD read ~100 µs · same-region round trip ~0.5 ms</li>
          <li>One server: ~10K simple QPS; one Postgres: a few K writes/s</li>
        </ul>
      </details>
    </>
  );
}

// ---------- review ----------
function Review({ state, now, onChange, onEnd }: {
  state: PracticeState; now: number; onChange: (s: PracticeState) => void; onEnd: () => void;
}) {
  const [editing, setEditing] = useState(!state.review);
  const [checks, setChecks] = useState<Set<string>>(() => new Set(state.review?.checks ?? []));
  const [rating, setRating] = useState(state.review?.rating ?? 0);
  const [notes, setNotes] = useState(state.review?.notes ?? "");

  if (!isFinished(state)) {
    return (
      <div className="review-wait">
        <p className="muted">End the session to review how it went.</p>
        <button className="primary" onClick={onEnd}>End session now</button>
      </div>
    );
  }

  const spent = liveSpent(state, now);
  const breakdown = (
    <table className="est-out">
      <tbody>
        {PHASES.map((p, i) => {
          const budget = budgetMs(i, state.durationMin);
          return (
            <tr key={p.id}>
              <th>{p.name}</th>
              <td className={spent[i] > budget * 1.2 ? "over" : ""}>
                {formatMinutes(spent[i])} <span className="muted">/ {formatMinutes(budget)}</span>
              </td>
            </tr>
          );
        })}
        <tr><th>Total</th><td>{formatMinutes(totalSpent(state, now))} <span className="muted">/ {state.durationMin} min</span></td></tr>
      </tbody>
    </table>
  );

  if (!editing && state.review) {
    const r = state.review;
    const missed = CHECKLIST.filter((c) => !r.checks.includes(c.id));
    return (
      <>
        <div className="score">
          <span className="stars" aria-label={`${r.rating} out of 5`}>{"★".repeat(r.rating)}{"☆".repeat(5 - r.rating)}</span>
          <span>{r.checks.length} / {CHECKLIST.length} checks · {state.hintsShown} hint{state.hintsShown === 1 ? "" : "s"}</span>
        </div>
        {breakdown}
        {missed.length > 0 && (<><h4>Work on next time</h4><ul>{missed.map((c) => <li key={c.id}>{c.label}</li>)}</ul></>)}
        {r.notes && (<><h4>Notes</h4><p className="review-notes">{r.notes}</p></>)}
        <button className="wide" onClick={() => setEditing(true)}>Edit review</button>
      </>
    );
  }

  const toggle = (id: string) => setChecks((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const save = () => {
    const review: PracticeReview = { checks: [...checks], rating: rating || 3, notes: notes.trim(), reviewedAt: Date.now() };
    onChange({ ...state, review });
    setEditing(false);
  };

  return (
    <>
      {breakdown}
      <h4>Did you…</h4>
      <div className="checklist">
        {CHECKLIST.map((c) => (
          <label key={c.id}>
            <input type="checkbox" checked={checks.has(c.id)} onChange={() => toggle(c.id)} /> {c.label}
          </label>
        ))}
      </div>
      <h4>How did it go overall?</h4>
      <div className="rating" role="radiogroup" aria-label="Rating">
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} role="radio" aria-checked={rating === n} className={n <= rating ? "on" : ""} onClick={() => setRating(n)}>★</button>
        ))}
      </div>
      <textarea placeholder="What would you change next time?" value={notes} onChange={(e) => setNotes(e.target.value)} rows={4} />
      <button className="primary wide" onClick={save}>Save review</button>
    </>
  );
}
