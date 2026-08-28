import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseDoc } from "../../lib/specLint/parse";
import { checkExpectN } from "../../lib/specLint/expectContract";
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
