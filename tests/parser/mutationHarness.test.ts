// tests/parser/mutationHarness.test.ts
import { describe, it, expect, beforeAll } from "vitest";
import { FIXTURES, readFixture } from "./mutation/fixtures";
import { boundedMutants, MUTANT_BUDGET, OPERATOR_NAMES } from "./mutation/operators";
import type { Mutant } from "./mutation/operators";
import { capture, verdict, fingerprint } from "./mutation/oracle";
import { KNOWN_SILENT_HOLES, reconcileLedger } from "./mutation/knownHoles";
import type { Alarm } from "./mutation/knownHoles";

// MUTANT_BUDGET is the single source of truth in operators.ts (imported above) — the per-(operator,
// fixture) fanout ceiling. Here it doubles as the GLOBAL corpus-size guard (below) and is asserted
// by the "corpus size within budget" test. Op names come from `OPERATOR_NAMES` (NOT the eager
// `OPERATORS` array form); the corpus is streamed through `boundedMutants`.

// Prefix each operator's siteId with the fixture slug so keys are globally unique across
// the corpus. Operator siteIds start "<op>:B..:L..:X.." → "<op>:<slug>:B..:L..:X..".
const withSlug = (m: Mutant, op: string, slug: string): Mutant => ({
  ...m,
  siteId: `${op}:${slug}:${m.siteId.slice(op.length + 1)}`,
});

/** Exhaustive: parse EVERY generated mutant across all fixtures × operators (plan-R2).
 *  SINGLE-PASS STREAMING (Codex plan-R18–R24 [high], memory vector closed STRUCTURALLY): the corpus
 *  is streamed through `boundedMutants(op, md)` — the only exported corpus-scale iterator, which
 *  embeds the per-(op,fixture) `guardStream(..., MUTANT_BUDGET)` fail-fast guard — so an explosive
 *  single-operator fanout throws with O(1) heap before any array materializes. A SECOND, global
 *  `++n > MUTANT_BUDGET` guard here caps the whole-corpus total (defends the many-ops-each-large
 *  case). Nothing corpus-wide is retained except short siteId strings (+ actual alarms/noOps).
 *  `noOps` flags any operator emitting a byte-identical mutant (plan-R18). */
function runAll(): {
  alarms: Alarm[];
  allSiteIds: string[];
  cosmeticViolations: string[];
  noOps: string[];
} {
  const alarms: Alarm[] = [];
  const allSiteIds: string[] = [];
  const cosmeticViolations: string[] = [];
  const noOps: string[] = [];
  let n = 0;
  for (const f of FIXTURES) {
    const md = readFixture(f);
    const baseline = capture(md, `${f.slug}.md`);
    for (const op of OPERATOR_NAMES) {
      for (const raw of boundedMutants(op, md)) {
        // per-(op,fixture) budget guard inside boundedMutants
        if (++n > MUTANT_BUDGET) {
          throw new Error(
            `corpus mutant count exceeded MUTANT_BUDGET ${MUTANT_BUDGET} — operator fanout regression?`,
          );
        }
        const m = withSlug(raw, op, f.slug);
        allSiteIds.push(m.siteId);
        if (m.md === md) noOps.push(m.siteId); // byte-identical mutant = false coverage (plan-R18)
        const mut = capture(m.md, `${f.slug}.md`);
        const v = verdict(baseline, mut);
        if (m.bucket === "cosmetic") {
          if (v !== "ABSORBED") cosmeticViolations.push(m.siteId); // cosmetic must be fully invisible
          continue;
        }
        if (v === "SILENT_WRONG")
          alarms.push({ siteId: m.siteId, kind: "wrong", fingerprint: fingerprint(baseline, mut) });
        if (v === "SILENT_SIGNAL_LOSS")
          alarms.push({
            siteId: m.siteId,
            kind: "signal_loss",
            fingerprint: fingerprint(baseline, mut),
          });
      }
    }
  }
  return { alarms, allSiteIds, cosmeticViolations, noOps };
}

