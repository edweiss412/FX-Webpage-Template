/**
 * tests/ci/attentionPillFocusWorkflow.test.ts
 *
 * Structural gate for the attention-pill-focus CI wiring (attention-index plan
 * Task 7).
 *
 * Why this file exists: the coverage meta-test CANNOT serve as that task's
 * oracle. `scanWorkflowCoverage` deliberately rejects any workflow carrying a
 * `pull_request.paths` filter (tests/ci/_workflowCoverageScan.ts), so a
 * path-gated job leaves this spec in LOCAL_ONLY_ALLOWLIST exactly as before —
 * and the meta-test only ever reads Object.keys of that map, never the reason
 * values. Flipping UNSEEN → PATH_GATED therefore has zero executable effect.
 *
 * Without the assertions below the whole suite stays green if the workflow is
 * missing, invokes the wrong spec, or omits a dependency path — and an omitted
 * path is not a cosmetic defect: it leaves the job dark for changes to that
 * input, which is the exact failure the gate exists to remove.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const WORKFLOW = ".github/workflows/attention-pill-focus-e2e.yml";
const SPEC = "tests/e2e/attention-pill-focus.spec.ts";

/** Every repository input the spec/entry loads BEFORE the production import,
 *  plus the production surfaces it renders, the toolchain inputs, and the
 *  workflow's own path (or a workflow-only repair never exercises the job).
 *  Derived by reading the spec and entry, not by copying the template — the
 *  template omits tsconfig.json despite its own live bundle passing it. */
const REQUIRED_PATHS = [
  SPEC,
  "tests/e2e/_pillFocusLiveEntry.tsx",
  "tests/e2e/_publishedReviewModalHarness.tsx",
  "tests/e2e/_step3ReviewModalBundle.mjs",
  "tests/e2e/standalone.config.ts",
  "tsconfig.json",
  "components/admin/showpage/AttentionMenu.tsx",
  "components/admin/showpage/PublishedReviewModal.tsx",
  "app/globals.css",
  "package.json",
  "pnpm-lock.yaml",
  WORKFLOW,
];

describe("attention-pill-focus CI wiring", () => {
  const yaml = readFileSync(join(ROOT, WORKFLOW), "utf8");

  it("invokes the spec under the standalone config", () => {
    // the runner is reached through a package script, so accept either form
    const script = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as {
      scripts: Record<string, string>;
    };
    const runLine = /run:\s*(.+)/g;
    const runs = [...yaml.matchAll(runLine)].map((m) => m[1]!.trim());
    const resolved = runs.map((r) => {
      const m = /^pnpm\s+(\S+)$/.exec(r);
      return m && script.scripts[m[1]!] ? script.scripts[m[1]!]! : r;
    });
    const invocation = resolved.find((r) => r.includes(SPEC));
    expect(invocation, `no run step invokes ${SPEC}`).toBeDefined();
    expect(invocation).toContain("tests/e2e/standalone.config.ts");
  });

  it("fires on every direct harness, production, and toolchain input", () => {
    const missing = REQUIRED_PATHS.filter((p) => !yaml.includes(`"${p}"`));
    expect(missing, `path filter omits: ${missing.join(", ")}`).toEqual([]);
  });

  it("is classified PATH_GATED, not UNSEEN, in the coverage registry", () => {
    const registry = readFileSync(join(ROOT, "tests/ci/_metaE2eWorkflowCoverage.test.ts"), "utf8");
    const row = new RegExp(`"${SPEC.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&")}":\\s*(\\w+)`);
    const m = row.exec(registry);
    expect(m, `no allowlist row for ${SPEC}`).not.toBeNull();
    expect(m![1]).toBe("PATH_GATED");
  });
});
