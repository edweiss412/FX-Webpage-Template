// tests/parser/mutationHarness.gates.test.ts
// Generation-only + structural gates for the mutation harness (relocated from the
// retired monolith tests/parser/mutationHarness.test.ts when the corpus parse
// moved to the 8 LPT shard files — sharding spec §3.3). NOTHING here parses the
// corpus: every corpus-scale loop below streams boundedMutants (generation only),
// so this file is seconds, not minutes. Runs in the env-gated `mutation` project
// alongside the shard files.
import { describe, it, expect } from "vitest";
import { FIXTURES, readFixture } from "./mutation/fixtures";
import { boundedMutants, MUTANT_BUDGET, OPERATOR_NAMES } from "./mutation/operators";
import {
  KNOWN_SECTION_HEADERS,
  PREFIX_SECTION_FAMILIES,
  normalizeHeader,
} from "@/lib/parser/knownSections";
import { SECTION_DOMAIN_MAP, resolveHeader } from "./mutation/classify";
import { EXPECTED_HEADER_DOMAINS } from "./mutation/expectedDomains";
import { OPERATORS as OPS, skippedInapplicable } from "./mutation/operators";
import { auditSites, expectedSkipped } from "./mutation/applicabilityAudit";
import {
  computeShardAssignment,
  pairKey,
  shardOfSiteId,
  SHARD_COUNT,
} from "./mutation/shardPartition";
import { KNOWN_SILENT_HOLES } from "./mutation/knownHoles";

// ─── classifier-parity + coverage-floor + audit-agreement gates (Task 9) ───────────────────────

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
  // `boundedMutants`, which embeds the guardStream+MUTANT_BUDGET fail-fast guard — never
  // materialize the operator array over real fixtures.
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

// ─── present-but-inapplicable + coverage legibility (Tasks 11) ─────────────────────────────────

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
    // Corpus-wide floor + budget live HERE (moved from the retired monolith's global
    // guard + per-shard >0 assertions — sharding spec §6): a slice may be small, but
    // the FULL corpus must be non-empty and within budget.
    expect(total).toBeGreaterThan(50);
    expect(total, "corpus-total budget (retired monolith's global ++n guard)").toBeLessThanOrEqual(
      MUTANT_BUDGET,
    );
    expect(domains.size).toBeGreaterThan(3);
  }, 120_000);

  it("skippedInapplicable is a pure function of the fixture (deterministic, surfaced not silent)", () => {
    // A present risk-critical domain with no applicable site must appear — merged-cell on a
    // 2-column HOTEL section. Assert the surfacing helper reports it (never a silent excusal).
    const md = "| HOTEL | Kimpton |\n|  | 122 W Monroe |";
    expect(skippedInapplicable(md, "merged-cell")).toContain("hotel");
  });
});

// ─── shard partition over the LIVE corpus (sharding spec §5 f-h) ───────────────────────────────

describe("shard partition over the LIVE corpus (spec §5 f-h)", () => {
  const A = computeShardAssignment(); // ~18 s generation, no parse

  it("(f) assignment covers every OPERATOR_NAMES × FIXTURES pair", () => {
    for (const f of FIXTURES)
      for (const op of OPERATOR_NAMES)
        expect(A.has(pairKey(op, f.slug)), `unassigned pair ${op}:${f.slug}`).toBe(true);
    expect(A.size).toBe(FIXTURES.length * OPERATOR_NAMES.length);
  }, 120_000);

  it("(g) ledger slices are disjoint-exhaustive and every row resolves", () => {
    const counts = new Array<number>(SHARD_COUNT).fill(0);
    for (const h of KNOWN_SILENT_HOLES) {
      const s = shardOfSiteId(h.siteId, A); // throws on an unresolvable row (fail-loud)
      counts[s] = counts[s]! + 1;
    }
    expect(counts.reduce((a, b) => a + b, 0)).toBe(KNOWN_SILENT_HOLES.length);
  }, 120_000);

  it("(h) LPT load spread stays sane (max/mean < 1.2; measured 1.000)", () => {
    const loads = new Array<number>(SHARD_COUNT).fill(0);
    for (const f of FIXTURES) {
      const md = readFixture(f);
      for (const op of OPERATOR_NAMES) {
        let n = 0;
        for (const _ of boundedMutants(op, md)) n++;
        const s = A.get(pairKey(op, f.slug))!;
        loads[s] = loads[s]! + n;
      }
    }
    const mean = loads.reduce((a, b) => a + b, 0) / SHARD_COUNT;
    expect(Math.max(...loads) / mean).toBeLessThan(1.2);
  }, 120_000);

  it("global siteId uniqueness across the FULL corpus (generation only)", () => {
    const seen = new Set<string>();
    for (const f of FIXTURES) {
      const md = readFixture(f);
      for (const op of OPERATOR_NAMES) {
        for (const raw of boundedMutants(op, md)) {
          const siteId = `${op}:${f.slug}:${raw.siteId.slice(op.length + 1)}`;
          expect(seen.has(siteId), `duplicate siteId ${siteId}`).toBe(false);
          seen.add(siteId);
        }
      }
    }
    expect(seen.size).toBeGreaterThan(50);
  }, 120_000);
});
