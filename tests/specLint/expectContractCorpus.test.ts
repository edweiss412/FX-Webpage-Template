import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseDoc } from "../../lib/specLint/parse";
import { checkExpectN, playwrightCollectionPlan } from "../../lib/specLint/expectContract";
import type { PlaywrightCandidate } from "../../lib/specLint/expectContract";
import { premise } from "../_shared/premise";

/**
 * Corpus measurement (spec
 * `docs/superpowers/specs/ci/2026-08-28-speclint-expect-n-exit-status.md` §4.4,
 * §8): the zero-false-advisory number, re-derived from disk on every run
 * rather than pinned — a document added later is covered by default. Failure
 * mode caught: the grammar widening onto prose ABOUT commands (a §4.2 site
 * entering the fire-set), or narrowing off a true positive (a §4.4 site
 * leaving it). Dated scalars (23 containing lines at authoring time) are NOT
 * asserted; the SET is.
 */

const planDocs = (): string[] =>
  execFileSync("git", ["ls-files", "-z", "docs/superpowers/plans"], { encoding: "utf8" })
    .split("\0")
    .filter((p) => p.endsWith(".md"));

describe("Arm A over the live plans corpus", () => {
  it("fires on exactly the §4.4 ten", () => {
    const docs = planDocs();
    premise("plan documents walked", docs.length, 100);
    premise(
      "known-positive document present in the walk",
      docs.filter((p) => p === "docs/superpowers/plans/2026-08-18-control-outline-border-token.md")
        .length,
      0,
    );

    const fired: string[] = [];
    for (const doc of docs) {
      const model = parseDoc(readFileSync(doc, "utf8"));
      for (const f of checkExpectN(model, "plan")) {
        if (f.code === "EXPECT_N_UNENFORCED") fired.push(`${doc}:${f.docLine}`);
      }
    }

    // The §4.4 measured accept-set. Every row is a command whose exit status
    // cannot report the stated number; a new true positive in a future plan
    // updates this characterization deliberately, never silently.
    expect(fired.sort()).toEqual(
      [
        "docs/superpowers/plans/2026-07-20-show-scoped-alert-copy/00-plan.md:407",
        "docs/superpowers/plans/2026-07-20-show-scoped-alert-copy/00-plan.md:408",
        "docs/superpowers/plans/2026-08-03-lead-capability-prose-settle.md:671",
        "docs/superpowers/plans/2026-08-18-control-outline-border-token.md:169",
        "docs/superpowers/plans/2026-08-18-control-outline-border-token.md:170",
        "docs/superpowers/plans/2026-08-21-app-e2e-batch2.md:74",
        "docs/superpowers/plans/2026-08-21-app-e2e-batch2.md:76",
        "docs/superpowers/plans/2026-08-21-app-e2e-batch2.md:77",
        "docs/superpowers/plans/parser/2026-07-06-bo-show-prefixed-breakout-header.md:187",
        "docs/superpowers/plans/v1-pre-deployment-amendments/2026-05-26-pg-cron-pivot/01-pivot-tasks.md:1058",
      ].sort(),
    );
  });
});

describe("Arm B extraction over the live plans corpus", () => {
  const allCandidates = (): { doc: string; c: PlaywrightCandidate }[] => {
    const out: { doc: string; c: PlaywrightCandidate }[] = [];
    for (const doc of planDocs()) {
      const model = parseDoc(readFileSync(doc, "utf8"));
      for (const c of playwrightCollectionPlan(model, "plan")) out.push({ doc, c });
    }
    return out;
  };

  it("finds the incident line, the -c alias, the multi-file candidate, exactly two configs, and declines the rule-3/rule-4 instances", () => {
    const rows = allCandidates();
    premise("corpus candidates extracted", rows.length, 0);

    // The clipsub incident transcript line: a candidate under the sentinel.
    const incident = rows.filter(
      (r) =>
        r.doc === "docs/superpowers/plans/2026-08-27-fitwithinclip-clip-subscription.md" &&
        r.c.files.includes("tests/e2e/popover-clip-fit.spec.ts") &&
        r.c.config === "(default)",
    );
    expect(incident.length).toBeGreaterThanOrEqual(1);

    // Exactly two distinct configs corpus-wide (the two-spawn property).
    const configs = new Set(rows.map((r) => r.c.config));
    expect([...configs].sort()).toEqual(["(default)", "tests/e2e/standalone.config.ts"]);

    // The one real -c alias use resolves the standalone config.
    const alias = rows.filter(
      (r) =>
        r.doc === "docs/superpowers/plans/2026-07-18-modal-close-exit-anim/01-tasks.md" &&
        r.c.files.includes("tests/e2e/step3-review-modal.interactions.spec.ts") &&
        r.c.config === "tests/e2e/standalone.config.ts",
    );
    expect(alias.length).toBeGreaterThanOrEqual(1);

    // The multi-file first-present-later-absent candidate carries BOTH tokens.
    const multi = rows.find(
      (r) =>
        r.doc ===
          "docs/superpowers/plans/2026-07-18-modal-header-reconciliation/01-shell-and-strip.md" &&
        r.c.line === 171,
    );
    expect(multi?.c.files).toEqual([
      "tests/e2e/published-review-modal.layout.spec.ts",
      "tests/e2e/step3-review-modal.layout.spec.ts",
    ]);

    // Rule-3 and rule-4 decline instances are NOT candidates.
    expect(
      rows.filter(
        (r) => r.doc === "docs/superpowers/plans/2026-08-21-app-e2e-batch2.md" && r.c.line === 173,
      ),
    ).toHaveLength(0);
    expect(
      rows.filter(
        (r) =>
          r.doc === "docs/superpowers/plans/2026-08-26-nearmiss-candidate-render.md" &&
          r.c.line === 138,
      ),
    ).toHaveLength(0);
  });
});
