import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { premiseHolds } from "../../_shared/premise";
import {
  type BrowserGuardSurface,
  BROWSER_SURFACES,
  browserSiteId,
  validateBrowserSurface,
} from "./registry";

/**
 * Static validation for the browser-mutant registry (spec §2, §7).
 *
 * The browser mode's anchors are CONTENT, not position: an explicit mutant is a
 * `from` string that must occur exactly once in a named file. That makes drift
 * loud at validation time rather than at scoring time — a `from` that no longer
 * occurs, or occurs twice, fails here BEFORE any child spawns, which is the one
 * place a wrong anchor is cheap.
 *
 * Every rejection case below flips exactly ONE field of a fully-green fixture,
 * so a failure is attributable to the field it names rather than to fixture rot.
 */
let dir: string;
let alpha: string;
let beta: string;

/** A repo file whose config/filter pair the shipped surface actually uses. */
const REAL_CONFIG = "tests/e2e/standalone.config.ts";
const REAL_FILTER = "tap-target-floor";

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "fx-browser-registry-"));
  alpha = join(dir, "alpha.tsx");
  beta = join(dir, "beta.tsx");
  writeFileSync(alpha, 'const a = <div className="rounded-pill w-fit" />;\n');
  writeFileSync(beta, 'const b = <div className="rounded-pill" />;\nconst c = "rounded-pill";\n');
});

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

const VALID = (): BrowserGuardSurface => ({
  id: "fixture",
  suites: [
    { kind: "vitest", path: "tests/mutation/source/ledger.test.ts" },
    {
      kind: "playwright",
      config: REAL_CONFIG,
      filter: REAL_FILTER,
      project: "standalone-chromium",
    },
  ],
  mutants: [
    {
      key: "strip-w-fit",
      edits: [{ file: alpha, from: "rounded-pill w-fit", to: "rounded-pill" }],
      reason: "the w-fit conformance pin; BACKLOG BL-TAP-TARGET-SPEC-MUTATION-ENROLMENT #18",
    },
    {
      key: "two-file-radius",
      edits: [
        { file: alpha, from: 'className="rounded-pill', to: 'className="rounded-sm' },
        { file: beta, from: 'className="rounded-pill', to: 'className="rounded-sm' },
      ],
      reason: "both pill sites move together; a single-site edit is a different mutant",
    },
  ],
  scoreFloor: 1,
  control: {
    key: "control-drop-class",
    edits: [{ file: beta, from: 'const c = "rounded-pill";', to: 'const c = "";' }],
    reason: "liveness control: the suites must obviously notice this",
  },
  accepted: [],
});

/** Each case flips exactly ONE field of the green fixture. */
const reject = (patch: Partial<BrowserGuardSurface>): string =>
  validateBrowserSurface({ ...VALID(), ...patch }).join(" | ");

describe("browser registry — the green fixture", () => {
  it("accepts a fully-valid surface, so every rejection below is attributable", () => {
    premiseHolds(
      "the fixture files exist, so a clean result is a validation verdict rather than a missing-file skip",
      validateBrowserSurface(VALID()).every((p) => !p.includes("does not exist")),
    );
    expect(validateBrowserSurface(VALID())).toEqual([]);
  });

  it("validates a multi-edit mutant across two distinct files", () => {
    const surface = VALID();
    const multi = surface.mutants[1]!;
    premiseHolds(
      "the multi-edit fixture spans two DIFFERENT files; a same-file pair would not exercise the per-file read",
      multi.edits.length === 2 && multi.edits[0]!.file !== multi.edits[1]!.file,
    );
    expect(validateBrowserSurface({ ...surface, mutants: [multi] })).toEqual([]);
  });

  it("derives the site id as `explicit:<key>` verbatim", () => {
    expect(browserSiteId({ key: "strip-w-fit" })).toBe("explicit:strip-w-fit");
    expect(browserSiteId({ key: "w-fit:strip" })).toBe("explicit:w-fit:strip");
  });
});

