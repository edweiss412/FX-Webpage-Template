/**
 * Drift-guard meta-test for the data-quality gap class
 * (spec: 2026-07-04-data-quality-badge-full-warn-class §3.2).
 *
 * Rounds 1-4 of the spec review proved that statically tracing WHICH literal
 * becomes a persisted `ParseWarning.code` is intractable — codes are threaded
 * through `warn(code)`, `reelWarning(code)`, `drift(…, CODE)` → `reelWarning(var)`,
 * unpinned `warning()` factories, and file-local consts. So this guard does NOT
 * trace producer mechanisms. It is MECHANISM-AGNOSTIC + CATALOG-ANCHORED:
 *
 *   Layer 1 (authoritative): a human-maintained, pairwise-disjoint partition of
 *     every persisted-ParseWarning code into gap / benign-warn / benign-info /
 *     asset. This is the editorial ledger.
 *   Layer 2 (drift alarm): collect EVERY code-shaped string literal across
 *     lib/parser + lib/sync, intersect the canonical MESSAGE_CATALOG (drops
 *     non-code noise, keeps only real system codes wherever/however threaded),
 *     and assert each survivor is classified — in the 42-partition OR the
 *     NON_GAP_CATALOG_CODES ignore-list. A new persisted gap code that
 *     nobody classified fails here; naming another literal is the guard WORKING.
 *
 * Residual (documented): a code that is NEVER a literal anywhere (fully
 * runtime-computed) escapes — none exists today (verified). summarizeDataGaps
 * fails safe on such a code (allow-list → uncounted; never over-counts/crashes).
 */

import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import * as ts from "typescript";
import { GAP_CLASSES, OPERATOR_ACTIONABLE_ANCHORED } from "@/lib/parser/dataGaps";
import { MESSAGE_CATALOG } from "@/lib/messages/catalog";
import { familyFor } from "@/app/help/errors/_families";

// ── Layer 1: the editorial partition (every PERSISTED ParseWarning code) ──────

/** 23 — sheet-data-quality gaps counted by summarizeDataGaps (from GAP_CLASSES). */
const DATA_GAP_CODES = new Set<string>(GAP_CLASSES.map((g) => g.code));

/** 7 — warn-severity but semantically benign (parser fixed/adjusted; data landed). */
const BENIGN_WARN_CODES = new Set<string>([
  "STAGE_WORD_AUTOCORRECTED",
  "ROLE_TOKEN_AUTOCORRECTED",
  "COLUMN_HEADER_AUTOCORRECTED",
  "SECTION_HEADER_AUTOCORRECTED",
  "FIELD_LABEL_AUTOCORRECTED",
  "AGENDA_SCHEDULE_TIME_ADJUSTED",
  "AGENDA_SCHEDULE_LOW_CONFIDENCE",
]);

/** 2 — info-severity benign. */
const BENIGN_INFO_CODES = new Set<string>(["TYPO_NORMALIZED", "DAY_RESTRICTION_DOUBLE_LOCATION"]);

/** 11 — persisted warn ParseWarnings, but Drive-asset enrichment, NOT sheet parse. */
const ASSET_WARN_CODES = new Set<string>([
  "DIAGRAMS_TAB_MISSING",
  "DIAGRAMS_EMBEDDED_NONE_FOUND",
  "DIAGRAMS_EMBEDDED_CAP_EXCEEDED",
  "DIAGRAMS_EMBEDDED_REVISIONS_UNAVAILABLE",
  "DIAGRAMS_EMBEDDED_OBJECT_INACCESSIBLE",
  "LINKED_FOLDER_OVERFLOW_TRUNCATED",
  "EMBEDDED_ASSET_DRIFTED",
  "EMBEDDED_RECOVERY_REQUIRES_RESTAGE",
  "REEL_DRIFTED",
  "OPENING_REEL_PERMISSION_DENIED",
  "OPENING_REEL_NOT_VIDEO",
]);

/** The full persisted-ParseWarning universe (42) — every code lands in exactly one bucket. */
const ALL_PERSISTED_WARNING_CODES = new Set<string>([
  ...DATA_GAP_CODES,
  ...BENIGN_WARN_CODES,
  ...BENIGN_INFO_CODES,
  ...ASSET_WARN_CODES,
]);

/**
 * Ignore-list — real MESSAGE_CATALOG codes that appear as literals in
 * lib/parser / lib/sync but are NOT counted gap `ParseWarning`s (so they never
 * reach the data-quality badge). This includes admin/sync control codes AND
 * parser hardErrors (`ParseError`, no severity — fatal parse failures, a
 * different surface from warn-severity data gaps). They are collected by the
 * mechanism-agnostic scan, so they MUST be listed here to satisfy
 * `collected ∩ catalog ⊆ partition ∪ ignore`. Grouped by family. Bootstrapped
 * empirically 2026-07-04 (spec §3.2); a NEW code added as a literal fails the
 * scan until classified — safe (fails closed).
 */
