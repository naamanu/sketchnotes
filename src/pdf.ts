import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import workerUrl from "pdfjs-dist/legacy/build/pdf.worker.min.mjs?url";
import { PDFDocument } from "pdf-lib";
import { convertToExcalidrawElements, exportToCanvas, getCommonBounds } from "@excalidraw/excalidraw";
import type { DiagramContent } from "./store";

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

/** Width of a page in canvas units, and the pixel width pages are rasterised at. */
export const PAGE_WIDTH = 800;
const RENDER_WIDTH = 1240; // ≈150 dpi for A4/Letter — sharp at 1.5× zoom without huge files
const PAGE_GAP = 40;
const JPEG_QUALITY = 0.85;

/** Stored on each page image element so pages can be found again. */
export type PageData = { pdfPage: number; pdfWidth: number; pdfHeight: number };

export const isPage = (el: any): boolean => el?.type === "image" && typeof el.customData?.pdfPage === "number";
export const pagesOf = (elements: readonly any[]) =>
  elements.filter((e) => isPage(e) && !e.isDeleted).sort((a, b) => a.customData.pdfPage - b.customData.pdfPage);

/**
 * Renders every page of a PDF to a JPEG and lays the pages out top-to-bottom as
 * locked image elements, ready to annotate on the Excalidraw canvas.
 */
export async function importPdf(
  data: ArrayBuffer,
  onProgress: (done: number, total: number) => void,
): Promise<DiagramContent & { pageCount: number }> {
  const task = pdfjs.getDocument({ data });
  const doc = await task.promise;
  const files: Record<string, unknown> = {};
  const skeletons: any[] = [];
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d")!;
  let y = 0;
  try {
    for (let n = 1; n <= doc.numPages; n++) {
      onProgress(n - 1, doc.numPages);
      const page = await doc.getPage(n);
      const base = page.getViewport({ scale: 1 }); // 1 unit = 1 PDF point
      const viewport = page.getViewport({ scale: RENDER_WIDTH / base.width });
      canvas.width = Math.round(viewport.width);
      canvas.height = Math.round(viewport.height);
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvas, canvasContext: ctx, viewport } as any).promise;
      page.cleanup();

      const fileId = `pdf-${crypto.randomUUID()}`;
      files[fileId] = {
        id: fileId, mimeType: "image/jpeg", created: Date.now(),
        dataURL: canvas.toDataURL("image/jpeg", JPEG_QUALITY),
      };
      const height = PAGE_WIDTH * (base.height / base.width);
      skeletons.push({
        type: "image", fileId, x: 0, y, width: PAGE_WIDTH, height, locked: true,
        customData: { pdfPage: n, pdfWidth: base.width, pdfHeight: base.height } satisfies PageData,
      });
      y += height + PAGE_GAP;
    }
    onProgress(doc.numPages, doc.numPages);
  } finally {
    canvas.width = canvas.height = 0;
    await task.destroy();
  }
  const elements = convertToExcalidrawElements(skeletons).map((e: any) => ({ ...e, status: "saved" }));
  return { elements, files, appState: { viewBackgroundColor: "#e9e9ee" }, pageCount: skeletons.length };
}

const overlaps = (el: any, p: any) => {
  const [x1, y1, x2, y2] = getCommonBounds([el]);
  return x2 > p.x && x1 < p.x + p.width && y2 > p.y && y1 < p.y + p.height;
};

/**
 * Flattens each page with the annotations drawn on it into a new PDF (one image per
 * page, original page sizes). Annotations outside every page are left out.
 */
export async function exportAnnotatedPdf(
  elements: readonly any[], files: any, onProgress: (done: number, total: number) => void,
): Promise<Blob> {
  const live = elements.filter((e) => !e.isDeleted);
  const pages = pagesOf(live);
  const notes = live.filter((e) => !isPage(e));
  const out = await PDFDocument.create();
  const pageCanvas = document.createElement("canvas");
  const pctx = pageCanvas.getContext("2d")!;

  for (const [i, p] of pages.entries()) {
    onProgress(i, pages.length);
    const k = RENDER_WIDTH / p.width; // canvas units → output pixels
    pageCanvas.width = RENDER_WIDTH;
    pageCanvas.height = Math.round(p.height * k);
    pctx.fillStyle = "#fff";
    pctx.fillRect(0, 0, pageCanvas.width, pageCanvas.height);

    const onPage = [p, ...notes.filter((n) => overlaps(n, p))];
    const [minX, minY, maxX, maxY] = getCommonBounds(onPage);
    const rendered = await exportToCanvas({
      elements: onPage,
      files,
      exportPadding: 0,
      appState: { exportBackground: false, exportWithDarkMode: false, viewBackgroundColor: "#ffffff" },
      getDimensions: (w: number, h: number) => ({ width: w * k, height: h * k, scale: k }),
    } as any);
    // `rendered` covers [minX..maxX]×[minY..maxY]; clip it to the page rectangle.
    pctx.drawImage(rendered, (minX - p.x) * k, (minY - p.y) * k, (maxX - minX) * k, (maxY - minY) * k);

    const jpg = await new Promise<Blob>((r) => pageCanvas.toBlob((b) => r(b!), "image/jpeg", JPEG_QUALITY));
    const img = await out.embedJpg(await jpg.arrayBuffer());
    const { pdfWidth, pdfHeight } = p.customData as PageData;
    out.addPage([pdfWidth, pdfHeight]).drawImage(img, { x: 0, y: 0, width: pdfWidth, height: pdfHeight });
  }
  onProgress(pages.length, pages.length);
  pageCanvas.width = pageCanvas.height = 0;
  return new Blob([(await out.save()) as BlobPart], { type: "application/pdf" });
}
