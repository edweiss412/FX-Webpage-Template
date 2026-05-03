/**
 * Tests for `lib/time/rightNowTransitions.ts` — the §8.2 RightNow
 * 12-state transition audit matrix (M4 Task 4.12 Batch 1).
 *
 * These contract tests pin the matrix's structural invariants.
 * Animation-behavior tests live in
 * `tests/e2e/right-now-transitions.spec.ts` (scaffolded as
 * `test.fixme()` until Batch 2 lands `framer-motion`).
 *
 * The matrix is the single source of truth for the audit. Any drift
 * (size, duplicates, unreachable cells without rationale, asymmetric
 * lookup) fails here, NOT downstream in the Playwright surface.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import type { RightNowState } from "@/lib/time/rightNow";
import {
  RIGHT_NOW_TRANSITION_MATRIX,
  transitionTreatment,
  type RightNowStateKind,
  type TransitionTreatment,
} from "@/lib/time/rightNowTransitions";

/**
 * The canonical list of 12 RightNow state kinds. Hand-listed (rather
 * than `keyof` extracted) so a future state addition or removal MUST be
 * mirrored here AND surfaces as a TypeScript error (the assignment
 * below to `RightNowStateKind` would fail to typecheck).
 *
 * Ordering matches the spec §8.2 precedence table top-to-bottom for
 * documentation purposes only — the matrix is symmetric, so test
 * iteration order does not affect outcomes.
 */
// `as const` preserves the literal tuple type so
// `(typeof ALL_KINDS)[number]` resolves to the union of the actual
// strings in this array, NOT a widened `RightNowStateKind`. Without
// `as const`, the exhaustiveness mapped type below would always
// evaluate to `never` (since the annotated element type already covers
// every kind by construction) — masking missing-kind bugs.
const ALL_KINDS = [
  "viewer_unconfirmed",
  "viewer_after_last_day",
  "viewer_off_day",
  "viewer_off_day_pre",
  "pre_travel",
  "travel_in_day",
  "set_day",
  "show_day_n",
  "travel_out_day",
  "post_show",
  "unknown",
  "dateless",
] as const;

// Compile-time guards (BOTH directions are required — see below):
//
// 1) "ALL_KINDS contains only valid kinds." The assignment below to
//    `ReadonlyArray<RightNowState["kind"]>` fails to typecheck if
//    ALL_KINDS contains a string that is NOT a member of
//    `RightNowState["kind"]` (e.g., a typo).
const _typeCheck: ReadonlyArray<RightNowState["kind"]> = ALL_KINDS;
void _typeCheck;

// 2) "ALL_KINDS contains EVERY valid kind." The mapped type below
//    evaluates to `true` only when every member of
//    `RightNowState["kind"]` is also a member of the literal-tuple
//    union `(typeof ALL_KINDS)[number]`. If a 13th kind is added to
//    `RightNowState` without being added here, `Exclude<...>` resolves
//    to that new kind (≠ never), forcing the conditional to `false`,
//    and the `: _Exhaustive = true` assignment fails to compile.
//    Without this, a missing kind only surfaces indirectly via the
//    "matrix has 66 entries" runtime test — and the intuitive fix to
//    that failure (relax the count) silently masks the real bug. Keep
//    BOTH directions.
type _Exhaustive = Exclude<
  RightNowState["kind"],
  (typeof ALL_KINDS)[number]
> extends never
  ? true
  : false;
const _exhaustive: _Exhaustive = true;
void _exhaustive;

const VALID_TREATMENTS: ReadonlyArray<TransitionTreatment> = [
  "crossfade-body",
  "morph-to-last-good",
  "instant",
  "unreachable",
];

/**
 * Sorted lexicographic pair key — same definition the helper uses.
 *
 * Intentionally duplicated from `lib/time/rightNowTransitions.ts:pairKey`
 * (NOT imported): tests for the matrix shouldn't import the helper they
 * are partly checking — a buggy `pairKey` in the helper would otherwise
 * pass tests against itself (e.g., a non-symmetric implementation would
 * still satisfy "f(a, b) === f(b, a)" because both call sites read from
 * the same broken function). Keep these two implementations in sync
 * manually OR fold the test into a separate helper module the matrix
 * does not depend on.
 */
function pairKey(a: RightNowStateKind, b: RightNowStateKind): string {
  return a < b ? `${a}:${b}` : `${b}:${a}`;
}

