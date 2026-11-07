# Architecture

SketchNotes is a single-page React app running inside an Android WebView. Capacitor provides the WebView shell, the JS↔native bridge, and the native plugins.

```
┌────────────────────────────── Android app (dev.nana.sketchnotes) ──────────────────────────────┐
│ MainActivity (Capacitor BridgeActivity)                                                        │
│  ┌──────────────────────────── WebView (assets/public) ─────────────────────────────┐          │
│  │ React app                                                                        │          │
│  │  App.tsx ── sidebar / folder tree / dialogs / top bar                            │          │
│  │     ├─ pdf.ts ── pdf.js (worker) renders pages ─► locked image elements          │          │
│  │     └─ DiagramEditor ── <Excalidraw/> (canvas, tools, undo, pen mode)            │          │
│  │            │ onChange ─► debounced save ─► store.ts ─► IndexedDB (idb-keyval)    │          │
│  │            │ new freedraw strokes ─► diagramInk.ts ─► ink.ts ──┐                 │          │
│  │  share.ts ─┼──────────────────────────────────────────────┐    │                 │          │
│  └────────────┼──────────────────────────────────────────────┼────┼─────────────────┘          │
│               │ Capacitor bridge                             │    │                            │
│   @capacitor/filesystem + @capacitor/share ◄─────────────────┘    ▼                            │
│                                                     InkPlugin.java ─► ML Kit Digital Ink       │
│                                                                       (on-device model)        │
└────────────────────────────────────────────────────────────────────────────────────────────────┘
```

## Modules

### `src/main.tsx`
Mounts `<App/>` and imports the global stylesheet.

### `src/App.tsx`
The whole UI shell. Main parts:

