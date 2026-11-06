import { Capacitor, registerPlugin } from "@capacitor/core";

/** A stroke is a list of [x, y] or [x, y, t(ms)] points. */
export type Stroke = number[][];

interface InkPlugin {
  prepare(o: { lang: string }): Promise<{ ready: boolean }>;
  recognize(o: { strokes: Stroke[]; width?: number; height?: number; preContext?: string }): Promise<{ candidates: string[] }>;
}

const Ink = registerPlugin<InkPlugin>("Ink");

export const inkAvailable = Capacitor.isNativePlatform();

let preparing: Promise<void> | null = null;
/** Ensures the handwriting model is downloaded (one-time, ~20MB, needs internet). */
export function prepareInk(): Promise<void> {
  if (!inkAvailable) return Promise.reject(new Error("Handwriting recognition only works in the Android app"));
  preparing ??= Ink.prepare({ lang: "en-US" }).then(() => undefined).catch((e) => { preparing = null; throw e; });
  return preparing;
}

export async function recognize(strokes: Stroke[], opts: { width?: number; height?: number; preContext?: string } = {}) {
  await prepareInk();
  const { candidates } = await Ink.recognize({ strokes, ...opts });
  return candidates.map((c) => c.trim()).filter(Boolean);
}

type Box = { minX: number; minY: number; maxX: number; maxY: number };
export const bbox = (strokes: Stroke[]): Box => {
  const b = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  for (const s of strokes) for (const [x, y] of s) {
    b.minX = Math.min(b.minX, x); b.maxX = Math.max(b.maxX, x);
    b.minY = Math.min(b.minY, y); b.maxY = Math.max(b.maxY, y);
  }
  return b;
};

/** Groups items (each with its strokes) into lines of handwriting by vertical overlap. */
export function groupLines<T extends { strokes: Stroke[] }>(items: T[]): T[][] {
  const withBox = items.map((it) => ({ it, b: bbox(it.strokes) })).sort((a, b) => a.b.minY - b.b.minY);
  const lines: { items: T[]; minY: number; maxY: number }[] = [];
  for (const { it, b } of withBox) {
    const cy = (b.minY + b.maxY) / 2;
    const line = lines.find((l) => cy >= l.minY && cy <= l.maxY);
    if (line) { line.items.push(it); line.minY = Math.min(line.minY, b.minY); line.maxY = Math.max(line.maxY, b.maxY); }
    else lines.push({ items: [it], minY: b.minY, maxY: b.maxY });
  }
  // Fold tiny "lines" (i-dots, apostrophes, accents) into the nearest real line.
  const tallest = Math.max(0, ...lines.map((l) => l.maxY - l.minY));
  const real = lines.filter((l) => l.maxY - l.minY >= tallest * 0.4);
  for (const l of lines) {
    if (real.includes(l)) continue;
    const cy = (l.minY + l.maxY) / 2;
    const dist = (r: typeof l) => (cy < r.minY ? r.minY - cy : cy > r.maxY ? cy - r.maxY : 0);
    real.reduce((a, b) => (dist(b) < dist(a) ? b : a)).items.push(...l.items);
  }
  // Keep the original writing order inside each line; order lines top-to-bottom.
  return real.sort((a, b) => a.minY - b.minY).map((l) => l.items.sort((a, b) => items.indexOf(a) - items.indexOf(b)));
}