describe("RIGHT_NOW_TRANSITION_MATRIX — structural invariants", () => {
  test("matrix has exactly 66 entries (C(12,2) = 12*11/2)", () => {
    expect(RIGHT_NOW_TRANSITION_MATRIX).toHaveLength(66);
  });

  test("no diagonals — every entry has from !== to", () => {
    const diagonals = RIGHT_NOW_TRANSITION_MATRIX.filter(
      (entry) => entry.from === entry.to,
    );
    expect(diagonals).toEqual([]);
  });

  test("no duplicates — every unordered pair appears at most once", () => {
    const seen = new Set<string>();
    const duplicates: string[] = [];
    for (const entry of RIGHT_NOW_TRANSITION_MATRIX) {
      const key = pairKey(entry.from, entry.to);
      if (seen.has(key)) {
        duplicates.push(key);
      }
      seen.add(key);
    }
    expect(duplicates).toEqual([]);
    expect(seen.size).toBe(66);
  });

  test("coverage — every kind appears in exactly 11 entries (its 11 partners)", () => {
    const counts = new Map<RightNowStateKind, number>();
    for (const kind of ALL_KINDS) counts.set(kind, 0);
    for (const entry of RIGHT_NOW_TRANSITION_MATRIX) {
      counts.set(entry.from, (counts.get(entry.from) ?? 0) + 1);
      counts.set(entry.to, (counts.get(entry.to) ?? 0) + 1);
    }
    for (const kind of ALL_KINDS) {
      expect(counts.get(kind)).toBe(11);
    }
  });

  test("every entry's `from` and `to` is a valid RightNowStateKind", () => {
    const validKinds = new Set<string>(ALL_KINDS);
    for (const entry of RIGHT_NOW_TRANSITION_MATRIX) {
      expect(validKinds.has(entry.from)).toBe(true);
      expect(validKinds.has(entry.to)).toBe(true);
    }
  });

  test("every entry's `treatment` is one of the four enum values", () => {
    const valid = new Set<string>(VALID_TREATMENTS);
    for (const entry of RIGHT_NOW_TRANSITION_MATRIX) {
      expect(valid.has(entry.treatment)).toBe(true);
    }
  });

  test("every `unreachable` entry has a non-empty `reason` field", () => {
    const offenders = RIGHT_NOW_TRANSITION_MATRIX.filter(
      (entry) =>
        entry.treatment === "unreachable" &&
        (entry.reason === undefined || entry.reason.trim().length === 0),
    );
    expect(offenders).toEqual([]);
  });
});

