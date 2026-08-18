import { describe, it, expect } from "vitest";
import { synthesizeFixtureFindings } from "@/lib/specLint/fixtureContract";
import { premise, premiseHolds } from "@/tests/_shared/premise";

const PREMISE =
  "Error: premise not met: the live matcher opened a block. The assertion below this line proves nothing";
const ASSERT = "AssertionError: expected false to be true";
const HOOK = "Error: BEFORE_EACH_EXPLODED";

const entry = (line: number) => ({ line, block: "// b" });
const file = (o: {
  statuses?: string[];
  failures?: string[];
  fileStatus?: string;
  fileMessage?: string;
}) => ({
  fileStatus: o.fileStatus ?? "passed",
  assertions: (o.statuses ?? ["passed"]).map((status, i) => ({ status, title: `t${i}` })),
  failureMessages: o.failures ?? [],
  // A module-scope premise throws during COLLECTION, so its message arrives
  // here and never in an assertion's failureMessages (spec section 2.9).
  fileMessage: o.fileMessage ?? "",
});
const only = (r: unknown) => synthesizeFixtureFindings([entry(5)], r as never).map((f) => f.code);
const results = (r: unknown) => ({ files: new Map([[5, r]]) });

describe("classification ladder (spec section 4.3)", () => {
  it("UNSATISFIABLE is the one hard verdict, and it needs the sentinel", () => {
    expect(
      only(results(file({ fileStatus: "failed", statuses: ["failed"], failures: [PREMISE] }))),
    ).toEqual(["FIXTURE_UNSATISFIABLE"]);
    expect(
      only(
        results(
          file({
            fileStatus: "failed",
            statuses: ["failed", "failed"],
            failures: [ASSERT, PREMISE],
          }),
        ),
      ),
    ).toEqual(["FIXTURE_UNSATISFIABLE"]);
    expect(
      only(
        results(
          file({ fileStatus: "failed", statuses: ["failed", "skipped"], failures: [PREMISE] }),
        ),
      ),
    ).toEqual(["FIXTURE_UNSATISFIABLE"]);
  });

  it("a module-scope premise failure is the VERDICT, not the advisory", () => {
    // spec section 2.9: premise() before any registration throws during
    // collection, so the report carries ZERO test cases and the sentinel sits
    // at FILE level. Testing emptiness first would report this as a block
    // that produced no test case, and would
    // suppress the one verdict this arm exists to emit.
    expect(
      only(results(file({ fileStatus: "failed", statuses: [], fileMessage: PREMISE }))),
    ).toEqual(["FIXTURE_UNSATISFIABLE"]);
  });

  it("the advisory means the report carries NO TEST CASE, and nothing else", () => {
    // empty entry list AND no sentinel anywhere: the report's own statement
    // that no test case existed (unresolvable import, transform error, no
    // suite, outside-the-globs trap)
    expect(
      only(
        results(
          file({
            fileStatus: "failed",
            statuses: [],
            fileMessage: "Transform failed with 1 error",
          }),
        ),
      ),
    ).toEqual(["FIXTURE_PROBE_UNVERIFIED"]);
    // absent from the report entirely
    const absent = synthesizeFixtureFindings([entry(5)], { files: new Map() } as never);
    expect(absent.map((f) => f.code)).toEqual(["FIXTURE_PROBE_UNVERIFIED"]);
    expect(absent[0]!.severity).toBe("advisory");
  });

  it("NO shape without the sentinel is ever certified, and none draws a hard code", () => {
    // Each of these was, in some review round, a branch that claimed more than
    // the report supports. Every one now draws NOTHING: the arm has no claim.
    // spec section 2.8 - an empty test body passes, so a passing entry proves nothing
    expect(only(results(file({ statuses: ["passed", "passed"] })))).toEqual([]);
    // spec section 2.5 - a skipped entry is present and unexecuted; the run exits 0
    expect(only(results(file({ statuses: ["skipped", "skipped"] })))).toEqual([]);
    expect(only(results(file({ statuses: ["passed", "skipped"] })))).toEqual([]);
    // spec section 2.6 - afterAll fails the FILE while every assertion passes
    expect(only(results(file({ fileStatus: "failed", statuses: ["passed"] })))).toEqual([]);
    // spec section 2.7 - a per-test hook failure arrives as an ordinary failure
    expect(
      only(results(file({ fileStatus: "failed", statuses: ["failed"], failures: [HOOK] }))),
    ).toEqual([]);
    // an ordinary assertion failure is equally not a satisfiability signal
    expect(
      only(results(file({ fileStatus: "failed", statuses: ["failed"], failures: [ASSERT] }))),
    ).toEqual([]);
  });

  it("every enrolled block draws at most one outcome, over the whole ladder", () => {
    const plan = [1, 2, 3, 4, 5].map(entry);
    const map = new Map<number, unknown>([
      [1, file({ fileStatus: "failed", statuses: ["failed"], failures: [PREMISE] })],
      [2, file({ fileStatus: "failed", statuses: [] })],
      [3, file({ statuses: ["passed"] })],
      [5, file({ fileStatus: "failed", statuses: [], fileMessage: PREMISE })],
      // line 4 deliberately absent from the report
    ]);
    const out = synthesizeFixtureFindings(plan, { files: map } as never);
    expect(out.map((f) => `${f.docLine}:${f.code}`)).toEqual([
      "1:FIXTURE_UNSATISFIABLE",
      "2:FIXTURE_PROBE_UNVERIFIED",
      "4:FIXTURE_PROBE_UNVERIFIED",
      "5:FIXTURE_UNSATISFIABLE",
    ]);
    // line 3 ran without a premise failure, so the arm says nothing about it
    expect(out.some((f) => f.docLine === 3)).toBe(false);
  });

  it("the verdict names every premise description it observed", () => {
    // Projecting findings to codes lets a wrong or missing detail pass. The
    // detail IS the repair instruction here: which premise, on which fixture.
    const two = [
      "Error: premise not met: the live v2 matcher opened a block. ...",
      "Error: premise not met: the vocabulary contains RENTAL PICKUP. ...",
    ];
    const out = synthesizeFixtureFindings([entry(5)], {
      files: new Map([
        [5, file({ fileStatus: "failed", statuses: ["failed", "failed"], failures: two })],
      ]),
    } as never);
    expect(out).toHaveLength(1);
    expect(out[0]!.detail).toContain("the live v2 matcher opened a block");
    expect(out[0]!.detail).toContain("the vocabulary contains RENTAL PICKUP");
  });

  it("the advisory names WHICH case it observed, so the reasons are distinguishable", () => {
    const reasonFor = (r: unknown) =>
      synthesizeFixtureFindings([entry(5)], r as never)[0]!.detail ?? "";
    const emptyEntries = reasonFor(results(file({ fileStatus: "failed", statuses: [] })));
    const absent = reasonFor({ files: new Map() });
    expect(emptyEntries).not.toBe("");
    expect(absent).not.toBe("");
    expect(emptyEntries).not.toBe(absent);
  });

  it("a null results map (static invocation) draws nothing", () => {
    expect(synthesizeFixtureFindings([entry(5)], null)).toEqual([]);
  });
});

