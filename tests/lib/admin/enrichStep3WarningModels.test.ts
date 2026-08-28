/**
 * tests/lib/admin/enrichStep3WarningModels.test.ts
 * (wizard-warning-ignore-controls spec §2.0/§2.1 — Task 4)
 *
 * Enrichment is where a row's LINKAGE decides which ignore store it reads. Get the
 * taxonomy wrong and the failure is silent in the worst direction: a FIRST-SEEN row
 * that calls the loader queries `ignored_warnings` for a show that does not exist yet
 * and quietly renders every warning active, while the operator's staged decisions sit
 * unread in the column. So the FIRST-SEEN cases assert the loader is NEVER called —
 * a spy, not an outcome — and every malformed shape is exercised on both sides of the
 * §2.0 predicate.
 *
 * Fingerprints come from the REAL `warningFingerprint` at test time.
 */
import { describe, expect, it, vi } from "vitest";
import { premiseHolds } from "@/tests/_shared/premise";
import { warningFingerprint, buildReportSurfaceId } from "@/lib/dataQuality/warningFingerprint";
import type { ParseWarning } from "@/lib/parser/types";
import type { Step3Row } from "@/components/admin/wizard/Step3Review";
import type { LoadIgnoredWarningsResult } from "@/lib/admin/loadIgnoredWarnings";
import { enrichStep3WarningModels } from "@/lib/admin/enrichStep3WarningModels";

const warnA: ParseWarning = {
  severity: "warn",
  code: "UNKNOWN_FIELD",
  message: "Unrecognized field.",
  rawSnippet: "Hotel notes | double occupancy",
};
const warnB: ParseWarning = {
  severity: "warn",
  code: "HOTEL_GUEST_SPLIT_AMBIGUOUS",
  message: "Ambiguous guest split.",
  rawSnippet: "2 guests, 1 room",
};

const FP_A = warningFingerprint(warnA) as string;
const FP_B = warningFingerprint(warnB) as string;

const DFID = "drive-file-abc";
const SLUG = "east-coast-2026";

/** A row with a reviewable preview (`show` truthy), the §2.0 model-bearing class. */
function reviewableRow(over: Partial<Step3Row> = {}, warnings: unknown = [warnA, warnB]): Step3Row {
  return {
    driveFileId: DFID,
    status: "staged",
    parseResult: { show: { title: "II - East Coast" }, warnings } as Step3Row["parseResult"],
    ...over,
  } as Step3Row;
}

// The `showId` parameter is declared (unused) on purpose: it types `mock.calls`, so a
// test can assert WHICH show id each call carried, not merely that a call happened.
const okLoader = (fps: string[]) =>
  vi.fn(
    async (_showId: string): Promise<LoadIgnoredWarningsResult> => ({
      kind: "ok",
      fingerprints: new Set(fps),
    }),
  );
const faultLoader = () =>
  vi.fn(
    async (_showId: string): Promise<LoadIgnoredWarningsResult> => ({
      kind: "infra_error",
      message: "boom",
    }),
  );

describe("enrichStep3WarningModels — LINKED rows", () => {
  it("partitions from the loader and scopes report ids to the slug", async () => {
    premiseHolds(
      "the fixture's ignored warning actually fingerprints (a snippet-less fixture " +
        "could never partition, so the assertion below would pass vacuously)",
      typeof FP_B === "string" && FP_B.length > 0,
    );
    const loader = okLoader([FP_B]);
    const [row] = await enrichStep3WarningModels(
      [reviewableRow({ linkedShowRef: { id: "show-1", slug: SLUG } })],
      loader,
    );

    expect(loader).toHaveBeenCalledWith("show-1");
    expect(row?.warningModel?.ignored.map((i) => i.index)).toEqual([1]);
    expect(row?.warningModel?.active.map((i) => i.index)).toEqual([0]);
    // Scope proof from a SECOND direct call against the source warning.
    expect(row?.warningModel?.active[0]?.reportSurfaceId).toBe(buildReportSurfaceId(SLUG, warnA));
  });

  it("treats an infra_error from the loader as an empty ignore set (fail toward VISIBLE)", async () => {
    const [row] = await enrichStep3WarningModels(
      [reviewableRow({ linkedShowRef: { id: "show-1", slug: SLUG } })],
      faultLoader(),
    );
    expect(row?.warningModel?.active.map((i) => i.index)).toEqual([0, 1]);
    expect(row?.warningModel?.ignored).toEqual([]);
  });

  it("loads once per LINKED row and leaves other rows' loads independent", async () => {
    const loader = okLoader([FP_A]);
    const rows = await enrichStep3WarningModels(
      [
        reviewableRow({ driveFileId: "d-1", linkedShowRef: { id: "show-1", slug: SLUG } }),
        reviewableRow({ driveFileId: "d-2", linkedShowRef: { id: "show-2", slug: "rpas" } }),
      ],
      loader,
    );
    expect(loader).toHaveBeenCalledTimes(2);
    expect(loader.mock.calls.map((c) => c[0])).toEqual(["show-1", "show-2"]);
    expect(rows[1]?.warningModel?.active[0]?.reportSurfaceId).toBe(
      buildReportSurfaceId("rpas", warnB),
    );
  });
});

