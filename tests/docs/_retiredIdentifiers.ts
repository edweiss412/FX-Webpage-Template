// tests/docs/_retiredIdentifiers.ts
//
// Pure core for the retired-identifier reference guard. Split from the test file
// so the family proofs can run against synthetic inputs instead of depending on
// the real tree happening to contain an instance — the layer split
// tests/components/_orphanedComponents.ts and tests/docs/_invariant8Closeout.ts
// both use.
//
// WHY THIS EXISTS. When a component is retired, its name survives in comments,
// test titles, registries, and ledgers. Three consecutive adversarial rounds on
// the 2026-08-03 orphan-components branch each found references a hand-curated
// census had missed, and each miss came from a different `--glob` scoping
// decision silently reclassifying a live reference as history:
//
//   R1 — two files naming the path as a STRING inside a test helper (a
//        readFileSync and a registry row), invisible to an import-oriented grep.
//   R2 — a `test.describe` TITLE, and a still-open backlog entry.
//   R3 — three ACTIVE deferral-ledger rows, treated as history because they sat
//        in a docs/ directory.
//
// So discovery is a walk of `git ls-files` and every exemption is a CLAIM with a
// reason attached, reviewable per row.
//
// EXEMPTIONS ARE KEYED BY LINE CONTENT, NOT BY FILE (spec R4). A file key cannot
// distinguish a live occurrence from a historical one inside the same file, and
// this tree has exactly that case: the v1 plan's DEFERRED.md carries a LIVE
// commitment naming RightNowCard and resolved history naming it too.
// Allowlisting the file to keep the history also exempts the live row; refusing
// to allowlist it leaves the guard permanently red.
//
// ARCHIVE ROWS ARE GLOBS, WITH THE CURRENT-STATE DOCUMENTS CARVED OUT (spec R7).
// The census finds these identifiers in ~40 documents under docs/superpowers/**;
// forty hand rows would be a curated list by another name. But a glob that
// swallowed a live ledger — or 00-overview.md, whose file map declares itself
// "the source of truth for where does X live" — would reintroduce the same
// mixed-liveness defect at directory scale. Membership test for the carve-out: a
// file is CURRENT-STATE if a reader consults it to learn how things ARE, not how
// they WERE.
import { readFileSync } from "node:fs";
import { join } from "node:path";

export const ROOT = process.cwd();

/** The identifiers this branch retires. A reference to any of them is a hit. */
export const RETIRED_IDENTIFIERS = [
  "RightNowCard",
  "PerShowCrewSection",
  "PerShowCrewRow",
  "ResolveAlertButton",
  "RunFinalCASButton",
] as const;

/**
 * Path prefixes whose every file is a dated record end to end: what was true
 * when written. A superseded design record is not corrected, it is superseded.
 */
export const ARCHIVE_GLOBS = [
  "docs/superpowers/specs/",
  "docs/superpowers/plans/",
  "docs/audits/",
  "docs/superpowers/artifacts/",
  // Byte-frozen copies of the ledgers at a named date, cross-checked against git
  // history by the `pnpm ledger:mass` oracle. A snapshot of BACKLOG.md carries
  // every name the repo had retired by that date BY CONSTRUCTION, and the one
  // repair this guard asks for — edit the line — is precisely the mutant the
  // oracle exists to kill. Scoped to this ONE directory, never `tests/fixtures/`:
  // a live fixture naming a retired component is still a defect. The naming
  // assertion below keeps a non-snapshot file from landing here unnoticed.
  "tests/fixtures/ledger-mass/",
] as const;

/**
 * Every file under the frozen-snapshot glob is a dated ledger snapshot.
 *
 * The glob exempts a whole directory, so without this a hand-written helper
 * dropped beside the snapshots would inherit the exemption silently — the
 * "archive globs matching nothing" assertion catches a typo that WIDENS by
 * matching nothing, not one that widens by matching too much.
 */
export const FROZEN_LEDGER_SNAPSHOT_GLOB = "tests/fixtures/ledger-mass/";
export const FROZEN_LEDGER_SNAPSHOT_NAME = /^\d{4}-\d{2}-\d{2}\.ledgers\.json$/;

/** Whole files that are archives by name rather than by directory. */
export const ARCHIVE_FILES = ["BACKLOG-archive.md", "DEFERRED-archive.md"] as const;

/**
 * CURRENT-STATE documents that sit inside an archive glob but describe how
 * things ARE. A stale reference in one of these is a defect, not a record, so
 * they need per-line rows like any live file. Every path here is asserted to
 * EXIST, so a rename cannot silently return a file to the archive glob.
 */
