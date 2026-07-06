// tests/parser/mutation/applicabilityAudit.test.ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { auditSites, GOLDEN_INVENTORY } from "./applicabilityAudit";
import { OPERATORS } from "./operators";

// ─── EXTERNAL ORACLE (plan-R8) ────────────────────────────────────────────────
// A tiny HAND-AUTHORED fixture whose per-operator/per-domain site counts were
// derived by a human reading the markdown — NOT copied from auditSites output.
// This is the true anti-tautology guard: if auditSites over/under-counts, these
// literals (counted by hand below) diverge and the test fails. Two sections:
//   CREW (crew): 2 data rows, each ["","Doug|Eric","917|646"] → 2 non-empty cells
//   HOTEL (hotel): 1 data row ["","Doug","3"] → 2 non-empty; "3" is 1-char
const HAND_FIXTURE =
  "| CREW | NAME | PHONE |\n|  | Doug | 917 |\n|  | Eric | 646 |\n\n| HOTEL | GUEST | NIGHTS |\n|  | Doug | 3 |";
// Hand-counted expected sites (see per-line reasoning in the plan body):
const HAND_EXPECTED: Record<string, number> = {
  "header-typo|crew": 1, "header-typo|hotel": 1,
  "ref-sub|crew": 4, "ref-sub|hotel": 2,          // non-empty data cells: 2+2 / 2
  "unicode-inject|crew": 4, "unicode-inject|hotel": 1, // ≥2-scalar cells; "3" excluded
  "merged-cell|crew": 4, "merged-cell|hotel": 2,  // (row.length-1) per ≥3-cell row
  "column-shift|crew": 1, "column-shift|hotel": 1, // one per section
  "blank-row:inject|crew": 1,                      // (dataRows-1); hotel has 1 row → 0
  "blank-row:remove|crew": 1, "blank-row:remove|hotel": 1, // one boundary, both domains
};

describe("independent applicability audit (Codex R9/R13)", () => {
  it("EXTERNAL ORACLE: auditSites matches hand-counted sites on a hand-authored fixture (plan-R8)", () => {
    const sites = auditSites(HAND_FIXTURE);
    const got: Record<string, number> = {};
    for (const [k, v] of sites) if (v > 0) got[k] = v;
    expect(got).toEqual(HAND_EXPECTED); // exact set + counts — no extra keys, no missing keys
  });
  it("counts a nonzero ref-sub|crew for consultants-roundtable's embedded CREW section", () => {
    const md = readFileSync("fixtures/shows/raw/2025-10-consultants-roundtable.md", "utf8");
    const sites = auditSites(md);
    expect(sites.get("ref-sub|crew") ?? 0).toBeGreaterThan(0);
    expect(sites.get("column-shift|crew") ?? 0).toBeGreaterThan(0);
  });
  it("every GOLDEN_INVENTORY count is present in the real fixture (sanity; EXACT pin is the excerpt test, plan-R7/R26)", () => {
    // The count is SECTION-scoped (a `lines` excerpt), so the whole-fixture total is >= it (a
    // domain can recur in other sections — e.g. rpas has HOTEL at L43 AND "HOTELS FOR DOUG'S DRIVE
    // BACK" at L59). The EXACT anti-tautology pin is the excerpt-localization test below
    // (`auditSites(excerpt) === count`); here we only sanity-check the section's sites exist in the
    // real fixture, so a wholesale audit failure (0 sites) is still caught.
    for (const g of GOLDEN_INVENTORY) {
      const md = readFileSync(g.fixture, "utf8");
      expect(auditSites(md).get(`${g.op}|${g.domain}`) ?? 0, `${g.fixture} ${g.op} ${g.domain}`).toBeGreaterThanOrEqual(g.count);
    }
  });
  it("every GOLDEN_INVENTORY row has CONCRETE, REAL, LOCALIZING provenance (plan-R10)", () => {
    for (const g of GOLDEN_INVENTORY) {
      // (a) concrete line range, never a TODO placeholder
      expect(g.lines, `${g.fixture} ${g.op} ${g.domain} lines must be a concrete range like "40-58"`).toMatch(/^\d+-\d+$/);
      const [start, end] = g.lines.split("-").map(Number) as [number, number];
      expect(start).toBeGreaterThanOrEqual(1);
      expect(end).toBeGreaterThanOrEqual(start);
      // (b) the range exists in the fixture
      const all = readFileSync(g.fixture, "utf8").split("\n");
      expect(end, `${g.fixture} lines ${g.lines} exceed file length ${all.length}`).toBeLessThanOrEqual(all.length);
      // (c) the count LOCALIZES to exactly those lines — auditing the excerpt alone reproduces
      //     the count. A number pasted from a different section (or the whole file) fails here,
      //     so provenance cannot be bogus while the count still matches.
      const excerpt = all.slice(start - 1, end).join("\n");
      expect(auditSites(excerpt).get(`${g.op}|${g.domain}`) ?? 0, `${g.fixture} ${g.op} ${g.domain} does not localize to lines ${g.lines}`).toBe(g.count);
    }
  });
  it("GOLDEN_INVENTORY is structurally non-vacuous (plan-R6)", () => {
    const CORRUPT = ["header-typo", "ref-sub", "unicode-inject", "column-shift", "blank-row:inject", "blank-row:remove", "merged-cell"];
    expect(GOLDEN_INVENTORY.length).toBeGreaterThanOrEqual(CORRUPT.length);
    const ops = new Set(GOLDEN_INVENTORY.map((g) => g.op));
    for (const op of CORRUPT) expect(ops.has(op), `golden inventory missing operator ${op}`).toBe(true);
    const has = (op: string, domain: string) => GOLDEN_INVENTORY.some((g) => g.op === op && g.domain === domain && g.count >= 1);
    expect(has("ref-sub", "hotel"), "need a ref-sub × hotel row").toBe(true);
    expect(has("merged-cell", "hotel"), "need a merged-cell × hotel row").toBe(true);
    expect(has("ref-sub", "crew"), "need a ref-sub × crew row").toBe(true);
    const domains = new Set(GOLDEN_INVENTORY.map((g) => g.domain));
    expect(domains.size, "golden inventory too narrow").toBeGreaterThanOrEqual(3);
  });
});

