// Exemption / ledger registries for the mutation-surface discovery meta-test
// (invariant #10, spec §4.3 escape hatches). The behavioral-coverage grandfather
// baseline was fully retired when BL-ADMIN-OUTCOME-BEHAVIOR closed (Batch 3): every
// admin surface now carries a live proof, so there is no longer a grandfather escape.

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

// The behavioral-coverage grandfather baseline array + its unit type were fully
// retired when BL-ADMIN-OUTCOME-BEHAVIOR closed (Batch 3, 2026-07-09): all 30
// originally-grandfathered admin surfaces (6 per-show actions → Batch 1; 16 clean
// DI-seam route POSTs → Batch 2; the final 8 → Batch 3) now carry a live inline
// `proveAdminOutcomeBehavior` proof in adminOutcomeBehavior.test.ts. Task 18 there is
// now a STRICT completeness assertion with no escape hatch.
