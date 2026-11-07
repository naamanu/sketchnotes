// Drives the real SketchNotes app (Vite dev server) in headless Chrome and records one
// clip per step of the tour into public/clips/*.webm, plus public/clips/clips.json with
// each clip's duration. A touch indicator is drawn so taps and strokes are visible.
//
// Usage: (in the app root) npx vite --port 5179   then   npm run record
import puppeteer from "puppeteer-core";
import { writeFileSync, mkdirSync, rmSync } from "fs";
import { execFileSync } from "child_process";
import { fileURLToPath } from "url";

const APP = process.env.APP_URL ?? "http://localhost:5179/";
const CHROME = process.env.CHROME ?? "/usr/bin/google-chrome";
const OUT = fileURLToPath(new URL("../public/clips/", import.meta.url));
const PDF = fileURLToPath(new URL("../assets/demo-paper.pdf", import.meta.url));
const VIEW = { width: 1280, height: 800, deviceScaleFactor: 1.5 };
mkdirSync(OUT, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox", "--hide-scrollbars"] });
const page = await browser.newPage();
await page.setViewport(VIEW);

// ---- touch indicator: a soft circle that follows the pointer and pulses on press ----
await page.evaluateOnNewDocument(() => {
  addEventListener("DOMContentLoaded", () => {
    const css = document.createElement("style");
    css.textContent = `
      #touch{position:fixed;left:0;top:0;width:40px;height:40px;margin:-20px 0 0 -20px;border-radius:50%;
        border:3px solid rgba(105,101,219,.95);background:rgba(105,101,219,.18);pointer-events:none;z-index:2147483647;
        transition:transform .12s ease, background .12s ease, opacity .3s;opacity:0}
      #touch.down{transform:scale(.7);background:rgba(105,101,219,.45)}
      .ripple{position:fixed;width:40px;height:40px;margin:-20px 0 0 -20px;border-radius:50%;pointer-events:none;
        z-index:2147483646;border:3px solid rgba(105,101,219,.7);animation:rip .5s ease-out forwards}
      @keyframes rip{from{transform:scale(.6);opacity:1}to{transform:scale(2.2);opacity:0}}`;
    document.head.append(css);
    const t = document.createElement("div"); t.id = "touch"; document.body.append(t);
    const at = (e) => { t.style.left = e.clientX + "px"; t.style.top = e.clientY + "px"; t.style.opacity = "1"; };
    addEventListener("pointermove", at, true);
    addEventListener("pointerdown", (e) => {
      at(e); t.classList.add("down");
      const r = document.createElement("div"); r.className = "ripple";
      r.style.left = e.clientX + "px"; r.style.top = e.clientY + "px";
      document.body.append(r); setTimeout(() => r.remove(), 600);
    }, true);
    addEventListener("pointerup", () => t.classList.remove("down"), true);
  });
});

// ---- helpers ----
const centerOf = async (fn, arg) => {
  const box = await page.evaluate((src, arg) => {
    const el = new Function("arg", `return (${src})(arg)`)(arg);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  }, fn.toString(), arg);
  if (!box) throw new Error("element not found: " + fn + " " + arg);
  return box;
};
const byText = (t) => [...document.querySelectorAll("button")].find((b) => b.offsetParent && b.textContent.trim().startsWith(t));
const bySel = (s) => document.querySelector(s);
const move = (x, y, steps = 18) => page.mouse.move(x, y, { steps });
const tap = async ({ x, y }, pause = 450) => {
  await move(x, y); await sleep(180);
  await page.mouse.down(); await sleep(90); await page.mouse.up();
  await sleep(pause);
};
const tapText = async (t, pause) => tap(await centerOf(byText, t), pause);
const tapSel = async (s, pause) => tap(await centerOf(bySel, s), pause);
const drag = async (a, b, steps = 22) => {
  await move(a.x, a.y); await sleep(150); await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps }); await sleep(80); await page.mouse.up(); await sleep(350);
};
const stroke = async (pts) => {
  await move(pts[0].x, pts[0].y); await sleep(120); await page.mouse.down();
  for (const p of pts.slice(1)) await page.mouse.move(p.x, p.y, { steps: 2 });
  await page.mouse.up(); await sleep(300);
};
const type = async (text) => { await page.keyboard.type(text, { delay: 75 }); await sleep(300); };
// Scene (canvas) coordinates → screen coordinates, via the dev-only window.__excalidraw hook.
const toScreen = (sx, sy) => page.evaluate((sx, sy) => {
  const s = window.__excalidraw.getAppState();
  return { x: (sx + s.scrollX) * s.zoom.value + s.offsetLeft, y: (sy + s.scrollY) * s.zoom.value + s.offsetTop };
}, sx, sy);

