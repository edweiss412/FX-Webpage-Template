import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { GUARD_SURFACES } from "../mutation/source/registry";
import { discoverPins, type Pin } from "../../lib/specLint/declaredLimitPins";
import { premise, premiseHolds } from "../_shared/premise";
import { NOT_A_PIN } from "./declaredLimitPinDispositions";
import { ALL_SYNTHETIC_TITLES } from "./__fixtures__/declaredLimitPins/syntheticTitles";

/**
 * The derived cover over the disposition registry (spec §5).
 *
 * It walks the enrolled `suitePaths` FROM DISK, so a new suite file is covered by
 * default rather than by someone remembering to list it.
 *
 * ── WHAT IS THE RED HERE, AND WHAT IS ONLY CHARACTERIZATION ────────────────────
 * The red is the TARGETED assertion that neither §2.4 closure title is a pin. Against
 * the Step-1 empty registry both appear, by name, in the failure output.
 *
 * **The derived census is NOT the red and must not be read as one:** with no
 * dispositions its two sides hold the SAME nine titles and it passes. It becomes
 * meaningful only once the rows land, and it is stated here so nobody later reads its
 * green as evidence the registry was exercised.
 *
 * ── PREPARATION MAKES NO DIFFERENCE ON THE LIVE CORPUS TODAY ───────────────────
 * These runs scan RAW suite text. Measured, not assumed: no enrolled suite currently
 * holds a test-shaped line inside a comment, template or multi-line string, so prepared
 * and unprepared yield the same set. Preparation is defensive — one ordinary edit away —
 * and its only executable proof is Task 7b's in-process decoy case, against the real
 * adapter function. Stated so this file is not mistaken for a preparation proof.
 */

const REPO = process.cwd();

const ENROLLED_SUITES: readonly string[] = [
  ...new Set(GUARD_SURFACES.flatMap((surface) => surface.suitePaths)),
].sort();

function readSuite(path: string): string[] | null {
  try {
    return readFileSync(join(REPO, path), "utf8").split("\n");
  } catch {
    return null;
  }
}

/** Every phrase-bearing title on disk, BEFORE any disposition is applied. */
function rawTitles(): Pin[] {
  const found: Pin[] = [];
  for (const path of ENROLLED_SUITES) {
    const lines = readSuite(path);
    // A read that could not happen and a read that found nothing must not look alike.
    expect(lines, `enrolled suite is unreadable: ${path}`).not.toBeNull();
    found.push(...discoverPins(path, lines!, []));
  }
  return found;
}

/** The live pin set: the same scan WITH the shipped registry applied. */
function livePins(): Pin[] {
  const found: Pin[] = [];
  for (const path of ENROLLED_SUITES) {
    const lines = readSuite(path);
    expect(lines, `enrolled suite is unreadable: ${path}`).not.toBeNull();
    found.push(...discoverPins(path, lines!, NOT_A_PIN));
  }
  return found;
}

const identity = (pin: Pin): string => `${pin.path}\u0000${pin.title}`;
const identities = (pins: Pin[]): string[] => pins.map(identity).sort();

/**
 * Spec §2.4's two closure titles. These are the ONLY literals in this file that name
 * corpus content, and they are the red: each narrates a limit that closed, so neither
 * may be reported as a live pin.
 */
const CLOSURE_TITLES = [
  {
    path: "tests/cross-cutting/psqlStartupFileSuppression.test.ts",
    title: "a QUOTED Windows path is now read - the R40-era known miss closes",
  },
  {
    path: "tests/help/_metaUiLabelCrosswalk.test.ts",
    title: "CLOSED (was DOCUMENTED LIMIT): a type annotation no longer reaches the haystack",
  },
] as const;

describe("declared-limit pin dispositions — premise", () => {
  it("states executably that there is a corpus and that it carries pins", () => {
    // Without this, a checkout where the registry resolved to nothing would assert an
    // empty set against an empty set and report PASS.
    premise("enrolled suites walked from the registry", ENROLLED_SUITES.length, 10);
    premise("phrase-bearing titles found on disk", rawTitles().length, 0);
    premiseHolds(
      "every enrolled suite is readable, so a zero below is a decision and not a failed read",
      ENROLLED_SUITES.every((path) => readSuite(path) !== null),
    );
  });
});

describe("declared-limit pin dispositions — the registry (spec §5)", () => {
  it("does not report either §2.4 CLOSURE title as a live pin", () => {
    // THE RED. With the Step-1 empty registry both appear here by name.
    const live = new Set(identities(livePins()));
    for (const closure of CLOSURE_TITLES) {
      expect(
        live.has(`${closure.path}\u0000${closure.title}`),
        `a title narrating a CLOSED limit is being reported as a live pin: ${closure.path} — ${closure.title}`,
      ).toBe(false);
    }
  });

  it("still reports the other pins in the SAME files the closures live in", () => {
    // Paired with the assertion above: "neither closure is a pin" is satisfied by a
    // registry that suppressed everything, or by a scan that never ran.
    const live = identities(livePins());
    expect(
      live.some((id) =>
        id.startsWith("tests/cross-cutting/psqlStartupFileSuppression.test.ts\u0000"),
      ),
    ).toBe(true);
  });

  it("derives the census rather than typing it: live == raw MINUS the disposition rows", () => {
    // CHARACTERIZATION until the rows land — with an empty registry both sides hold the
    // same nine titles and this passes. It reads the expected side from the two SHIPPED
    // artifacts, the scanner and the registry, so drift cannot relocate into the test.
    const disposed = new Set(NOT_A_PIN.map((row) => `${row.path}\u0000${row.title}`));
    const expected = identities(rawTitles()).filter((id) => !disposed.has(id));
    expect(identities(livePins())).toEqual(expected);
  });

  it("carries no STALE row — every disposition still matches a title on disk", () => {
    const onDisk = new Set(identities(rawTitles()));
    for (const row of NOT_A_PIN) {
      expect(
        onDisk.has(`${row.path}\u0000${row.title}`),
        `stale disposition: ${row.path} no longer carries the title ${JSON.stringify(row.title)}`,
      ).toBe(true);
    }
  });

  it("proves the stale-row check CAN fail, by constructing a row that is not on disk", () => {
    // A check that cannot fail is not a check. Constructed and discarded, never left in
    // the registry.
    const onDisk = new Set(identities(rawTitles()));
    const fabricated = {
      path: "tests/specLint/numerics.test.ts",
      title: "a qplinth title that is not on disk anywhere - documented limit",
      reason: "constructed for this assertion",
    };
    expect(onDisk.has(`${fabricated.path}\u0000${fabricated.title}`)).toBe(false);
  });

  it("carries no row with an empty or whitespace REASON", () => {
    // A waiver that launders itself is the shape WAIVER_MISSING_REASON already refuses.
    for (const row of NOT_A_PIN) {
      expect(
        row.reason.trim().length,
        `disposition for ${row.title} carries no reason`,
      ).toBeGreaterThan(0);
    }
  });
});