const NON_GAP_CATALOG_CODES = new Set<string>([
  // parser hardErrors (ParseError, not a persisted ParseWarning — fatal, held for
  // review via the parse-failure path, never counted as a warn-severity data gap)
  "VERSION_AMBIGUOUS",
  // admin_alerts / lifecycle codes raised from the sync path (not parse warnings)
  "SHOW_FIRST_PUBLISHED",
  "SHOW_UNPUBLISHED",
  "SHOW_ARCHIVED_IMMUTABLE",
  "FINALIZE_OWNED_SHOW",
  "ONBOARDING_SCAN_REVIEW",
  "ROLE_FLAGS_NOTICE",
  // sync-problem / infra codes (surface as admin alerts / results, not parse warnings)
  "SHEET_UNAVAILABLE",
  "PARSE_ERROR_LAST_GOOD",
  "RESYNC_SHRINK_HELD",
  "RESYNC_QUALITY_REGRESSED",
  "SYNC_FILE_FAILED",
  "SYNC_INFRA_ERROR",
  "SYNC_STEP_TIMEOUT",
  "CONCURRENT_SYNC_SKIPPED",
  "WEBHOOK_NOOP_ALREADY_SYNCED",
  "DRIVE_FETCH_FAILED",
  "DRIVE_METADATA_MISSING",
  "LIVE_ROW_CONFLICT",
  "LOCK_OWNERSHIP_ASSERTION_FAILED",
  // staged-parse control codes (staging state machine, not parse warnings)
  "STAGED_PARSE_OUTDATED",
  "STAGED_PARSE_RESTAGED_INLINE",
  "STAGED_PARSE_RESULT_CORRUPT",
  "STAGED_PARSE_REVISION_RACE",
  "STAGED_PARSE_REVISION_RACE_COOLDOWN",
  "STAGED_PARSE_SOURCE_GONE",
  "STAGED_PARSE_SOURCE_OUT_OF_SCOPE",
  "STAGED_PARSE_SUPERSEDED",
  "STAGED_REVIEW_ITEMS_CORRUPT",
  // reviewer-choice validation codes (wizard, not parse warnings)
  "DUPLICATE_REVIEWER_CHOICE",
  "EXTRA_REVIEWER_CHOICE",
  "INVALID_REVIEWER_ACTION",
  "MISSING_REVIEWER_CHOICE",
  // pending sync/ingestion + snapshot stuck codes
  "PENDING_INGESTION_NOT_FOUND",
  "PENDING_SYNC_NOT_FOUND",
  "PENDING_SNAPSHOT_DELETE_STUCK",
  "PENDING_SNAPSHOT_PROMOTE_STUCK",
  "PENDING_SNAPSHOT_ROLLBACK_STUCK",
  // wizard-session / isolation codes
  "WIZARD_ISOLATION_INDEXES_MISSING",
  "WIZARD_SESSION_SUPERSEDED",
  "WIZARD_SESSION_SUPERSEDED_DURING_SCAN",
  // stale-write / replay abort codes
  "STALE_DISCARD_REJECTED",
  "STALE_MANUAL_REPLAY_ABORTED",
  "STALE_PUSH_ABORTED",
  "STALE_WRITE_ABORTED",
  // unpublish-token lifecycle
  "UNPUBLISH_TOKEN_CONSUMED",
  "UNPUBLISH_TOKEN_EXPIRED",
  // MI11 drive-recheck / hold codes
  "MI11_DRIVE_RECHECK_FAILED",
  "MI11_HOLD_ALREADY_RESOLVED",
  // asset-recovery control codes (cooldown/drift accounting, not persisted parse warnings)
  "ASSET_RECOVERY_BYTES_EXCEEDED",
  "ASSET_RECOVERY_DRIFT_COOLDOWN",
  "ASSET_RECOVERY_REVISION_DRIFT",
]);

// ── Layer 2: mechanism-agnostic, catalog-anchored source scan ─────────────────

const CODE_RE = /^[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+$/;
const CATALOG_CODES = new Set<string>(Object.keys(MESSAGE_CATALOG));

function tsFiles(dir: string, acc: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) tsFiles(p, acc);
    else if (p.endsWith(".ts") && !p.endsWith(".test.ts") && !p.endsWith(".d.ts")) acc.push(p);
  }
  return acc;
}

/** AST StringLiteral / no-substitution-template scan (per feedback_ast_guard_for_log_code_stamps —
 * comments are NOT collected, so a code mentioned in prose can't false-trip the guard). */
