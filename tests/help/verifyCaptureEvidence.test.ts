// @vitest-environment node
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { absentRecordProblem, verifyEvidence } from "@/scripts/verify-capture-evidence";

const HEADER = {
  eventName: "pull_request",
  runnerName: "GitHub Actions 3",
  runnerArch: "X64",
  runnerOs: "Linux",
  cpuModel: "AMD EPYC",
  cpuCount: 4,
};

function entry(key: string, theme: string, over: Record<string, unknown> = {}) {
  return {
    key,
    theme,
    capturedAtUtc: "2026-08-24T10:00:00.000Z",
    pixelWidth: 1216,
    pixelHeight: 1463,
    pixelSha256: "a".repeat(64),
    webpBytes: 1234,
    webpSha256: "b".repeat(64),
    faultHits: [],
    refusedReason: null,
    ...over,
  };
}

const EXPECTED = ["one-light", "one-dark", "two-light"];
const CLEAN = EXPECTED.map((id) => {
  const cut = id.lastIndexOf("-");
  return entry(id.slice(0, cut), id.slice(cut + 1));
});

describe("on a CLEAN run the record must be complete", () => {
  it("accepts a full record", () => {
    expect(verifyEvidence({ ...HEADER, entries: CLEAN }, EXPECTED, {})).toEqual([]);
  });

  it("rejects a record short of the manifest-derived expectation", () => {
    expect(verifyEvidence({ ...HEADER, entries: CLEAN.slice(0, 2) }, EXPECTED, {})).toContain(
      "clean run is missing identities: two-light",
    );
  });

  it("rejects duplicate identities", () => {
    const dupes = [...CLEAN, entry("one", "light")];
    expect(verifyEvidence({ ...HEADER, entries: dupes }, EXPECTED, {}).join(" ")).toContain(
      "duplicate",
    );
  });

  it("rejects a missing post-encode field", () => {
    const holed = [entry("one", "light", { webpSha256: null }), ...CLEAN.slice(1)];
    expect(verifyEvidence({ ...HEADER, entries: holed }, EXPECTED, {}).join(" ")).toContain(
      "one-light",
    );
  });
});

describe("the four passthrough fields are required in CI and waived only locally", () => {
  // The failure this catches: the docker step forwards none of them, so the
  // instrument records four empty fields on every run forever.
  for (const field of ["eventName", "runnerName", "runnerArch", "runnerOs"] as const) {
    it(`rejects an empty ${field} in CI`, () => {
      const record = { ...HEADER, [field]: "", entries: CLEAN };
      expect(verifyEvidence(record, EXPECTED, {}).join(" ")).toContain(field);
    });

    it(`waives ${field} under --local, where it cannot exist`, () => {
      const record = { ...HEADER, [field]: "", entries: CLEAN };
      expect(verifyEvidence(record, EXPECTED, { local: true })).toEqual([]);
    });
  }

  // --local must not become a way to satisfy the AC. It waives the four
  // environment fields and nothing else.
  it("still rejects a short record under --local", () => {
    expect(
      verifyEvidence({ ...HEADER, entries: CLEAN.slice(0, 1) }, EXPECTED, { local: true }).join(
        " ",
      ),
    ).toContain("missing identities");
  });
});

describe("on a REFUSED run a short record is the CORRECT shape", () => {
  // The capture aborts on the first refusal, so demanding a full-length record
  // fails every genuine refusal -- while satisfying a carelessly worded AC.
  const refused = [
    CLEAN[0]!,
    entry("one", "dark", {
      pixelWidth: null,
      pixelHeight: null,
      pixelSha256: null,
      webpBytes: null,
      webpSha256: null,
      faultHits: ["dashboard-load"],
      refusedReason: "RenderFaultError",
    }),
  ];

  it("accepts a record ending in exactly one refused entry", () => {
    expect(verifyEvidence({ ...HEADER, entries: refused }, EXPECTED, {})).toEqual([]);
  });

  it("rejects an entry AFTER the refusal", () => {
    const after = [...refused, entry("two", "light")];
    expect(verifyEvidence({ ...HEADER, entries: after }, EXPECTED, {}).join(" ")).toContain(
      "after the refused entry",
    );
  });

  it("rejects an incomplete entry BEFORE the refusal", () => {
    const holed = [entry("one", "light", { pixelSha256: null }), refused[1]!];
    expect(verifyEvidence({ ...HEADER, entries: holed }, EXPECTED, {}).join(" ")).toContain(
      "one-light",
    );
  });

  it("rejects a refused entry carrying post-encode fields", () => {
    // A refusal writes no image, so bytes on a refused entry mean the refusal
    // happened after the write -- the ordering layer 1 exists to prevent.
    const bogus = [CLEAN[0]!, entry("one", "dark", { refusedReason: "RenderFaultError" })];
    expect(verifyEvidence({ ...HEADER, entries: bogus }, EXPECTED, {}).join(" ")).toContain(
      "post-encode",
    );
  });

  it("requires a refused entry to name a reason", () => {
    // refusedReason must be set-but-empty, not absent: an absent one is not a
    // refusal at all, and the record would be judged as a short CLEAN run.
    const nameless = [
      CLEAN[0]!,
      entry("one", "dark", {
        webpSha256: null,
        webpBytes: null,
        pixelSha256: null,
        pixelWidth: null,
        pixelHeight: null,
        refusedReason: "",
      }),
    ];
    expect(verifyEvidence({ ...HEADER, entries: nameless }, EXPECTED, {}).join(" ")).toContain(
      "refusedReason",
    );
  });
});

