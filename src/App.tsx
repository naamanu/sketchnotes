import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Excalidraw, FONT_FAMILY, convertToExcalidrawElements, exportToBlob } from "@excalidraw/excalidraw";
import "@excalidraw/excalidraw/index.css";
import {
  Backup, DiagramContent, NoteContent, Folder, Index, NoteMeta,
  deleteContent, descendantFolderIds, loadContent, loadIndex, makeBackup,
  restoreBackup, saveContent, saveIndex, uid,
} from "./store";
import { shareFile } from "./share";
import { inkAvailable } from "./ink";
import { convertInkToText } from "./diagramInk";

type Theme = "light" | "dark";

// ---------- tiny promise-based dialog ----------
type DialogSpec =
  | { kind: "prompt"; title: string; value: string; resolve: (v: string | null) => void }
  | { kind: "confirm"; title: string; body?: string; resolve: (v: boolean) => void }
  | { kind: "pick"; title: string; options: { label: string; value: string; danger?: boolean }[]; resolve: (v: string | null) => void };

function useDialog() {
  const [spec, setSpec] = useState<DialogSpec | null>(null);
  const close = () => setSpec(null);
  const prompt = (title: string, value = "") =>
    new Promise<string | null>((resolve) => setSpec({ kind: "prompt", title, value, resolve }));
  const confirm = (title: string, body?: string) =>
    new Promise<boolean>((resolve) => setSpec({ kind: "confirm", title, body, resolve }));
  const pick = (title: string, options: { label: string; value: string; danger?: boolean }[]) =>
    new Promise<string | null>((resolve) => setSpec({ kind: "pick", title, options, resolve }));
  return { spec, close, prompt, confirm, pick };
}