describe("enrichStep3WarningModels — FIRST-SEEN rows", () => {
  it("reads the staged column and NEVER calls the loader", async () => {
    const loader = okLoader([FP_A, FP_B]);
    const [row] = await enrichStep3WarningModels(
      [
        reviewableRow({
          stagedIgnoredWarnings: [{ fingerprint: FP_A, code: warnA.code, ignored_by: "d@e.co" }],
        }),
      ],
      loader,
    );

    // The strongest assertion in this file. A first-seen row has NO show id, so a
    // loader call could only query with a wrong or absent key — and the loader's
    // fingerprints here would produce a VISIBLY different partition if consulted.
    expect(loader).not.toHaveBeenCalled();
    expect(row?.warningModel?.ignored.map((i) => i.index)).toEqual([0]);
    expect(row?.warningModel?.active.map((i) => i.index)).toEqual([1]);
  });

  it("scopes report ids to the drive file id", async () => {
    const [row] = await enrichStep3WarningModels([reviewableRow()], okLoader([]));
    expect(row?.warningModel?.active[0]?.reportSurfaceId).toBe(
      buildReportSurfaceId(`staged-${DFID}`, warnA),
    );
  });

  it.each([
    ["a non-array column value", "not-an-array"],
    ["a null column value", null],
    ["an absent column value", undefined],
    ["entries without a string fingerprint", [{ code: "C", ignored_by: "a@b.co" }]],
  ])("renders every warning active for %s", async (_label, raw) => {
    const [row] = await enrichStep3WarningModels(
      [reviewableRow({ stagedIgnoredWarnings: raw })],
      okLoader([]),
    );
    expect(row?.warningModel?.active.map((i) => i.index)).toEqual([0, 1]);
    expect(row?.warningModel?.ignored).toEqual([]);
  });

  it("sends BOTH duplicate-fingerprint warnings to ignored", async () => {
    const [row] = await enrichStep3WarningModels(
      [
        reviewableRow(
          {
            stagedIgnoredWarnings: [{ fingerprint: FP_A, code: warnA.code, ignored_by: "d@e.co" }],
          },
          [warnA, { ...warnA }],
        ),
      ],
      okLoader([]),
    );
    expect(row?.warningModel?.ignored.map((i) => i.index)).toEqual([0, 1]);
    expect(row?.warningModel?.active).toEqual([]);
  });

  it("degrades a LINKED-looking row with no usable ref to the staged arm", async () => {
    // linkedShowRef null is exactly what Phase A emits for a candidate without a
    // usable slug (spec §3). It must read the staged column, not the loader.
    const loader = okLoader([FP_A]);
    const [row] = await enrichStep3WarningModels([reviewableRow({ linkedShowRef: null })], loader);
    expect(loader).not.toHaveBeenCalled();
    expect(row?.warningModel?.active.map((i) => i.index)).toEqual([0, 1]);
  });
});

describe("enrichStep3WarningModels — the §2.0 predicate boundary", () => {
  it.each([
    ["parseResult null", null],
    ["parseResult absent", undefined],
    ["parseResult {} (no show)", {}],
    ["parseResult with warnings but no show", { warnings: [warnA] }],
    ["parseResult with an explicitly falsey show", { show: null, warnings: [warnA] }],
    ["parseResult a non-object primitive", "parsed" as unknown],
  ])("%s is NO-PREVIEW: no warningModel key at all", async (_label, parseResult) => {
    const loader = okLoader([FP_A]);
    const [row] = await enrichStep3WarningModels(
      [
        {
          driveFileId: DFID,
          status: "staged",
          parseResult: parseResult as Step3Row["parseResult"],
        } as Step3Row,
      ],
      loader,
    );
    expect(loader).not.toHaveBeenCalled();
    // Key ABSENT, not present-and-undefined: exactOptionalPropertyTypes, and the
    // panel's `dq` construction keys off presence.
    expect(row && "warningModel" in row).toBe(false);
  });

  it.each([
    ["warnings null", { show: { title: "T" }, warnings: null }],
    // Key genuinely ABSENT — not passed through a defaulted helper parameter, which
    // would silently restore the two-warning fixture and assert nothing.
    ["warnings absent", { show: { title: "T" } }],
    ["warnings a non-array string", { show: { title: "T" }, warnings: "nope" }],
    ["warnings a number", { show: { title: "T" }, warnings: 7 }],
  ])(
    "a reviewable row with %s yields an empty model, never a throw",
    async (_label, parseResult) => {
      premiseHolds(
        "the fixture is REVIEWABLE (a non-reviewable one would pass this assertion by " +
          "taking the NO-PREVIEW branch, which attaches no model at all)",
        !!(parseResult as { show?: unknown }).show,
      );
      const [row] = await enrichStep3WarningModels(
        [
          {
            driveFileId: DFID,
            status: "staged",
            parseResult: parseResult as Step3Row["parseResult"],
          } as Step3Row,
        ],
        okLoader([]),
      );
      expect(row?.warningModel).toEqual({ active: [], ignored: [] });
    },
  );

  it("leaves the input rows untouched (no mutation of the caller's array)", async () => {
    const input = reviewableRow();
    const [out] = await enrichStep3WarningModels([input], okLoader([]));
    expect("warningModel" in input).toBe(false);
    expect(out?.warningModel).toBeDefined();
  });
});