export const CURRENT_STATE_CARVE_OUTS = [
  "BACKLOG.md",
  // The master spec is the canonical contract (AGENTS.md invariant 7), not a dated
  // record. It sits inside the specs glob, so without this row an injected stale
  // reference in it would be silently exempt — whole-diff R2 proved exactly that.
  "docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md",
  "docs/superpowers/plans/2026-04-30-fxav-crew-pages-v1/00-overview.md",
  "docs/superpowers/plans/2026-04-30-fxav-crew-pages-v1/ROUTING.md",
  "docs/superpowers/plans/2026-04-30-fxav-crew-pages-v1/HANDOFF-TEMPLATE.md",
  "docs/superpowers/plans/2026-04-30-fxav-crew-pages-v1/DEFERRED.md",
  "docs/superpowers/plans/v1-pre-deployment-amendments/2026-05-12-user-facing-docs/DEFERRED.md",
] as const;

/**
 * Live, current-state files inside the archive globs.
 *
 * Three families, each discovered by SHAPE rather than enumerated, so a new one is
 * covered the day it lands:
 *   - any `DEFERRED.md` under the plans tree (a deferral is a commitment),
 *   - any `README.md` under `docs/superpowers/**` (whole-diff R3: these are
 *     catalogs and subsystem indexes — they describe what exists NOW, so a stale
 *     entry in one is a defect, not a record),
 *   - the explicitly named documents in CURRENT_STATE_CARVE_OUTS.
 */
export function isLiveLedger(file: string): boolean {
  if ((CURRENT_STATE_CARVE_OUTS as readonly string[]).includes(file)) return true;
  if (file.startsWith("docs/superpowers/") && file.endsWith("/README.md")) return true;
  return file.startsWith("docs/superpowers/plans/") && file.endsWith("/DEFERRED.md");
}

/** True when the whole file is a dated record AND is not carved out as current-state. */
export function isArchivePath(file: string): boolean {
  if (isLiveLedger(file)) return false;
  if ((ARCHIVE_FILES as readonly string[]).includes(file)) return true;
  return ARCHIVE_GLOBS.some((g) => file.startsWith(g));
}

/**
 * One exemption. `line` and `pending` carry the matched line VERBATIM (trimmed);
 * a row that matches nothing fails, so editing an exempted line invalidates its
 * exemption instead of silently widening it.
 */
export type ExemptionRow =
  | { kind: "line"; file: string; text: string; reason: string }
  | { kind: "pending"; file: string; text: string; repairedBy: string; reason: string };

/**
 * The ledger. `pending` rows are live references this branch repairs; the task
 * named in `repairedBy` deletes its rows in the same commit that repairs them,
 * and the terminal assertion requires zero `pending` rows at close-out.
 *
 * ANY task that edits, moves, or deletes an exempted line owns its row in the
 * same commit. "I only renamed a test file" is exactly the case that breaks an
 * exact-line exemption.
 */
