import clips from "../public/clips/clips.json";

export const FPS = 30;
export const WIDTH = 1920;
export const HEIGHT = 1080;
export const INTRO = 3.2 * FPS;
export const OUTRO = 5.5 * FPS;
export const TRANSITION = 14; // frames of cross-fade between scenes

export type Step = {
  clip: string;
  /** Playback speed of the screen recording. */
  speed: number;
  title: string;
  points: string[];
};

export const STEPS: Step[] = [
  {
    clip: "01-folders",
    speed: 1.25,
    title: "Organise with folders",
    points: ["Tap + Folder and give it a name", "Use the folder's ⋯ menu to add a diagram inside it"],
  },
  {
    clip: "02-draw",
    speed: 2,
    title: "Sketch a design",
    points: ["Pick a shape and drag to draw it", "Press Enter to label the selected shape", "Arrows snap to the shapes they connect"],
  },
  {
    clip: "03-import-pdf",
    speed: 1.25,
    title: "Import a PDF",
    points: ["Tap + PDF and choose a file", "Its pages appear on the canvas, locked in place"],
  },
  {
    clip: "04-annotate",
    speed: 1.4,
    title: "Read and take notes",
    points: ["Circle, underline and write on the page", "Type notes in the Excalidraw font", "Jump to a page · Reading mode to scroll safely"],
  },
  {
    clip: "05-share-search",
    speed: 1.25,
    title: "Share and find",
    points: ["Share PDF sends a copy with your notes", "Search finds items across folders", "Dark mode lives in the ⚙ menu"],
  },
];

const seconds = (id: string) => {
  const c = (clips as { id: string; seconds: number }[]).find((x) => x.id === id);
  if (!c) throw new Error(`Missing clip ${id} — run "npm run record" first`);
  return c.seconds;
};

/** Frames a step is on screen: its recording at `speed`, plus a short hold at the end. */
export const stepFrames = (s: Step) => Math.ceil((seconds(s.clip) / s.speed) * FPS) + 20;

export const totalFrames = () =>
  INTRO + OUTRO + STEPS.reduce((n, s) => n + stepFrames(s), 0) - TRANSITION * (STEPS.length + 1);