// The exhaustive corpus parse is DEFERRED into a beforeAll (NOT executed at describe-collection
// time) and scoped to THIS describe only. Consequence (closes Codex plan-R17 [high]): a targeted
// run of the cheap structural-gate describes added in Task 9 — `-t "classifier parity"`,
// `-t "COUNT-level audit agreement"`, and their red-phase probes — collects this module but runs
// only the matched describe's hooks/tests, so `runAll()` never fires for those. Only tests INSIDE
// this describe pay the corpus cost. The hook carries an explicit 180-min (10_800_000 ms) timeout
// because the measured corpus wall-clock (Step 1) is ~92 min — far past vitest's default hookTimeout
// (10s) AND past the 300s originally planned before the exhaustive corpus was measured. This heavy
// file is EXCLUDED from the default/unit-suite discovery and run ONLY by the nightly workflow
// (opt-in VITEST_INCLUDE_MUTATION_HARNESS, Task 12) — the beforeAll deferral additionally keeps its
// cost off any targeted `-t` sibling-gate run within the same file.
describe("mutation harness — bidirectional known-holes ledger", () => {
  let R: { alarms: Alarm[]; allSiteIds: string[]; cosmeticViolations: string[]; noOps: string[] };
  beforeAll(() => {
    R = runAll(); // throws (fails the hook) if Phase-1 mutant count exceeds MUTANT_BUDGET before any parse
  }, 10_800_000);

  it("corpus size is within the documented runtime budget (plan-R17)", () => {
    expect(R.allSiteIds.length).toBeGreaterThan(0);
    expect(
      R.allSiteIds.length,
      `mutant count exceeds MUTANT_BUDGET — measure + update deliberately`,
    ).toBeLessThanOrEqual(MUTANT_BUDGET);
  });
  it("no emitted mutant is byte-identical to its baseline fixture (plan-R18)", () => {
    expect(
      R.noOps,
      `byte-identical no-op mutants (false coverage):\n${R.noOps.join("\n")}`,
    ).toEqual([]);
  });
  it("all generated siteIds are globally unique (Codex R2)", () => {
    expect(new Set(R.allSiteIds).size).toBe(R.allSiteIds.length);
  });
  it("cosmetic operators are fully invisible (payload + signals unchanged)", () => {
    expect(R.cosmeticViolations).toEqual([]);
  });
  it("actual alarms == committed ledger, keyed (siteId, kind, fingerprint) — bidirectional", () => {
    const { newAlarms, staleRows } = reconcileLedger(R.alarms, KNOWN_SILENT_HOLES);
    expect(newAlarms, `NEW/changed alarms not in ledger:\n${newAlarms.join("\n")}`).toEqual([]);
    expect(staleRows, `stale ledger rows (fixed or drifted):\n${staleRows.join("\n")}`).toEqual([]);
  });
});

// ─── Task 9: classifier-parity + coverage-floor + audit-agreement gates ────────────────────────
import {
  KNOWN_SECTION_HEADERS,
  PREFIX_SECTION_FAMILIES,
  normalizeHeader,
} from "@/lib/parser/knownSections";
import { SECTION_DOMAIN_MAP, resolveHeader } from "./mutation/classify";
import { EXPECTED_HEADER_DOMAINS } from "./mutation/expectedDomains";
import { OPERATORS as OPS } from "./mutation/operators";
import { auditSites } from "./mutation/applicabilityAudit";

describe("classifier parity gate (Codex R2/R4/R8/R20)", () => {
  it("every KNOWN_SECTION_HEADERS entry is mapped and non-other", () => {
    for (const h of KNOWN_SECTION_HEADERS) {
      expect(SECTION_DOMAIN_MAP[h], `unmapped: ${h}`).toBeDefined();
      expect(SECTION_DOMAIN_MAP[h], `${h}=other`).not.toBe("other");
    }
  });
  it("suffixed room families resolve to rooms", () => {
    for (const fam of PREFIX_SECTION_FAMILIES)
      expect(SECTION_DOMAIN_MAP[resolveHeader(`${fam} SALON A`)!]).toBe("rooms");
  });
  it("EXPECTED_HEADER_DOMAINS covers the live registry (a new parser header forces a row, R20)", () => {
    const covered = new Set(EXPECTED_HEADER_DOMAINS.map(([h]) => normalizeHeader(h)));
    for (const h of KNOWN_SECTION_HEADERS)
      expect(covered, `no expected-domain row for ${h}`).toContain(h);
  });
  it("lockstep: SECTION_DOMAIN_MAP agrees with the independent EXPECTED_HEADER_DOMAINS oracle", () => {
    for (const [h, d] of EXPECTED_HEADER_DOMAINS)
      expect(SECTION_DOMAIN_MAP[resolveHeader(h)!], h).toBe(d);
  });
});