| Part | Responsibility |
|---|---|
| `useDialog` / `Dialog` | A tiny promise-based modal system: `prompt(title, value)`, `confirm(title, body)`, `pick(title, options)`. These are used instead of `window.prompt`/`confirm`, which look out of place in a WebView. Because they return promises, menu handlers read as straight-line `async` code. |
| `useDebounced` | A debounced callback that **flushes on unmount and when the page becomes hidden** (`visibilitychange`). This is what makes "switch diagrams" or "press Home" safe without losing the last 500 ms of edits. |
| `toDiagram` | Normalises stored content into `{elements, appState, files}`. It also migrates legacy plain-text notes (see [data-and-backups.md](data-and-backups.md#migrations)). |
| `DiagramEditor` | Used for both diagrams and PDFs (`note.kind`). Loads the scene and its images (`loadFiles`), mounts `<Excalidraw/>` with `initialData` (and `viewModeEnabled` for PDF reading mode), saves on change, tracks "last edited" time, and runs handwriting auto-conversion. It's remounted per diagram (`key={note.id}`), so Excalidraw always starts clean. |
| `Tree` | A recursive folder/diagram list. Folders sort by name, diagrams by `updatedAt` (newest first). The search filter expands all folders. |
| PDF actions | `choosePdf`/`onPdfChosen` (import with a progress overlay), `goToPage` (`scrollToContent` on a page element), `sharePdf` (export, then share). A `busy` overlay blocks input during long operations. |
| `App` | Holds the index (folders and diagram metadata), selection, the expanded set, sidebar visibility and theme. It also handles every create/rename/move/delete/duplicate action and backup export/import. |

**Image storage.** Images (PDF pages and pasted pictures) are stored once, under their own keys, instead of inside the scene. The debounced save writes only images it hasn't stored yet (tracked in `storedFiles`), then writes the scene with `files: {}`. Without this, every pen stroke on a 100-page PDF would rewrite tens of MB. Keys are namespaced per item, so **Duplicate** copies images and **Delete** removes them, with no reference counting.

**State ownership.** The **index** (`{folders, notes}`) is React state in `App`, written through to IndexedDB on every change by `update(fn)`. **Diagram content** is *not* in React state. Each `DiagramEditor` loads it on mount, and Excalidraw owns it while it's open. That keeps large scenes out of React's render path.

**"Last edited" tracking.** `onChange` fires for every pointer move, scroll and selection change. To bump `updatedAt` only on real edits, `DiagramEditor` computes `sceneVersion` (element count + the sum of `element.version`) and only calls `onTouch()` when it changes.

**UI state in `localStorage`** (per device, not in backups): `theme`, `expanded` (folder ids), `selected` (open diagram id), `inkToText` (auto-convert toggle).

### `src/store.ts`
The data model and persistence. See [data-and-backups.md](data-and-backups.md) for the schema.

- `loadIndex` / `saveIndex`: the `index` key.
- `loadContent` / `saveContent` / `deleteContent`: the `content:<id>` keys.
- `saveFiles` / `loadFiles` / `copyNoteFiles` / `deleteNoteFiles`: images under `file:<noteId>:<fileId>` (see below). `referencedFileIds(elements)` lists the images a scene uses.
- `loadFullContent` (scene plus its images, used for backups) and `deleteNote` (content plus images).
- `descendantFolderIds(folders, id)`: the transitive closure of subfolders. It's used for cascading deletes and to stop a folder from being moved into its own subtree.
- `makeBackup` / `restoreBackup`: the JSON backup format, with merge-on-import.
- `uid()`: base-36 timestamp plus random suffix ids.

### `src/ink.ts`
The JS side of handwriting recognition. See [handwriting.md](handwriting.md).

- `registerPlugin<InkPlugin>("Ink")` binds to the native plugin.
- `inkAvailable`: `Capacitor.isNativePlatform()`. All handwriting UI is hidden in a browser.
- `prepareInk()`: a memoised model download/initialisation that resets on failure, so a later attempt retries.
- `recognize(strokes, opts)`: returns candidate strings, best first.
- `bbox`, `groupLines`: geometry helpers that split strokes into lines of writing.

### `src/pdf.ts`
PDF support. A PDF is stored as an ordinary scene in which each page is a **locked image element**. That's how every Excalidraw tool, undo, autosave, handwriting conversion and backups work on PDFs with no special cases.

**Import: `importPdf(data, onProgress)`**
1. Loads the document with **pdf.js** (legacy build, for older WebViews), with its worker bundled by Vite (`pdf.worker.min.mjs?url`).
2. For each page:
   - Renders it on a white canvas `RENDER_WIDTH` = 1240 px wide (about 150 dpi for A4/Letter) and encodes it as JPEG at quality 0.85.
   - Creates an image file `pdf-<uuid>`.
   - Creates an image element `PAGE_WIDTH` = 800 canvas units wide, with height from the page's aspect ratio. It's placed at `y`, with a `PAGE_GAP` of 40 between pages, and `locked: true`.
   - Stores `customData: { pdfPage, pdfWidth, pdfHeight }`, where the sizes are in PDF points.
3. Returns `{ elements, files, appState: { viewBackgroundColor: "#e9e9ee" }, pageCount }`. The grey background makes the white pages stand out.

`isPage(el)` / `pagesOf(elements)` find page elements through `customData.pdfPage`.

**Export: `exportAnnotatedPdf(elements, files, onProgress)`**
1. Finds the pages and the non-page "notes".
2. For each page:
   - Collects the notes whose bounds (`getCommonBounds`) overlap the page.
   - Renders page plus notes with Excalidraw's `exportToCanvas` (`exportPadding: 0`, light theme, scale k = 1240 / page width).
   - Draws the result onto a page-sized canvas, offset by `(minX − page.x) · k`. This clips anything outside the page.
3. Encodes each page as JPEG and adds it to a new **pdf-lib** document at the original `pdfWidth × pdfHeight` points.

**On open:** if the PDF has no saved scroll position, `DiagramEditor` scrolls to page 1 (`scrollToContent(..., { fitToViewport: true })`). It always selects the freedraw tool.

### `src/diagramInk.ts`
`convertInkToText(api, ids)` turns Excalidraw freedraw elements into Excalifont text elements. It handles line grouping, font-size snapping, and binding text to a box you wrote inside. It applies the change as **one undoable step**. The algorithm is in [handwriting.md](handwriting.md#the-conversion-algorithm).

### `src/share.ts`
`shareFile(name, blob)`:
- **Native:** base64-encodes the blob, writes it to the app's cache directory with `@capacitor/filesystem`, then opens the share sheet with `@capacitor/share` (passing the file URI).
- **Browser:** a normal `<a download>` click.

It's used for **Share PNG** (via Excalidraw's `exportToBlob`) and **Export backup**.

### `src/styles.css`
CSS custom properties for light and dark themes (`:root[data-theme="dark"]`), sidebar/topbar layout, the dialog, the handwriting toggle, and a `max-width: 899px` breakpoint where the sidebar becomes an overlay.

**Safe areas:** Android 15 draws apps edge-to-edge, under the status and navigation bars. Capacitor 8's SystemBars plugin injects `--safe-area-inset-*` CSS variables. `.app` pads itself with `var(--safe-area-inset-top, env(safe-area-inset-top, 0px))` (and the same for the other sides), and the overlay sidebar uses the same insets.

### Native: `android/app/src/main/java/dev/nana/sketchnotes/`
- `MainActivity.java`: `registerPlugin(InkPlugin.class)` before `super.onCreate()`. Local plugins must be registered by hand, unlike npm plugins, which `cap sync` registers automatically.
- `InkPlugin.java`: the `@CapacitorPlugin(name = "Ink")` wrapper around ML Kit. Details in [handwriting.md](handwriting.md#native-plugin-inkpluginjava).

## Excalidraw integration details

| Concern | How it's handled |
|---|---|
| Fonts offline | `window.EXCALIDRAW_ASSET_PATH = "/"` in `index.html`, plus fonts copied into `public/fonts` by `postinstall`. |
| Default font | `initialData.appState.currentItemFontFamily = FONT_FAMILY.Excalifont`, set on every load. |
| What's persisted | Non-deleted `elements`; images in the file store (see *Image storage*); and the `appState` subset `viewBackgroundColor`, `gridModeEnabled`, `scrollX`, `scrollY`, `zoom`. Tool choice, selection and other UI state aren't saved. |
| `collaborators` | Must be a `Map` in `initialData.appState`. It's re-created on load because JSON can't store a `Map`. |
| Hidden menu items | `UIOptions.canvasActions`: `loadScene`, `saveToActiveFile`, `export` and `saveAsImage` are disabled. They rely on browser file APIs and blob downloads, which an Android WebView doesn't support. **Share PNG** and **Backups** replace them. |
| Theme | Passed as the `theme` prop, following the app theme. |
| API handle | `excalidrawAPI` is kept in `apiRef` for Share PNG (`getSceneElements`, `getAppState`, `getFiles`) and for handwriting conversion (`getSceneElementsIncludingDeleted`, `updateScene`). |
| Pen input | This is built into Excalidraw. The first `pointerType: "pen"` event turns on pen mode (palm rejection, fingers pan). |

## Why these choices

- **Capacitor + web instead of fully native (Kotlin/Compose):** Excalidraw is a mature web editor, and rebuilding one natively would be a lot of work. Capacitor gives a real APK, native plugins where needed (ML Kit, share sheet), and a fast `npm run dev` loop.
- **IndexedDB through `idb-keyval`:** diagrams with embedded images can be several MB, which is too much for `localStorage`'s ~5 MB. `idb-keyval` is a tiny promise wrapper. Data stays in the app's private storage.
- **ML Kit Digital Ink instead of a web handwriting API:** the W3C Handwriting Recognition API isn't available in Android WebView. ML Kit runs on the device, is free, works offline after a one-time model download, and supports 300+ languages.
- **PDF pages as locked Excalidraw images instead of a separate PDF viewer:** one editor for everything. Every tool, undo/redo, autosave, handwriting conversion and backup works on PDFs for free, and notes can go anywhere, including the margins. The trade-off: pages are raster images (about 150 dpi), so text in a PDF isn't selectable, and very long documents use more storage.
- **Content stored separately from the index:** the sidebar loads quickly however big the diagrams are, and only the open diagram's content is read.