export const RETIRED_IDENTIFIER_EXEMPTIONS: readonly ExemptionRow[] = [
  {
    kind: "line",
    file: "BACKLOG-archive.md",
    text:
      "**Description:** M5-D7 extracted the canonical accent-fill button chrome (`bg-accent` + `text-accent-text` + `hover:bg-accent-hover` + focus-ring + disabled treatment) into one atom and migrated the **8 admin call sites** the deferral named (ResolveAlertButton ×2, PendingPanelRetryButton, ReSyncButton, PublishShowButton, RunFinalCASButton, ResumeFinalizeButton, FinalizeButton, StagedReviewCard). **Census note (2026-08-03):** four of those eight call sites have since been deleted — PublishShowButton at `32fec4fac` (with `/admin/unpublished`), ResumeFinalizeButton at the Step-3 consolidation, and ResolveAlertButton and RunFinalCASButton as zero-production-importer components — and `ReSyncButton` was separately DE-MIGRATED to a ghost trigger by the modal-header reconciliation (§6.7), so the executable `MIGRATED_FILES` census in `tests/styles/accent-button-atom.test.ts` is now three: `PendingPanelRetryButton`, `FinalizeButton`, `StagedReviewCard`. That scan walks the migrated files, not the repo; repo-wide `bg-accent` coverage belongs to `tests/styles/_metaBgAccentInventory.test.ts`. A repo-wide grep at migration time found the pattern still hand-rolled in **~17 other sites** OUT OF M5-D7 SCOPE: `app/admin/error.tsx`, `app/admin/settings/error.tsx`, `app/admin/settings/admins/{error.tsx,AddAdminForm.tsx,RevokeRowButton.tsx ×3}`, `app/admin/show/[slug]/{ShareLinkCopyButton.tsx,ResetPickerEpochButton.tsx,RotateShareTokenButton.tsx ×2}`, `app/show/[slug]/unpublish/ConfirmUnpublishForm.tsx`, `app/show/[slug]/[shareToken]/_SignInOrSkipGate.tsx ×2`, `components/admin/Mi11GateActions.tsx`, `components/admin/wizard/{Step1Share,Step2Verify ×2,Step3Review}.tsx`, `components/admin/settings/AddAdminDisclosure.tsx`, `components/shared/{ReportButton.tsx,ReportModal.tsx ×4}`. (Pill-badge `bg-accent text-accent-text` spans in AdminNav/NotifBell and the active-step indicators in OnboardingWizard/Step3Review/me/page are NOT buttons — they are a different, legitimate use of the token pair and out of scope for this atom.)",
    reason:
      "BL-ACCENT-BUTTON-ATOM-SWEEP's description records which call sites M5-D7 migrated. The retired names ARE the census, and the note says they are retired. Moved to BACKLOG-archive.md 2026-08-06 when the L-wave demoted the entry at its honest census (3 live in MIGRATED_FILES, not 8); the line is unchanged, only its file.",
  },
  {
    kind: "line",
    file: "BACKLOG-archive.md",
    text:
      "| `components/admin/PerShowCrewSection.tsx` | RETIRED. Mount removed at `d70761005`; the route is now a 307 into the dashboard modal, where `CrewBreakdown` renders the roster.                                 |",
    reason:
      "Disposition table in the worked orphan entry: each row records what was retired and what superseded it. Moved to BACKLOG-archive.md 2026-08-26 with BL-ORPHANED-COMPONENTS-ZERO-PROD-IMPORTERS; the line is unchanged, only its file.",
  },
  {
    kind: "line",
    file: "BACKLOG-archive.md",
    text:
      "| `components/admin/ResolveAlertButton.tsx` | RETIRED. Superseded at `67ce6d082` by the bell panel's resolve control (labelled `Confirm` / `Mark resolved`, never \"Dismiss\").                                   |",
    reason:
      "Disposition table in the worked orphan entry. Moved to BACKLOG-archive.md 2026-08-26 with the entry; the line is unchanged, only its file.",
  },
  {
    kind: "line",
    file: "BACKLOG-archive.md",
    text:
      "| `components/admin/RunFinalCASButton.tsx`  | RETIRED. Superseded at `bd214c04b`; `FinalizeButton`'s `\"finish\"` mode is the live finalize-cas path.                                                             |",
    reason:
      "Disposition table in the worked orphan entry. Moved to BACKLOG-archive.md 2026-08-26 with the entry; the line is unchanged, only its file.",
  },
  {
    kind: "line",
    file: "BACKLOG-archive.md",
    text:
      "| `components/right-now/RightNowCard.tsx`   | RETIRED. Superseded at `b327d5eb0` by `RightNowHero`; its two regression suites were RETARGETED onto the hero first, each proven by mutation rather than assumed. |",
    reason:
      "Disposition table in the worked orphan entry. Moved to BACKLOG-archive.md 2026-08-26 with the entry; the line is unchanged, only its file.",
  },
  {
    kind: "line",
    file: "components/crew/RightNowHero.tsx",
    text:
      "* `RightNowCard` required.",
    reason:
      "Continuation of the retirement provenance sentence above it.",
  },
  {
    kind: "line",
    file: "components/crew/RightNowHero.tsx",
    text:
      "* `RightNowHero` IS the retired `RightNowCard` re-skinned into the mock's",
    reason:
      "Provenance: the hero is defined by what it was reskinned from, and the reader needs the name to find it in history.",
  },
  {
    kind: "line",
    file: "components/crew/RightNowHero.tsx",
    text:
      "// ── lastGood / morph-to-last-good tracker (verbatim from RightNowCard) ──",
    reason:
      "Provenance: marks the block as carried verbatim, which is why the retargeted regression pins apply to it.",
  },
  {
    kind: "line",
    file: "components/right-now/buildRightNowContext.ts",
    text:
      "* original `RightNowCard` at `b327d5eb0`, which is retired).",
    reason:
      "Provenance for the projection's consumer: the sentence exists to name what superseded what.",
  },
  {
    kind: "line",
    file: "components/shared/AccentButton.tsx",
    text:
      "* consolidation, ResolveAlertButton and RunFinalCASButton retired 2026-08-03,",
    reason:
      "Retirement provenance: the atom's drift history is the point of the sentence, and naming what left keeps the census honest.",
  },
  {
    kind: "line",
    file: "docs/superpowers/plans/2026-04-30-fxav-crew-pages-v1/00-overview.md",
    text:
      "crew/RightNowHero.tsx      # state machine (§8.2; superseded right-now/RightNowCard.tsx at b327d5eb0)",
    reason:
      "The canonical file map points at the live hero; the retired path survives only as the supersession note that makes the change legible.",
  },
  {
    kind: "line",
    file: "docs/superpowers/plans/2026-04-30-fxav-crew-pages-v1/DEFERRED.md",
    text:
      "**Description:** `components/layout/Header.tsx` show title is `text-2xl sm:text-3xl font-bold` — same scale as the RightNowCard lead. The eyebrow `client_label` is the same `text-xs uppercase` as every tile heading. Result: header competes visually with both the hero card and the tile grid; nothing dominates.",
    reason:
      "Description of a resolved deferral; rewriting it would falsify the record.",
  },
  {
    kind: "line",
    file: "docs/superpowers/plans/2026-04-30-fxav-crew-pages-v1/DEFERRED.md",
    text:
      "**Description:** `components/right-now/RightNowCard.tsx` carries 3 `data-*` test attributes (`data-state`, `data-rendered-state`, `data-treatment`) on a screen-reader-traversed `<p>`. Over-instrumented for a hero element.",
    reason:
      "Description of a deferral resolved in M9 C1; the file it names was accurate when written.",
  },
  {
    kind: "line",
    file: "docs/superpowers/plans/2026-04-30-fxav-crew-pages-v1/DEFERRED.md",
    text:
      "**Description:** Five different `tracking-[...]` values for uppercase eyebrows across Section + KeyValue + Header + RightNowCard + Footer (`0.12em` / `0.14em` / `0.18em` / `0.22em` / inline arbitrary values). Token-discipline contract violation — inline arbitrary values where a named token would unify the spec.",
    reason:
      "Description of a resolved deferral; rewriting it would falsify the record.",
  },
  {
    kind: "line",
    file: "docs/superpowers/plans/2026-04-30-fxav-crew-pages-v1/DEFERRED.md",
    text:
      "**Regression test added:** `tests/components/ResolveAlertButton.test.tsx` — new case `\"M9-D-C4-1: pending flips back to false on action failure → Confirm + Cancel re-enabled (no stuck Resolving…)\"` uses a controlled async action that rejects mid-flight; asserts the disabled controls re-enable + label reverts to \"Confirm resolve\" after the failed submission. The existing `confirm → resolving` case was also rewritten to use a real `<form action={fn}>` with a controlled promise so useFormStatus has an actual submission lifecycle to track.",
    reason:
      "A RESOLVED deferral's record of the test that closed it; the suite was retired with its component on 2026-08-03, and rewriting the record would falsify what closed the deferral.",
  },
  {
    kind: "line",
    file: "docs/superpowers/plans/2026-04-30-fxav-crew-pages-v1/DEFERRED.md",
    text:
      "**Status:** **Resolved.** `components/admin/ResolveAlertButton.tsx` refactored to derive the \"Resolving…\" / disabled-controls state from `useFormStatus().pending` instead of a local `ui=\"resolving\"` flag.",
    reason:
      "Resolution note on a closed deferral: it records what was refactored at the time.",
  },
  {
    kind: "line",
    file: "docs/superpowers/plans/2026-04-30-fxav-crew-pages-v1/DEFERRED.md",
    text:
      "**Status:** Resolved in M9 Cluster C1 (commit `9c5b98a` in recent log: \"relocate RightNowCard debug attributes off AT-traversed p (M4-D4)\").",
    reason:
      "Resolution note quoting the commit subject verbatim; rewriting it would falsify the citation.",
  },
  {
    kind: "line",
    file: "docs/superpowers/plans/2026-04-30-fxav-crew-pages-v1/DEFERRED.md",
    text:
      "**Suggested home:** M9 polish. Either shrink the header (smaller title, condense to a sticky-thin bar) so the RightNowCard wins the page's primary moment unambiguously, OR commit to header-as-context (smaller title, drop the orange hairline which fights the RightNowCard's accent dot for the eye).",
    reason:
      "Suggested-home note on a resolved deferral; history.",
  },
  {
    kind: "line",
    file: "docs/superpowers/plans/2026-04-30-fxav-crew-pages-v1/DEFERRED.md",
    text:
      "### M4-D3 — Header weight competes with RightNowCard for the page hero — **RESOLVED 2026-05-17 via M9 Cluster C1**",
    reason:
      "A resolved deferral inside a live ledger: history, and the heading records what was true when it closed.",
  },
  {
    kind: "line",
    file: "docs/superpowers/plans/2026-04-30-fxav-crew-pages-v1/DEFERRED.md",
    text:
      "### M4-D4 — RightNowCard data-\\* test attribute relocation — **RESOLVED 2026-05-17 via M9 Cluster C1**",
    reason:
      "A resolved deferral inside a live ledger: history, and the heading records what was true when it closed.",
  },
  {
    kind: "line",
    file: "docs/superpowers/plans/v1-pre-deployment-amendments/2026-05-12-user-facing-docs/DEFERRED.md",
    text:
      "- **Concrete fix path (NOT Phase A scope):** Project-infra session — either (a) raise `maxDiffPixels` tolerance on the four `empty-state-reachability.spec.ts` snapshots to allow ~0.02 ratio, (b) refresh the snapshots if a stable post-fonts rendering can be captured, or (c) investigate the RightNowCard hydration drift root-cause and pin its post-hydration state before the screenshot fires.",
    reason:
      "Scope note naming the M3/M4 render path as it stood; a record of the deferral's boundary, not a live pointer.",
  },
  {
    kind: "line",
    file: "docs/superpowers/plans/v1-pre-deployment-amendments/2026-05-12-user-facing-docs/DEFERRED.md",
    text:
      "- **Why deferred (concrete trigger):** Current 3 manifest keys (`dashboard-overview`, `review-queues-empty-state`, `preview-as-crew-banner`) capture surfaces that contain only hover/focus transition-colors on links/buttons — no load-time animations, no spinners, no framer-motion inside the captured selectors. `RightNowCard` does use framer-motion but is outside the `preview-as-crew-banner` capture region. The empirical determinism evidence outweighs the theoretical timing vulnerability at this scope. Phase F R4 APPROVE-with-residual disposition.",
    reason:
      "Trigger note describing the surfaces the manifest captured at filing time.",
  },
  {
    kind: "line",
    file: "docs/superpowers/plans/v1-pre-deployment-amendments/2026-05-12-user-facing-docs/DEFERRED.md",
    text:
      "- **Why deferred (NOT Phase A's surface):** Phase A does not touch `components/show/`, `components/atoms/`, or `app/show/[slug]/`. The M3 LodgingTile + tile-grid render path is owned by the M3/M4 plan tree. WebServer logs surface an incidental hydration drift on `<RightNowCard data-prefers-reduced-motion>` (\"unknown\" → \"false\"), but RightNowCard is outside the screenshotted `tile-grid` element.",
    reason:
      "Scope note describing what Phase A did not touch; a record of the boundary.",
  },
  {
    kind: "line",
    file: "tests/components/admin/FinalizeReentry.test.tsx",
    text:
      "* RunFinalCASButton was retired 2026-08-03 (see the note below).",
    reason:
      "Records which surfaces this suite lost and when; the names are the history the count depends on.",
  },
  {
    kind: "line",
    file: "tests/components/admin/FinalizeReentry.test.tsx",
    text:
      "// CleanupAbandonedFinalizeButton contract remains here. The RunFinalCASButton",
    reason:
      "Explains what left this file and where the live coverage moved; naming it is the pointer a reader needs.",
  },
  {
    kind: "line",
    file: "tests/components/atoms/AccentButton.test.tsx",
    text:
      "* atom — plus PublishShowButton, ResumeFinalizeButton, ResolveAlertButton and",
    reason:
      "Retirement provenance for the atom's drift history; naming what left keeps the eight-site census checkable.",
  },
  {
    kind: "line",
    file: "tests/components/atoms/AccentButton.test.tsx",
    text:
      "* RunFinalCASButton, all since deleted, and ReSyncButton, de-migrated).",
    reason:
      "Second half of the same census sentence.",
  },
  {
    kind: "line",
    file: "tests/components/crew/rightNowHero.test.tsx",
    text:
      "* `RightNowHero` IS the retired `RightNowCard` re-skinned into the §4.16 five-slot hero",
    reason:
      "Provenance: the suite's subject is defined by what it was reskinned from.",
  },
  {
    kind: "line",
    file: "tests/components/crew/rightNowHeroRecovery.test.tsx",
    text:
      "* RETARGET (2026-08-03): this suite pinned `RightNowCard`, which the",
    reason:
      "Provenance for the retarget: naming the component this suite used to pin IS the content.",
  },
  {
    kind: "line",
    file: "tests/help/_metaServerTimeGuard.test.ts",
    text:
      "// 'use client' directive over from the retired RightNowCard verbatim, so the",
    reason:
      "Explains why swapping the island exemplar preserves the classifier's contract; naming the source is the justification.",
  },
  {
    kind: "line",
    file: "tests/styles/accent-button-atom.test.ts",
    text:
      "// RunFinalCASButton left the same way on 2026-08-03: both were retired as",
    reason:
      "Second half of the same de-migration note.",
  },
  {
    kind: "line",
    file: "tests/styles/accent-button-atom.test.ts",
    text:
      "// the Step-3 consolidation retired it — spec §4.5. ResolveAlertButton and",
    reason:
      "Explains why two rows left the migrated-files list; naming what left is the justification a reviewer checks.",
  },
];

