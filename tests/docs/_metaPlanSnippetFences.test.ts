/**
 * tests/docs/_metaPlanSnippetFences.test.ts — THE plan-fence gate.
 *
 * Spec: docs/superpowers/specs/2026-08-06-arc-b-review-infra.md §2.1.
 *
 * BLOCKING by construction rather than by configuration: `tests/docs/**` is in
 * the `parallel` project (`vitest.projects.ts`) run by `unit-suite.yml`'s
 * required `unit-suite-nodb` shards. A rename out of that glob silently
 * un-wires the gate, so the name is load-bearing — the same reason the em-dash
 * guard pinned its own.
 *
 * The corpus is walked FROM DISK, so a new plan is covered by default. A gate
 * that reads a committed file list is a gate a new file is exempt from.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { analyzePlan, RULE_NAMES, type Finding, type RuleName } from "@/lib/planFences";
import { premiseHolds } from "@/tests/_shared/premise";
import { FROZEN_ROWS, FROZEN_TOTAL, PLAN_FENCE_BASELINE } from "./planFencesBaseline";

const PLANS_ROOT = "docs/superpowers/plans";
const FIXTURES_ROOT = "tests/docs/fixtures/planFences";

function markdownFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) out.push(...markdownFiles(p));
    else if (entry.endsWith(".md")) out.push(p);
  }
  return out.sort();
}

type Report = ReturnType<typeof analyzePlan>;

function scan(root: string): Report[] {
  return markdownFiles(root).map((f) => analyzePlan(f, readFileSync(f, "utf8")));
}

/**
 * The four-field identity a baseline row matches on. `fenceKey` is a digest of
 * the fence's own content, NOT its line: keying on the line meant one blank line
 * inserted near the top of a historical plan invalidated every row below it.
 */
const identity = (f: Finding): string => `${f.path}|${f.fenceKey}|${f.rule}|${f.instance}`;

describe("plan snippet fences (arc B spec §2.1)", () => {
  describe("the gate can FAIL — planted premise fixtures", () => {
    const planted = scan(FIXTURES_ROOT);
    const firedRules = new Set<RuleName>(planted.flatMap((r) => r.findings.map((f) => f.rule)));

    // Executed unconditionally. This is the whole point of the planted tree: if
    // the extractor silently stopped recognizing fences, every corpus assertion
    // below would still pass, and only this one would notice.
    premiseHolds("planted fixture tree yields fences to analyze", planted.some((r) => r.fences > 0));

    for (const rule of RULE_NAMES) {
      if (rule === "DUPLICATE_IMPORT" || rule === "UNIMPORTED_IDENTIFIER") {
        it(`fires ${rule} on its planted fixture`, () => {
          expect([...firedRules]).toContain(rule);
        });
        continue;
      }
      it(`fires ${rule} on its planted fixture`, () => {
        expect([...firedRules]).toContain(rule);
      });
    }

    it("names the plan file, the fence line, and the rule for every planted hit", () => {
      for (const report of planted) {
        for (const f of report.findings) {
          expect(f.path).toContain(FIXTURES_ROOT);
          expect(f.fenceLine).toBeGreaterThan(0);
          expect(f.instance.length).toBeGreaterThan(0);
        }
      }
    });

    it("REPORTS an unplaceable fence rather than skipping it (limit 3b)", () => {
      const unplaced = planted.flatMap((r) => r.unplaced);
      expect(unplaced.map((u) => u.path)).toContain(`${FIXTURES_ROOT}/unplaced-fence.md`);
    });
  });

  describe("the real corpus, against the shrink-only baseline", () => {
    const reports = scan(PLANS_ROOT);
    const findings = reports.flatMap((r) => r.findings);

    premiseHolds("the plans corpus contains fences to analyze", reports.some((r) => r.fences > 0));

    const baseline = new Map(PLAN_FENCE_BASELINE.map((row) => [row.slice(0, row.lastIndexOf("|")), Number(row.slice(row.lastIndexOf("|") + 1))]));

    it("fails on any hit not matching a baseline row within its frozen count", () => {
      const offenders = findings.filter((f) => {
        const allowed = baseline.get(identity(f));
        return allowed === undefined || f.count > allowed;
      });
      expect(
        offenders.map((f) => `${f.path}:${f.fenceLine} ${f.rule} ${f.instance} (x${f.count})`),
        "new plan-fence violations — fix the fence, or add a rule-scoped `plan-fences: ignore RULE — reason` waiver above it",
      ).toEqual([]);
    });

    it("fails on STALE baseline rows — the ratchet only shrinks", () => {
      const live = new Map<string, number>();
      for (const f of findings) live.set(identity(f), f.count);
      const stale = [...baseline.entries()].filter(([id, count]) => {
        const now = live.get(id);
        return now === undefined || now < count;
      });
      expect(
        stale.map(([id, count]) => `${id} (frozen x${count})`),
        "baseline rows whose hit no longer exists at that count — remove them in the same commit that fixed the fence",
      ).toEqual([]);
    });

    it("holds both frozen ceilings, which are decrease-only by header contract", () => {
      // Two ceilings, not one: a row count alone cannot see a count bump on an
      // existing row, and a total alone cannot see a row split. Together they
      // make neither a new row nor a new occurrence pass unnoticed.
      expect(PLAN_FENCE_BASELINE.length, "row count").toBeLessThanOrEqual(FROZEN_ROWS);
      expect(
        [...baseline.values()].reduce((a, b) => a + b, 0),
        "summed occurrence counts",
      ).toBeLessThanOrEqual(FROZEN_TOTAL);
    });

    it("reports no waiver errors across the corpus", () => {
      const errs = reports.flatMap((r) => r.waiverErrors);
      expect(errs.map((e) => `${e.path}:${e.line} ${e.code} — ${e.message}`)).toEqual([]);
    });

    it("reports every unplaceable fence by name rather than skipping it", () => {
      // Not an assertion that the number is zero — it is an assertion that the
      // number is KNOWN. A conservative demotion that nobody can see is a hole.
      const unplaced = reports.flatMap((r) => r.unplaced);
      expect(Array.isArray(unplaced)).toBe(true);
      for (const u of unplaced) expect(u.reason.length).toBeGreaterThan(0);
    });
  });
});