/** The message the LIVE helper actually throws, never a hand-copied string. */
const thrownBy = (fn: () => void): string => {
  try {
    fn();
  } catch (e) {
    return `Error: ${(e as Error).message}`;
  }
  throw new Error("the helper did not throw, so this case observes nothing");
};

describe("classification — pinned against the live premise helper", () => {
  it("both helper forms produce the sentinel, and the detail names the description", () => {
    // Hand-copied sentinel strings drift silently when tests/_shared/premise.ts
    // is reworded: the arm would stop firing and every case built on a literal
    // would still pass. These messages come from the helper itself.
    const cases: [string, string][] = [
      [thrownBy(() => premise("the producer yielded cases", 0, 0)), "the producer yielded cases"],
      [
        thrownBy(() => premiseHolds("the live v2 matcher opened a block", false)),
        "the live v2 matcher opened a block",
      ],
    ];
    for (const [message, description] of cases) {
      const viaAssertion = synthesizeFixtureFindings([entry(5)], {
        files: new Map([
          [5, file({ fileStatus: "failed", statuses: ["failed"], failures: [message] })],
        ]),
      } as never);
      const viaFileLevel = synthesizeFixtureFindings([entry(5)], {
        files: new Map([[5, file({ fileStatus: "failed", statuses: [], fileMessage: message })]]),
      } as never);
      for (const [label, out] of [
        ["assertion channel", viaAssertion],
        ["file-level channel", viaFileLevel],
      ] as const) {
        expect(
          out.map((f) => f.code),
          label,
        ).toEqual(["FIXTURE_UNSATISFIABLE"]);
        expect(out[0]!.detail, label).toContain(description);
        // The boilerplate half of the message is not the description.
        expect(out[0]!.detail, label).not.toContain(
          "this is not a claim that the code under test is wrong",
        );
      }
    }
  });

  it("one block draws ONE finding even when the sentinel is in both channels", () => {
    const msg = thrownBy(() => premiseHolds("the header opens a block", false));
    const out = synthesizeFixtureFindings([entry(5)], {
      files: new Map([
        [
          5,
          file({ fileStatus: "failed", statuses: ["failed"], failures: [msg], fileMessage: msg }),
        ],
      ]),
    } as never);
    expect(out).toHaveLength(1);
    // The same description twice is one description.
    expect(out[0]!.detail!.match(/the header opens a block/g)).toHaveLength(1);
  });

  it("an unavailable report puts its OWN reason on every enrolled block", () => {
    // The adapter cannot read a report for a pre-existing splice directory, a
    // spawn that threw, a timeout, or unreadable JSON. Each is a different
    // repair for the author, so the reason must survive to the finding.
    const out = synthesizeFixtureFindings([entry(3), entry(9)], {
      files: new Map(),
      unavailable: "the splice directory tests/.spec-lint-fixtures-1-1 already exists",
    } as never);
    expect(out.map((f) => `${f.docLine}:${f.code}`)).toEqual([
      "3:FIXTURE_PROBE_UNVERIFIED",
      "9:FIXTURE_PROBE_UNVERIFIED",
    ]);
    for (const f of out) expect(f.detail).toContain("tests/.spec-lint-fixtures-1-1 already exists");
  });

  it("an empty plan draws nothing, and report files with no enrolled block are ignored", () => {
    expect(
      synthesizeFixtureFindings([], results(file({ fileStatus: "failed", statuses: [] })) as never),
    ).toEqual([]);
    const strayed = synthesizeFixtureFindings([entry(5)], {
      files: new Map([
        [5, file({ statuses: ["passed"] })],
        [99, file({ fileStatus: "failed", statuses: [], fileMessage: PREMISE })],
      ]),
    } as never);
    expect(strayed).toEqual([]);
  });

  it("the empty-entry advisory carries the file-level message when there is one", () => {
    // "Cannot find package '@/lib/does/not/exist'" is the author's whole repair.
    const out = synthesizeFixtureFindings([entry(5)], {
      files: new Map([
        [5, file({ fileStatus: "failed", statuses: [], fileMessage: "Cannot find package '@/x'" })],
      ]),
    } as never);
    expect(out[0]!.detail).toContain("Cannot find package '@/x'");
  });
});

