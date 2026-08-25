import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { checkAcCoverage } from "../../lib/specLint/acCoverage";
import { premise, premiseHolds } from "../_shared/premise";
import { viewOf } from "./acCoverageView";

const PLANS = "docs/superpowers/plans";

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (p.endsWith(".md")) out.push(p);
  }
  return out;
}

/** The declaration, matched the way the arm matches it. */
const DECLARED = /^ {0,3}<!-- ac-coverage: command-col=[1-9][0-9]* -->[ \t]*$/m;

describe("acCoverage — the live plan corpus", () => {
  const docs = walk(PLANS);

  it("contributes NOTHING to any document that carries no declaration", () => {
    // The premise executes unconditionally relative to what it guards, and NOT
    // inside a .each callback whose case count can be zero: an empty walk would
    // otherwise satisfy every assertion below by having nothing to assert over.
    premise("plan documents walked from disk", docs.length, 30);

    // ONE pass: each document is read once and parsed once. The first draft read
    // and parsed twice and spent 56s against a 30s timeout, which is a
    // measurement of the test rather than of the arm.
    const noisy: string[] = [];
    let undeclared = 0;
    for (const f of docs) {
      const text = readFileSync(f, "utf8");
      if (DECLARED.test(text)) continue;
      undeclared += 1;
      const codes = checkAcCoverage(viewOf(text), "plan");
      if (codes.length > 0) noisy.push(`${f}: ${codes.map((c) => c.code).join(", ")}`);
    }
    premise("undeclared documents actually scanned", undeclared, 30);
    expect(noisy).toEqual([]);
    // A corpus scan over every plan document, each parsed once with remark. The
    // bound is deliberately generous, because a timeout here reads like a finding
    // about the ARM when it is a fact about the corpus size and the runner.
    //
    // MEASURED, not guessed, on 2026-08-25 over 699 documents: remark's parse is
    // 20578ms, this arm's view builder 223ms and `checkAcCoverage` 11ms -- the
    // walk is 99% parser. Under vitest the same work clocked 96.8s, so the 60s
    // bound this test shipped with was already marginal and three absorbs of main
    // in one day pushed it over. 180s leaves headroom for a slower CI runner
    // without hiding a real regression: a change that doubled the ARM's share
    // would still land far under it, so this bound cannot mask one.
  }, 180_000);

  it("both declaring PLANS are found, and the arm reports zero over each", () => {
    const declaring = docs.filter((f) => DECLARED.test(readFileSync(f, "utf8")));
    // Sweep B's assertion, executable. The loose substring grep also matches the
    // spec's prose describing the grammar; this is the anchored population.
    expect(declaring.sort()).toEqual([
      "docs/superpowers/plans/2026-08-21-pane-compaction-send-authorization.md",
      "docs/superpowers/plans/2026-08-25-planlint-ac-command-observability.md",
    ]);
    premiseHolds("both declaring documents were actually read", declaring.length === 2);
    for (const f of declaring) {
      const found = checkAcCoverage(viewOf(readFileSync(f, "utf8")), "plan");
      expect({ [f]: found.map((x) => x.code) }).toEqual({ [f]: [] });
    }
  });

  it("reports on a document the moment a declaration is planted into it", () => {
    // THE DISCRIMINATOR. The assertion above is satisfied by an arm that reads
    // nothing at all, which is exactly the state this task is authored in. This
    // case is what separates "reads declarations and finds none" from "reads
    // nothing", and it is red until declaration discovery lands.
    const victim = docs.find((f) => {
      const text = readFileSync(f, "utf8");
      return !DECLARED.test(text) && /^\| .* \|$/m.test(text);
    });
    premiseHolds("an undeclared corpus document containing a table exists", victim !== undefined);

    const original = readFileSync(victim!, "utf8");
    premiseHolds(
      "the unplanted document draws nothing, so any finding below is the plant's",
      checkAcCoverage(viewOf(original), "plan").length === 0,
    );

    // command-col=99 cannot be satisfied by any table in the corpus, so the plant
    // reports regardless of what the victim's table happens to contain.
    const planted = original.replace(/^(\| .* \|)$/m, "<!-- ac-coverage: command-col=99 -->\n\n$1");
    premiseHolds("the plant changed the document", planted !== original);

    expect(checkAcCoverage(viewOf(planted), "plan").map((f) => f.code)).toContain(
      "AC_COVERAGE_COL_OUT_OF_RANGE",
    );
  });
});
