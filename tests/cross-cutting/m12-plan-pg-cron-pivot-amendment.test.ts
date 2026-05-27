/**
 * M12.1 T5 — m12-plan-pg-cron-pivot-amendment doc-guard.
 *
 * 19 positive/negative assertions (A-S) pinning T5's amendments to:
 *   - 01-phase0-infra.md (A-D)
 *   - 05-phase0-smokes.md (E-J)
 *   - M12 sub-amendment spec (K-N, S)
 *   - Master spec (O-R)
 *
 * Authored at T5 commit boundary; per R9 F23 the test ships in its OWN file
 * (not commingled with pg-cron-pivot-doc-guard.test.ts so the T4 commit can be
 * green at HEAD before T5 edits land).
 *
 * Assertion P (R29 F57 structural defense) dynamic-imports
 * scripts/generate-traceability.ts to verify the parser surface includes
 * `x6-pg-cron-pivot`.
 */

import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = process.cwd();

const M12_PLAN_INFRA = join(
  REPO_ROOT,
  "docs/superpowers/plans/v1-pre-deployment-amendments/2026-05-19-solo-dev-ux-validation/01-phase0-infra.md",
);
const M12_PLAN_SMOKES = join(
  REPO_ROOT,
  "docs/superpowers/plans/v1-pre-deployment-amendments/2026-05-19-solo-dev-ux-validation/05-phase0-smokes.md",
);
const M12_SPEC = join(
  REPO_ROOT,
  "docs/superpowers/specs/v1-pre-deployment-amendments/2026-05-19-solo-dev-ux-validation-design.md",
);
const MASTER_SPEC = join(REPO_ROOT, "docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md");

function read(file: string): string {
  return readFileSync(file, "utf8");
}

function isHistoricalContextLine(line: string): boolean {
  return (
    /\bR\d+\s+F\d+\b/.test(line) ||
    /\bHISTORICAL\b/.test(line) ||
    /\baudit[- ]trail\b/i.test(line) ||
    /\bfinding history\b/i.test(line) ||
    /\bCaught:/i.test(line) ||
    /\bwas:\s/i.test(line) ||
    /\bRepair:/i.test(line) ||
    // X6-D-1 dormancy reframe: prose like "WERE required-blocking" / "WAS
    // independently required-blocking" / "marks the required-blocking
    // enforcement dormant" is the plan-prescribed text for dormancy notes,
    // NOT a stale-assumption. Allowlist these contexts.
    /\bX6-D-1\b/.test(line) ||
    /\bDEFERRED\.md\b/.test(line) ||
    /\bdormant\b/i.test(line)
  );
}

function findNonHistoricalMatches(
  text: string,
  regex: RegExp,
): Array<{ line: number; text: string }> {
  const out: Array<{ line: number; text: string }> = [];
  const lines = text.split("\n");
  const globalRegex = new RegExp(
    regex.source,
    regex.flags.includes("g") ? regex.flags : regex.flags + "g",
  );
  for (const match of text.matchAll(globalRegex)) {
    if (match.index === undefined) continue;
    const lineNumber = text.slice(0, match.index).split("\n").length;
    const lineText = lines[lineNumber - 1] ?? "";
    const lo = Math.max(0, lineNumber - 1 - 5);
    const hi = Math.min(lines.length, lineNumber - 1 + 6);
    const ctxLines = lines.slice(lo, hi);
    if (ctxLines.some(isHistoricalContextLine)) continue;
    out.push({ line: lineNumber, text: lineText.trim() });
  }
  return out;
}

