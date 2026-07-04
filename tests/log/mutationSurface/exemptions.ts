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
 * leaks to a sibling or a later-added action. */
export function functionSpanHasNoTelemetry(_file: string, node: ts.Node): boolean {
  const sf = node.getSourceFile();
  const text = sf.text.slice(node.getFullStart(), node.getEnd());
  return text.split("\n").some((line) => NO_TELEMETRY_RE.test(line));
}

export type AdminSurfaceExemption = {
  file: string;
  fn?: string;
  kind: "delegator" | "read-only";
  delegatesTo?: string;
};

/** The ONLY way an admin surface skips registry+behavioral (spec §4.3 item 2).
 * Populated in Task 17 alongside the corresponding source-file comments. */
export const ADMIN_SURFACE_EXEMPTIONS: readonly AdminSurfaceExemption[] = [];

export type KnownUninstrumented = { file: string; fn: string; backlog: string };

/** Debt ledger (spec §4.3 item 3, §3.1 C) — always per-function, never file-only.
 * Exactly the 6 non-admin-gated crew/system picker functions; the 3 admin-gated
 * picker mutations are instrumented (§3.1 A), never ledgered here (§4.3 hygiene
 * structurally rejects an admin-gated ledger entry). */
export const KNOWN_UNINSTRUMENTED: readonly KnownUninstrumented[] = [
  {
    file: "lib/auth/picker/cleanupStaleEntry.ts",
    fn: "cleanupStaleEntry",
    backlog: "BL-CREW-PICKER-OBSERVABILITY",
  },
  {
    file: "lib/auth/picker/cleanupStaleEntry.ts",
    fn: "cleanupStaleEntryCore",
    backlog: "BL-CREW-PICKER-OBSERVABILITY",
  },
  {
    file: "lib/auth/picker/clearIdentity.ts",
    fn: "clearIdentity",
    backlog: "BL-CREW-PICKER-OBSERVABILITY",
  },
  {
    file: "lib/auth/picker/clearIdentity.ts",
    fn: "clearIdentityAndSkip",
    backlog: "BL-CREW-PICKER-OBSERVABILITY",
  },
  {
    file: "lib/auth/picker/clearIdentity.ts",
    fn: "clearIdentityCore",
    backlog: "BL-CREW-PICKER-OBSERVABILITY",
  },
  {
    file: "lib/auth/picker/selectIdentity.ts",
    fn: "selectIdentityCore",
    backlog: "BL-CREW-PICKER-OBSERVABILITY",
  },
];

export type GrandfatherUnit = { file: string; fn: string };

/** The FROZEN scope-bound baseline (spec §4.2, §9): exactly the admin surfaces
 * that ALREADY emitted a success outcome at `origin/main` HEAD — 24 pre-existing
 * admin route POSTs + 6 pre-existing admin action functions. This is a HARDCODED
 * LITERAL (Codex plan-R3 F4 — NOT computed from the tree), and never grows.
 * `manifest/…/ignore` and `reap-stale-sessions` are deliberately NOT here — they
 * are seeded by this change, not pre-existing (Codex R15 F3 / plan-R3 F4). */
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
  { file: "app/admin/show/[slug]/_actions/archive.ts", fn: "archiveShowAction" },
  { file: "app/admin/show/[slug]/_actions/unarchive.ts", fn: "unarchiveShowAction" },
  { file: "app/admin/show/[slug]/_actions/setPublished.ts", fn: "setShowPublishedAction" },
  { file: "app/admin/show/[slug]/_actions/feed.ts", fn: "mi11ApproveAction" },
  { file: "app/admin/show/[slug]/_actions/feed.ts", fn: "mi11RejectAction" },
  { file: "app/admin/show/[slug]/_actions/feed.ts", fn: "undoChangeAction" },
];
