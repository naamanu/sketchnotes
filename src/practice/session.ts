// Practice-session state: which prompt, how long, and how time was spent in each interview phase.
// It lives on the note's metadata (NoteMeta.practice), so it travels with backups automatically.

export type Phase = { id: string; name: string; share: number; tip: string };

/** The usual shape of a system-design interview. `share` is the fraction of the session it gets. */
export const PHASES: Phase[] = [
  { id: "requirements", name: "Requirements", share: 0.15, tip: "Ask questions. Pin down features, users and what's out of scope." },
  { id: "estimates", name: "Estimates", share: 0.1, tip: "Rough numbers: QPS, storage, bandwidth. Say which ones drive the design." },
  { id: "api", name: "API & data model", share: 0.15, tip: "Sketch the main endpoints and the tables or documents behind them." },
  { id: "high-level", name: "High-level design", share: 0.25, tip: "Boxes and arrows that cover every functional requirement end to end." },
  { id: "deep-dive", name: "Deep dive", share: 0.25, tip: "Pick the hardest part. Scaling, consistency, failure handling." },
  { id: "wrap-up", name: "Wrap-up", share: 0.1, tip: "Summarise trade-offs, bottlenecks and what you'd do with more time." },
];

export const DURATIONS = [30, 45, 60] as const;

/** Self-review checklist shown when a session ends. */
export const CHECKLIST: { id: string; label: string }[] = [
  { id: "functional", label: "Clarified the functional requirements" },
  { id: "non-functional", label: "Stated non-functional goals (latency, availability, consistency)" },
  { id: "estimates", label: "Did back-of-envelope estimates and used them" },
  { id: "api", label: "Defined the API" },
  { id: "data-model", label: "Chose a data model and storage, and said why" },
  { id: "coverage", label: "High-level design covers every requirement" },
  { id: "bottlenecks", label: "Found bottlenecks and single points of failure" },
  { id: "scaling", label: "Covered scaling: caching, sharding, replication" },
  { id: "trade-offs", label: "Explained trade-offs instead of just picking" },
  { id: "on-time", label: "Finished within the time" },
];

export type PracticeReview = {
  checks: string[]; // CHECKLIST ids that were ticked
  rating: number; // 1–5
  notes: string;
  reviewedAt: number;
};

export type PracticeState = {
  promptId: string;
  durationMin: number;
  startedAt: number;
  /** Index into PHASES. Equal to PHASES.length once the session has ended. */
  phase: number;
  /** Milliseconds spent in each phase, not counting the stretch currently running. */
  spent: number[];
  /** When the clock was last started, or null while paused. */
  runningSince: number | null;
  hintsShown: number;
  endedAt?: number;
  review?: PracticeReview;
};

export function newSession(promptId: string, durationMin: number, now = Date.now()): PracticeState {
  return {
    promptId,
    durationMin,
    startedAt: now,
    phase: 0,
    spent: PHASES.map(() => 0),
    runningSince: now,
    hintsShown: 0,
  };
}

export const isFinished = (s: PracticeState) => s.phase >= PHASES.length;

/** Time per phase including the stretch that's running right now. */
export function liveSpent(s: PracticeState, now = Date.now()): number[] {
  const out = PHASES.map((_, i) => s.spent[i] ?? 0);
  if (s.runningSince !== null && !isFinished(s)) out[s.phase] += Math.max(0, now - s.runningSince);
  return out;
}

export const totalSpent = (s: PracticeState, now = Date.now()) => liveSpent(s, now).reduce((a, b) => a + b, 0);

/** Planned time for a phase, in milliseconds. */
export const budgetMs = (phase: number, durationMin: number) => Math.round(PHASES[phase].share * durationMin * 60_000);

/** Folds the running stretch into `spent` and stops the clock. */
export function pause(s: PracticeState, now = Date.now()): PracticeState {
  if (s.runningSince === null) return s;
  return { ...s, spent: liveSpent(s, now), runningSince: null };
}

export function resume(s: PracticeState, now = Date.now()): PracticeState {
  if (s.runningSince !== null || isFinished(s)) return s;
  return { ...s, runningSince: now };
}

/** Moves to another phase, keeping the clock running if it was. */
export function goToPhase(s: PracticeState, phase: number, now = Date.now()): PracticeState {
  if (isFinished(s)) return s;
  const target = Math.max(0, Math.min(PHASES.length - 1, phase));
  const wasRunning = s.runningSince !== null;
  const paused = pause(s, now);
  return { ...paused, phase: target, runningSince: wasRunning ? now : null };
}

export function finish(s: PracticeState, now = Date.now()): PracticeState {
  if (isFinished(s)) return s;
  return { ...pause(s, now), phase: PHASES.length, endedAt: now };
}

/** "12:05", or "+1:30" for time past zero when counting down. */
export function formatClock(ms: number): string {
  const sign = ms < 0 ? "+" : "";
  const total = Math.floor(Math.abs(ms) / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const sec = String(total % 60).padStart(2, "0");
  return h ? `${sign}${h}:${String(m).padStart(2, "0")}:${sec}` : `${sign}${m}:${sec}`;
}

/** "23 min" style duration for summaries. */
export const formatMinutes = (ms: number) => (ms > 0 && ms < 30_000 ? "<1 min" : `${Math.round(ms / 60_000)} min`);
