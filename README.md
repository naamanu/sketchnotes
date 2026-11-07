# SketchNotes

An offline, Excalidraw-style diagramming and PDF-annotation app for Android tablets. It's built for system-design interview practice: sketch boxes and arrows with a pen, read and mark up PDFs (papers, books, notes), keep everything in folders, and turn your handwriting into clean text in the Excalidraw font.

<p align="center">
  <img src="docs/screenshots/diagram-landscape.png" alt="A system-design diagram open beside the folder sidebar" width="860">
</p>

SketchNotes wraps the open-source [`@excalidraw/excalidraw`](https://www.npmjs.com/package/@excalidraw/excalidraw) editor in a small React app. [Capacitor](https://capacitorjs.com/) packages it as a native Android APK. Everything stays on the device, and nothing needs an account or a server.

## Features

| | |
|---|---|
| **Excalidraw canvas** | The full Excalidraw editor: rectangles, diamonds, ellipses, arrows, lines, pencil, text, images, eraser, shape library, undo/redo, grid, dark mode. |
| **PDF reading & notes** | Import a PDF and its pages appear on the canvas. Write, highlight, draw and type on them with every Excalidraw tool. Jump to a page, switch to read-only mode, and share a flattened, annotated PDF. |
| **Folders** | Folders can go inside other folders. Create, rename, move and delete folders and diagrams; search by title. |
| **Handwriting → text** | Write with the pencil tool and, after a short pause, the ink becomes Excalifont text. Writing inside an empty box becomes the box's label. Recognition runs on the device (Google ML Kit Digital Ink). |
| **Excalifont by default** | Typed text always starts in the hand-drawn Excalidraw font. |
| **Pen-friendly** | Excalidraw's pen mode with palm rejection: the pen draws, fingers pan and zoom. |
| **Autosave** | Every change is saved locally (IndexedDB) within about half a second, and again when the app goes to the background. |
| **Share PNG / PDF** | Export a diagram as a PNG, or a PDF with your notes burned in, through the Android share sheet. |
| **Backups** | Export and import a single JSON file containing every folder, diagram and PDF. |
| **Offline** | Fonts and code are bundled into the APK. Only the one-time handwriting model download (~20 MB) needs internet. |

## Screenshots

| Annotating a PDF | Portrait (tablet) |
|---|---|
| <img src="docs/screenshots/pdf-annotate.png" alt="PDF page with handwritten notes, a highlight and a circled phrase" width="380"> | <img src="docs/screenshots/diagram-portrait.png" alt="URL shortener diagram on a portrait tablet screen" width="380"> |

| Dark mode | Folders & item menu | Go to page |
|---|---|---|
| <img src="docs/screenshots/dark-mode.png" alt="The app in dark mode" width="280"> | <img src="docs/screenshots/folders.png" alt="Folder tree with a diagram's menu open" width="280"> | <img src="docs/screenshots/pdf-pages.png" alt="Page picker for a PDF" width="280"> |

<sub>Captured from the app's web build at the tablet's resolution (1920×1200 / 1200×1920) with demo content. On the device the UI is identical.</sub>

## Quick start

Prerequisites: Node.js 20+ (developed on 24), JDK 21, the Android SDK (see [docs/development.md](docs/development.md#1-one-time-machine-setup), no Android Studio needed), and a tablet with USB debugging on.

```bash
git clone git@github.com:naamanu/sketchnotes.git
cd sketchnotes
npm install                 # also copies the Excalidraw fonts into public/fonts
echo "sdk.dir=$HOME/Android/Sdk" > android/local.properties

npm run apk                 # type-check, build web assets, sync to Android, assemble debug APK
npm run install-tablet      # adb install -r … (keeps existing data)
```

To change the UI without reinstalling, run `npm run dev` and open the printed URL in a browser. Handwriting recognition is only available in the Android app.

## Documentation

| Doc | What's in it |
|---|---|
| [User guide](docs/user-guide.md) | Every screen and gesture: folders, the canvas, PDFs, handwriting, sharing, backups, settings. |
| [Development](docs/development.md) | Machine setup from scratch, scripts, build and install loop, wireless debugging, release signing. |
| [Architecture](docs/architecture.md) | How the pieces fit: React shell, Excalidraw integration, PDF pipeline, storage, Capacitor bridge, file layout. |
| [Handwriting recognition](docs/handwriting.md) | The native ML Kit plugin, the JS API, and the ink-to-text conversion algorithm, step by step. |
| [Data & backups](docs/data-and-backups.md) | Storage schema, the backup file format, migrations, and what can delete your data. |
| [Troubleshooting](docs/troubleshooting.md) | Build failures, adb problems, recognition issues, and fixes. |

## Tech stack

React 19 · TypeScript · Vite 8 · `@excalidraw/excalidraw` 0.18 · `pdfjs-dist` 6 · `pdf-lib` · `idb-keyval` · Capacitor 8 (`@capacitor/filesystem`, `@capacitor/share`) · Google ML Kit Digital Ink Recognition 19 · Android SDK 36 (min SDK 24).

## Project layout

```
src/
  App.tsx          React shell: sidebar/folder tree, dialogs, diagram editor, menus
  store.ts         Data model + IndexedDB persistence + backup/restore
  ink.ts           JS bridge to the native handwriting plugin + line grouping
  diagramInk.ts    Turns Excalidraw freedraw strokes into Excalifont text elements
  pdf.ts           PDF import (pdf.js → page images) and annotated-PDF export (pdf-lib)
  share.ts         Save a file and open the Android share sheet (download in browsers)
  styles.css       App styles (light/dark themes, safe-area handling)
android/
  app/src/main/java/dev/nana/sketchnotes/
    MainActivity.java   Registers the local Ink plugin
    InkPlugin.java      Capacitor plugin wrapping ML Kit Digital Ink Recognition
docs/              Detailed documentation
```

## License and credits

The canvas is [Excalidraw](https://github.com/excalidraw/excalidraw) (MIT). Its bundled fonts (Excalifont, Virgil, Nunito, Lilita One, Comic Shanns, Cascadia and others) ship under their own licenses inside `@excalidraw/excalidraw`. PDF rendering uses [pdf.js](https://github.com/mozilla/pdf.js) (Apache-2.0), and export uses [pdf-lib](https://github.com/Hopding/pdf-lib) (MIT). Handwriting recognition uses [Google ML Kit](https://developers.google.com/ml-kit/vision/digital-ink-recognition) under the ML Kit terms.
