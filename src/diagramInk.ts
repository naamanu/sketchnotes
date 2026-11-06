import { CaptureUpdateAction, FONT_FAMILY, convertToExcalidrawElements, newElementWith } from "@excalidraw/excalidraw";
import { Stroke, bbox, groupLines, recognize } from "./ink";

const SIZES = [16, 20, 28, 36, 48, 64, 96];
const snapSize = (h: number) => SIZES.reduce((a, b) => (Math.abs(b - h) < Math.abs(a - h) ? b : a));
const CONTAINERS = new Set(["rectangle", "ellipse", "diamond"]);

const strokeOf = (el: any): Stroke => el.points.map(([px, py]: number[]) => [el.x + px, el.y + py]);

/**
 * Replaces the given freedraw elements with Excalifont text. Lines of handwriting
 * become separate text elements; writing inside an empty box becomes that box's label.
 * Returns the number of text elements created.
 */
export async function convertInkToText(api: any, ids: Set<string>): Promise<number> {
  const inks = api.getSceneElements().filter((e: any) => ids.has(e.id) && e.type === "freedraw");
  if (!inks.length) return 0;

  const lines = groupLines<{ el: any; strokes: Stroke[] }>(inks.map((el: any) => ({ el, strokes: [strokeOf(el)] })));
  const recognised: { text: string; box: ReturnType<typeof bbox>; color: string; els: any[] }[] = [];
  for (const line of lines) {
    const strokes = line.flatMap((l) => l.strokes);
    const [text] = await recognize(strokes);
    if (text) recognised.push({ text, box: bbox(strokes), color: line[0].el.strokeColor, els: line.map((l) => l.el) });
  }
  if (!recognised.length) return 0;

  // Find the box (if any) each line was written inside, using the latest scene.
  const scene: any[] = api.getSceneElementsIncludingDeleted();
  const containerFor = (b: ReturnType<typeof bbox>) => {
    const cx = (b.minX + b.maxX) / 2, cy = (b.minY + b.maxY) / 2;
    return scene.filter((e) => !e.isDeleted && CONTAINERS.has(e.type) && !e.angle &&
        !e.boundElements?.some((be: any) => be.type === "text") &&
        cx > e.x && cx < e.x + e.width && cy > e.y && cy < e.y + e.height)
      .sort((a, b) => a.width * a.height - b.width * b.height)[0];
  };

  const groups = new Map<string, typeof recognised>(); // container id ("" = free) -> lines
  const free: typeof recognised = [];
  for (const r of recognised) {
    const c = containerFor(r.box);
    if (c) groups.set(c.id, [...(groups.get(c.id) ?? []), r]);
    else free.push(r);
  }

  const created: any[] = [];
  const containerPatches = new Map<string, any>();
  for (const r of free) {
    const [t] = convertToExcalidrawElements([{
      type: "text", x: r.box.minX, y: r.box.minY, text: r.text, strokeColor: r.color,
      fontFamily: FONT_FAMILY.Excalifont, fontSize: snapSize((r.box.maxY - r.box.minY) * 0.9),
    } as any]);
    created.push(t);
  }
  for (const [cid, rs] of groups) {
    const c = scene.find((e) => e.id === cid);
    const h = Math.max(...rs.map((r) => r.box.maxY - r.box.minY));
    const [t] = convertToExcalidrawElements([{
      type: "text", x: 0, y: 0, text: rs.map((r) => r.text).join("\n"), strokeColor: rs[0].color,
      fontFamily: FONT_FAMILY.Excalifont, fontSize: snapSize(Math.min(h * 0.9, 36)), textAlign: "center",
    } as any]) as any[];
    created.push({
      ...t, containerId: cid, verticalAlign: "middle", textAlign: "center",
      x: c.x + (c.width - t.width) / 2, y: c.y + (c.height - t.height) / 2,
    });
    containerPatches.set(cid, { boundElements: [...(c.boundElements ?? []), { type: "text", id: t.id }] });
  }

  const remove = new Set(recognised.flatMap((r) => r.els.map((e) => e.id)));
  api.updateScene({
    elements: [
      ...scene.map((e) =>
        remove.has(e.id) ? newElementWith(e, { isDeleted: true })
        : containerPatches.has(e.id) ? newElementWith(e, containerPatches.get(e.id)) : e),
      ...created,
    ],
    captureUpdate: CaptureUpdateAction.IMMEDIATELY,
  });
  return created.length;
}
