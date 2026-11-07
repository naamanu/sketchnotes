import { get, set, del, delMany, getMany, keys, setMany } from "idb-keyval";

export type Folder = { id: string; name: string; parentId: string | null; createdAt: number };
/** "text" only exists in data from older versions; it is opened as a diagram. */
export type NoteKind = "text" | "diagram" | "pdf";
export type NoteMeta = {
  id: string;
  pageCount?: number; // PDFs only
  title: string;
  folderId: string | null;
  kind: NoteKind;
  createdAt: number;
  updatedAt: number;
};
export type Index = { folders: Folder[]; notes: NoteMeta[] };

export type DiagramContent = {
  elements: readonly any[];
  appState: Record<string, unknown>;
  files: Record<string, unknown>;
};
export type NoteContent = string | DiagramContent;

const INDEX_KEY = "index";
const contentKey = (id: string) => `content:${id}`;

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

export async function loadIndex(): Promise<Index> {
  return (await get<Index>(INDEX_KEY)) ?? { folders: [], notes: [] };
}
export const saveIndex = (index: Index) => set(INDEX_KEY, index);

export const loadContent = (id: string) => get<NoteContent>(contentKey(id));
export const saveContent = (id: string, c: NoteContent) => set(contentKey(id), c);
export const deleteContent = (id: string) => del(contentKey(id));

// Images (pasted pictures, PDF pages) are stored once per diagram under their own keys,
// so autosaving strokes doesn't rewrite megabytes of image data every time.
const filePrefix = (noteId: string) => `file:${noteId}:`;

/** fileIds referenced by image elements in a scene. */
export const referencedFileIds = (elements: readonly any[]) =>
  [...new Set(elements.filter((e) => e.type === "image" && e.fileId).map((e) => e.fileId as string))];

/** Writes files not yet in `stored` and adds their ids to it. */
export async function saveFiles(noteId: string, files: Record<string, unknown>, stored: Set<string>) {
  const fresh = Object.entries(files).filter(([id]) => !stored.has(id));
  if (!fresh.length) return;
  await setMany(fresh.map(([id, f]) => [filePrefix(noteId) + id, f]));
  fresh.forEach(([id]) => stored.add(id));
}

export async function loadFiles(noteId: string, ids: string[]): Promise<Record<string, unknown>> {
  if (!ids.length) return {};
  const vals = await getMany(ids.map((id) => filePrefix(noteId) + id));
  return Object.fromEntries(ids.map((id, i) => [id, vals[i]]).filter(([, v]) => v));
}

const noteFileKeys = async (noteId: string) =>
  (await keys()).filter((k) => typeof k === "string" && k.startsWith(filePrefix(noteId))) as string[];

export async function deleteNoteFiles(noteId: string) {
  await delMany(await noteFileKeys(noteId));
}

export async function copyNoteFiles(from: string, to: string) {
  const ks = await noteFileKeys(from);
  const vals = await getMany(ks);
  await setMany(ks.map((k, i) => [filePrefix(to) + k.slice(filePrefix(from).length), vals[i]]));
}

/** Content with its images filled in (from inline `files` and the file store). */
export async function loadFullContent(id: string): Promise<NoteContent | undefined> {
  const c = await loadContent(id);
  if (!c || typeof c !== "object") return c;
  const missing = referencedFileIds(c.elements).filter((f) => !(f in (c.files ?? {})));
  return { ...c, files: { ...c.files, ...(await loadFiles(id, missing)) } };
}

/** Deletes everything stored for a note. */
export async function deleteNote(id: string) {
  await deleteContent(id);
  await deleteNoteFiles(id);
}

/** All folder ids inside `folderId`, including itself. */
export function descendantFolderIds(folders: Folder[], folderId: string): Set<string> {
  const out = new Set([folderId]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const f of folders) {
      if (f.parentId && out.has(f.parentId) && !out.has(f.id)) {
        out.add(f.id);
        grew = true;
      }
    }
  }
  return out;
}

export type Backup = { version: 1; exportedAt: number; index: Index; contents: Record<string, NoteContent> };

export async function makeBackup(index: Index): Promise<Backup> {
  const contents: Record<string, NoteContent> = {};
  for (const n of index.notes) {
    const c = await loadFullContent(n.id);
    if (c !== undefined) contents[n.id] = c;
  }
  return { version: 1, exportedAt: Date.now(), index, contents };
}

/** Merges a backup into the current data (existing ids are overwritten). */
export async function restoreBackup(current: Index, b: Backup): Promise<Index> {
  if (b?.version !== 1 || !b.index) throw new Error("Not a SketchNotes backup file");
  for (const [id, c] of Object.entries(b.contents)) await saveContent(id, c);
  const folders = new Map(current.folders.map((f) => [f.id, f]));
  b.index.folders.forEach((f) => folders.set(f.id, f));
  const notes = new Map(current.notes.map((n) => [n.id, n]));
  b.index.notes.forEach((n) => notes.set(n.id, n));
  const next = { folders: [...folders.values()], notes: [...notes.values()] };
  await saveIndex(next);
  return next;
}
