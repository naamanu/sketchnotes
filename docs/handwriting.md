# Handwriting recognition

How pen strokes on the canvas become Excalifont text. For how to *use* it, see the [user guide](user-guide.md#handwriting--text).

- [Overview](#overview)
- [Native plugin (InkPlugin.java)](#native-plugin-inkpluginjava)
- [JS bridge (ink.ts)](#js-bridge-inkts)
- [When conversion runs (DiagramEditor)](#when-conversion-runs-diagrameditor)
- [The conversion algorithm](#the-conversion-algorithm)
- [Tuning knobs](#tuning-knobs)
- [Supporting other languages](#supporting-other-languages)
- [Limitations and ideas](#limitations-and-ideas)

---

## Overview

```
pen strokes (Excalidraw "freedraw" elements)
        │  onChange: new, finished strokes → pending set; 1.1 s idle timer
        ▼
convertInkToText(api, ids)                       src/diagramInk.ts
        │  freedraw points → absolute [x,y] strokes
        │  groupLines(): split into lines of writing
        ▼
recognize(strokes) per line                      src/ink.ts
        │  Capacitor bridge
        ▼
InkPlugin.recognize → ML Kit DigitalInkRecognizer     android/…/InkPlugin.java
        │  candidates ["api gateway", "api gate way", …]
        ▼
build Excalifont text elements (free-standing or bound to a box)
api.updateScene(…, CaptureUpdateAction.IMMEDIATELY)  → one undo step
```

## Native plugin (`InkPlugin.java`)

`android/app/src/main/java/dev/nana/sketchnotes/InkPlugin.java` is a Capacitor plugin named `Ink` with two methods.

### `prepare({ lang })`

1. Builds a `DigitalInkRecognitionModel` from a BCP-47 tag (default `"en-US"`). It rejects unknown tags.
2. Asks `RemoteModelManager.isModelDownloaded(model)`.
3. If the model is missing, calls `download(model, DownloadConditions)`. No Wi-Fi-only or charging conditions are set, so it downloads over any connection. The model is about 20 MB and is stored by Google Play services / ML Kit in app-private storage.
4. Creates (or reuses) a `DigitalInkRecognizer` for that language and resolves `{ ready: true }`.

### `recognize({ strokes, width?, height?, preContext? })`

- `strokes`: `number[][][]`. Each stroke is a list of `[x, y]` or `[x, y, t]` points (t = ms timestamp). Timestamps are optional, and the canvas path doesn't send them because Excalidraw doesn't store them.
- Builds an `Ink` (strokes → `Ink.Stroke` → `Ink.Point`).
- `RecognitionContext` with `preContext` (the text before the writing, which helps with word continuation; `""` by default). If `width`/`height` are given, they're passed as a `WritingArea`, which helps the model judge relative size. The canvas path sends neither.
- Resolves `{ candidates: string[] }`, best first.

It rejects with a message if `prepare()` hasn't succeeded, or if ML Kit fails.

### Dependency note

```groovy
implementation "com.google.mlkit:digital-ink-recognition:19.0.0"
```

`RecognitionCandidate` is in the transitive `digital-ink-common` artifact under `com.google.mlkit.vision.digitalink.common`. `Ink`, `RecognitionContext`, `WritingArea` and so on are under `…digitalink.recognition`.

## JS bridge (`ink.ts`)

```ts
export const inkAvailable: boolean;            // true only inside the native app
export function prepareInk(): Promise<void>;   // memoised; retries after a failure
export function recognize(strokes: Stroke[], opts?): Promise<string[]>;  // trimmed, non-empty candidates
export function bbox(strokes): { minX, minY, maxX, maxY };
export function groupLines<T extends { strokes: Stroke[] }>(items: T[]): T[][];
```

`recognize` calls `prepareInk()` first, so the first conversion triggers the model download transparently. While that runs, the UI shows *"Converting handwriting…"*.

## When conversion runs (`DiagramEditor`)

In `src/App.tsx`, `DiagramEditor.onChange`:

1. **Known strokes.** On load, every existing freedraw id goes into `knownInk`, so old ink is never converted by surprise.
2. **Ignore mid-stroke.** If `appState.newElement` is set, the user is still drawing. Cancel any pending timer and stop there.
3. **Collect new strokes.** Each live freedraw element not in `knownInk` is added to it. If auto-convert is **on**, it's also added to `pendingInk`.
4. **Debounce.** If anything was added, (re)start a **1100 ms** timer. When it fires, convert everything in `pendingInk` together, as one "burst" of writing.
5. **Manual path.** `onChange` also tracks selected freedraw ids. **Aa Convert selection** calls the same `convert()` with them.

So the pause is what defines a burst: everything written without a gap of about 1.1 s is recognised together.

**Undo safety.** After conversion the original stroke ids stay in `knownInk`. If you undo, the ink comes back but isn't re-converted.

## The conversion algorithm

`convertInkToText(api, ids)` in `src/diagramInk.ts`:

### 1. Gather strokes
It takes the live freedraw elements whose id is in `ids`. Each Excalidraw freedraw element stores `points` relative to its own `x`/`y`, so they're converted to absolute canvas coordinates: `[el.x + px, el.y + py]`.

### 2. Group into lines (`groupLines`)
1. Compute each stroke's bounding box and sort by top edge (`minY`).
2. Go through the strokes in that order. A stroke joins the first existing line whose vertical range contains the stroke's **vertical centre**; the line's range grows to include it. Otherwise it starts a new line.
3. **Fold small marks back in.** Dots on *i*/*j*, apostrophes and accents sit above the letters, so step 2 makes them a separate "line". Any line shorter than **40 %** of the tallest line is merged into the nearest real line (by vertical distance).
4. Lines are returned top to bottom, and strokes inside each line are put **back in drawing order**. ML Kit uses stroke order as a strong signal.

### 3. Recognise each line
Each line's strokes go to `recognize()`, and the top candidate is used. A line with no candidate stays as ink. If no line is recognised at all, the function returns `0`, and the UI shows *"Couldn't read that — left it as ink"* for 2 s.

### 4. Decide where each line goes
Using the current scene (fetched again, since the user may have kept drawing during recognition), it looks for a container for each line:
- The shape's type is `rectangle`, `ellipse` or `diamond`.
- It isn't rotated, and it **doesn't already have a bound text label**.
- The **centre of the line's bounding box** is strictly inside the shape's bounding box.
- If several shapes qualify (nested boxes), the **smallest** one wins.

Lines with the same container are grouped. Lines with no container are "free".

### 5. Build text elements
All text is created with `convertToExcalidrawElements`, which also measures it:

| Case | Text | Position | Font size |
|---|---|---|---|
| Free line | the line's text | top-left of the ink's bounding box | `snap(inkHeight × 0.9)` |
| Box label | the container's lines joined with `\n` | centred in the box, `textAlign: center`, `verticalAlign: middle`, `containerId` set | `snap(min(tallestLine × 0.9, 36))` |

`snap()` picks the nearest of `16, 20, 28, 36, 48, 64, 96`. Snapping keeps text sizes consistent across a diagram, instead of a mix like 23/27/31 px from slightly different handwriting.

Colour comes from the first stroke's `strokeColor`. The font is always `FONT_FAMILY.Excalifont`.

For box labels, the container also gets `{ type: "text", id }` added to its `boundElements`. Excalidraw then treats the text as the shape's label, so it moves and resizes with the shape and double-tap edits it.

### 6. Apply as one undo step
```ts
api.updateScene({
  elements: [
    ...scene with recognised strokes marked isDeleted (newElementWith),
    ...containers patched with boundElements,
    ...new text elements,
  ],
  captureUpdate: CaptureUpdateAction.IMMEDIATELY,
});
```
The strokes are marked `isDeleted` (via `newElementWith`, which bumps version and nonce) rather than removed, so Excalidraw's history can restore them. `IMMEDIATELY` records the change as a single history entry, so one undo brings the ink back.

## Tuning knobs

| Constant | Where | Default | Effect |
|---|---|---|---|
| Idle delay | `App.tsx`, `setTimeout(…, 1100)` in `DiagramEditor` | 1100 ms | How long to wait after the last stroke. Lower feels snappier but may split a phrase into separate texts. |
| Small-mark threshold | `ink.ts`, `tallest * 0.4` | 40 % | Lines shorter than this fraction of the tallest line are merged as dots/accents. |
| Size factor | `diagramInk.ts`, `* 0.9` | 0.9 | Ink height → font size. |
| Size steps | `diagramInk.ts`, `SIZES` | 16…96 | Allowed font sizes. |
| Label size cap | `diagramInk.ts`, `Math.min(h * 0.9, 36)` | 36 | Largest size for text written into a box. |
| Container types | `diagramInk.ts`, `CONTAINERS` | rectangle, ellipse, diamond | Shapes that can receive a label. |
| Language | `ink.ts`, `prepare({ lang: "en-US" })` | en-US | The recognition model. |

## Supporting other languages

ML Kit supports 300+ language tags (e.g. `fr-FR`, `de-DE`, `ja`, `zh-Hani-CN`, plus special models like `zxx-Zsym-x-autodraw` for shapes and `zxx-Zsye-x-emoji`). To change the language, edit the tag in `prepareInk()` (`src/ink.ts`). To let the user choose, store a tag in `localStorage`, pass it to `prepare`, and reset the memoised promise when it changes. Each language downloads its own model once.

## Limitations and ideas

- **Bursts, not words.** Everything written within one pause becomes one text per line. Write a word, pause, write the next somewhere else, and you get separate texts, which is usually what you want on a diagram.
- **Doodles get converted too** while auto-convert is on. Undo restores them, or switch the toggle off for freehand sketching.
- **No timestamps** are sent from the canvas, because Excalidraw doesn't store them. Accuracy is still good, but live timestamps could help a little.
- **Rotated shapes** aren't used as label targets.
- **Ideas:**
  - Recognise sketched shapes (rectangle, circle, arrow) with ML Kit's AutoDraw model and swap them for clean Excalidraw shapes.
  - A per-burst "alternatives" popover using the other candidates.
  - A language picker.
