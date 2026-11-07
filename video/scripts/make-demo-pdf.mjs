// Generates assets/demo-paper.pdf: a short, original "paper" used in the demo video.
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { writeFileSync } from "fs";
const doc = await PDFDocument.create();
const reg = await doc.embedFont(StandardFonts.TimesRoman), bold = await doc.embedFont(StandardFonts.TimesRomanBold);
const wrap = (t, f, size, w) => { const out = []; let line = ""; for (const word of t.split(" ")) { const l = line ? line + " " + word : word; if (f.widthOfTextAtSize(l, size) > w) { out.push(line); line = word; } else line = l; } out.push(line); return out; };
const pages = [
  ["Designing a Highly Available Key-Value Store", [
    ["Abstract", "We describe the design of a distributed key-value store that favours availability over strong consistency. Keys are spread across nodes with consistent hashing, every write is replicated to N nodes, and reads and writes succeed once R and W replicas respond. Conflicts are detected with vector clocks and resolved by the client."],
    ["1. Partitioning", "Each node owns several virtual positions on a hash ring. A key is stored on the first N distinct nodes found walking clockwise from its hash. Virtual nodes smooth out load when machines join or leave, and let more powerful machines take a larger share of the ring."],
    ["2. Replication", "The node that receives a write acts as coordinator. It stores the value locally and forwards it to the next N-1 healthy nodes on the ring. With R + W > N, every read overlaps at least one replica that saw the latest write."],
    ["3. Handling failures", "If a replica is unreachable, the write goes to the next healthy node with a hint naming the intended owner. When the owner recovers, the hinted data is handed back. Merkle trees let replicas find and repair differences cheaply in the background."],
  ]],
  ["4. Versioning and conflicts", [
    ["", "Because writes may be accepted by different replicas during a partition, a key can end up with several concurrent versions. Each version carries a vector clock; versions whose clocks are ordered can be discarded automatically, while truly concurrent ones are returned to the client to merge."],
    ["5. Membership", "Nodes learn about each other through a gossip protocol. Every second each node exchanges its view of the ring with a random peer, so changes spread in O(log n) rounds without any central coordinator."],
    ["6. Evaluation", "In production-like tests the store kept 99.9th percentile read and write latencies under 300 ms while serving peak traffic, and remained writable during simulated data-centre failures."],
  ]],
  ["7. Lessons learned", [["", "Tunable N, R and W let each application choose its own balance of durability, latency and consistency. Pushing conflict resolution to clients keeps the storage layer simple, but requires careful application design."]]],
];
for (const [title, secs] of pages) {
  const p = doc.addPage([595, 842]); let y = 770;
  for (const l of wrap(title, bold, 22, 475)) { p.drawText(l, { x: 60, y, size: 22, font: bold }); y -= 30; }
  y -= 10;
  for (const [h, body] of secs) {
    if (h) { p.drawText(h, { x: 60, y, size: 14, font: bold }); y -= 22; }
    for (const l of wrap(body, reg, 12, 475)) { p.drawText(l, { x: 60, y, size: 12, font: reg }); y -= 17; }
    y -= 16;
  }
  p.drawText(`${doc.getPageCount()}`, { x: 292, y: 40, size: 10, font: reg, color: rgb(0.4, 0.4, 0.4) });
}
writeFileSync(new URL("../assets/demo-paper.pdf", import.meta.url), await doc.save());