describe("classification — anchors and sentinel scanning", () => {
  const outcomeAt = (o: Parameters<typeof file>[0]) =>
    synthesizeFixtureFindings([entry(5)], { files: new Map([[5, file(o)]]) } as never);

  it("both the verdict and the advisory anchor at column 1", () => {
    // Every other case projects findings to codes, which leaves the anchor free
    // to drift to any column while the suite stays green — and the anchor is
    // what an editor jumps to.
    const verdict = outcomeAt({ fileStatus: "failed", statuses: ["failed"], failures: [PREMISE] });
    const advisory = outcomeAt({ fileStatus: "failed", statuses: [] });
    expect(verdict[0]!.column).toBe(1);
    expect(verdict[0]!.docLine).toBe(5);
    expect(advisory[0]!.column).toBe(1);
    expect(advisory[0]!.docLine).toBe(5);
  });

  it("a message that BEGINS with the sentinel is detected", () => {
    // The scan must start at index 0. Vitest prefixes an assertion's message
    // with "Error: ", but a file-level message carries the raw throw text, so
    // the sentinel really can sit at index 0 -- and a scan starting one
    // character in would silently stop reporting exactly the module-scope
    // failures the file-level channel exists to carry.
    const bare = "premise not met: the sentinel sits at index zero. and more text";
    expect(
      outcomeAt({ fileStatus: "failed", statuses: [], fileMessage: bare }).map((f) => f.code),
    ).toEqual(["FIXTURE_UNSATISFIABLE"]);
    expect(
      outcomeAt({ fileStatus: "failed", statuses: ["failed"], failures: [bare] })[0]!.detail,
    ).toContain("the sentinel sits at index zero");
  });

  it("a description with no sentence boundary is carried WHOLE, not one character short", () => {
    const noStop = "premise not met: no trailing period here";
    const detail = outcomeAt({ fileStatus: "failed", statuses: ["failed"], failures: [noStop] })[0]!
      .detail;
    expect(detail).toContain("no trailing period here");
    // The off-by-one this catches truncates the last character and is invisible
    // to any assertion that only checks the code.
    expect(detail).not.toContain("no trailing period her;");
    expect(detail!.endsWith("here")).toBe(true);
  });
});
