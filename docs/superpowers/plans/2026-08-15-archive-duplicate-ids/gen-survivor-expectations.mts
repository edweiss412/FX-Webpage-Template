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
  P("BL-RATE-LIMIT-SNAPSHOT-DURABILITY", "BACKLOG-archive.md", 2675, 2704),
  P("BL-LEDGER-MDAST-SHARED-HOME", "BACKLOG-archive.md", 2716, 2752),
  P("BL-AGENDA-PERLINK-COMPLETENESS", "BACKLOG-archive.md", 2767, 2801),
  P("BL-FITWITHINCLIP-CLIP-SCROLL-STALE", "BACKLOG-archive.md", 2821, 2863),
  P("BL-FINALIZE-CAS-ROLEFLAGS-NOTICE-DROP", "BACKLOG-archive.md", 2910, 2943),
  P("BL-IDENTITYLINK-LANDED-VS-REQUESTED", "BACKLOG-archive.md", 2953, 2986),
  P("BL-UNDO-SELECTIONS-RESET-AT-DROP", "BACKLOG-archive.md", 2996, 3028),
  P("BL-ADMIN-NOJS-LOADING-CONFLICT", "BACKLOG-archive.md", 3077, 3079),
  P("BL-MODAL-REALTIME-UPDATED-CUE", "BACKLOG-archive.md", 3160, 3168),
  P("BL-ONBOARDING-CAS-SOURCE-ANCHORS", "BACKLOG-archive.md", 3178, 3180),
  P("BL-ROLEFLAGS-NOTICE-HELPFULCONTEXT-OVERGRANT", "BACKLOG-archive.md", 3210, 3212),
  P("BL-ADMIN-PARSEPANEL-ORPHANED", "BACKLOG-archive.md", 3218, 3220),
  P("BL-HELP-STRIP-COPYLINK-STALE", "BACKLOG-archive.md", 3224, 3226),
  P("BL-UNPUBLISH-TO-HELD", "BACKLOG-archive.md", 3234, 3236),
  P("BL-VERSION-AMBIGUOUS-V1-OVERRIDE", "BACKLOG-archive.md", 3246, 3248),
  P("BL-CI-STATIC-ENV-INJECTION", "BACKLOG-archive.md", 3476, 3480),
  P("BL-DANGLING-CITATIONS-RETIRED-WORKFLOW", "BACKLOG-archive.md", 3492, 3494),
  P("BL-MASTERSPEC-FINANCIALS-VOCAB", "BACKLOG-archive.md", 3522, 3524),
  P("BL-SOUND-REDIRECT-GUARD", "BACKLOG-archive.md", 3532, 3536),
  P("BL-CI-GITHUB-ENV-CROSS-STEP-STATE", "BACKLOG-archive.md", 3546, 3550),
  P("BL-PG-CRON-PER-CASE-QUERY-ATTRIBUTION", "BACKLOG-archive.md", 3558, 3562),
  P("BL-LEDGER-GUARD-MDAST-REWRITE", "BACKLOG-archive.md", 3580, 3584),
  P("BL-ARCHIVE-PENDING-REALTIME-SWAP-RACE", "BACKLOG-archive.md", 4963, 4967),
  P("BL-ARCHIVE-REPEAT-TELEMETRY-DEDUP", "BACKLOG-archive.md", 4973, 4977),
  P("BL-INVARIANT8-CLOSEOUT-ENFORCEMENT", "BACKLOG-archive.md", 5210, 5216),
  P("BL-SHAREHUB-BACKDROP-COVERS-TRIGGERS", "BACKLOG-archive.md", 5343, 5347),
  P("BL-ATTENTION-MENU-PANEL-CLIP", "BACKLOG-archive.md", 5359, 5363),
  P("BL-PUBLISHED-TOGGLE-OVERLAY-CLIP", "BACKLOG-archive.md", 5375, 5379),
  P("BL-SHAREHUB-CONFIRM-NAMES-SHOW", "BACKLOG-archive.md", 5387, 5391),
  P("BL-SHAREHUB-OPEN-TIMER-LEAK", "BACKLOG-archive.md", 5403, 5407),
  P("BL-POPOVER-SHARED-RAF-COALESCER", "BACKLOG-archive.md", 5417, 5421),
  P("BL-WIZARD-RESTAGE-FETCH-BEFORE-LOCK", "BACKLOG-archive.md", 5574, 5581),
  P("BL-CONCURRENT-RETRY-DB-TIMEOUT-FLAKE", "BACKLOG-archive.md", 5683, 5695),
  P("BL-PARSER-VENUE-TYPO-GENERATOR-SEED-FLAKE", "BACKLOG-archive.md", 5710, 5718),
  P("BL-KNOWN-SECTIONS-WALKER", "BACKLOG-archive.md", 5732, 5747),
  P("BL-LEDGER-GUARD-TERMINAL-CLAIM-BLIND", "BACKLOG-archive.md", 5757, 5781),
  P("BL-NEEDS-ATTENTION-HOLDS-ROLLUP", "BACKLOG-archive.md", 6066, 6068),
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
