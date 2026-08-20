import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { GUARD_SURFACES } from "../mutation/source/registry";
import { parseDoc } from "../../lib/specLint/parse";
import {
  RAW_SUITE_PREPARER,
  checkDeclaredLimitPins,
  discoverPins,
} from "../../lib/specLint/declaredLimitPins";
import type { EnrolledSurface, FileResolver } from "../../lib/specLint/types";
import { premise, premiseHolds } from "../_shared/premise";
import { NOT_A_PIN } from "./declaredLimitPinDispositions";

/**
 * Task 6 — the §2.7 historical re-enactment and the §2.6 corpus regression
 * (AC-4, AC-6).
 *
 * ── CHARACTERIZATION, DISCLOSED RATHER THAN FAKED ──────────────────────────────
 * Tasks 1-5 implemented the whole core, so a correct implementation makes this suite
 * green the moment it is authored: there is no deliberately defective surface left for
 * it to observe. A `red-state=authored` marker here would assert a red that cannot
 * fire, which is precisely the silent under-coverage
 * `BL-SPECLINT-RED-TARGET-CANNOT-NAME-A-REPO-ROOT-SURFACE` records, so it is stated
 * instead.
 *
 * Its value is REGRESSION, and that is real: it pins the §2.7 replay and the §2.6 set
 * so a later change to any rule must restate them deliberately.
 *
 * ── THE REPLAY IS FROM COMMITTED HISTORY, NOT A CONSTRUCTED ANALOGUE ───────────
 * `fix/shell-binding-mixed-quoted-value` plan round 3 finding 1: the spec's fix
 * inverted the verdict of a committed pin, and neither the spec nor the plan named it
 * until a reviewer did. The plan then grew Step 3b to retire the pin. Both directions
 * come from one pair of inputs differing ONLY by that repair, so an arm that always
 * fires and an arm that never fires each fail one direction.
 */

const REPO = process.cwd();
const FIXTURES = join(REPO, "tests/specLint/__fixtures__/declaredLimitPins");

const SUITE_PATH = "tests/cross-cutting/psqlStartupFileSuppression.test.ts";
const SCAN_PATH = "tests/cross-cutting/psqlStartupFiles/scan.ts";
const INCIDENT_PIN = "a QUOTED backslash path in shell text is a KNOWN miss";

const fixture = (name: string): string => readFileSync(join(FIXTURES, name), "utf8");

/**
 * The real enrolled surface, projected as the adapter projects it. Its suite text comes
 * from the COMMITTED BLOB rather than from disk, so the replay does not depend on those
 * blobs staying reachable in git.
 */
const PSQL_SURFACE: EnrolledSurface = {
  id: "psqlStartupScan",
  sourcePath: SCAN_PATH,
  suitePaths: [SUITE_PATH],
};

function replayResolver(suiteText: string): FileResolver {
  return {
    readFileLines: (path) => (path === SUITE_PATH ? suiteText.split("\n") : null),
    listTrackedFiles: () => [SUITE_PATH, SCAN_PATH],
  };
}

const advisoriesFor = (planText: string, suiteText: string): string[] =>
  checkDeclaredLimitPins(
    parseDoc(planText),
    "plan",
    [PSQL_SURFACE],
    replayResolver(suiteText),
    RAW_SUITE_PREPARER,
    NOT_A_PIN,
  )
    .filter((f) => f.code === "DECLARED_LIMIT_PIN_UNNAMED")
    .map((f) => f.message);

describe("declared-limit pins — §2.7 replay, from committed blobs (AC-4)", () => {
  const suitePreRepair = fixture("suite-pre-repair.txt");
  const planPre = fixture("plan-pre-step3b.md");
  const planPost = fixture("plan-post-step3b.md");

  it("states its premise executably: the blobs are present and carry what the replay needs", () => {
    premise("pre-repair suite blob lines", suitePreRepair.split("\n").length, 1000);
    premiseHolds("the pre-repair suite still carries the incident pin", suitePreRepair.includes(INCIDENT_PIN));
    premiseHolds(
      "the two plan blobs differ, so a replay comparing them is comparing something",
      planPre !== planPost,
    );
  });

  it("discovers exactly the incident pin in the PRE-REPAIR suite blob", () => {
    const pins = discoverPins(SUITE_PATH, suitePreRepair.split("\n"), NOT_A_PIN);
    expect(pins.map((p) => p.title)).toEqual([INCIDENT_PIN]);
  });

  it("draws ONE advisory naming that pin for the PRE-STEP-3B plan", () => {
    const advisories = advisoriesFor(planPre, suitePreRepair);
    expect(advisories).toHaveLength(1);
    expect(advisories[0]).toContain(INCIDENT_PIN);
  });

  it("draws ZERO advisories for the MERGED plan, which names the pin", () => {
    // The other direction, from the same pair of inputs. An arm that always fires fails
    // this; an arm that never fires fails the case above.
    expect(advisoriesFor(planPost, suitePreRepair)).toEqual([]);
  });
});

