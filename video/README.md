# SketchNotes tour video

A ~75 s walkthrough of the basics (folders, drawing, importing and annotating a PDF, sharing, search, dark mode), made with [Remotion](https://www.remotion.dev/).

Output: `out/sketchnotes-tour.mp4` (1920×1080, 30 fps). It isn't committed; render it with the steps below.

## How it's made

1. **`scripts/record.mjs`** drives the real app in headless Chrome (puppeteer-core) and screen-records one clip per step into `public/clips/*.mp4`, plus `clips.json` with their durations. It draws a touch indicator so taps and strokes are visible. It needs the app's Vite dev server, which exposes the Excalidraw API as `window.__excalidraw` in dev builds only, so the script can place annotations on the PDF precisely.
2. **`src/`** is the Remotion composition: an intro, a scene per step (captions on the left, the clip inside a tablet frame on the right), and an outro. Steps, captions and playback speeds live in `src/steps.ts`.

Handwriting → text isn't shown being used because it needs the Android app's native recogniser. The outro mentions it instead.

## Re-recording and rendering

```bash
# terminal 1 — in the app root
npx vite --port 5179 --strictPort

# terminal 2 — in video/
npm install
node scripts/make-demo-pdf.mjs   # regenerates assets/demo-paper.pdf (optional)
npm run record                   # needs Chrome at /usr/bin/google-chrome (or CHROME=…) and ffmpeg on PATH
npm run studio                   # preview and tweak in the browser
npm run render                   # → out/sketchnotes-tour.mp4
```

If the app's UI changes, re-run `npm run record`. Clip lengths are picked up automatically from `clips.json`.
