// Built-in system-design prompts. `scale` seeds the estimate calculator with sensible assumptions.
import type { EstimateInput } from "./estimate";

export type Difficulty = "easy" | "medium" | "hard";

export type PracticePrompt = {
  id: string;
  title: string;
  difficulty: Difficulty;
  tags: string[];
  summary: string;
  functional: string[];
  nonFunctional: string[];
  scale: Partial<EstimateInput>;
  hints: string[];
  deepDives: string[];
};

export const PROMPTS: PracticePrompt[] = [
  {
    id: "url-shortener",
    title: "Design a URL shortener",
    difficulty: "easy",
    tags: ["storage", "caching", "ids"],
    summary: "Turn long URLs into short links like sn.io/aZ3k9 that redirect to the original.",
    functional: [
      "Create a short link for a long URL, optionally with a custom alias",
      "Redirect a short link to its long URL",
      "Links can expire",
      "Basic click counts per link",
    ],
    nonFunctional: ["Redirects in under 50 ms at p99", "Very high availability for reads", "Short codes must not be guessable in sequence"],
    scale: { dau: 10_000_000, writesPerUser: 0.1, readsPerWrite: 100, objectBytes: 500, retentionYears: 5 },
    hints: [
      "Reads outnumber writes about 100:1, so put a cache in front of the database.",
      "7 base-62 characters give 62⁷ ≈ 3.5 trillion codes.",
      "Pre-generate ids in ranges per server (or use a key service) to avoid collisions.",
      "301 redirects get cached by browsers and hide clicks from you; 302 doesn't.",
    ],
    deepDives: ["Generating unique short codes without coordination", "Counting clicks without slowing redirects", "Cleaning up expired links"],
  },
  {
    id: "pastebin",
    title: "Design Pastebin",
    difficulty: "easy",
    tags: ["blob storage", "caching"],
    summary: "Users paste text and get a link others can open to read it.",
    functional: ["Create a paste and get a link", "View a paste by link", "Pastes can be public, unlisted or expire", "Syntax highlighting by language"],
    nonFunctional: ["Paste pages load in under 200 ms", "Pastes are never lost once acknowledged", "Up to 10 MB per paste"],
    scale: { dau: 5_000_000, writesPerUser: 0.2, readsPerWrite: 10, objectBytes: 10_000, retentionYears: 3 },
    hints: [
      "Store paste bodies in object storage and keep only metadata in the database.",
      "Popular pastes are read-heavy: serve them from a CDN.",
      "Reuse the short-id approach from a URL shortener.",
    ],
    deepDives: ["Metadata vs. blob storage split", "Expiry at scale", "Abuse and rate limiting"],
  },
  {
    id: "rate-limiter",
    title: "Design a distributed rate limiter",
    difficulty: "medium",
    tags: ["algorithms", "redis", "consistency"],
    summary: "Limit how many requests each client can make to an API across many servers.",
    functional: ["Limit requests per client per time window", "Different limits per endpoint or plan", "Tell clients when they're limited (429 + retry-after)"],
    nonFunctional: ["Adds under 5 ms per request", "Keeps working if the limiter store is slow or down", "Roughly accurate across all API servers"],
    scale: { dau: 50_000_000, writesPerUser: 20, readsPerWrite: 1, objectBytes: 100, retentionYears: 0, replication: 2 },
    hints: [
      "Compare token bucket, leaky bucket, fixed window and sliding window log/counter.",
      "A shared Redis with atomic INCR + EXPIRE (or a Lua script) keeps servers consistent.",
      "Decide whether to fail open or fail closed when Redis is unavailable.",
    ],
    deepDives: ["Sliding window counter accuracy", "Race conditions between servers", "Local caching vs. global accuracy"],
  },
  {
    id: "chat",
    title: "Design a chat app like WhatsApp",
    difficulty: "hard",
    tags: ["websockets", "messaging", "fan-out"],
    summary: "One-to-one and group messaging with delivery receipts and offline delivery.",
    functional: ["Send 1:1 and group messages (up to 256 members)", "Sent / delivered / read receipts", "Messages reach users who were offline", "Online presence and last seen"],
    nonFunctional: ["Messages delivered in under 500 ms when both are online", "Messages kept in order per conversation", "No message is lost"],
    scale: { dau: 500_000_000, writesPerUser: 40, readsPerWrite: 1.5, objectBytes: 200, retentionYears: 5 },
    hints: [
      "Clients hold a persistent WebSocket to a gateway; track which gateway each user is on.",
      "Store messages per conversation, ordered by a per-conversation sequence number.",
      "Queue messages for offline users and push a notification.",
      "Group fan-out: write once, deliver to each member's connection.",
    ],
    deepDives: ["Message ordering and idempotent delivery", "Routing between gateway servers", "Presence at 500M users"],
  },
  {
    id: "news-feed",
    title: "Design a social news feed",
    difficulty: "hard",
    tags: ["fan-out", "ranking", "caching"],
    summary: "Users follow others and see a feed of their posts, newest or most relevant first.",
    functional: ["Publish a post with text and images", "See a feed of posts from people you follow", "Like and comment", "Paginate through the feed"],
    nonFunctional: ["Feed loads in under 300 ms", "New posts show up in followers' feeds within a minute", "Feed can be slightly stale (eventual consistency)"],
    scale: { dau: 300_000_000, writesPerUser: 1, readsPerWrite: 50, objectBytes: 1_000, retentionYears: 10 },
    hints: [
      "Fan-out on write (push to followers' feed caches) is fast to read but costly for celebrities.",
      "Fan-out on read (pull at request time) is cheap to write but slow to read.",
      "A hybrid: push for normal users, pull for accounts with millions of followers.",
      "Store images in object storage behind a CDN; the feed holds only post ids.",
    ],
    deepDives: ["Hybrid fan-out for celebrity accounts", "Feed cache layout and pagination cursors", "Ranking signals"],
  },
  {
    id: "notifications",
    title: "Design a notification service",
    difficulty: "medium",
    tags: ["queues", "retries", "third-party apis"],
    summary: "Send push, email and SMS notifications on behalf of other services.",
    functional: ["Send by push, email or SMS", "User preferences and opt-outs per channel", "Scheduled and immediate sends", "Templates with variables"],
    nonFunctional: ["At-least-once delivery, no duplicates the user sees", "Spikes of 10× normal traffic", "Most notifications sent within 10 s"],
    scale: { dau: 100_000_000, writesPerUser: 10, readsPerWrite: 1, objectBytes: 500, retentionYears: 1 },
    hints: [
      "Put a queue between the API and per-channel workers so spikes don't drop sends.",
      "Providers (APNs, FCM, SMS gateways) fail and rate-limit: retry with backoff and a dead-letter queue.",
      "Dedupe with an idempotency key per notification.",
    ],
    deepDives: ["Retry and dead-letter design", "Respecting provider rate limits", "Preference checks without slowing sends"],
  },
  {
    id: "typeahead",
    title: "Design search autocomplete",
    difficulty: "medium",
    tags: ["tries", "caching", "batch processing"],
    summary: "Suggest the top completions as the user types into a search box.",
    functional: ["Return the top 10 suggestions for a prefix", "Suggestions ranked by popularity", "Popularity updates from recent searches"],
    nonFunctional: ["Responses in under 100 ms (they arrive on every keystroke)", "Highly available", "Suggestions can lag real searches by hours"],
    scale: { dau: 100_000_000, writesPerUser: 5, readsPerWrite: 8, objectBytes: 50, retentionYears: 1 },
    hints: [
      "A trie with the top-k completions cached at each node makes lookups O(prefix length).",
      "Rebuild the trie offline from search logs (hourly or daily) instead of updating it live.",
      "Shard the trie by prefix range; cache hot prefixes at the edge.",
    ],
    deepDives: ["Building and shipping the trie", "Sharding by prefix and hot spots", "Filtering offensive suggestions"],
  },
  {
    id: "video-platform",
    title: "Design a video platform like YouTube",
    difficulty: "hard",
    tags: ["blob storage", "cdn", "transcoding"],
    summary: "Users upload videos that others stream at different qualities.",
    functional: ["Upload a video", "Stream it at several resolutions", "Search and view counts", "Resume where you left off"],
    nonFunctional: ["Playback starts in under 2 s", "Uploads survive flaky connections", "Uploaded videos are never lost"],
    scale: { dau: 100_000_000, writesPerUser: 0.01, readsPerWrite: 500, objectBytes: 50_000_000, retentionYears: 10 },
    hints: [
      "Resumable, chunked uploads straight to object storage via pre-signed URLs.",
      "A transcoding pipeline (queue + workers) produces HLS/DASH segments per resolution.",
      "Almost all egress should come from a CDN; storage is the dominant cost.",
    ],
    deepDives: ["Transcoding pipeline and its failure handling", "CDN strategy for popular vs. long-tail videos", "Counting views at scale"],
  },
  {
    id: "ride-sharing",
    title: "Design a ride-sharing service",
    difficulty: "hard",
    tags: ["geospatial", "real-time", "matching"],
    summary: "Riders request trips and are matched with nearby drivers in real time.",
    functional: ["Drivers report their location every few seconds", "Riders see nearby drivers and request a ride", "Match a rider to a driver", "Track the trip live"],
    nonFunctional: ["Matching in under a few seconds", "A driver is never matched to two riders", "Location data can be a few seconds stale"],
    scale: { dau: 20_000_000, writesPerUser: 200, readsPerWrite: 1, objectBytes: 100, retentionYears: 1 },
    hints: [
      "Index driver locations with geohashes, S2 cells or a quadtree, kept in memory.",
      "Location updates are write-heavy and short-lived: don't send them to the main database.",
      "Use a lock or conditional write when offering a ride so a driver isn't double-booked.",
    ],
    deepDives: ["Geospatial indexing choices", "Absorbing a constant stream of location writes", "Matching consistency"],
  },
  {
    id: "kv-store",
    title: "Design a distributed key-value store",
    difficulty: "hard",
    tags: ["partitioning", "replication", "consistency"],
    summary: "A Dynamo-style store with get(key) and put(key, value) across many machines.",
    functional: ["get and put by key", "Values up to 1 MB", "Configurable consistency per request"],
    nonFunctional: ["Single-digit ms latency", "Keeps accepting writes during node failures", "Scales by adding nodes"],
    scale: { dau: 1_000_000, writesPerUser: 1_000, readsPerWrite: 10, objectBytes: 1_000, retentionYears: 1 },
    hints: [
      "Consistent hashing with virtual nodes spreads keys and limits movement when nodes join.",
      "Replicate to N nodes; tune R and W so R + W > N when you need strong reads.",
      "Detect failures with gossip; repair with hinted handoff and Merkle-tree anti-entropy.",
    ],
    deepDives: ["Quorums and conflict resolution (vector clocks, last-write-wins)", "Rebalancing on node join and leave", "Storage engine: LSM tree vs. B-tree"],
  },
  {
    id: "ticket-booking",
    title: "Design a ticket booking system",
    difficulty: "medium",
    tags: ["transactions", "contention", "queues"],
    summary: "Users browse events and book specific seats, including during huge on-sale spikes.",
    functional: ["Browse events and see seat availability", "Hold seats for a few minutes during checkout", "Pay and confirm the booking"],
    nonFunctional: ["A seat is never sold twice", "Survives on-sale spikes of 100× normal traffic", "Availability views can be slightly stale"],
    scale: { dau: 10_000_000, writesPerUser: 0.5, readsPerWrite: 40, objectBytes: 2_000, retentionYears: 5 },
    hints: [
      "Hold seats with a time-limited reservation row (or a Redis key with TTL).",
      "Serialize contention per seat with a conditional update or row lock, not a global lock.",
      "A virtual waiting room smooths on-sale spikes before they reach booking.",
    ],
    deepDives: ["Preventing double booking", "The virtual waiting room", "Payment failures and releasing holds"],
  },
  {
    id: "file-sync",
    title: "Design a file sync service like Dropbox",
    difficulty: "hard",
    tags: ["chunking", "sync", "blob storage"],
    summary: "Files in a folder stay in sync across a user's devices and can be shared.",
    functional: ["Upload and download files", "Changes sync to all of a user's devices", "Share folders with others", "File version history"],
    nonFunctional: ["Large files sync efficiently over slow links", "No data loss", "Edits on two devices don't silently overwrite each other"],
    scale: { dau: 50_000_000, writesPerUser: 2, readsPerWrite: 3, objectBytes: 500_000, retentionYears: 10 },
    hints: [
      "Split files into chunks (~4 MB) addressed by content hash; upload only changed chunks.",
      "Dedupe identical chunks across users to save storage.",
      "A metadata service tracks file → chunk lists and versions; clients long-poll for changes.",
    ],
    deepDives: ["Chunking and deduplication", "Conflict handling", "Notifying devices of changes"],
  },
];

export const promptById = (id: string) => PROMPTS.find((p) => p.id === id);

export const DIFFICULTY_LABEL: Record<Difficulty, string> = { easy: "Easy", medium: "Medium", hard: "Hard" };

/** Prompts matching a search over title, summary and tags. */
export function searchPrompts(query: string, difficulty: Difficulty | "all" = "all"): PracticePrompt[] {
  const q = query.trim().toLowerCase();
  return PROMPTS.filter((p) =>
    (difficulty === "all" || p.difficulty === difficulty) &&
    (!q || [p.title, p.summary, ...p.tags].some((s) => s.toLowerCase().includes(q))));
}

/** The prompt brief as plain text, for inserting onto the canvas. */
export function promptBrief(p: PracticePrompt): string {
  return [
    p.title,
    "",
    "Functional:",
    ...p.functional.map((f) => `• ${f}`),
    "",
    "Non-functional:",
    ...p.nonFunctional.map((f) => `• ${f}`),
  ].join("\n");
}