const SELF: readonly string[] = [
  "tests/docs/_retiredIdentifiers.ts",
  "tests/docs/retiredIdentifierReferences.test.ts",
];

export interface Hit {
  file: string;
  line: number;
  identifier: string;
  text: string;
}

/** Every hit of every retired identifier across the given tracked files. */
export function scanFiles(files: readonly string[], root: string = ROOT): Hit[] {
  const out: Hit[] = [];
  for (const file of files) {
    if (SELF.includes(file)) continue; // the ledger and its test name every identifier by construction
    let source: string;
    try {
      source = readFileSync(join(root, file), "utf8");
    } catch {
      continue; // deleted between `git ls-files` and the read; not this guard's business
    }
    if (!RETIRED_IDENTIFIERS.some((id) => source.includes(id))) continue;
    const lines = source.split("\n");
    for (const [i, raw] of lines.entries()) {
      // ONE hit per LINE, not per identifier. A line naming several retired
      // components is one reference to repair, so it takes one exemption row;
      // counting per identifier would demand N rows for one sentence. The
      // occurrence counting that matters is across DUPLICATE LINES, which this
      // preserves.
      const named = RETIRED_IDENTIFIERS.filter((id) => raw.includes(id));
      if (named.length > 0) {
        out.push({ file, line: i + 1, identifier: named.join("+"), text: raw.trim() });
      }
    }
  }
  return out;
}

