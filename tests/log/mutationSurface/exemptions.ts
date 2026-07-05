// Exemption / ledger / grandfather registries for the mutation-surface discovery
// meta-test (invariant #10, spec §4.3 escape hatches + §4.2 grandfather baseline).

import ts from "typescript";

/** An inline line comment `// no-telemetry: <reason>`. The trailing `\s*\S`
 * REQUIRES non-empty reason text (Codex R13 F3) — mirrors the `canonicalize-exempt`
 * precedent in `tests/admin/no-inline-email-normalization.test.ts`. A bare
 * `// no-telemetry:` with no reason does NOT match. */
export const NO_TELEMETRY_RE = /^\s*\/\/\s*no-telemetry:\s*\S/;

/** File-leading `// no-telemetry:` — only valid for a route file or a file with
 * no server-action surfaces (spec §4.3 item 1). Scans leading comment/blank
 * lines before the first real statement. */
export function fileHasNoTelemetry(file: string): boolean {
  const src = ts.sys.readFile(file) ?? "";
  const lines = src.split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === "") continue;
    if (NO_TELEMETRY_RE.test(line)) return true;
    if (trimmed.startsWith("//")) continue;
    break;
  }
  return false;
}

/** Per-function `// no-telemetry:` — the comment must sit INSIDE the body span
 * of the specific action function it exempts (spec §4.3 item 1); it never
 * leaks to a sibling or a later-added action. Uses `node.getStart()` (which
 * skips leading trivia) rather than `getFullStart()` so a comment ABOVE the
 * function declaration — e.g. a file-leading exemption on the first export in
 * a "use server" module — can never satisfy a per-function exemption; only a
 * comment written inside the function's own signature/body counts. */
export function functionSpanHasNoTelemetry(_file: string, node: ts.Node): boolean {
  const sf = node.getSourceFile();
  const text = sf.text.slice(node.getStart(sf), node.getEnd());
  return text.split("\n").some((line) => NO_TELEMETRY_RE.test(line));
}

export type AdminSurfaceExemption = {
  file: string;
  fn?: string;
  kind: "delegator" | "read-only";
  delegatesTo?: string;
};

/** The ONLY way an admin surface skips registry+behavioral (spec §4.3 item 2).
 * Two shapes:
 *  - `delegator`: a thin cross-file re-export shim whose POST forwards to a target
 *    route that IS registered + behaviorally proven. The two wizard pending-ingestion
 *    shims (`defer_until_modified`, `permanent_ignore`) both `export { POST } from
 *    "../retry/route"` → the retry route (registered, PENDING_INGESTION_* codes).
 *  - `read-only`: an admin-gated function that only READS (no write-builder, no `.rpc(`,
 *    no `logAdminOutcome`) — nothing to observe. The two dev-panel reads
 *    (`getStagedResult`, `listFixtures`) load fixture/staged state for the UI.
 * (The dev `*FormAction` wrappers are NOT here — they are registered + behaviorally
 * proven in AUDITABLE_MUTATIONS, since the delegator shape models cross-file
 * re-export shims, not a same-module by-name delegation.) */
export const ADMIN_SURFACE_EXEMPTIONS: readonly AdminSurfaceExemption[] = [
  {
    file: "app/api/admin/onboarding/pending_ingestions/[id]/defer_until_modified/route.ts",
    fn: "POST",
    kind: "delegator",
    delegatesTo: "app/api/admin/onboarding/pending_ingestions/[id]/retry/route.ts",
  },
  {
    file: "app/api/admin/onboarding/pending_ingestions/[id]/permanent_ignore/route.ts",
    fn: "POST",
    kind: "delegator",
    delegatesTo: "app/api/admin/onboarding/pending_ingestions/[id]/retry/route.ts",
  },
  { file: "app/admin/dev/actions.ts", fn: "getStagedResult", kind: "read-only" },
  { file: "app/admin/dev/actions.ts", fn: "listFixtures", kind: "read-only" },
  // Bell notification center Task 12: mints a short-lived Realtime JWT and
  // writes no state (no write-builder, no `.rpc(`, no `logAdminOutcome`) —
  // nothing to observe.
  { file: "app/api/admin/alerts/bell/token/route.ts", fn: "POST", kind: "read-only" },
];

export type KnownUninstrumented = { file: string; fn: string; backlog: string };

/** Debt ledger (spec §4.3 item 3, §3.1 C) — always per-function, never file-only.
 * EMPTY: BL-CREW-PICKER-OBSERVABILITY shipped 2026-07-05. The 6 non-admin crew/system
 * picker functions are now instrumented — the mutation boundaries in their private
 * `*Impl` emit the `auth.picker.*` crew-telemetry codes (PICKER_IDENTITY_SELECTED /
 * PICKER_IDENTITY_CLEARED / PICKER_STALE_ENTRY_CLEANED, coded `log.info` — NOT
 * `logAdminOutcome`, since the actor is an anonymous crew member on an emailed link),
 * and their exported wrappers carry `// no-telemetry:` delegation comments. The 3
 * admin-gated picker mutations remain instrumented via `logAdminOutcome` (§3.1 A). A
 * NEW uninstrumented picker mutation fails the discovery floor by default, not here. */
