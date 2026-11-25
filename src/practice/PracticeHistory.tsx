import type { NoteMeta } from "../store";
import { promptById } from "./prompts";
import { CHECKLIST, PracticeState, formatMinutes, isFinished, totalSpent } from "./session";

type Session = { note: NoteMeta; s: PracticeState };

const dateFmt = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" });

/** Every practice note, newest first, with a few totals and the checklist items missed most often. */
export function PracticeHistory({ notes, onOpen, onClose }: {
  notes: NoteMeta[];
  onOpen: (n: NoteMeta) => void;
  onClose: () => void;
}) {
  const sessions: Session[] = notes
    .filter((n): n is NoteMeta & { practice: PracticeState } => !!n.practice)
    .map((n) => ({ note: n, s: n.practice }))
    .sort((a, b) => b.s.startedAt - a.s.startedAt);
  const reviewed = sessions.filter((x) => x.s.review);
  const avgRating = reviewed.length ? reviewed.reduce((a, x) => a + x.s.review!.rating, 0) / reviewed.length : 0;
  const practiceMs = sessions.reduce((a, x) => a + totalSpent(x.s), 0);

  const missCounts = CHECKLIST.map((c) => ({
    ...c,
    missed: reviewed.filter((x) => !x.s.review!.checks.includes(c.id)).length,
  })).filter((c) => c.missed > 0).sort((a, b) => b.missed - a.missed).slice(0, 3);

  return (
    <div className="backdrop" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog history" role="dialog" aria-label="Practice history">
        <h3>Practice history</h3>
        {sessions.length === 0 ? (
          <p>No practice sessions yet. Start one with 🎯 Practice in the sidebar.</p>
        ) : (
          <>
            <div className="stats">
              <div><b>{sessions.length}</b><span>sessions</span></div>
              <div><b>{formatMinutes(practiceMs)}</b><span>practised</span></div>
              <div><b>{avgRating ? avgRating.toFixed(1) : "—"}</b><span>avg rating</span></div>
            </div>
            {missCounts.length > 0 && (
              <div className="focus">
                <b>Most often missed</b>
                <ul>{missCounts.map((c) => <li key={c.id}>{c.label} <span className="muted">({c.missed}/{reviewed.length})</span></li>)}</ul>
              </div>
            )}
            <div className="history-list">
              {sessions.map(({ note, s }) => {
                const p = promptById(s.promptId);
                const status = !isFinished(s) ? "In progress" : s.review ? `${"★".repeat(s.review.rating)} · ${s.review.checks.length}/${CHECKLIST.length}` : "Not reviewed";
                return (
                  <button key={note.id} className="history-item" onClick={() => onOpen(note)}>
                    <span className="history-date">{dateFmt.format(s.startedAt)}</span>
                    <span className="history-title">{p?.title ?? note.title}</span>
                    <span className="muted">{formatMinutes(totalSpent(s))} / {s.durationMin}</span>
                    <span className="history-status">{status}</span>
                  </button>
                );
              })}
            </div>
          </>
        )}
        <div className="row-end"><button onClick={onClose}>Close</button></div>
      </div>
    </div>
  );
}