describe("declared-limit pin dispositions — both directions, on constructed input", () => {
  const CONSTRUCTED = 'test("a qplinth constructed row is a documented limit", () => {});';
  const TITLE = "a qplinth constructed row is a documented limit";
  const HERE = "tests/qplinth/here.test.ts";
  const THERE = "tests/qplinth/there.test.ts";

  it("makes a phrase-bearing title a pin when nothing dispositions it", () => {
    expect(discoverPins(HERE, [CONSTRUCTED], []).map((p) => p.title)).toEqual([TITLE]);
  });

  it("suppresses it once a matching row exists", () => {
    const row = [{ path: HERE, title: TITLE, reason: "constructed" }];
    expect(discoverPins(HERE, [CONSTRUCTED], row)).toEqual([]);
  });

  it("does NOT suppress the same title at a DIFFERENT path", () => {
    // The finer grain asserted directly: a path-keyed row would absorb every future pin
    // in that file, and no positive test would ever show it.
    const row = [{ path: HERE, title: TITLE, reason: "constructed" }];
    expect(discoverPins(THERE, [CONSTRUCTED], row).map((p) => p.title)).toEqual([TITLE]);
  });
});

describe("declared-limit pin dispositions — this arc's fixtures are not corpus", () => {
  it("shares no title with the live pin set", () => {
    /**
     * The weaker implementation the pin-grammar suite must kill is "the seven live pin
     * titles, hardcoded", which passes every accept case whose title was COPIED from the
     * corpus. So no synthetic title may appear as a live pin.
     *
     * Keyed on the shared title DATA, never on a nonce token: a check keyed on a naming
     * convention is blind to every entry that does not use it, and would report a
     * confident zero for a title written without the convention.
     */
    const liveTitles = new Set(livePins().map((pin) => pin.title));
    const collisions = ALL_SYNTHETIC_TITLES.filter((title) => liveTitles.has(title));
    expect(collisions).toEqual([]);
  });

  it("has a POSITIVE CONTROL, so the empty result above is attributable", () => {
    // If the live pin set were empty — a broken walk, an unreadable tree — the
    // assertion above would pass while proving nothing.
    const liveTitles = new Set(livePins().map((pin) => pin.title));
    expect(liveTitles.has("a COMPUTED key is a documented limit, not a site")).toBe(true);
  });
});

describe("declared-limit pins — the enrolled suite list is DERIVED, not trusted", () => {
  /**
   * `suitePaths` in `tests/mutation/source/registry.ts` is an ENUMERATION, and an
   * enumeration over a growing set goes stale on ADDITION rather than on mistake: it is
   * correct when written and silently wrong the moment someone adds a suite. The cost is
   * not cosmetic — a suite absent from `suitePaths` buys ZERO mutation score and decides
   * nothing, so its assertions run, pass, and prove nothing about the surface.
   *
   * CONTAINMENT, not equality, and the direction is the point: every test file that
   * IMPORTS the core must be registered, while a registered suite that reaches the arm
   * some other way is fine. The wiring suite is exactly that case — it exercises the arm
   * through `runLint` rather than by a direct import — so an equality assertion would
   * fail on correct data.
   *
   * Keyed on the IMPORT GRAPH rather than on a filename pattern, because a name-keyed
   * check is blind to any suite that tests the core under a different name.
   */
  const SPEC_LINT_TESTS = readdirSync(join(REPO, "tests/specLint"))
    .filter((name) => name.endsWith(".test.ts"))
    .map((name) => `tests/specLint/${name}`);

  const importsCore = SPEC_LINT_TESTS.filter((rel) =>
    /from\s+"[^"]*\/declaredLimitPins"/.test(readFileSync(join(REPO, rel), "utf8")),
  );

  const registered = new Set(
    GUARD_SURFACES.find((s) => s.id === "declaredLimitPins")?.suitePaths ?? [],
  );

  it("finds importers at all, so the containment below is not vacuous", () => {
    premise("tests/specLint suites importing the core", importsCore.length, 3);
    premiseHolds("the surface is enrolled and carries suitePaths", registered.size > 0);
  });

  it("registers every suite that imports the core", () => {
    const unregistered = importsCore.filter((rel) => !registered.has(rel));
    expect(
      unregistered,
      `these suites test the core but are absent from suitePaths, so they buy ZERO ` +
        `mutation score and decide nothing:\n  ${unregistered.join("\n  ")}`,
    ).toEqual([]);
  });
});
