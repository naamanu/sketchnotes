// Back-of-envelope calculator: turns a few traffic assumptions into QPS, storage and bandwidth.
// Uses decimal units (1 KB = 1,000 bytes) and 86,400 s/day, the usual interview shortcuts.

export type EstimateInput = {
  dau: number; // daily active users (or clients)
  writesPerUser: number; // writes per user per day
  readsPerWrite: number; // read:write ratio
  objectBytes: number; // size of one written item
  retentionYears: number;
  peakFactor: number; // peak traffic ÷ average
  replication: number; // copies kept of each item
};

export type EstimateResult = {
  writesPerDay: number;
  writeQps: number;
  readQps: number;
  peakWriteQps: number;
  peakReadQps: number;
  storagePerDay: number; // bytes, before replication
  storageTotal: number; // bytes, with replication, over the retention period
  ingressBps: number; // bytes per second, average
  egressBps: number;
};

export const SECONDS_PER_DAY = 86_400;

export const DEFAULT_INPUT: EstimateInput = {
  dau: 10_000_000,
  writesPerUser: 1,
  readsPerWrite: 10,
  objectBytes: 1_000,
  retentionYears: 5,
  peakFactor: 3,
  replication: 3,
};

export function estimate(i: EstimateInput): EstimateResult {
  const writesPerDay = i.dau * i.writesPerUser;
  const writeQps = writesPerDay / SECONDS_PER_DAY;
  const readQps = writeQps * i.readsPerWrite;
  const storagePerDay = writesPerDay * i.objectBytes;
  return {
    writesPerDay,
    writeQps,
    readQps,
    peakWriteQps: writeQps * i.peakFactor,
    peakReadQps: readQps * i.peakFactor,
    storagePerDay,
    storageTotal: storagePerDay * 365 * i.retentionYears * i.replication,
    ingressBps: writeQps * i.objectBytes,
    egressBps: readQps * i.objectBytes,
  };
}

const UNITS = [
  { suffix: "T", value: 1e12 },
  { suffix: "B", value: 1e9 },
  { suffix: "M", value: 1e6 },
  { suffix: "K", value: 1e3 },
];

/** At most three significant-ish digits, without trailing zeros after the point. */
function trim(n: number): string {
  const a = Math.abs(n);
  if (a >= 100) return Math.round(n).toString();
  return n.toFixed(a >= 10 ? 1 : 2).replace(/\.?0+$/, "");
}

/** 12_300_000 → "12.3M". */
export function formatCount(n: number): string {
  if (!Number.isFinite(n)) return "—";
  const u = UNITS.find((x) => Math.abs(n) >= x.value);
  return u ? trim(n / u.value) + u.suffix : trim(n);
}

const BYTE_UNITS = ["B", "KB", "MB", "GB", "TB", "PB", "EB"];

/** 2_500_000 → "2.5 MB". */
export function formatBytes(n: number): string {
  if (!Number.isFinite(n)) return "—";
  let i = 0;
  while (Math.abs(n) >= 1000 && i < BYTE_UNITS.length - 1) { n /= 1000; i++; }
  return `${trim(n)} ${BYTE_UNITS[i]}`;
}

export const formatRate = (bytesPerSecond: number) => `${formatBytes(bytesPerSecond)}/s`;

const MULTIPLIERS: Record<string, number> = {
  "": 1, k: 1e3, m: 1e6, b: 1e9, g: 1e9, t: 1e12,
  kb: 1e3, mb: 1e6, gb: 1e9, tb: 1e12, pb: 1e15,
};

/**
 * Reads quantities the way people say them in interviews: "10M", "1.5k", "500", "2 KB", "1,000".
 * Returns null when the text isn't a number.
 */
export function parseQuantity(text: string): number | null {
  const m = text.trim().toLowerCase().replace(/,/g, "").match(/^(\d+(?:\.\d+)?|\.\d+)\s*([a-z]*)$/);
  if (!m) return null;
  const unit = m[2] === "bytes" ? "" : m[2];
  const mult = MULTIPLIERS[unit];
  return mult === undefined ? null : parseFloat(m[1]) * mult;
}

/** Plain-text summary, used when inserting the estimate onto the canvas. */
export function summarize(i: EstimateInput, r: EstimateResult): string {
  return [
    "Estimates",
    `${formatCount(i.dau)} DAU × ${formatCount(i.writesPerUser)} writes/day = ${formatCount(r.writesPerDay)} writes/day`,
    `Write QPS ≈ ${formatCount(r.writeQps)} (peak ${formatCount(r.peakWriteQps)})`,
    `Read QPS ≈ ${formatCount(r.readQps)} (peak ${formatCount(r.peakReadQps)})`,
    `Storage ≈ ${formatBytes(r.storagePerDay)}/day → ${formatBytes(r.storageTotal)} over ${i.retentionYears}y ×${i.replication}`,
    `Bandwidth ≈ in ${formatRate(r.ingressBps)}, out ${formatRate(r.egressBps)}`,
  ].join("\n");
}
