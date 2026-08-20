// tests/paneCompaction/_metaSendAuthSingleRead.test.ts
//
// The send-authorization single-read gate (spec
// docs/superpowers/specs/ci/2026-08-19-send-auth-single-read-lint-design.md).
//
// EVERY assertion about the scanner lives HERE, and that is not a style
// preference: `sendAuthScan`'s registry row lists this file as its only
// `suitePath`, and only a suite listed there decides KILLED versus SURVIVED. An
// assertion in a neighbouring file still runs, still passes, and contributes
// NOTHING to the mutation score -- probed on a sibling arc, where eight
// surviving mutants existed solely because their covering assertions sat
// outside the surface's `suitePaths` (BL-ENROLLED-SUITE-PLACEMENT-METATEST).
//
// The fixture corpus is authored against a DELIBERATELY DIFFERENT registry row
// -- `Channel` / `ch` / `dispatch` / `settle` / `snapshotOf` -- with no live
// spelling anywhere. A scanner hardcoded to the live instance's vocabulary
// fails every fixture immediately. The live instance is covered by exactly one
// case, the live-tree scan, and that split is the point: the fixtures prove the
// rules are driven by the registry row, the live tree proves the shipped row is
// correct.

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { readsFor, type SendAuthSurface } from "./sendAuthScan";

const FIXTURE_ROOT = "tests/paneCompaction/fixtures/sendAuth";

const fixture = (name: string): string => join(FIXTURE_ROOT, name);

const readFixture = (name: string): string => readFileSync(fixture(name), "utf8");

/**
 * The fixture row. Not one live spelling: `Channel` where the live instance says
 * `Surface`, `dispatch` where it says `send`, `snapshotOf` where it says
 * `cacheOf`.
 */
const CHANNEL_ROW: SendAuthSurface = {
  module: fixture("surface-type-extra-member.ts"),
  surfaceType: "Channel",
  sinks: ["dispatch"],
  effects: ["emit", "trace"],
  ambient: ["clock"],
  derivationHelpers: ["snapshotOf"],
};

describe("AC-4 — the read set is DERIVED from the surface type declaration", () => {
  it("returns every member of the type that the row does not classify", () => {
    // The discriminator: `stamp` is declared in NONE of the row's three sets, so
    // it is a read by complement. A scanner hardcoded to the live read names
    // returns those instead and fails here on a value.
    expect(readsFor(readFixture("surface-type-extra-member.ts"), CHANNEL_ROW)).toEqual([
      "panes",
      "gauge",
      "memo",
      "claim",
      "stamp",
    ]);
  });

  it("covers a PROPERTY signature, not only a method signature", () => {
    // `stamp: (cwd: string) => string | null` is a PropertySignature. A scanner
    // inspecting only `MethodSignature` passes the assertion above's other four
    // members and drops this one -- the live type mixes both forms, so this is
    // the ordinary case rather than an exotic one.
    expect(readsFor(readFixture("surface-type-extra-member.ts"), CHANNEL_ROW)).toContain("stamp");
  });

  it("excludes every member the row declares as a sink, an effect or ambient", () => {
    const reads = readsFor(readFixture("surface-type-extra-member.ts"), CHANNEL_ROW);
    for (const declared of [...CHANNEL_ROW.sinks, ...CHANNEL_ROW.effects, ...CHANNEL_ROW.ambient]) {
      expect(reads, `${declared} is declared and must not be a read`).not.toContain(declared);
    }
  });

  it("is driven by the row, not by the type: reclassifying a member moves it out of the read set", () => {
    // The same source text with `memo` declared an effect. A hardcoded read set
    // cannot move, so this is the second, independent way the corpus refuses a
    // scanner that ignores its registry row.
    const reclassified: SendAuthSurface = {
      ...CHANNEL_ROW,
      effects: [...CHANNEL_ROW.effects, "memo"],
    };
    expect(readsFor(readFixture("surface-type-extra-member.ts"), reclassified)).toEqual([
      "panes",
      "gauge",
      "claim",
      "stamp",
    ]);
  });
});
