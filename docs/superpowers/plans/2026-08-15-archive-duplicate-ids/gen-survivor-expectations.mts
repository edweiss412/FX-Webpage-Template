/**
 * Generates survivor-expectations.json from the PRE-REPAIR tree: one row per
 * duplicate pair — { id, file, survivorHeadingText, demotedHeadingText } — using
 * the spec §2.1 direction column (keep-first everywhere except USE-RAW-FULL-LIST-1).
 * Run from the repo root. Line numbers are the spec table's (drafting-time
 * locators at the authoring base); the OUTPUT keys on heading TEXT, which survives
 * line drift.
 */
import { readFileSync, writeFileSync } from "node:fs";

type Pair = { id: string; file: string; first: number; second: number; keep: "first" | "second" };
const P = (id: string, file: string, first: number, second: number, keep: "first" | "second" = "first"): Pair =>
  ({ id, file, first, second, keep });

const PAIRS: Pair[] = [
  P("BL-RATE-LIMIT-SNAPSHOT-DURABILITY", "BACKLOG-archive.md", 2582, 2611),
  P("BL-LEDGER-MDAST-SHARED-HOME", "BACKLOG-archive.md", 2623, 2659),
  P("BL-AGENDA-PERLINK-COMPLETENESS", "BACKLOG-archive.md", 2674, 2708),
  P("BL-FITWITHINCLIP-CLIP-SCROLL-STALE", "BACKLOG-archive.md", 2728, 2770),
  P("BL-FINALIZE-CAS-ROLEFLAGS-NOTICE-DROP", "BACKLOG-archive.md", 2817, 2850),
  P("BL-IDENTITYLINK-LANDED-VS-REQUESTED", "BACKLOG-archive.md", 2860, 2893),
  P("BL-UNDO-SELECTIONS-RESET-AT-DROP", "BACKLOG-archive.md", 2903, 2935),
  P("BL-ADMIN-NOJS-LOADING-CONFLICT", "BACKLOG-archive.md", 2984, 2986),
  P("BL-MODAL-REALTIME-UPDATED-CUE", "BACKLOG-archive.md", 3067, 3075),
  P("BL-ONBOARDING-CAS-SOURCE-ANCHORS", "BACKLOG-archive.md", 3085, 3087),
  P("BL-ROLEFLAGS-NOTICE-HELPFULCONTEXT-OVERGRANT", "BACKLOG-archive.md", 3117, 3119),
  P("BL-ADMIN-PARSEPANEL-ORPHANED", "BACKLOG-archive.md", 3125, 3127),
  P("BL-HELP-STRIP-COPYLINK-STALE", "BACKLOG-archive.md", 3131, 3133),
  P("BL-UNPUBLISH-TO-HELD", "BACKLOG-archive.md", 3141, 3143),
  P("BL-VERSION-AMBIGUOUS-V1-OVERRIDE", "BACKLOG-archive.md", 3153, 3155),
  P("BL-CI-STATIC-ENV-INJECTION", "BACKLOG-archive.md", 3383, 3387),
  P("BL-DANGLING-CITATIONS-RETIRED-WORKFLOW", "BACKLOG-archive.md", 3399, 3401),
  P("BL-MASTERSPEC-FINANCIALS-VOCAB", "BACKLOG-archive.md", 3429, 3431),
  P("BL-SOUND-REDIRECT-GUARD", "BACKLOG-archive.md", 3439, 3443),
  P("BL-CI-GITHUB-ENV-CROSS-STEP-STATE", "BACKLOG-archive.md", 3453, 3457),
  P("BL-PG-CRON-PER-CASE-QUERY-ATTRIBUTION", "BACKLOG-archive.md", 3465, 3469),
  P("BL-LEDGER-GUARD-MDAST-REWRITE", "BACKLOG-archive.md", 3487, 3491),
  P("BL-ARCHIVE-PENDING-REALTIME-SWAP-RACE", "BACKLOG-archive.md", 4870, 4874),
  P("BL-ARCHIVE-REPEAT-TELEMETRY-DEDUP", "BACKLOG-archive.md", 4880, 4884),
  P("BL-INVARIANT8-CLOSEOUT-ENFORCEMENT", "BACKLOG-archive.md", 5117, 5123),
  P("BL-SHAREHUB-BACKDROP-COVERS-TRIGGERS", "BACKLOG-archive.md", 5250, 5254),
  P("BL-ATTENTION-MENU-PANEL-CLIP", "BACKLOG-archive.md", 5266, 5270),
  P("BL-PUBLISHED-TOGGLE-OVERLAY-CLIP", "BACKLOG-archive.md", 5282, 5286),
  P("BL-SHAREHUB-CONFIRM-NAMES-SHOW", "BACKLOG-archive.md", 5294, 5298),
  P("BL-SHAREHUB-OPEN-TIMER-LEAK", "BACKLOG-archive.md", 5310, 5314),
  P("BL-POPOVER-SHARED-RAF-COALESCER", "BACKLOG-archive.md", 5324, 5328),
  P("BL-WIZARD-RESTAGE-FETCH-BEFORE-LOCK", "BACKLOG-archive.md", 5481, 5488),
  P("BL-CONCURRENT-RETRY-DB-TIMEOUT-FLAKE", "BACKLOG-archive.md", 5590, 5602),
  P("BL-PARSER-VENUE-TYPO-GENERATOR-SEED-FLAKE", "BACKLOG-archive.md", 5617, 5625),
  P("BL-KNOWN-SECTIONS-WALKER", "BACKLOG-archive.md", 5639, 5654),
  P("BL-LEDGER-GUARD-TERMINAL-CLAIM-BLIND", "BACKLOG-archive.md", 5664, 5688),
  P("BL-NEEDS-ATTENTION-HOLDS-ROLLUP", "BACKLOG-archive.md", 5973, 5975),
  P("NEWTAB-GUARD-UNDECIDABLE-2", "DEFERRED-archive.md", 380, 412),
  P("DESTRUCT-ARM-ANNOUNCE-1", "DEFERRED-archive.md", 448, 470),
  P("PSQL-GUARD-RECALL-RESIDUAL", "DEFERRED-archive.md", 478, 507),
  P("PSQL-STARTUP-FILE-NO-X-CLASSWIDE", "DEFERRED-archive.md", 541, 587),
  P("USE-RAW-FULL-LIST-1", "DEFERRED-archive.md", 1763, 1905, "second"),
  P("CASP-2", "DEFERRED-archive.md", 1807, 1818),
];

const files = new Map<string, string[]>();
const lineAt = (file: string, n: number): string => {
  if (!files.has(file)) files.set(file, readFileSync(file, "utf8").split("\n"));
  const line = files.get(file)![n - 1];
  if (line === undefined) throw new Error(`${file}:${n} out of range`);
  if (!/^#{2,4} /.test(line)) throw new Error(`${file}:${n} is not a heading: ${line.slice(0, 60)}`);
  if (!line.includes(PAIRS.find((p) => p.file === file && (p.first === n || p.second === n))!.id))
    throw new Error(`${file}:${n} heading does not carry the pair id`);
  return line.replace(/^#{2,4} /, "");
};

const rows = PAIRS.map((p) => ({
  id: p.id,
  file: p.file,
  survivorHeadingText: lineAt(p.file, p.keep === "first" ? p.first : p.second),
  demotedHeadingText: lineAt(p.file, p.keep === "first" ? p.second : p.first),
}));
if (rows.length !== 43) throw new Error(`expected 43 rows, got ${rows.length}`);
writeFileSync(
  "docs/superpowers/plans/2026-08-15-archive-duplicate-ids/survivor-expectations.json",
  JSON.stringify(rows, null, 2) + "\n",
);
console.log(`wrote ${rows.length} rows`);