describe("transitionTreatment(from, to) — symmetric lookup helper", () => {
  test("symmetric for every matrix pair: f(a, b) === f(b, a)", () => {
    for (const entry of RIGHT_NOW_TRANSITION_MATRIX) {
      const forward = transitionTreatment(entry.from, entry.to);
      const reverse = transitionTreatment(entry.to, entry.from);
      expect(forward).toBe(entry.treatment);
      expect(reverse).toBe(entry.treatment);
    }
  });

  test("returns null for diagonal pairs (from === to)", () => {
    for (const kind of ALL_KINDS) {
      expect(transitionTreatment(kind, kind)).toBeNull();
    }
  });

  test("returns null for unknown kinds (defense against `as any` bypass)", () => {
    expect(
      transitionTreatment(
        "not_a_real_state" as RightNowStateKind,
        "pre_travel",
      ),
    ).toBeNull();
    expect(
      transitionTreatment(
        "pre_travel",
        "also_not_real" as RightNowStateKind,
      ),
    ).toBeNull();
    expect(
      transitionTreatment(
        "garbage" as RightNowStateKind,
        "more_garbage" as RightNowStateKind,
      ),
    ).toBeNull();
  });

  test("post_show ↔ pre_travel is unreachable with reason populated", () => {
    expect(transitionTreatment("post_show", "pre_travel")).toBe("unreachable");
    expect(transitionTreatment("pre_travel", "post_show")).toBe("unreachable");
    const entry = RIGHT_NOW_TRANSITION_MATRIX.find(
      (e) =>
        (e.from === "pre_travel" && e.to === "post_show") ||
        (e.from === "post_show" && e.to === "pre_travel"),
    );
    expect(entry?.reason).toBeDefined();
    expect((entry?.reason ?? "").length).toBeGreaterThan(0);
  });

  test("pre_travel → travel_in_day is crossfade-body (spec line 2420)", () => {
    expect(transitionTreatment("pre_travel", "travel_in_day")).toBe(
      "crossfade-body",
    );
    expect(transitionTreatment("travel_in_day", "pre_travel")).toBe(
      "crossfade-body",
    );
  });

  test("any-state ↔ unknown is morph-to-last-good (spec line 2424)", () => {
    // Excluding the `unknown ↔ dateless` pair (Rule 3 — recovery).
    const partners: RightNowStateKind[] = ALL_KINDS.filter(
      (k) => k !== "unknown" && k !== "dateless",
    );
    for (const partner of partners) {
      expect(transitionTreatment("unknown", partner)).toBe("morph-to-last-good");
      expect(transitionTreatment(partner, "unknown")).toBe("morph-to-last-good");
    }
  });

  test("unknown ↔ dateless is crossfade-body (recovery, not stale-on-stale)", () => {
    expect(transitionTreatment("unknown", "dateless")).toBe("crossfade-body");
    expect(transitionTreatment("dateless", "unknown")).toBe("crossfade-body");
  });

  test("any-state ↔ dateless (excluding unknown) is morph-to-last-good", () => {
    const partners: RightNowStateKind[] = ALL_KINDS.filter(
      (k) => k !== "dateless" && k !== "unknown",
    );
    for (const partner of partners) {
      expect(transitionTreatment("dateless", partner)).toBe("morph-to-last-good");
      expect(transitionTreatment(partner, "dateless")).toBe("morph-to-last-good");
    }
  });

  test("viewer_off_day_pre ↔ viewer_after_last_day is unreachable (calendrical paradox)", () => {
    expect(
      transitionTreatment("viewer_off_day_pre", "viewer_after_last_day"),
    ).toBe("unreachable");
    expect(
      transitionTreatment("viewer_after_last_day", "viewer_off_day_pre"),
    ).toBe("unreachable");
  });

  test("viewer_off_day_pre → set_day is crossfade-body (plan Step 2 explicit)", () => {
    expect(transitionTreatment("viewer_off_day_pre", "set_day")).toBe(
      "crossfade-body",
    );
  });

  test("viewer_off_day → show_day_n is crossfade-body (spec lines 2422-2423)", () => {
    expect(transitionTreatment("viewer_off_day", "show_day_n")).toBe(
      "crossfade-body",
    );
    expect(transitionTreatment("show_day_n", "viewer_off_day")).toBe(
      "crossfade-body",
    );
  });
});

describe("RIGHT_NOW_TRANSITION_MATRIX — full enumeration cross-check", () => {
  /**
   * Cross-check that the matrix covers EVERY one of the 66 unordered
   * kind-pairs, not just the right total count + the specific ones the
   * other tests poke at. A future commit that swaps two entries for a
   * duplicate would still pass the size + duplicate tests if both
   * entries happen to match — this test catches that by enumerating the
   * full Cartesian product.
   */
  test("every (kind, kind) unordered pair has a matrix entry", () => {
    const expectedKeys = new Set<string>();
    for (let i = 0; i < ALL_KINDS.length; i += 1) {
      for (let j = i + 1; j < ALL_KINDS.length; j += 1) {
        expectedKeys.add(pairKey(ALL_KINDS[i]!, ALL_KINDS[j]!));
      }
    }
    expect(expectedKeys.size).toBe(66);

    const actualKeys = new Set(
      RIGHT_NOW_TRANSITION_MATRIX.map((e) => pairKey(e.from, e.to)),
    );
    const missing = [...expectedKeys].filter((k) => !actualKeys.has(k));
    const extra = [...actualKeys].filter((k) => !expectedKeys.has(k));
    expect(missing).toEqual([]);
    expect(extra).toEqual([]);
  });
});