describe("declared-limit pins — §2.6 corpus regression (AC-6)", () => {
  /**
   * The corpus is ENUMERATED at run time and the assertion is the SET of
   * `(plan, suitePath, title)` triples — never a count. Two reasons, both measured on
   * this arc: a count passes on a different set of the same size, and the corpus grew
   * between drafting and review, which would have stranded any hard-coded total.
   */
  const trackedPlans = (): string[] =>
    execFileSync("git", ["ls-files", "docs/superpowers/plans"], { cwd: REPO, encoding: "utf8" })
      .split("\n")
      .filter((p) => p.endsWith(".md"));

  const surfaces: readonly EnrolledSurface[] = GUARD_SURFACES.map((s) => ({
    id: s.id,
    sourcePath: s.sourcePath,
    suitePaths: s.suitePaths,
  }));

  const diskResolver: FileResolver = {
    readFileLines: (path) => {
      try {
        return readFileSync(join(REPO, path), "utf8").split("\n");
      } catch {
        return null;
      }
    },
    listTrackedFiles: () =>
      execFileSync("git", ["ls-files"], { cwd: REPO, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 })
        .split("\n")
        .filter(Boolean),
  };

  function corpusAdvisories(): string[] {
    const rows: string[] = [];
    for (const plan of trackedPlans()) {
      let text: string;
      try {
        text = readFileSync(join(REPO, plan), "utf8");
      } catch {
        continue;
      }
      for (const finding of checkDeclaredLimitPins(
        parseDoc(text),
        "plan",
        surfaces,
        diskResolver,
        RAW_SUITE_PREPARER,
        NOT_A_PIN,
      )) {
        if (finding.code !== "DECLARED_LIMIT_PIN_UNNAMED") continue;
        const parsed = /^(\S+):\d+ pins a declared limit that this plan does not name: "(.*)"$/.exec(
          finding.message,
        );
        rows.push(`${plan} | ${parsed?.[1] ?? "?"} | ${parsed?.[2] ?? finding.message}`);
      }
    }
    return rows.sort();
  }

  it("states its premise executably: the corpus is non-empty and at least one surface carries a pin", () => {
    // Without this, a checkout where the glob returned nothing would assert an empty set
    // against an empty set and report PASS.
    premise("tracked plan corpus", trackedPlans().length, 100);
    premise(
      "live pins across enrolled suites",
      [...new Set(surfaces.flatMap((s) => s.suitePaths))].flatMap((p) => {
        const lines = diskResolver.readFileLines(p);
        return lines === null ? [] : discoverPins(p, lines, NOT_A_PIN);
      }).length,
      0,
    );
  });

  it("relints to exactly the §2.6 SET of (plan, suitePath, title)", () => {
    expect(corpusAdvisories()).toEqual(
      [
        'docs/superpowers/plans/2026-07-19-spec-lint.md | tests/specLint/numerics.test.ts | an irregular plural is NOT singularized — documented limit, not a wrong flag',
        "docs/superpowers/plans/2026-07-19-spec-lint.md | tests/specLint/numerics.test.ts | the wedge-remeasure anchor pair stays SILENT — the arm's documented limit (spec §3.3)",
        "docs/superpowers/plans/2026-08-04-review-round-economy.md | tests/docs/_metaReviewRoundEconomy.test.ts | PASSES a stale none followed by candidate lines - documented limit §5.7",
        "docs/superpowers/plans/2026-08-04-review-round-economy.md | tests/docs/_metaReviewRoundEconomy.test.ts | does NOT resolve an id defined only as a body sub-item - the documented limit",
        "docs/superpowers/plans/2026-08-09-m-wave-2/plan.md | tests/docs/interactionTimingScan.test.ts | a COMPUTED key is a documented limit, not a site",
      ].sort(),
    );
  });

  it("draws advisories on exactly THREE distinct plans", () => {
    // A companion to the set, not a substitute for it: this is derived FROM the set
    // above rather than typed as an independent cardinality.
    expect(new Set(corpusAdvisories().map((row) => row.split(" | ")[0])).size).toBe(3);
  });
});
