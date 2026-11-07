# Data & backups

Where your diagrams live, what the stored data looks like, and how backups work.

## Where data lives

| What | Where | In backups? |
|---|---|---|
| Folders + diagram list (the *index*) | IndexedDB, database `keyval-store`, store `keyval`, key `index` | ✅ |
| Each diagram's / PDF's scene | Same store, key `content:<id>` | ✅ |
| Images: PDF pages and pasted pictures | Same store, key `file:<id>:<fileId>`, one per image | ✅ (inlined into each item's `files`) |
| Theme, expanded folders, open diagram, auto-convert toggle | WebView `localStorage` (`theme`, `expanded`, `selected`, `inkToText`) | ❌ (per device) |
| Handwriting model | ML Kit's own app-private storage | ❌ (re-downloads) |

All of it sits inside the app's private data directory, `/data/data/dev.nana.sketchnotes/`. Other apps can't read it.

### What deletes your data

- **Uninstalling** the app.
- **Settings → Apps → SketchNotes → Storage → Clear storage / Clear data.**
- Installing a build **signed with a different key** (debug ↔ release). Android makes you uninstall first.
- Factory reset.

`adb install -r` (what `npm run install-tablet` does) **keeps** data. Clearing *cache* only also keeps data.

**Export a backup regularly**, and before any of the above.

## Schema

Defined in `src/store.ts`.

```ts
type Folder = {
  id: string;              // uid(): base-36 time + 6 random chars, e.g. "mhn3k2x1a9f0qz"
  name: string;
  parentId: string | null; // null = top level
  createdAt: number;       // epoch ms
};

type NoteMeta = {          // a diagram's metadata
  id: string;
  title: string;
  folderId: string | null; // null = top level
  kind: "text" | "diagram" | "pdf"; // "text" = legacy (see Migrations)
  pageCount?: number;      // PDFs only
  createdAt: number;
  updatedAt: number;       // bumped only when elements actually change
};

type Index = { folders: Folder[]; notes: NoteMeta[] };

type DiagramContent = {
  elements: ExcalidrawElement[];      // non-deleted elements only
  appState: {                         // a small subset, restored on open
    viewBackgroundColor?: string;
    gridModeEnabled?: boolean;
    scrollX?: number; scrollY?: number;
    zoom?: { value: number };
  };
  files: Record<string, BinaryFileData>; // always {} when stored; images live under file:<id>:<fileId>
};                                       // (inline files are still accepted, e.g. from backups)

// file:<noteId>:<fileId>  →  BinaryFileData { id, mimeType, dataURL, created }
```

A **PDF** is a `DiagramContent` whose page images are locked `image` elements carrying
`customData: { pdfPage: number, pdfWidth: number, pdfHeight: number }` (sizes in PDF points).
Its page JPEGs are ordinary files in the file store. The original PDF file isn't kept.

```ts

type NoteContent = string | DiagramContent; // string = legacy text note
```

`elements` and `files` are exactly Excalidraw's own formats, so a diagram's content is close to a `.excalidraw` file. See [Converting to .excalidraw](#converting-a-diagram-to-an-excalidraw-file) below.

### Write behaviour

- **Index:** written immediately on every structural change (create, rename, move, delete, title edit, `updatedAt` bump).
- **Images:** written once, the first time a save sees an image id that isn't stored yet. A PDF's pages are written at import.
- **Content:** written by a 500 ms debounced save on every Excalidraw `onChange`, and **flushed** when you switch diagrams (unmount) or the app goes to the background (`visibilitychange → hidden`). Force-stopping the app within 500 ms of an edit can lose that last edit.

### Deletes

- Deleting a diagram or PDF removes its `index` entry, its `content:<id>` key and all its `file:<id>:*` keys.
- **Duplicate** copies the content and all the image keys to the new id.
- Deleting a folder removes the folder, **all subfolders** (`descendantFolderIds`), and **all diagrams in any of them**, along with their content.

## Backup file format

**⚙︎ → Export backup** produces `sketchnotes-backup-YYYY-MM-DD-HH-MM.json`:

```json
{
  "version": 1,
  "exportedAt": 1793999999999,
  "index": {
    "folders": [ { "id": "…", "name": "System Design", "parentId": null, "createdAt": 1793… } ],
    "notes":   [ { "id": "…", "title": "URL shortener", "folderId": "…", "kind": "diagram",
                   "createdAt": 1793…, "updatedAt": 1793… } ]
  },
  "contents": {
    "<noteId>": { "elements": [ … ], "appState": { … }, "files": { … } }
  }
}
```

It's plain JSON. Images, including every PDF page, are inlined as base64 data URLs into each item's `files`, so backups containing PDFs are large (roughly 1.4× the stored page images).

When a backup is imported, images stay inline in the content until that item is opened and saved once. At that point they move into the file store automatically.

### Import semantics

**⚙︎ → Import backup** (`restoreBackup`):

1. Rejects the file unless `version === 1` and `index` is present (*"Not a SketchNotes backup file"*).
2. Writes every `contents[id]` to `content:<id>`.
3. **Merges** the indexes by id. Folders and diagrams with the same id are replaced by the backup's version, and everything else on the device is kept.
4. Saves the merged index and closes the open diagram.

So importing the same backup twice is harmless, and importing an old backup **overwrites** newer edits to diagrams that exist in both. Ids are globally unique, so backups from different devices merge without collisions.

**To restore exactly** (device = backup, nothing else): clear the app's storage in Android settings, then import.

## Migrations

`DiagramEditor` passes stored content through `toDiagram()` (`src/App.tsx`):

| Stored value | Becomes |
|---|---|
| `DiagramContent` object | used as is; inline `files` are moved to the file store on the next save |
| non-empty `string` (legacy text note from early builds) | a diagram with **one Excalifont text element** (size 20) at (0, 0) holding the text |
| empty string / missing | an empty diagram |

The migrated content is saved on the first `onChange` after opening, so the conversion is permanent once a legacy note has been opened. Its `kind` stays `"text"` in the index, which is harmless because every note now opens in the diagram editor.

**When changing the schema:** bump `Backup.version` only if old backups can no longer be read as they are, and keep `restoreBackup` accepting older versions. Do content upgrades lazily in `toDiagram()`, as above, so old data and old backups keep working.

## Converting a diagram to an `.excalidraw` file

To open a diagram in excalidraw.com, take one entry from a backup's `contents` and wrap it:

```bash
jq '{type:"excalidraw", version:2, source:"sketchnotes",
     elements: .contents["<noteId>"].elements,
     appState: .contents["<noteId>"].appState,
     files:    .contents["<noteId>"].files}' sketchnotes-backup-….json > diagram.excalidraw
```

Find the `<noteId>` by title with `jq '.index.notes[] | {id,title}' sketchnotes-backup-….json`.

## Inspecting data on the device

With a debug build: `chrome://inspect` → inspect the app → **Application → IndexedDB → keyval-store → keyval**. You can view or delete keys there. Be careful: changes are live.