describe("coverage floor + COUNT-level audit agreement (Codex R5/R9, exhaustive plan-R3)", () => {
  // EXACT: operator emit count per domain must EQUAL the independent audit count
  // (identical applicability predicate). header-typo is exact too — the audit replicates
  // its typo-eligibility guard (plan-R4). blank-row:remove is exact — its 2-domain mutant
  // credits each adjacent domain once, matching the audit's dual bump.
  const EXACT = [
    "header-typo",
    "ref-sub",
    "unicode-inject",
    "merged-cell",
    "column-shift",
    "blank-row:inject",
    "blank-row:remove",
  ];

  // Array form — for the BOUNDED synthetic-input tests below only.
  const genCounts = (raw: { domains: string[] }[]): Map<string, number> => {
    const m = new Map<string, number>();
    for (const mut of raw) for (const d of mut.domains) m.set(d, (m.get(d) ?? 0) + 1);
    return m;
  };
  // STREAMING form for the FULL-CORPUS loop (Codex plan-R23/R24 [high]): route through the shared
  // `boundedMutants` (imported at the top of this file), which embeds the guardStream+MUTANT_BUDGET
  // fail-fast guard — never materialize the operator array over real fixtures.
  const genCountsStreamed = (op: string, md: string): Map<string, number> => {
    const m = new Map<string, number>();
    for (const mut of boundedMutants(op, md))
      for (const d of mut.domains) m.set(d, (m.get(d) ?? 0) + 1);
    return m;
  };

  it("EXACT operators: per-domain generated count === independent audit count", () => {
    for (const f of FIXTURES) {
      const md = readFixture(f);
      const audit = auditSites(md);
      for (const op of EXACT) {
        const gen = genCountsStreamed(op, md); // streaming + budget-guarded (never an eager array)
        const domains = new Set<string>([
          ...gen.keys(),
          ...[...audit.keys()].filter((k) => k.startsWith(`${op}|`)).map((k) => k.split("|")[1]!),
        ]);
        for (const d of domains) {
          expect(gen.get(d) ?? 0, `${f.slug} ${op}|${d} count`).toBe(audit.get(`${op}|${d}`) ?? 0);
        }
      }
    }
  }, 120_000); // ~102k streaming generations (no parse) ≈ 19s — past the 5s default testTimeout

  it("header-typo count matches for TWO same-domain headers (one-emitted-only would fail, plan-R4)", () => {
    const md = "| CREW | NAME |\n|  | Doug |\n\n| TECH | NAME |\n|  | Eric |"; // two crew-domain headers
    const gen = genCounts(OPS["header-typo"]!(md));
    expect(gen.get("crew") ?? 0).toBe(auditSites(md).get("header-typo|crew") ?? 0);
    expect(gen.get("crew") ?? 0).toBe(2); // both CREW + TECH headers → 2 crew-domain typo sites
  });
});

// ─── Task 11: coverage summary + skippedInapplicable surfacing ─────────────────────────────────
import { skippedInapplicable } from "./mutation/operators";
import { expectedSkipped } from "./mutation/applicabilityAudit";

const CORRUPTING = [
  "header-typo",
  "ref-sub",
  "unicode-inject",
  "column-shift",
  "blank-row:inject",
  "blank-row:remove",
  "merged-cell",
];

describe("present-but-inapplicable domains cannot be silently excused (plan-R10)", () => {
  it("shared skippedInapplicable === independent expectedSkipped for every fixture × corrupting op", () => {
    // The independent audit computes present-risk-critical domains (incl. ZERO-site ones) from
    // its OWN segmentation. If the shared classifier regresses and drops a present domain, the
    // shared skippedInapplicable omits it while expectedSkipped still lists it → this fails.
    for (const f of FIXTURES) {
      const md = readFixture(f);
      for (const op of CORRUPTING) {
        expect(
          skippedInapplicable(md, op),
          `${f.slug}/${op} skipped-inapplicable mismatch (classifier drift?)`,
        ).toEqual(expectedSkipped(md, op));
      }
    }
  }, 120_000);
  it("a present zero-site domain IS surfaced by both sides (merged-cell on a 2-col HOTEL section)", () => {
    const md = "| HOTEL | Kimpton |\n|  | 122 W Monroe |"; // 2-col → no merged-cell site; hotel present
    expect(skippedInapplicable(md, "merged-cell")).toContain("hotel");
    expect(expectedSkipped(md, "merged-cell")).toContain("hotel");
  });
});

describe("coverage legibility (exhaustive; skippedInapplicable surfaced)", () => {
  it("emits total mutant count + per-fixture/op skippedInapplicable and covers >3 domains", () => {
    let total = 0;
    const domains = new Set<string>();
    const skips: string[] = [];
    for (const f of FIXTURES) {
      const md = readFixture(f);
      for (const op of OPERATOR_NAMES) {
        for (const m of boundedMutants(op, md)) {
          total++;
          for (const dm of m.domains) domains.add(dm);
        } // guarded stream (plan-R24)
        if (op.startsWith("section-reorder") || op.startsWith("trailing")) continue; // domain-agnostic (section-reorder) / cosmetic (trailing): no per-domain floor
        const sk = skippedInapplicable(md, op);
        if (sk.length) skips.push(`${f.slug}/${op}: ${sk.join(",")}`);
      }
    }
    console.log(
      `[mutation-harness] total=${total} domains=${[...domains].sort().join(",")}\n  skippedInapplicable:\n  ${skips.join("\n  ") || "(none)"}`,
    );
    expect(total).toBeGreaterThan(50);
    expect(domains.size).toBeGreaterThan(3);
  }, 120_000);

  it("skippedInapplicable is a pure function of the fixture (deterministic, surfaced not silent)", () => {
    // A present risk-critical domain with no applicable site must appear — merged-cell on a
    // 2-column HOTEL section. Assert the surfacing helper reports it (never a silent excusal).
    const md = "| HOTEL | Kimpton |\n|  | 122 W Monroe |";
    expect(skippedInapplicable(md, "merged-cell")).toContain("hotel");
  });
});
