import { useMemo, useState } from "react";
import { DIFFICULTY_LABEL, Difficulty, PracticePrompt, PROMPTS, searchPrompts } from "./prompts";
import { DURATIONS } from "./session";

const LEVELS: (Difficulty | "all")[] = ["all", "easy", "medium", "hard"];

/** Modal for choosing a prompt and session length. `practiced` maps prompt id → times done. */
export function PromptPicker({ practiced, onStart, onClose }: {
  practiced: Record<string, number>;
  onStart: (p: PracticePrompt, durationMin: number) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [level, setLevel] = useState<Difficulty | "all">("all");
  const [duration, setDuration] = useState<number>(() => Number(localStorage.getItem("practice:duration")) || 45);
  const [chosen, setChosen] = useState<string | null>(null);
  const list = useMemo(() => searchPrompts(query, level), [query, level]);
  const prompt = PROMPTS.find((p) => p.id === chosen) ?? null;

  const start = (p: PracticePrompt) => {
    localStorage.setItem("practice:duration", String(duration));
    onStart(p, duration);
  };

  const surprise = () => {
    // Prefer prompts done the fewest times, so a random pick also spreads practice out.
    const pool = list.length ? list : PROMPTS;
    const least = Math.min(...pool.map((p) => practiced[p.id] ?? 0));
    const fresh = pool.filter((p) => (practiced[p.id] ?? 0) === least);
    setChosen(fresh[Math.floor(Math.random() * fresh.length)].id);
  };

  return (
    <div className="backdrop" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog picker" role="dialog" aria-label="Start a practice interview">
        <h3>Practice interview</h3>
        <div className="picker-filters">
          <input placeholder="Search prompts…" value={query} onChange={(e) => setQuery(e.target.value)} />
          <div className="segmented" role="group" aria-label="Difficulty">
            {LEVELS.map((l) => (
              <button key={l} className={level === l ? "on" : ""} onClick={() => setLevel(l)}>
                {l === "all" ? "All" : DIFFICULTY_LABEL[l]}
              </button>
            ))}
          </div>
        </div>
        <div className="picker-list">
          {list.map((p) => (
            <button key={p.id} className={"picker-item" + (chosen === p.id ? " on" : "")} onClick={() => setChosen(p.id)}>
              <span className="picker-title">
                {p.title}
                {practiced[p.id] ? <span className="done-count"> · done {practiced[p.id]}×</span> : null}
              </span>
              <span className={`badge ${p.difficulty}`}>{DIFFICULTY_LABEL[p.difficulty]}</span>
              <span className="picker-summary">{p.summary}</span>
            </button>
          ))}
          {list.length === 0 && <p className="hint">No prompts match.</p>}
        </div>
        {prompt && (
          <div className="picker-detail">
            <b>You'll design:</b> {prompt.summary}
            <div className="tags">{prompt.tags.map((t) => <span key={t} className="tag">{t}</span>)}</div>
          </div>
        )}
        <div className="picker-foot">
          <label>
            Length{" "}
            <select value={duration} onChange={(e) => setDuration(Number(e.target.value))}>
              {DURATIONS.map((d) => <option key={d} value={d}>{d} min</option>)}
            </select>
          </label>
          <span className="spacer" />
          <button onClick={surprise}>🎲 Surprise me</button>
          <button onClick={onClose}>Cancel</button>
          <button className="primary" disabled={!prompt} onClick={() => prompt && start(prompt)}>Start</button>
        </div>
      </div>
    </div>
  );
}
