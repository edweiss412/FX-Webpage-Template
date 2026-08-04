import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { OPERATOR_NAMES } from "./source/operators";
import { GUARD_SURFACES, type GuardSurface, validateSurface } from "./source/registry";

/**
 * Structural meta-test for the guard-surface registry (spec §3.7, AC-11).
 *
 * Merge-gating and cheap: it runs no mutants and touches no DB. Its job is the
 * static half of the vacuity defence — an enrolled surface with an empty
 * `operators` list generates no mutants, and a gate comparing only against the
 * score floor would pass it, because `0/0` is `NaN` and `NaN < floor` is
 * `false`. The gate closes that at runtime (condition 6); this closes it at
 * authoring time.
 */
const VALID: GuardSurface = {
  id: "fixture",
  sourcePath: "lib/specLint/taskContract.ts",
  suitePaths: ["tests/specLint/taskContract.test.ts"],
  operators: [...OPERATOR_NAMES],
  scoreFloor: 0.95,
  accepted: [
    { siteId: "relational-boundary:1:1:<><=", kind: "equivalent", reason: "unreachable; §2.4" },
    {
      siteId: "relational-boundary:2:1:>>>=",
      kind: "accepted-gap",
      reason: "not observable; §2.5",
      ref: "BL-TASKCONTRACT-SORT-COMPARATOR-EQUALKEY",
    },
  ],
};

/** Each case flips exactly ONE field of VALID. */
const reject = (patch: Partial<GuardSurface>): string[] => validateSurface({ ...VALID, ...patch });

describe("guard-surface registry — the shipped rows", () => {
  it("enrols at least one surface and every row validates", () => {
    expect(GUARD_SURFACES.length).toBeGreaterThan(0);
    for (const s of GUARD_SURFACES) {
      expect(validateSurface(s), `${s.id} must validate`).toEqual([]);
    }
  });

  it("points every sourcePath and suitePath at a file that exists on disk", () => {
    for (const s of GUARD_SURFACES) {
      expect(existsSync(s.sourcePath), `${s.id}: missing source ${s.sourcePath}`).toBe(true);
      for (const suite of s.suitePaths) {
        expect(existsSync(suite), `${s.id}: missing suite ${suite}`).toBe(true);
      }
    }
  });

  it("declares only implemented operators", () => {
    for (const s of GUARD_SURFACES) {
      for (const op of s.operators) expect(OPERATOR_NAMES).toContain(op);
    }
  });
});

describe("guard-surface registry — validation rejects each malformed row (AC-11)", () => {
  it("accepts the valid fixture, so every rejection below is attributable", () => {
    expect(validateSurface(VALID)).toEqual([]);
  });

  it("rejects a missing sourcePath", () => {
    expect(reject({ sourcePath: "lib/specLint/does-not-exist.ts" }).join(" ")).toMatch(/source/i);
  });

  it("rejects an EMPTY operators list — the vacuous-gate hole (AC-16)", () => {
    expect(reject({ operators: [] }).join(" ")).toMatch(/operator/i);
  });

  it("rejects an empty suitePaths list", () => {
    expect(reject({ suitePaths: [] }).join(" ")).toMatch(/suite/i);
  });

  it("rejects a scoreFloor outside (0, 1]", () => {
    for (const scoreFloor of [0, -0.1, 1.5, Number.NaN]) {
      expect(reject({ scoreFloor }).join(" "), `floor ${scoreFloor}`).toMatch(/floor/i);
    }
    expect(reject({ scoreFloor: 1 })).toEqual([]);
  });

  it("rejects a ledger row naming an operator the surface does not declare", () => {
    expect(
      reject({
        operators: ["equality-flip"],
        accepted: [{ siteId: "relational-boundary:1:1:<><=", kind: "equivalent", reason: "x" }],
      }).join(" "),
    ).toMatch(/operator/i);
  });

  it("rejects a ledger row whose siteId does not start with a known operator", () => {
    expect(
      reject({
        accepted: [{ siteId: "not-an-operator:1:1:a>b", kind: "equivalent", reason: "x" }],
      }).join(" "),
    ).toMatch(/operator/i);
  });

  it("rejects an empty or whitespace-only reason", () => {
    for (const reason of ["", "   "]) {
      expect(
        reject({
          accepted: [{ siteId: "equality-flip:1:1:===>!==", kind: "equivalent", reason }],
        }).join(" "),
      ).toMatch(/reason/i);
    }
  });

  it("rejects an accepted-gap row with no ref, while allowing an equivalent row without one", () => {
    // The asymmetry IS the contract: a deliberately-uncovered gap is debt and
    // must be tracked; a proven equivalence is not debt.
    expect(
      reject({
        accepted: [{ siteId: "equality-flip:1:1:===>!==", kind: "accepted-gap", reason: "x" }],
      }).join(" "),
    ).toMatch(/ref/i);
    expect(
      reject({
        accepted: [{ siteId: "equality-flip:1:1:===>!==", kind: "equivalent", reason: "x" }],
      }),
    ).toEqual([]);
  });

  it("rejects an accepted-gap ref that is not shaped like a ledger id (whole-diff R1 F5)", () => {
    // A non-empty check alone lets an accepted gap LOOK tracked while resolving
    // to no debt entry, which defeats the only reason the field is mandatory.
    for (const ref of ["not-a-backlog-id", "TODO", "see backlog", "bl-lowercase"]) {
      expect(
        reject({
          accepted: [
            { siteId: "equality-flip:1:1:===>!==", kind: "accepted-gap", reason: "x", ref },
          ],
        }).join(" "),
        `ref ${ref}`,
      ).toMatch(/ref/i);
    }
  });

  it("accepts BL- and DEF- shaped refs", () => {
    for (const ref of ["BL-TASKCONTRACT-SORT-COMPARATOR-EQUALKEY", "DEF-SOMETHING-2"]) {
      expect(
        reject({
          accepted: [
            { siteId: "equality-flip:1:1:===>!==", kind: "accepted-gap", reason: "x", ref },
          ],
        }),
        `ref ${ref}`,
      ).toEqual([]);
    }
  });

  it("rejects duplicate siteIds in one ledger", () => {
    const row = {
      siteId: "equality-flip:1:1:===>!==",
      kind: "equivalent" as const,
      reason: "x",
    };
    expect(reject({ accepted: [row, { ...row }] }).join(" ")).toMatch(/duplicate/i);
  });
});