/** The hits no exemption covers, sorted for a stable failure message. */
const key = (file: string, text: string): string => `${file}\u0000${text}`;

/**
 * The hits no exemption covers.
 *
 * Matching is OCCURRENCE-COUNTED, not set-based (whole-diff review finding 5): a
 * row exempts ONE occurrence of its text, so if a file gains a second identical
 * line, the duplicate surfaces. A set-based match would let one historical
 * exemption silently cover a newly duplicated live reference — the same
 * "one claim, unbounded coverage" failure that made the file-keyed design wrong.
 */
export function unexemptedHits(hits: readonly Hit[], rows: readonly ExemptionRow[]): Hit[] {
  const budget = new Map<string, number>();
  for (const row of rows) {
    const k = key(row.file, row.text);
    budget.set(k, (budget.get(k) ?? 0) + 1);
  }
  const out: Hit[] = [];
  for (const h of hits) {
    if (isArchivePath(h.file)) continue;
    const k = key(h.file, h.text);
    const left = budget.get(k) ?? 0;
    if (left > 0) {
      budget.set(k, left - 1);
      continue;
    }
    out.push(h);
  }
  return out.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
}

/** Exemption rows that no longer match any line — stale claims, and a failure. */
export function unmatchedRows(
  hits: readonly Hit[],
  rows: readonly ExemptionRow[],
): ExemptionRow[] {
  // Counted the same way: two rows for a line that occurs once leaves one row
  // matching nothing, which is a stale claim even though the text still exists.
  const available = new Map<string, number>();
  for (const h of hits) {
    const k = key(h.file, h.text);
    available.set(k, (available.get(k) ?? 0) + 1);
  }
  const out: ExemptionRow[] = [];
  for (const row of rows) {
    const k = key(row.file, row.text);
    const left = available.get(k) ?? 0;
    if (left > 0) available.set(k, left - 1);
    else out.push(row);
  }
  return out;
}