function Dialog({ spec, close }: { spec: DialogSpec; close: () => void }) {
  const [text, setText] = useState(spec.kind === "prompt" ? spec.value : "");
  const cancel = () => {
    close();
    spec.kind === "confirm" ? spec.resolve(false) : spec.resolve(null);
  };
  return (
    <div className="backdrop" onPointerDown={(e) => e.target === e.currentTarget && cancel()}>
      <div className="dialog">
        <h3>{spec.title}</h3>
        {spec.kind === "prompt" && (
          <form onSubmit={(e) => { e.preventDefault(); close(); spec.resolve(text.trim() || null); }}>
            <input autoFocus value={text} onChange={(e) => setText(e.target.value)} onFocus={(e) => e.target.select()} />
            <div className="row-end">
              <button type="button" onClick={cancel}>Cancel</button>
              <button type="submit" className="primary">OK</button>
            </div>
          </form>
        )}
        {spec.kind === "confirm" && (
          <>
            {spec.body && <p>{spec.body}</p>}
            <div className="row-end">
              <button onClick={cancel}>Cancel</button>
              <button className="danger" onClick={() => { close(); spec.resolve(true); }}>Delete</button>
            </div>
          </>
        )}
        {spec.kind === "pick" && (
          <div className="pick-list">
            {spec.options.map((o) => (
              <button key={o.value} className={o.danger ? "danger-text" : ""} onClick={() => { close(); spec.resolve(o.value); }}>
                {o.label}
              </button>
            ))}
            <button onClick={cancel}>Cancel</button>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------- editors ----------
function useDebounced<T>(fn: (v: T) => void, ms: number) {
  const timer = useRef<number | undefined>(undefined);
  const pending = useRef<{ v: T } | null>(null);
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const flush = useCallback(() => {
    clearTimeout(timer.current);
    if (pending.current) { fnRef.current(pending.current.v); pending.current = null; }
  }, []);
  const call = useCallback((v: T) => {
    pending.current = { v };
    clearTimeout(timer.current);
    timer.current = window.setTimeout(flush, ms);
  }, [flush, ms]);
  useEffect(() => {
    const onHide = () => document.visibilityState === "hidden" && flush();
    document.addEventListener("visibilitychange", onHide);
    return () => { document.removeEventListener("visibilitychange", onHide); flush(); };
  }, [flush]);
  return call;
}

/** Older versions had plain-text notes; turn their text into a text element on a canvas. */
function toDiagram(c: NoteContent | undefined): DiagramContent {
  if (c && typeof c === "object") return c;
  const elements = typeof c === "string" && c.trim()
    ? convertToExcalidrawElements([{ type: "text", x: 0, y: 0, text: c, fontFamily: FONT_FAMILY.Excalifont, fontSize: 20 } as any])
    : [];
  return { elements, appState: {}, files: {} };
}

const sceneVersion = (els: readonly any[]) => els.reduce((s, e) => s + (e.version ?? 0), els.length);

function DiagramEditor({ note, theme, onTouch, apiRef }: {
  note: NoteMeta; theme: Theme; onTouch: () => void; apiRef: React.MutableRefObject<any>;
}) {
  const [initial, setInitial] = useState<DiagramContent | null>(null);
  const [autoText, setAutoText] = useState(() => inkAvailable && localStorage.getItem("inkToText") !== "0");
  const [selectedInk, setSelectedInk] = useState<string[]>([]);
  const [status, setStatus] = useState("");
  const lastVersion = useRef(0);
  const knownInk = useRef(new Set<string>());
  const pendingInk = useRef(new Set<string>());
  const inkTimer = useRef<number | undefined>(undefined);
  const autoRef = useRef(autoText);
  autoRef.current = autoText;

  useEffect(() => {
    loadContent(note.id).then((c) => {
      const d = toDiagram(c);
      lastVersion.current = sceneVersion(d.elements);
      knownInk.current = new Set(d.elements.filter((e) => e.type === "freedraw").map((e) => e.id));
      setInitial(d);
    });
    return () => clearTimeout(inkTimer.current);
  }, [note.id]);
  useEffect(() => { localStorage.setItem("inkToText", autoText ? "1" : "0"); }, [autoText]);
  const save = useDebounced<DiagramContent>((d) => saveContent(note.id, d), 500);

  const convert = async (ids: Set<string>) => {
    if (!apiRef.current || !ids.size) return;
    try {
      setStatus("Converting handwriting…");
      const n = await convertInkToText(apiRef.current, ids);
      setStatus(n ? "" : "Couldn't read that — left it as ink");
      if (!n) setTimeout(() => setStatus(""), 2000);
    } catch (e) {
      setStatus((e as Error).message);
      setTimeout(() => setStatus(""), 4000);
    }
  };

  const onChange = (elements: readonly any[], appState: any, files: any) => {
    const live = elements.filter((e) => !e.isDeleted);
    const { viewBackgroundColor, gridModeEnabled, scrollX, scrollY, zoom } = appState;
    save({ elements: live, appState: { viewBackgroundColor, gridModeEnabled, scrollX, scrollY, zoom }, files });
    const v = sceneVersion(elements);
    if (v !== lastVersion.current) { lastVersion.current = v; onTouch(); }

    // Selected handwriting (for the manual "convert" button).
    const sel = live.filter((e) => e.type === "freedraw" && appState.selectedElementIds?.[e.id]).map((e) => e.id);
    if (sel.join() !== selectedInk.join()) setSelectedInk(sel);

    // Auto-convert: collect finished pen strokes; convert after a pause in writing.
    if (appState.newElement) { clearTimeout(inkTimer.current); return; }
    let added = false;
    for (const e of live) {
      if (e.type === "freedraw" && !knownInk.current.has(e.id)) {
        knownInk.current.add(e.id);
        if (autoRef.current) { pendingInk.current.add(e.id); added = true; }
      }
    }
    if (added) {
      clearTimeout(inkTimer.current);
      inkTimer.current = window.setTimeout(() => {
        const ids = pendingInk.current;
        pendingInk.current = new Set();
        convert(ids);
      }, 1100);
    }
  };

  if (!initial) return <div className="empty">Loading…</div>;
  return (
    <div className="canvas-wrap">
      <Excalidraw
        excalidrawAPI={(api) => (apiRef.current = api)}
        initialData={{
          ...initial,
          appState: { ...initial.appState, collaborators: new Map(), currentItemFontFamily: FONT_FAMILY.Excalifont },
        } as any}
        theme={theme}
        UIOptions={{ canvasActions: { loadScene: false, saveToActiveFile: false, export: false, saveAsImage: false } }}
        onChange={onChange}
      />
      {inkAvailable && (
        <div className="ink-bar">
          {status && <span className="status">{status}</span>}
          {selectedInk.length > 0 && (
            <button onClick={() => convert(new Set(selectedInk))}>Aa Convert selection</button>
          )}
          <button className={autoText ? "on" : ""} onClick={() => setAutoText(!autoText)}
            title="Turn pen handwriting into text automatically">
            ✍️→Aa {autoText ? "On" : "Off"}
          </button>
        </div>
      )}
    </div>
  );
}

// ---------- sidebar tree ----------
const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name);
const byUpdated = (a: NoteMeta, b: NoteMeta) => b.updatedAt - a.updatedAt;

function Tree(props: {
  index: Index; parentId: string | null; depth: number; filter: string;
  expanded: Set<string>; selectedNote: string | null; activeFolder: string | null;
  onFolder: (f: Folder) => void; onFolderMenu: (f: Folder) => void;
  onNote: (n: NoteMeta) => void; onNoteMenu: (n: NoteMeta) => void;
}) {
  const { index, parentId, depth, filter, expanded } = props;
  const folders = index.folders.filter((f) => f.parentId === parentId).sort(byName);
  const notes = index.notes
    .filter((n) => n.folderId === parentId && n.title.toLowerCase().includes(filter))
    .sort(byUpdated);
  const pad = { paddingLeft: 10 + depth * 16 };
  return (
    <>
      {folders.map((f) => {
        const open = expanded.has(f.id) || !!filter;
        return (
          <div key={f.id}>
            <div className={"item folder" + (props.activeFolder === f.id ? " active" : "")} style={pad}>
              <button className="item-main" onClick={() => props.onFolder(f)}>
                <span className="chev">{open ? "▾" : "▸"}</span>📁 {f.name}
              </button>
              <button className="more" onClick={() => props.onFolderMenu(f)} aria-label="Folder actions">⋯</button>
            </div>
            {open && <Tree {...props} parentId={f.id} depth={depth + 1} />}
          </div>
        );
      })}
      {notes.map((n) => (
        <div key={n.id} className={"item" + (props.selectedNote === n.id ? " selected" : "")} style={pad}>
          <button className="item-main" onClick={() => props.onNote(n)}>
            <span className="chev" />✏️ {n.title || "Untitled"}
          </button>
          <button className="more" onClick={() => props.onNoteMenu(n)} aria-label="Note actions">⋯</button>
        </div>
      ))}
    </>
  );
}

// ---------- app ----------
export default function App() {
  const [index, setIndex] = useState<Index | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(() => localStorage.getItem("selected"));
  const [activeFolder, setActiveFolder] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(JSON.parse(localStorage.getItem("expanded") ?? "[]")));
  const [sidebar, setSidebar] = useState(() => !(window.innerWidth < 900 && localStorage.getItem("selected")));
  const [filter, setFilter] = useState("");
  const [theme, setTheme] = useState<Theme>(() =>
    (localStorage.getItem("theme") as Theme) ?? (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"));
  const dialog = useDialog();
  const apiRef = useRef<any>(null);
  const importRef = useRef<HTMLInputElement>(null);

  useEffect(() => { loadIndex().then(setIndex); }, []);
  useEffect(() => { localStorage.setItem("theme", theme); document.documentElement.dataset.theme = theme; }, [theme]);
  useEffect(() => { localStorage.setItem("expanded", JSON.stringify([...expanded])); }, [expanded]);
  useEffect(() => { selectedId ? localStorage.setItem("selected", selectedId) : localStorage.removeItem("selected"); }, [selectedId]);

  const update = useCallback((fn: (i: Index) => Index) => {
    setIndex((prev) => { if (!prev) return prev; const next = fn(prev); saveIndex(next); return next; });
  }, []);

  const note = useMemo(() => index?.notes.find((n) => n.id === selectedId) ?? null, [index, selectedId]);
  const narrow = () => window.innerWidth < 900;

  const patchNote = (id: string, patch: Partial<NoteMeta>) =>
    update((i) => ({ ...i, notes: i.notes.map((n) => (n.id === id ? { ...n, ...patch } : n)) }));
  const touch = useCallback(() => {
    if (selectedId) update((i) => ({ ...i, notes: i.notes.map((n) => (n.id === selectedId ? { ...n, updatedAt: Date.now() } : n)) }));
  }, [selectedId, update]);

  const folderPath = (id: string | null): string => {
    const parts: string[] = [];
    let f = index?.folders.find((x) => x.id === id);
    while (f) { parts.unshift(f.name); f = index?.folders.find((x) => x.id === f!.parentId); }
    return parts.join(" / ");
  };

  const openNote = (n: NoteMeta) => { setSelectedId(n.id); setActiveFolder(n.folderId); if (narrow()) setSidebar(false); };

  const createNote = async (folderId = activeFolder) => {
    const title = await dialog.prompt("New diagram", "Untitled diagram");
    if (!title) return;
    const now = Date.now();
    const n: NoteMeta = { id: uid(), title, folderId, kind: "diagram", createdAt: now, updatedAt: now };
    await saveContent(n.id, { elements: [], appState: {}, files: {} });
    update((i) => ({ ...i, notes: [...i.notes, n] }));
    if (folderId) setExpanded((s) => new Set(s).add(folderId));
    openNote(n);
  };

  const createFolder = async (parentId = activeFolder) => {
    const name = await dialog.prompt(parentId ? `New folder in “${folderPath(parentId)}”` : "New folder");
    if (!name) return;
    const f: Folder = { id: uid(), name, parentId, createdAt: Date.now() };
    update((i) => ({ ...i, folders: [...i.folders, f] }));
    setExpanded((s) => { const n = new Set(s).add(f.id); if (parentId) n.add(parentId); return n; });
    setActiveFolder(f.id);
  };

  const pickFolder = async (title: string, exclude?: Set<string>) => {
    const opts = [{ label: "🏠 Top level", value: "__root" }].concat(
      index!.folders.filter((f) => !exclude?.has(f.id))
        .map((f) => ({ label: "📁 " + folderPath(f.id), value: f.id }))
        .sort((a, b) => a.label.localeCompare(b.label)));
    const v = await dialog.pick(title, opts);
    return v === null ? undefined : v === "__root" ? null : v;
  };

  const folderMenu = async (f: Folder) => {
    setActiveFolder(f.id);
    const a = await dialog.pick(f.name, [
      { label: "✏️ New diagram here", value: "diagram" },
      { label: "📁 New subfolder", value: "sub" },
      { label: "Rename", value: "rename" },
      { label: "Move to…", value: "move" },
      { label: "Delete folder", value: "delete", danger: true },
    ]);
    if (a === "diagram") createNote(f.id);
    else if (a === "sub") createFolder(f.id);
    else if (a === "rename") {
      const name = await dialog.prompt("Rename folder", f.name);
      if (name) update((i) => ({ ...i, folders: i.folders.map((x) => (x.id === f.id ? { ...x, name } : x)) }));
    } else if (a === "move") {
      const to = await pickFolder(`Move “${f.name}” to`, descendantFolderIds(index!.folders, f.id));
      if (to !== undefined) update((i) => ({ ...i, folders: i.folders.map((x) => (x.id === f.id ? { ...x, parentId: to } : x)) }));
    } else if (a === "delete") {
      const ids = descendantFolderIds(index!.folders, f.id);
      const doomed = index!.notes.filter((n) => n.folderId && ids.has(n.folderId));
      if (!(await dialog.confirm(`Delete “${f.name}”?`, `This deletes ${ids.size - 1} subfolder(s) and ${doomed.length} note(s) inside it. This can't be undone.`))) return;
      doomed.forEach((n) => deleteContent(n.id));
      if (doomed.some((n) => n.id === selectedId)) setSelectedId(null);
      update((i) => ({ folders: i.folders.filter((x) => !ids.has(x.id)), notes: i.notes.filter((n) => !doomed.includes(n)) }));
      setActiveFolder(f.parentId);
    }
  };

  const noteMenu = async (n: NoteMeta) => {
    const a = await dialog.pick(n.title || "Untitled", [
      { label: "Rename", value: "rename" },
      { label: "Move to…", value: "move" },
      { label: "Duplicate", value: "dup" },
      { label: "Delete note", value: "delete", danger: true },
    ]);
    if (a === "rename") {
      const title = await dialog.prompt("Rename", n.title);
      if (title) patchNote(n.id, { title });
    } else if (a === "move") {
      const to = await pickFolder(`Move “${n.title}” to`);
      if (to !== undefined) { patchNote(n.id, { folderId: to }); if (to) setExpanded((s) => new Set(s).add(to)); }
    } else if (a === "dup") {
      const c = await loadContent(n.id);
      const copy: NoteMeta = { ...n, id: uid(), title: n.title + " (copy)", createdAt: Date.now(), updatedAt: Date.now() };
      if (c !== undefined) await saveContent(copy.id, c);
      update((i) => ({ ...i, notes: [...i.notes, copy] }));
    } else if (a === "delete") {
      if (!(await dialog.confirm(`Delete “${n.title}”?`, "This can't be undone."))) return;
      await deleteContent(n.id);
      if (selectedId === n.id) setSelectedId(null);
      update((i) => ({ ...i, notes: i.notes.filter((x) => x.id !== n.id) }));
    }
  };

  const appMenu = async () => {
    const a = await dialog.pick("SketchNotes", [
      { label: theme === "dark" ? "☀️ Light mode" : "🌙 Dark mode", value: "theme" },
      { label: "⬆️ Export backup (all notes)", value: "export" },
      { label: "⬇️ Import backup", value: "import" },
    ]);
    if (a === "theme") setTheme(theme === "dark" ? "light" : "dark");
    else if (a === "export") {
      const b = await makeBackup(index!);
      const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
      await shareFile(`sketchnotes-backup-${stamp}.json`, new Blob([JSON.stringify(b)], { type: "application/json" }));
    } else if (a === "import") importRef.current?.click();
  };

  const onImport = async (file: File) => {
    try {
      const b = JSON.parse(await file.text()) as Backup;
      setIndex(await restoreBackup(index!, b));
      setSelectedId(null);
    } catch (e) {
      await dialog.pick(`Import failed: ${(e as Error).message}`, []);
    }
  };

  const sharePng = async () => {
    const api = apiRef.current;
    if (!api || !note) return;
    const blob = await exportToBlob({
      elements: api.getSceneElements(),
      appState: { ...api.getAppState(), exportBackground: true, exportWithDarkMode: theme === "dark" },
      files: api.getFiles(),
      mimeType: "image/png",
      exportPadding: 24,
    });
    await shareFile(`${note.title || "diagram"}.png`, blob);
  };

  if (!index) return <div className="empty">Loading…</div>;
  const q = filter.trim().toLowerCase();

  return (
    <div className={"app" + (sidebar ? " with-sidebar" : "")}>
      {sidebar && (
        <aside className="sidebar">
          <div className="side-head">
            <strong>SketchNotes</strong>
            <button className="icon" onClick={appMenu} aria-label="Menu">⚙︎</button>
          </div>
          <input className="search" placeholder="Search diagrams…" value={filter} onChange={(e) => setFilter(e.target.value)} />
          <div className="new-row">
            <button onClick={() => createNote()}>+ Diagram</button>
            <button onClick={() => createFolder()}>+ Folder</button>
          </div>
          <div className="target">
            Adding to: <b>{activeFolder ? folderPath(activeFolder) : "Top level"}</b>
            {activeFolder && <button className="link" onClick={() => setActiveFolder(null)}>reset</button>}
          </div>
          <div className="tree" onClick={(e) => e.target === e.currentTarget && setActiveFolder(null)}>
            <Tree
              index={index} parentId={null} depth={0} filter={q} expanded={expanded}
              selectedNote={selectedId} activeFolder={activeFolder}
              onFolder={(f) => {
                setActiveFolder(f.id);
                setExpanded((s) => { const n = new Set(s); n.has(f.id) ? n.delete(f.id) : n.add(f.id); return n; });
              }}
              onFolderMenu={folderMenu} onNote={openNote} onNoteMenu={noteMenu}
            />
            {index.notes.length === 0 && index.folders.length === 0 && (
              <p className="hint">No diagrams yet. Create a folder like “System Design”, then add a diagram.</p>
            )}
          </div>
        </aside>
      )}
      {sidebar && <div className="scrim" onClick={() => setSidebar(false)} />}

      <main className="main">
        <header className="topbar">
          <button className="icon" onClick={() => setSidebar(!sidebar)} aria-label="Toggle sidebar">☰</button>
          {note ? (
            <>
              <input className="title" value={note.title} onChange={(e) => patchNote(note.id, { title: e.target.value })} />
              <span className="crumb">{folderPath(note.folderId)}</span>
              <button onClick={sharePng}>Share PNG</button>
            </>
          ) : <span className="crumb">Pick or create a diagram</span>}
        </header>
        <div className="editor">
          {!note ? (
            <div className="empty">
              <div>
                <p>Nothing open.</p>
                <div className="new-row">
                  <button onClick={() => createNote()}>+ Diagram</button>
                </div>
              </div>
            </div>
          ) : (
            <DiagramEditor key={note.id} note={note} theme={theme} onTouch={touch} apiRef={apiRef} />
          )}
        </div>
      </main>

      <input ref={importRef} type="file" accept="application/json,.json" hidden
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onImport(f); e.target.value = ""; }} />
      {dialog.spec && <Dialog spec={dialog.spec} close={dialog.close} />}
    </div>
  );
}