describe("audit independence is EXECUTABLE (plan-R7/R8/R25)", () => {
  it("NO import/export-from/require/import() in applicabilityAudit.ts RESOLVES to a shared harness module", () => {
    // Codex plan-R25 [medium]: a string-match on `./rows` misses alias/parent forms
    // (`../mutation/rows`, `@/tests/parser/mutation/rows`). Instead RESOLVE every specifier to an
    // absolute path and compare against the three forbidden sibling files — fail-closed for any
    // form that actually resolves to rows.ts / classify.ts / operators.ts.
    const auditPath = resolve("tests/parser/mutation/applicabilityAudit.ts");
    const src = readFileSync(auditPath, "utf8");
    const dir = dirname(auditPath);
    const repoRoot = resolve("."); // `@/*` → repo root (tsconfig.json:25-26)
    const forbidden = new Set(["rows", "classify", "operators"].map((m) => resolve(dir, `${m}.ts`)));
    const specifiers = [
      ...src.matchAll(/(?:import|export)[\s\S]*?from\s*['"]([^'"]+)['"]|(?:require|import)\(\s*['"]([^'"]+)['"]\s*\)/g),
    ]
      .map((m) => m[1] ?? m[2]!)
      .filter(Boolean);
    for (const spec of specifiers) {
      const base = spec.startsWith("@/") ? resolve(repoRoot, spec.slice(2)) : resolve(dir, spec);
      const withTs = base.endsWith(".ts") ? base : `${base}.ts`;
      expect(
        forbidden.has(withTs),
        `applicabilityAudit must not depend on a shared harness module (resolved ${spec} → ${withTs})`,
      ).toBe(false);
    }
  });
});

describe("blank-row:remove same-domain boundary is credited ONCE (plan-R8)", () => {
  it("two adjacent same-domain runs → operator and audit both count exactly 1 for that domain", () => {
    // two CREW runs separated by one blank line — same domain on both sides.
    const md = "| CREW | NAME |\n|  | Doug |\n\n| CREW | NAME |\n|  | Eric |";
    const gen = OPERATORS["blank-row:remove"]!(md).filter((m) => m.domains.includes("crew"));
    expect(gen).toHaveLength(1);                       // one physical boundary, not double-counted
    expect(gen[0]!.domains).toEqual(["crew"]);         // deduped
    expect(auditSites(md).get("blank-row:remove|crew") ?? 0).toBe(1);
  });
});
