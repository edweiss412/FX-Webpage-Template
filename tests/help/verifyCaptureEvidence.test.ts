// @vitest-environment node
import { describe, expect, it } from "vitest";
import { verifyEvidence } from "@/scripts/verify-capture-evidence";

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