describe("browser registry — per-edit anchor rules", () => {
  it("rejects an anchor absent from its file", () => {
    expect(
      reject({
        mutants: [
          { key: "k", edits: [{ file: alpha, from: "nothing like this", to: "x" }], reason: "r" },
        ],
      }),
    ).toMatch(/does not occur/i);
  });

  it("rejects an ambiguous anchor that occurs more than once", () => {
    // `rounded-pill` occurs TWICE in beta.tsx, so the edit's target is
    // unknowable — the same rule as the vitest control anchor
    // (tests/mutation/source/registry.ts:92-97).
    expect(
      reject({
        mutants: [
          { key: "k", edits: [{ file: beta, from: "rounded-pill", to: "x" }], reason: "r" },
        ],
      }),
    ).toMatch(/occurs 2 times/i);
  });

  it("rejects an EMPTY anchor as its own problem, not as an occurrence count", () => {
    // `"x".split("")` reports one boundary per character, so an empty `from`
    // can never be read as a count. Without the dedicated rejection the edit
    // validates CLEAN and `applyEdits` later prepends `to` to the file — a
    // mutant nobody declared, applied silently. (Enrolment survivor
    // `statement-removal:92:7`, repaid with this case rather than a ledger row.)
    expect(
      reject({
        mutants: [{ key: "k", edits: [{ file: alpha, from: "", to: "x" }], reason: "r" }],
      }),
    ).toMatch(/from is empty/i);
  });

  it("rejects an edit that changes nothing", () => {
    expect(
      reject({
        mutants: [{ key: "k", edits: [{ file: alpha, from: "w-fit", to: "w-fit" }], reason: "r" }],
      }),
    ).toMatch(/identical/i);
  });

  it("rejects an edit naming a file that does not exist", () => {
    expect(
      reject({
        mutants: [
          {
            key: "k",
            edits: [{ file: join(dir, "no-such-file.tsx"), from: "a", to: "b" }],
            reason: "r",
          },
        ],
      }),
    ).toMatch(/does not exist/i);
  });

  it("applies every anchor rule to the CONTROL as well as to mutants", () => {
    // The control is the overlay-liveness proof; an unvalidated control anchor
    // fails at run time, mid-surface, after ~20 minutes of mutant children.
    expect(
      reject({
        control: {
          key: "control",
          edits: [{ file: beta, from: "rounded-pill", to: "x" }],
          reason: "r",
        },
      }),
    ).toMatch(/control/i);
    expect(
      reject({
        control: { key: "control", edits: [], reason: "r" },
      }),
    ).toMatch(/control/i);
  });

  it("reports EVERY problem at once rather than stopping at the first", () => {
    // Validation failures are gate failures reported before any child spawns
    // (spec §2). One-problem-per-run turns one run into N runs, which is the
    // failure mode the whole harness exists to reduce.
    const problems = validateBrowserSurface({
      ...VALID(),
      mutants: [
        { key: "k", edits: [{ file: alpha, from: "absent-one", to: "x" }], reason: "r" },
        { key: "k2", edits: [{ file: alpha, from: "absent-two", to: "y" }], reason: "" },
      ],
    });
    expect(problems.length).toBeGreaterThanOrEqual(3);
    expect(problems.join(" ")).toMatch(/absent-one/);
    expect(problems.join(" ")).toMatch(/absent-two/);
  });
});

describe("browser registry — per-mutant rules", () => {
  it("rejects a duplicate mutant key, which would collide two ledger ids", () => {
    const m = {
      key: "same",
      edits: [{ file: alpha, from: "w-fit", to: "" }],
      reason: "r",
    };
    expect(reject({ mutants: [m, { ...m, edits: [...m.edits] }] })).toMatch(/duplicate/i);
  });

  it("rejects an empty edits list", () => {
    expect(reject({ mutants: [{ key: "k", edits: [], reason: "r" }] })).toMatch(/edits/i);
  });

  it("rejects an empty or whitespace-only reason", () => {
    for (const reason of ["", "   "]) {
      expect(
        reject({
          mutants: [{ key: "k", edits: [{ file: alpha, from: "w-fit", to: "" }], reason }],
        }),
        `reason ${JSON.stringify(reason)}`,
      ).toMatch(/reason/i);
    }
  });

  it("rejects an empty or whitespace-only key", () => {
    for (const key of ["", "  "]) {
      expect(
        reject({
          mutants: [{ key, edits: [{ file: alpha, from: "w-fit", to: "" }], reason: "r" }],
        }),
        `key ${JSON.stringify(key)}`,
      ).toMatch(/key/i);
    }
  });
});

