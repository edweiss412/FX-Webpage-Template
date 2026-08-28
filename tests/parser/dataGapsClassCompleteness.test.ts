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
 *     and assert each survivor is classified — in the data-gap partition OR the
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

// The four buckets live in a shared module so the attention-index I-1 corpus can
// read them too; this suite remains the owner of the partition contract below.
import {
  ASSET_WARN_CODES,
  BENIGN_INFO_CODES,
  BENIGN_WARN_CODES,
  NON_GAP_CATALOG_CODES,
} from "@/tests/parser/_dataGapBuckets";

/** 39 — sheet-data-quality gaps counted by summarizeDataGaps (from GAP_CLASSES). */
const DATA_GAP_CODES = new Set<string>(GAP_CLASSES.map((g) => g.code));

/** The full persisted-ParseWarning universe (60) — every code lands in exactly one bucket. */
const ALL_PERSISTED_WARNING_CODES = new Set<string>([
  ...DATA_GAP_CODES,
  ...BENIGN_WARN_CODES,
  ...BENIGN_INFO_CODES,
  ...ASSET_WARN_CODES,
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
  it("Layer 1 — the 4 buckets are pairwise disjoint and total 60 (39/8/2/11)", () => {
    expect(DATA_GAP_CODES.size).toBe(39);
    expect(BENIGN_WARN_CODES.size).toBe(8);
    expect(BENIGN_INFO_CODES.size).toBe(2);
    expect(ASSET_WARN_CODES.size).toBe(11);
    expect(ALL_PERSISTED_WARNING_CODES.size).toBe(60); // Set dedups → proves pairwise-disjoint

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