/**
 * Markdown grid sentinel — guards against doc-vs-code drift in
 * `docs/superpowers/plans/2026-04-30-fxav-crew-pages-design/right-now-transition-matrix.md`.
 *
 * Why this exists: the markdown grid is a human-readable rendering of
 * `RIGHT_NOW_TRANSITION_MATRIX`. If a future PR flips a `crossfade-body`
 * to `morph-to-last-good` in the TS source, the runtime tests above
 * still pass and the markdown silently lies. The doc itself flags this
 * risk ("Any drift between this file and the TypeScript constant is a
 * bug in this file") but nothing enforces it. This block does.
 *
 * Parsing approach (regex form, no doc churn required):
 *
 *   1. Read the markdown via `readFileSync` from `process.cwd()` (same
 *      pattern as `tests/admin/no-inline-email-normalization.test.ts`).
 *   2. Map the column-header abbreviations (`pre_t`, `tr_in`, `set`,
 *      `show_n`, `tr_out`, `post`, `v_off`, `v_off_pre`, `v_unconf`,
 *      `v_after`, `datel`, `unkn`) to full kind names. The doc uses
 *      these short forms in the column header for table-width reasons;
 *      the row headers use the full kind name in `**...**` markers.
 *   3. For every line starting with `| **` extract:
 *        - the row kind (between the `**...**` markers), and
 *        - the 12 cell values (split on `|`, trimmed).
 *   4. For each cell `(rowKind, colIndex, letter)`:
 *        - colKind = COL_HEADERS[colIndex] mapped through KIND_BY_ABBR
 *        - if rowKind === colKind, the cell must be `—` (diagonal).
 *        - if colIndex < rowIndex (lower triangle), cell must be `—`.
 *        - otherwise the letter must map to the same treatment as
 *          `transitionTreatment(rowKind, colKind)` via LETTER_BY_TREATMENT.
 *
 * Choosing regex parse over doc reformat: the existing markdown legend
 * (`C` / `M` / `U` / `—`) is already deterministic and parser-friendly,
 * so we use a regex tolerant of the existing form rather than churning
 * the doc. Letter `I` (instant) is included in the legend mapping for
 * future-proofing even though no current entry uses `instant`.
 */