export const KNOWN_UNINSTRUMENTED: readonly KnownUninstrumented[] = [];

export type GrandfatherUnit = { file: string; fn: string };

/** The scope-bound behavioral-coverage baseline (spec §4.2, §9): admin surfaces
 * that ALREADY emitted a success outcome at `origin/main` HEAD but whose INLINE
 * `observeSuccessCodes` proof in `adminOutcomeBehavior.test.ts` is still being
 * backfilled. Originally 30 (24 pre-existing admin route POSTs + 6 pre-existing
 * admin action functions). This is a HARDCODED LITERAL (Codex plan-R3 F4 — NOT
 * computed from the tree) that NEVER grows and only SHRINKS as surfaces graduate
 * to inline proof (BL-ADMIN-OUTCOME-BEHAVIOR, delivered in batches).
 * Batch 1 (2026-07-05) graduated the 6 per-show action functions → 24 route POSTs
 * remain. `manifest/…/ignore` and `reap-stale-sessions` are deliberately NOT here —
 * they were seeded WITH inline proof, not pre-existing (Codex R15 F3 / plan-R3 F4). */
export const ADMIN_OUTCOME_BEHAVIOR_GRANDFATHER: readonly GrandfatherUnit[] = [
  {
    file: "app/api/admin/onboarding/staged/[wizardSessionId]/[driveFileId]/apply/route.ts",
    fn: "POST",
  },
  {
    file: "app/api/admin/onboarding/staged/[wizardSessionId]/[driveFileId]/approve/route.ts",
    fn: "POST",
  },
  {
    file: "app/api/admin/onboarding/staged/[wizardSessionId]/[driveFileId]/unapprove/route.ts",
    fn: "POST",
  },
  {
    file: "app/api/admin/onboarding/staged/[wizardSessionId]/[driveFileId]/discard/route.ts",
    fn: "POST",
  },
  { file: "app/api/admin/onboarding/finalize/route.ts", fn: "POST" },
  { file: "app/api/admin/onboarding/finalize-cas/route.ts", fn: "POST" },
  { file: "app/api/admin/staged/[fileId]/apply/route.ts", fn: "POST" },
  { file: "app/api/admin/show/staged/[stagedId]/apply/route.ts", fn: "POST" },
  { file: "app/api/admin/sync/[slug]/route.ts", fn: "POST" },
  { file: "app/api/admin/pending-ingestions/[id]/retry/route.ts", fn: "POST" },
  { file: "app/api/admin/snapshot-rollback/[id]/repair/route.ts", fn: "POST" },
  { file: "app/api/admin/show/[slug]/data-quality/ignore/route.ts", fn: "POST" },
  { file: "app/api/admin/show/[slug]/data-quality/unignore/route.ts", fn: "POST" },
  { file: "app/api/admin/admin-alerts/[id]/resolve/route.ts", fn: "POST" },
  { file: "app/api/admin/show/[slug]/alerts/[id]/resolve/route.ts", fn: "POST" },
  { file: "app/api/admin/pending-ingestions/[id]/discard/route.ts", fn: "POST" },
  { file: "app/api/admin/onboarding/pending_ingestions/[id]/retry/route.ts", fn: "POST" },
  { file: "app/api/admin/onboarding/rescan-sheet/route.ts", fn: "POST" },
  {
    file: "app/api/admin/onboarding/cleanup-abandoned-finalize/[sessionId]/route.ts",
    fn: "POST",
  },
  { file: "app/api/admin/show/staged/[stagedId]/discard/route.ts", fn: "POST" },
  { file: "app/api/admin/onboarding/scan/route.ts", fn: "POST" },
  {
    file: "app/api/admin/onboarding/extract-agenda/[wizardSessionId]/[driveFileId]/route.ts",
    fn: "POST",
  },
  { file: "app/api/admin/staged/[fileId]/discard/route.ts", fn: "POST" },
  { file: "app/api/admin/ignored-sheets/[driveFileId]/unignore/route.ts", fn: "POST" },
  // Batch 1 (2026-07-05) — the 6 per-show admin action functions GRADUATED to inline
  // observeSuccessCodes proof in adminOutcomeBehavior.test.ts (BL-ADMIN-OUTCOME-BEHAVIOR):
  //   archive.ts::archiveShowAction, unarchive.ts::unarchiveShowAction,
  //   setPublished.ts::setShowPublishedAction, feed.ts::{mi11ApproveAction,mi11RejectAction,undoChangeAction}.
];