const clips = [];
const record = async (id, fn) => {
  const rec = await page.screencast({ path: `${OUT}${id}.webm` });
  const t0 = Date.now();
  await sleep(600);
  await fn();
  await sleep(900);
  await rec.stop();
  clips.push({ id, seconds: (Date.now() - t0) / 1000 });
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/${id}.png` });
  console.log("recorded", id, clips.at(-1).seconds.toFixed(1) + "s");
};

// ---- start from an empty app ----
await page.goto(APP, { waitUntil: "networkidle0" });
await page.evaluate(() => { localStorage.clear(); localStorage.setItem("theme", "light"); });
await page.reload({ waitUntil: "networkidle0" });
await move(640, 400, 1);

// 1. Folders + a new diagram
await record("01-folders", async () => {
  await tapText("+ Folder");
  await type("System Design"); await page.keyboard.press("Enter"); await sleep(600);
  const more = await centerOf(() => [...document.querySelectorAll(".item.folder")].find((i) => i.textContent.includes("System Design")).querySelector(".more"));
  await tap(more, 700);
  await tapText("✏️ New diagram here", 500);
  await page.keyboard.down("Control"); await page.keyboard.press("a"); await page.keyboard.up("Control");
  await type("URL shortener"); await page.keyboard.press("Enter");
  await page.waitForSelector(".excalidraw canvas"); await sleep(1200);
});

// 2. Draw a small architecture
await record("02-draw", async () => {
  const shape = async (tool, a, b, label, bg) => {
    await tapSel(`[data-testid="toolbar-${tool}"]`, 250);
    await drag(a, b);
    if (bg) await tapSel(`[data-testid="color-top-pick-${bg}"]`, 300);
    // the new shape is still selected: Enter opens its label editor
    await page.keyboard.press("Enter"); await sleep(300);
    await type(label);
    await page.keyboard.press("Escape"); await sleep(200); await page.keyboard.press("Escape"); await sleep(300);
  };
  // Everything stays right of x≈540: Excalidraw's style panel covers the left of the canvas.
  await shape("ellipse", { x: 565, y: 390 }, { x: 695, y: 470 }, "Client");
  await shape("rectangle", { x: 770, y: 380 }, { x: 925, y: 480 }, "API servers", "#b2f2bb");
  await shape("rectangle", { x: 1030, y: 240 }, { x: 1190, y: 320 }, "Cache", "#ffec99");
  await shape("rectangle", { x: 1030, y: 540 }, { x: 1190, y: 620 }, "Database", "#ffc9c9");
  for (const [a, b] of [[{ x: 699, y: 430 }, { x: 766, y: 430 }], [{ x: 929, y: 405 }, { x: 1026, y: 290 }], [{ x: 929, y: 455 }, { x: 1026, y: 575 }]]) {
    await tapSel('[data-testid="toolbar-arrow"]', 200);
    await drag(a, b, 16);
  }
  await page.keyboard.press("Escape"); await sleep(400);
  await tapSel('[data-testid="toolbar-text"]', 250);
  await tap({ x: 600, y: 215 }, 300);
  await type("URL shortener — v1");
  await page.keyboard.press("Escape"); await sleep(250); await page.keyboard.press("Escape");
  await tap({ x: 1150, y: 730 }, 300); // tap empty canvas to deselect
});

// 3. Import a PDF
await record("03-import-pdf", async () => {
  const pdfBtn = await centerOf(byText, "+ PDF");
  await move(pdfBtn.x, pdfBtn.y); await sleep(200);
  let chooser;
  for (let i = 0; !chooser && i < 3; i++) {
    [chooser] = await Promise.all([page.waitForFileChooser({ timeout: 6000 }).catch(() => null), page.mouse.click(pdfBtn.x, pdfBtn.y)]);
  }
  if (!chooser) throw new Error("file chooser never opened");
  await sleep(500);
  await chooser.accept([PDF]);
  await page.waitForSelector(".dialog input"); await sleep(400);
  await page.keyboard.down("Control"); await page.keyboard.press("a"); await page.keyboard.up("Control");
  await type("Highly available KV store");
  await tapText("OK", 300);
  await page.waitForFunction(() => window.__excalidraw?.getSceneElements().length && !document.querySelector(".dialog.busy"), { timeout: 30000 });
  await sleep(1800);
});

// 4. Read and annotate
await record("04-annotate", async () => {
  // zoom in on the top of page 1 for readability
  await page.evaluate(() => {
    const api = window.__excalidraw, s = api.getAppState(), z = 1.05;
    api.updateScene({ appState: { zoom: { value: z }, scrollX: (s.width / z - 800) / 2, scrollY: -60 } });
  });
  await sleep(900);
  await tapSel('[data-testid="color-top-pick-#e03131"]', 300);
  // circle "vector clocks"
  const c = Array.from({ length: 34 }, (_, i) => { const a = -0.4 + i / 32 * Math.PI * 2.1; return [155 + Math.cos(a) * 86, 244 + Math.sin(a) * 19]; });
  await stroke(await Promise.all(c.map(([x, y]) => toScreen(x, y))));
  // wavy underline under "R + W > N"
  const u = Array.from({ length: 26 }, (_, i) => [346 + i * 3.2, 471 + Math.sin(i / 2) * 2.5]);
  await stroke(await Promise.all(u.map(([x, y]) => toScreen(x, y))));
  // a typed note in Excalifont
  await tapSel('[data-testid="toolbar-text"]', 250);
  await tap(await toScreen(330, 512), 300);
  await type("↑ quorum ⇒ fresh reads");
  await page.keyboard.press("Escape"); await sleep(250); await page.keyboard.press("Escape"); await sleep(500);
  // jump to page 2, then read without marking the page
  await tapText("Pages", 600);
  await tapText("Page 2", 1200);
  await tapText("✏️ Annotating", 600);
  const mid = { x: 790, y: 500 };
  await move(mid.x, mid.y);
  for (let i = 0; i < 6; i++) { await page.mouse.wheel({ deltaY: 120 }); await sleep(140); }
  await sleep(500);
  await tapText("📖 Reading", 500);
});

// 5. Share, search and dark mode
await record("05-share-search", async () => {
  await tapText("Share PDF", 1400);
  const search = await centerOf(bySel, ".search");
  await tap(search, 200);
  await type("url"); await sleep(700);
  await tap(await centerOf(() => [...document.querySelectorAll(".item")].find((i) => i.textContent.includes("URL shortener")).querySelector(".item-main")), 900);
  await tap(search, 100); await page.keyboard.down("Control"); await page.keyboard.press("a"); await page.keyboard.up("Control"); await page.keyboard.press("Backspace"); await sleep(400);
  await tapText("⚙︎", 600);
  await tapText("🌙 Dark mode", 1500);
});

await browser.close();

// Screencasts are variable-frame-rate WebM without a duration header; convert to
// constant 30 fps H.264 MP4 so Remotion can seek them precisely.
for (const c of clips) {
  const src = `${OUT}${c.id}.webm`, dst = `${OUT}${c.id}.mp4`;
  execFileSync("ffmpeg", ["-v", "error", "-y", "-i", src, "-r", "30", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "20", "-movflags", "+faststart", dst]);
  rmSync(src);
  c.seconds = Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", dst]).toString());
}
writeFileSync(`${OUT}clips.json`, JSON.stringify(clips, null, 2) + "\n");
console.log(clips);