describe("right-now-transition-matrix.md — markdown grid sentinel", () => {
  const MARKDOWN_PATH = join(
    process.cwd(),
    "docs/superpowers/plans/2026-04-30-fxav-crew-pages-design/right-now-transition-matrix.md",
  );

  /** Map column-header abbreviations (used for table-width) to full kinds. */
  const KIND_BY_ABBR: Readonly<Record<string, RightNowStateKind>> = {
    pre_t: "pre_travel",
    tr_in: "travel_in_day",
    set: "set_day",
    show_n: "show_day_n",
    tr_out: "travel_out_day",
    post: "post_show",
    v_off: "viewer_off_day",
    v_off_pre: "viewer_off_day_pre",
    v_unconf: "viewer_unconfirmed",
    v_after: "viewer_after_last_day",
    datel: "dateless",
    unkn: "unknown",
  };

  /**
   * Letter ↔ treatment legend (per the markdown's "Pairwise grid"
   * section). `I` is reserved for `instant`; no current entry uses it
   * but we accept it so a future addition does not require the test
   * to grow simultaneously.
   */
  const LETTER_BY_TREATMENT: Readonly<Record<TransitionTreatment, string>> = {
    "crossfade-body": "C",
    "morph-to-last-good": "M",
    instant: "I",
    unreachable: "U",
  };

  /** Reverse lookup: a parsed letter → expected TransitionTreatment. */
  const TREATMENT_BY_LETTER: Readonly<Record<string, TransitionTreatment>> = {
    C: "crossfade-body",
    M: "morph-to-last-good",
    I: "instant",
    U: "unreachable",
  };

  test("legend mapping is exhaustive over TransitionTreatment", () => {
    // If a 5th treatment is added to the type, `LETTER_BY_TREATMENT`
    // missing it would surface as a TS error here; keep this assertion
    // even though it overlaps with the type system to make the
    // dependency explicit.
    const treatments = Object.keys(LETTER_BY_TREATMENT) as TransitionTreatment[];
    expect(treatments).toHaveLength(4);
    for (const t of treatments) {
      expect(LETTER_BY_TREATMENT[t]).toBeDefined();
    }
  });

  test("markdown contains all 12 row headers", () => {
    const md = readFileSync(MARKDOWN_PATH, "utf8");
    for (const kind of ALL_KINDS) {
      // Row headers appear as `| **<kind>**` (with optional padding).
      const re = new RegExp(`\\|\\s*\\*\\*${kind}\\*\\*`);
      expect(re.test(md), `missing row header for ${kind}`).toBe(true);
    }
  });

  test("markdown column header has all 12 abbreviated kinds in order", () => {
    const md = readFileSync(MARKDOWN_PATH, "utf8");
    const lines = md.split("\n");
    // The column header line is the one starting with `|` whose first
    // cell is empty AND which lists `pre_t` as its first non-empty cell.
    const headerLine = lines.find(
      (line) => /^\|\s+\|\s*pre_t\s*\|/.test(line),
    );
    expect(headerLine, "column-header row not found in markdown").toBeDefined();
    const cells = headerLine!
      .split("|")
      .slice(1, -1) // drop empty leading + trailing splits
      .map((c) => c.trim());
    // First cell is the row-header column (empty); next 12 are kinds.
    expect(cells[0]).toBe("");
    const colAbbrs = cells.slice(1);
    expect(colAbbrs).toHaveLength(12);
    for (const abbr of colAbbrs) {
      expect(
        KIND_BY_ABBR[abbr],
        `unknown column abbr "${abbr}" — update KIND_BY_ABBR or fix markdown`,
      ).toBeDefined();
    }
  });

  test("every grid cell matches transitionTreatment(row, col)", () => {
    const md = readFileSync(MARKDOWN_PATH, "utf8");
    const lines = md.split("\n");

    // Find the column-header line so we can parse the column order
    // (the markdown happens to use precedence-table order; pin it
    // explicitly rather than assuming).
    const headerLineIndex = lines.findIndex(
      (line) => /^\|\s+\|\s*pre_t\s*\|/.test(line),
    );
    expect(headerLineIndex).toBeGreaterThanOrEqual(0);
    const colAbbrs = lines[headerLineIndex]!
      .split("|")
      .slice(1, -1)
      .map((c) => c.trim())
      .slice(1);
    const colKinds = colAbbrs.map((abbr) => {
      const kind = KIND_BY_ABBR[abbr];
      if (!kind) throw new Error(`unknown column abbr ${abbr}`);
      return kind;
    });

    // Walk every row line: starts with `| **` followed by a known kind.
    const rowRe = /^\|\s+\*\*([a-z_]+)\*\*\s*\|(.*)\|\s*$/;
    const seenRows: RightNowStateKind[] = [];
    const drift: string[] = [];

    for (const line of lines) {
      const match = line.match(rowRe);
      if (!match) continue;
      const rowKind = match[1] as RightNowStateKind;
      // Skip any `| **...**` line whose row label isn't a known kind
      // (defensive — there are none today, but accidental matches in
      // unrelated tables shouldn't crash the test).
      if (!ALL_KINDS.includes(rowKind)) continue;
      seenRows.push(rowKind);

      const cells = match[2]!.split("|").map((c) => c.trim());
      expect(
        cells.length,
        `row ${rowKind} has ${cells.length} cells; expected 12`,
      ).toBe(12);

      const rowIndex = colKinds.indexOf(rowKind);
      // rowIndex is the column position where the diagonal sits; every
      // col with index < rowIndex is lower-triangle and must be `—`.

      for (let colIndex = 0; colIndex < 12; colIndex += 1) {
        const colKind = colKinds[colIndex]!;
        const cell = cells[colIndex]!;

        if (colIndex < rowIndex || colKind === rowKind) {
          if (cell !== "—") {
            drift.push(
              `${rowKind} × ${colKind} (col ${colIndex}): expected "—" (lower-triangle/diagonal), got "${cell}"`,
            );
          }
          continue;
        }

        // Upper triangle: cell letter must map to a treatment, and that
        // treatment must equal what the helper returns.
        const expectedTreatment = transitionTreatment(rowKind, colKind);
        if (expectedTreatment === null) {
          drift.push(
            `${rowKind} × ${colKind}: helper returned null but markdown shows "${cell}" (helper bug?)`,
          );
          continue;
        }
        const actualTreatment = TREATMENT_BY_LETTER[cell];
        if (!actualTreatment) {
          drift.push(
            `${rowKind} × ${colKind} (col ${colIndex}): unrecognized cell letter "${cell}"`,
          );
          continue;
        }
        if (actualTreatment !== expectedTreatment) {
          const expectedLetter = LETTER_BY_TREATMENT[expectedTreatment];
          drift.push(
            `${rowKind} × ${colKind}: markdown shows "${cell}" (${actualTreatment}), helper returns "${expectedTreatment}" (expected letter "${expectedLetter}")`,
          );
        }
      }
    }

    expect(drift, drift.join("\n")).toEqual([]);
    // Every kind must appear exactly once as a row.
    expect(seenRows.sort()).toEqual([...ALL_KINDS].sort());
  });
});