function collectCodeLiterals(path: string, into: Set<string>): void {
  const src = readFileSync(path, "utf8");
  const sf = ts.createSourceFile(path, src, ts.ScriptTarget.Latest, true);
  const visit = (n: ts.Node): void => {
    if ((ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) && CODE_RE.test(n.text)) {
      into.add(n.text);
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
}

const ROOT = process.cwd();
const collectedRealCodes = (() => {
  const all = new Set<string>();
  for (const f of [...tsFiles(join(ROOT, "lib/parser")), ...tsFiles(join(ROOT, "lib/sync"))]) {
    collectCodeLiterals(f, all);
  }
  return [...all].filter((c) => CATALOG_CODES.has(c)); // intersect the canonical catalog
})();

// ── Assertions ────────────────────────────────────────────────────────────────

describe("data-gap class completeness (drift guard)", () => {
  it("Layer 1 — the 4 buckets are pairwise disjoint and total 43 (23/7/2/11)", () => {
    expect(DATA_GAP_CODES.size).toBe(23);
    expect(BENIGN_WARN_CODES.size).toBe(7);
    expect(BENIGN_INFO_CODES.size).toBe(2);
    expect(ASSET_WARN_CODES.size).toBe(11);
    expect(ALL_PERSISTED_WARNING_CODES.size).toBe(43); // Set dedups → proves pairwise-disjoint

    // explicit pairwise-disjoint (also vs the ignore-list)
    const buckets = [
      DATA_GAP_CODES,
      BENIGN_WARN_CODES,
      BENIGN_INFO_CODES,
      ASSET_WARN_CODES,
      NON_GAP_CATALOG_CODES,
    ];
    for (let i = 0; i < buckets.length; i++) {
      for (let j = i + 1; j < buckets.length; j++) {
        const overlap = [...buckets[i]!].filter((c) => buckets[j]!.has(c));
        expect(overlap, `buckets ${i} and ${j} overlap on ${overlap.join(",")}`).toEqual([]);
      }
    }
  });

  it("Layer 2 — every catalog code literal in lib/parser+lib/sync is classified (gap/benign/asset/ignore)", () => {
    const unclassified = collectedRealCodes.filter(
      (c) => !ALL_PERSISTED_WARNING_CODES.has(c) && !NON_GAP_CATALOG_CODES.has(c),
    );
    // A new persisted parse-warning code (or any new sync/admin code) that nobody
    // classified lands here → add it to the correct bucket or the ignore-list.
    expect(
      unclassified,
      `Unclassified catalog code literal(s) in lib/parser+lib/sync — classify each as a data gap ` +
        `(GAP_CLASSES), benign, asset, or add to NON_GAP_CATALOG_CODES: ${unclassified.join(", ")}`,
    ).toEqual([]);
  });

  it("Layer 2 — every counted gap code actually appears as a literal (no phantom gap codes)", () => {
    const collected = new Set(collectedRealCodes);
    const phantom = [...DATA_GAP_CODES].filter((c) => !collected.has(c));
    expect(phantom, `gap codes not found as literals in source: ${phantom.join(", ")}`).toEqual([]);
  });

  it("NEGATIVE — the guard bites: a catalog code in neither partition nor ignore-list is flagged", () => {
    // Simulate the scan surfacing an unclassified real catalog code.
    const fakeCollected = [
      ...collectedRealCodes,
      "SHOW_FIRST_PUBLISHED",
      "WEBHOOK_NOOP_ALREADY_SYNCED",
    ];
    // sanity: those two ARE in the ignore-list, so they don't trip it
    let unclassified = fakeCollected.filter(
      (c) => !ALL_PERSISTED_WARNING_CODES.has(c) && !NON_GAP_CATALOG_CODES.has(c),
    );
    expect(unclassified).toEqual([]);
    // now inject a genuinely-unclassified catalog code → the assertion must catch it
    const injected = Object.keys(MESSAGE_CATALOG).find(
      (c) => !ALL_PERSISTED_WARNING_CODES.has(c) && !NON_GAP_CATALOG_CODES.has(c),
    )!;
    unclassified = [...fakeCollected, injected].filter(
      (c) => !ALL_PERSISTED_WARNING_CODES.has(c) && !NON_GAP_CATALOG_CODES.has(c),
    );
    expect(unclassified).toContain(injected); // the guard would FAIL, as intended
  });
});

describe("UNKNOWN_STAGE_RESTRICTION registration (spec §7)", () => {
  it("auto-groups under crew-schedule (no _families.ts edit — keeps the PR NON-UI)", () => {
    expect(familyFor("UNKNOWN_STAGE_RESTRICTION").id).toBe("crew-schedule");
  });
  it("is operator-actionable-anchored (per-cell deep link on review surfaces)", () => {
    expect(OPERATOR_ACTIONABLE_ANCHORED.has("UNKNOWN_STAGE_RESTRICTION")).toBe(true);
  });
  it("is counted by the data-quality badge (GAP_CLASSES membership)", () => {
    expect(GAP_CLASSES.map((g) => g.code)).toContain("UNKNOWN_STAGE_RESTRICTION");
  });
});
