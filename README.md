# SketchNotes

An offline, Excalidraw-style diagramming app for Android tablets. It's built for system-design interview practice: sketch boxes and arrows with a pen, keep each design in folders, and turn your handwriting into clean text in the Excalidraw font.

SketchNotes wraps the open-source [`@excalidraw/excalidraw`](https://www.npmjs.com/package/@excalidraw/excalidraw) editor in a small React app. [Capacitor](https://capacitorjs.com/) packages it as a native Android APK. Everything stays on the device, and nothing needs an account or a server.

## Features

| | |
|---|---|
| **Excalidraw canvas** | The full Excalidraw editor: rectangles, diamonds, ellipses, arrows, lines, pencil, text, images, eraser, shape library, undo/redo, grid, dark mode. |
| **Folders** | Folders can go inside other folders. Create, rename, move and delete folders and diagrams; search by title. |
| **Handwriting → text** | Write with the pencil tool and, after a short pause, the ink becomes Excalifont text. Writing inside an empty box becomes the box's label. Recognition runs on the device (Google ML Kit Digital Ink). |
| **Excalifont by default** | Typed text always starts in the hand-drawn Excalidraw font. |
| **Pen-friendly** | Excalidraw's pen mode with palm rejection: the pen draws, fingers pan and zoom. |
| **Autosave** | Every change is saved locally (IndexedDB) within about half a second, and again when the app goes to the background. |
| **Share PNG** | Export the current diagram as a PNG through the Android share sheet. |
| **Backups** | Export and import a single JSON file containing every folder and diagram. |
| **Offline** | Fonts and code are bundled into the APK. Only the one-time handwriting model download (~20 MB) needs internet. |

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
| [User guide](docs/user-guide.md) | Every screen and gesture: folders, the canvas, handwriting, sharing, backups, settings. |
| [Development](docs/development.md) | Machine setup from scratch, scripts, build and install loop, wireless debugging, release signing. |
| [Architecture](docs/architecture.md) | How the pieces fit: React shell, Excalidraw integration, storage, Capacitor bridge, file layout. |
| [Handwriting recognition](docs/handwriting.md) | The native ML Kit plugin, the JS API, and the ink-to-text conversion algorithm, step by step. |
| [Data & backups](docs/data-and-backups.md) | Storage schema, the backup file format, migrations, and what can delete your data. |
| [Troubleshooting](docs/troubleshooting.md) | Build failures, adb problems, recognition issues, and fixes. |

## Tech stack

React 19 · TypeScript · Vite 8 · `@excalidraw/excalidraw` 0.18 · `idb-keyval` · Capacitor 8 (`@capacitor/filesystem`, `@capacitor/share`) · Google ML Kit Digital Ink Recognition 19 · Android SDK 36 (min SDK 24).

## Project layout

```
src/
  App.tsx          React shell: sidebar/folder tree, dialogs, diagram editor, menus
  store.ts         Data model + IndexedDB persistence + backup/restore
  ink.ts           JS bridge to the native handwriting plugin + line grouping
  diagramInk.ts    Turns Excalidraw freedraw strokes into Excalifont text elements
  share.ts         Save a file and open the Android share sheet (download in browsers)
  styles.css       App styles (light/dark themes, safe-area handling)
android/
  app/src/main/java/dev/nana/sketchnotes/
    MainActivity.java   Registers the local Ink plugin
    InkPlugin.java      Capacitor plugin wrapping ML Kit Digital Ink Recognition
docs/              Detailed documentation
```

## License and credits

The canvas is [Excalidraw](https://github.com/excalidraw/excalidraw) (MIT). Its bundled fonts (Excalifont, Virgil, Nunito, Lilita One, Comic Shanns, Cascadia and others) ship under their own licenses inside `@excalidraw/excalidraw`. Handwriting recognition uses [Google ML Kit](https://developers.google.com/ml-kit/vision/digital-ink-recognition) under the ML Kit terms.