describe("browser registry — per-surface rules", () => {
  it("rejects an EMPTY mutants list — the vacuous-gate hole", () => {
    expect(reject({ mutants: [] })).toMatch(/mutant/i);
  });

  it("rejects an empty suites list; nothing could decide a verdict", () => {
    expect(reject({ suites: [] })).toMatch(/suite/i);
  });

  it("rejects a scoreFloor outside (0, 1]", () => {
    for (const scoreFloor of [0, -0.1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(reject({ scoreFloor }), `floor ${scoreFloor}`).toMatch(/floor/i);
    }
    expect(validateBrowserSurface({ ...VALID(), scoreFloor: 1 })).toEqual([]);
    expect(validateBrowserSurface({ ...VALID(), scoreFloor: 0.5 })).toEqual([]);
  });
});

describe("browser registry — deciding-suite rules", () => {
  it("rejects a playwright config that does not exist", () => {
    expect(
      reject({
        suites: [
          {
            kind: "playwright",
            config: "tests/e2e/no-such.config.ts",
            filter: REAL_FILTER,
            project: "standalone-chromium",
          },
        ],
      }),
    ).toMatch(/config/i);
  });

  it("STOPS at a missing playwright config instead of walking a directory that is not there", () => {
    // The filter check below reads `dirname(config)` off disk. The existing
    // case above uses a config in a REAL directory, so a fall-through still
    // lands on a readable dir and its assertion holds either way — which is
    // exactly why enrolment survivor `statement-removal:148:7` (the `continue`)
    // lived. Point the config at an ABSENT directory and the fall-through turns
    // a reported problem into a thrown ENOENT the gate never catches.
    const config = "tests/e2e/no-such-directory/absent.config.ts";
    premiseHolds(
      "the fixture's parent directory really is absent — that is what the fall-through would walk",
      !existsSync(dirname(config)),
    );
    let problems: string[] = [];
    expect(() => {
      problems = validateBrowserSurface({
        ...VALID(),
        suites: [
          { kind: "playwright", config, filter: REAL_FILTER, project: "standalone-chromium" },
        ],
      });
    }, "a missing config must be REPORTED, never thrown").not.toThrow();
    expect(problems.join(" | ")).toMatch(/config/i);
  });

  it("rejects a filter that matches no spec file beside its config", () => {
    // A filter resolving zero tests is the no-tests trap: every mutant would run
    // nothing and score SURVIVED. The baseline closes it at run time; this
    // closes it at authoring time.
    expect(
      reject({
        suites: [
          {
            kind: "playwright",
            config: REAL_CONFIG,
            filter: "no-spec-file-carries-this-token",
            project: "standalone-chromium",
          },
        ],
      }),
    ).toMatch(/filter/i);
  });

  it("rejects a vitest suite path that does not exist", () => {
    expect(
      reject({ suites: [{ kind: "vitest", path: "tests/mutation/no-such.test.ts" }] }),
    ).toMatch(/vitest|path/i);
  });

  it("accepts a real playwright config + filter pair", () => {
    expect(
      validateBrowserSurface({
        ...VALID(),
        suites: [
          {
            kind: "playwright",
            config: REAL_CONFIG,
            filter: REAL_FILTER,
            project: "standalone-chromium",
          },
        ],
      }),
    ).toEqual([]);
  });
});

describe("browser registry — ledger rules", () => {
  const site = "explicit:strip-w-fit";

  it("rejects duplicate ledger siteIds", () => {
    const row = { siteId: site, kind: "equivalent" as const, reason: "x" };
    expect(reject({ accepted: [row, { ...row }] })).toMatch(/duplicate/i);
  });

  it("rejects an empty or whitespace-only ledger reason", () => {
    for (const reason of ["", "   "]) {
      expect(
        reject({ accepted: [{ siteId: site, kind: "equivalent", reason }] }),
        `reason ${JSON.stringify(reason)}`,
      ).toMatch(/reason/i);
    }
  });

  it("rejects an accepted-gap row with no ref, while allowing an equivalent row without one", () => {
    expect(reject({ accepted: [{ siteId: site, kind: "accepted-gap", reason: "x" }] })).toMatch(
      /ref/i,
    );
    expect(
      validateBrowserSurface({
        ...VALID(),
        accepted: [{ siteId: site, kind: "equivalent", reason: "x" }],
      }),
    ).toEqual([]);
  });

  it("rejects an accepted-gap ref that is not shaped like a ledger id", () => {
    for (const ref of ["not-a-backlog-id", "TODO", "see backlog", "bl-lowercase"]) {
      expect(
        reject({ accepted: [{ siteId: site, kind: "accepted-gap", reason: "x", ref }] }),
        `ref ${ref}`,
      ).toMatch(/ref/i);
    }
  });

  it("accepts BL- and DEF- shaped refs", () => {
    for (const ref of ["BL-TAP-TARGET-SPEC-MUTATION-ENROLMENT", "DEF-SOMETHING-2"]) {
      expect(
        validateBrowserSurface({
          ...VALID(),
          accepted: [{ siteId: site, kind: "accepted-gap", reason: "x", ref }],
        }),
        `ref ${ref}`,
      ).toEqual([]);
    }
  });

  it("rejects a ledger row naming a site no declared mutant produces", () => {
    // The analogue of the vitest mode's "names an operator this surface does not
    // declare" (tests/mutation/source/registry.ts:110-114). A typo'd row accepts
    // nothing while looking like coverage; the runtime gate would report it as a
    // stale row plus an unaccepted survivor, ~20 minutes later.
    expect(
      reject({
        accepted: [{ siteId: "explicit:no-such-mutant", kind: "equivalent", reason: "x" }],
      }),
    ).toMatch(/explicit:no-such-mutant/);
  });
});

describe("browser registry — the shipped rows", () => {
  it("validates every enrolled surface", () => {
    for (const s of BROWSER_SURFACES) {
      expect(validateBrowserSurface(s), `${s.id} must validate`).toEqual([]);
    }
  });

  it("gives every enrolled surface a unique id", () => {
    const ids = BROWSER_SURFACES.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