describe("M12.1 T5: m12-plan-pg-cron-pivot-amendment doc-guard", () => {
  describe("01-phase0-infra.md (assertions A-D)", () => {
    const infra = read(M12_PLAN_INFRA);

    test("A — contains literal Task 0.A.4.5 heading", () => {
      expect(infra).toContain(
        "### Task 0.A.4.5: Populate Vault + set GUC + apply M12.1 migrations against validation Supabase",
      );
    });

    test("B — Task 0.A.5 step 3 contains CRON_SECRET in Vercel-Production-scope context", () => {
      const m = infra.match(/### Task 0\.A\.5[\s\S]*?(?=### Task 0\.A\.[6-9]|\n## )/);
      expect(m, "Task 0.A.5 section not found").not.toBeNull();
      expect(m![0]).toMatch(/CRON_SECRET[\s\S]*Vercel Production scope/i);
    });

    test("C — does NOT contain stale Vercel-Cron-only rationale outside HISTORICAL", () => {
      const matches = findNonHistoricalMatches(
        infra,
        /Vercel Cron Jobs run only on production deployments/i,
      );
      expect(matches, `stale Vercel-Cron-only phrase found at: ${JSON.stringify(matches)}`).toEqual(
        [],
      );
    });

    test("D — contains joined cron.job_run_details query (j.jobid = jrd.jobid)", () => {
      expect(infra).toMatch(/cron\.job_run_details[\s\S]{0,200}?join\s+cron\.job/i);
      expect(infra).toMatch(/j\.jobid\s*=\s*jrd\.jobid/i);
    });
  });

  describe("05-phase0-smokes.md (assertions E-J)", () => {
    const smokes = read(M12_PLAN_SMOKES);

    function smoke3Section(): string {
      const m = smokes.match(/### Task 0\.F\.3:?\s*Smoke 3[\s\S]*?(?=### Task 0\.F\.[4-9]|^## )/m);
      return m ? m[0] : "";
    }

    test("E — Smoke 3 references all 3 observability layers", () => {
      const body = smoke3Section();
      expect(body, "Smoke 3 section not found").not.toBe("");
      expect(body).toMatch(/cron\.job_run_details/i);
      expect(body).toMatch(/net\._http_response/i);
      expect(body.toLowerCase()).toMatch(/downstream side effect/);
    });

    test("F — Smoke 3 contains joined cron.job_run_details jrd join cron.job j", () => {
      expect(smoke3Section()).toMatch(
        /cron\.job_run_details\s+jrd[\s\S]{0,200}?join\s+cron\.job\s+j[\s\S]{0,100}?j\.jobid\s*=\s*jrd\.jobid/i,
      );
    });

    test("G — Smoke 3 references net._http_response", () => {
      expect(smoke3Section()).toMatch(/net\._http_response/i);
    });

    test("H — Smoke 3 uses 5-minute timeout prose (300s / 5 min), NOT 30s", () => {
      const body = smoke3Section();
      expect(body).toMatch(/\b(300\s*(?:000)?\b|5\s*min(?:ute)?s?)/i);
      expect(body).not.toMatch(/\b30\s*(?:s|sec|seconds?)\b\s*(?:timeout|cron|pg_net)/i);
    });

    test("I — Smoke 3 does NOT contain stale Vercel-Cron observability references", () => {
      const matches = findNonHistoricalMatches(
        smoke3Section(),
        /(Vercel Cron Logs|verify cron is enabled in vercel\.json)/i,
      );
      expect(
        matches,
        `stale Vercel-Cron observability references in Smoke 3: ${JSON.stringify(matches)}`,
      ).toEqual([]);
    });

    test("J — Phase 0.F failure-modes Smoke 3 entry does NOT identify Preview as sole cause", () => {
      const idx = smokes.indexOf("Phase 0.F failure modes");
      expect(idx, "Phase 0.F failure modes section not found").toBeGreaterThan(0);
      const section = smokes.slice(idx);
      const entryMatch = section.match(/Smoke 3 \(cron\) doesn['’]t fire[\s\S]{0,800}?(?=\n- |\n\n##|\n\n###)/);
      expect(entryMatch, "Smoke 3 (cron) doesn't fire entry not found").not.toBeNull();
      const body = entryMatch![0];
      const isStalePreviewOnly =
        /Vercel deployment is\s+(?:in\s+)?Preview/i.test(body) &&
        !/(cron\.job_run_details|net\._http_response|3-layer)/i.test(body);
      expect(
        isStalePreviewOnly,
        `Smoke 3 failure-mode entry still attributes only to Preview: ${body}`,
      ).toBe(false);
    });
  });

  describe("M12 spec — solo-dev-ux-validation-design.md (K-N, S)", () => {
    const m12spec = read(M12_SPEC);

    test("K — does NOT contain stale 'Vercel Cron Jobs run only' rationale outside HISTORICAL", () => {
      const matches = findNonHistoricalMatches(
        m12spec,
        /Vercel Cron Jobs run only on production deployments/i,
      );
      expect(matches, `stale Vercel-Cron phrase in M12 spec: ${JSON.stringify(matches)}`).toEqual([]);
    });

    test("L — §9.2 smoke 3 does NOT contain stale 'Vercel Cron → fetch' phrase outside HISTORICAL", () => {
      const matches = findNonHistoricalMatches(
        m12spec,
        /Vercel Cron\s*→\s*fetch from Drive/i,
      );
      expect(matches, `stale Vercel-Cron-fetch phrase in M12 spec: ${JSON.stringify(matches)}`).toEqual(
        [],
      );
    });

    test("M — M12 spec contains new Cron-scheduling-architecture section with M12.1 refs", () => {
      expect(m12spec).toMatch(/(Cron scheduling architecture|M12\.1 amendment)[\s\S]{0,2000}fxav_cron_/i);
      expect(m12spec).toMatch(/pg_net[\s\S]{0,2000}async/i);
    });

    test("N — §9.1.1 CI gate inventory contains `x6-pg-cron-pivot` AND 8-canonical-CI-gates phrasing", () => {
      expect(m12spec).toContain("x6-pg-cron-pivot");
      expect(m12spec).toMatch(/(?:eight|8)\s+(?:canonical\s+)?CI gates/i);
    });

    test("S — M12 spec zero matches for 'seven canonical|seven CI gates|all seven|the seven|required-blocking' outside HISTORICAL", () => {
      const matches = findNonHistoricalMatches(
        m12spec,
        /(seven canonical|seven CI gates|all seven|the seven|required-blocking)/i,
      );
      expect(
        matches,
        `M12 spec still has stale seven/required-blocking references: ${JSON.stringify(matches.slice(0, 5))}`,
      ).toEqual([]);
    });
  });

  describe("Master spec — 2026-04-30-fxav-crew-pages-v1.md (O-R)", () => {
    const master = read(MASTER_SPEC);

    test("O — master spec AC-X.6 paragraph contains backtick literal `x6-pg-cron-pivot`", () => {
      const m = master.match(/AC-X\.6[\s\S]*?### 17\.2\.1/);
      expect(m, "AC-X.6 paragraph not found").not.toBeNull();
      expect(m![0]).toContain("`x6-pg-cron-pivot`");
    });

    test("P — loadRequiredChecksFromSpec returns array containing 'x6-pg-cron-pivot'", async () => {
      const mod: { loadRequiredChecksFromSpec: (specPath?: string) => string[] } = await import(
        "../../scripts/generate-traceability"
      );
      const checks = mod.loadRequiredChecksFromSpec();
      expect(checks).toContain("x6-pg-cron-pivot");
    });

    test("Q — BRANCH_PROTECTION_DRIFT catalog row contains `x6-pg-cron-pivot` and updated count", () => {
      const idx = master.indexOf("BRANCH_PROTECTION_DRIFT");
      expect(idx).toBeGreaterThan(0);
      const row = master.slice(idx, idx + 5000);
      expect(row).toContain("x6-pg-cron-pivot");
      expect(row).toMatch(/EIGHT required|eight required/);
    });

    test("R — master spec zero matches for 'seven required|SEVEN required|all seven|the seven' outside HISTORICAL", () => {
      const matches = findNonHistoricalMatches(
        master,
        /(seven required|SEVEN required|all seven|the seven)/,
      );
      expect(
        matches,
        `master spec still has stale seven-required references: ${JSON.stringify(matches.slice(0, 5))}`,
      ).toEqual([]);
    });
  });
});