describe("an absent record is distinguished from a malformed one", () => {
  it("names the path it looked at and how to produce one", () => {
    // The failure this catches: an operator running the parser before any
    // capture has run gets a raw ENOENT stack, which reads as a broken script
    // rather than a missing input, and says nothing about WHERE it looked.
    const problems = absentRecordProblem("/nonexistent/public/help/screenshots/evidence.json");

    expect(problems).not.toBeNull();
    expect(problems?.[0]).toContain("/nonexistent/public/help/screenshots/evidence.json");
    expect(problems?.[1]).toContain("pnpm screenshot:help");
  });

  it("stands down for a record that is present, whatever its contents", () => {
    // Scoped to THIS file, which exists by construction while the test runs.
    // Asserting against a fixture the suite writes would test the fixture; the
    // branch under test reads existence and nothing else, so a file that is
    // certainly present and certainly not an evidence record is the input that
    // proves it does not also validate.
    expect(absentRecordProblem(fileURLToPath(import.meta.url))).toBeNull();
  });
});

describe("layer 2's premise is asserted on the record, not assumed", () => {
  it("reports a run where every completed entry skipped the geometry check", () => {
    // The failure this catches: the baseline naming or the output directory
    // moves, `checkGeometry` finds no committed baseline for ANY entry, records
    // a skip for each, and the run goes green having compared nothing. A skip is
    // correctly not a pass, but nothing read the skip back.
    const allSkipped = CLEAN.map((e) => ({ ...e, geometrySkippedReason: "no-committed-baseline" }));
    const problems = verifyEvidence({ ...HEADER, entries: allSkipped }, EXPECTED, {});

    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("layer 2 compared nothing");
    expect(problems[0]).toContain("no-committed-baseline");
  });

  it("stays silent when only some entries skipped", () => {
    // One skip is an ordinary newly-added manifest entry. Firing here would make
    // the check unusable the first time anyone adds a capture.
    const oneSkipped = CLEAN.map((e, i) =>
      i === 0 ? { ...e, geometrySkippedReason: "no-committed-baseline" } : e,
    );
    expect(verifyEvidence({ ...HEADER, entries: oneSkipped }, EXPECTED, {})).toEqual([]);
  });

  it("cannot fire on an empty completed set", () => {
    // Guards the premise of the premise: `0 === 0` would report a comparison
    // failure on a run that never got far enough to compare anything, which is
    // already reported as a missing-identities problem and would double-count.
    const problems = verifyEvidence({ ...HEADER, entries: [] }, EXPECTED, {});
    expect(problems.some((p) => p.includes("layer 2 compared nothing"))).toBe(false);
  });
});

describe("a non-object record is its own failure, not a crash", () => {
  it.each([
    ["null", null],
    ["a string", "not a record"],
    ["an array", []],
    ["a number", 42],
  ])("returns a problem for %s rather than throwing", (_label, value) => {
    // The failure this catches: `record as Record<string, unknown>` is a cast,
    // not a check, so `run.entries` on null threw a TypeError and the parser
    // step crashed instead of reporting. A crashed verifier and a rejected
    // record look different to an operator and must stay that way.
    let problems: string[] = [];
    expect(() => {
      problems = verifyEvidence(value, EXPECTED, {});
    }).not.toThrow();
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("not a JSON object");
  });
});
