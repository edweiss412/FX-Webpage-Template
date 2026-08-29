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

// ── Whole-diff R1: the staged→linked transition ────────────────────────────────
//
// Linkage is not fixed for the life of a wizard session. A FIRST-SEEN row gains a
// show the moment any ordinary concurrent finalize creates it — a case spec §2.7
// documents explicitly — and `assembleStep3Row` resolves it as LINKED on the next
// read. Reading only durable ignores at that point made the operator's staged
// dismissal vanish and the warning come back ACTIVE mid-session, with nothing said.
describe("enrichStep3WarningModels — the staged-to-linked transition (R1)", () => {
  it("a LINKED row still honours its OWN staged dismissals", async () => {
    // The row is linked (a concurrent finalize created the show), the durable table is
    // still empty because the carry has not run, and the dismissal lives only in the
    // column. It must stay hidden.
    const loader = okLoader([]);
    const [row] = await enrichStep3WarningModels(
      [
        reviewableRow({
          linkedShowRef: { id: "show-1", slug: SLUG },
          stagedIgnoredWarnings: [{ fingerprint: FP_A, code: warnA.code, ignored_by: "d@e.co" }],
        }),
      ],
      loader,
    );
    expect(loader).toHaveBeenCalledWith("show-1");
    expect(row?.warningModel?.ignored.map((i) => i.index)).toEqual([0]);
    expect(row?.warningModel?.active.map((i) => i.index)).toEqual([1]);
  });

  it("unions the two sources rather than preferring either", async () => {
    // Durable holds one, the column holds the other; both stay hidden.
    const [row] = await enrichStep3WarningModels(
      [
        reviewableRow({
          linkedShowRef: { id: "show-1", slug: SLUG },
          stagedIgnoredWarnings: [{ fingerprint: FP_B, code: warnB.code, ignored_by: "d@e.co" }],
        }),
      ],
      okLoader([FP_A]),
    );
    expect(row?.warningModel?.ignored.map((i) => i.index)).toEqual([0, 1]);
    expect(row?.warningModel?.active).toEqual([]);
  });

  it("a LINKED row with a malformed staged column still honours the durable set", async () => {
    // The column coerces to empty; the durable read is unaffected.
    const [row] = await enrichStep3WarningModels(
      [
        reviewableRow({
          linkedShowRef: { id: "show-1", slug: SLUG },
          stagedIgnoredWarnings: "not-an-array",
        }),
      ],
      okLoader([FP_A]),
    );
    expect(row?.warningModel?.ignored.map((i) => i.index)).toEqual([0]);
  });
});

// ── Whole-diff P0: the ignore's ORIGIN, so the write follows the read ──────────
describe("enrichStep3WarningModels — ignoreOrigin (whole-diff P0)", () => {
  it("stamps a staged-column ignore on a LINKED row as staged, not show", async () => {
    // The union made this row's staged dismissal visible; without the stamp the panel
    // would target Un-ignore at the slug route, which deletes nothing from the staged
    // column and still answers `unignored` — a false success on a dead control.
    const [row] = await enrichStep3WarningModels(
      [
        reviewableRow({
          linkedShowRef: { id: "show-1", slug: SLUG },
          stagedIgnoredWarnings: [{ fingerprint: FP_A, code: warnA.code, ignored_by: "d@e.co" }],
        }),
      ],
      okLoader([]),
    );
    expect(row?.warningModel?.ignored).toEqual([
      expect.objectContaining({ index: 0, ignoreOrigin: "staged" }),
    ]);
  });

  it("stamps a durable ignore on a LINKED row as show", async () => {
    const [row] = await enrichStep3WarningModels(
      [reviewableRow({ linkedShowRef: { id: "show-1", slug: SLUG } })],
      okLoader([FP_A]),
    );
    expect(row?.warningModel?.ignored).toEqual([
      expect.objectContaining({ index: 0, ignoreOrigin: "show" }),
    ]);
  });

  it("prefers staged when a fingerprint sits in BOTH stores", async () => {
    // The durable route would delete its own copy, report success, and leave the staged
    // copy still hiding the row on the next read. Staged has to win.
    const [row] = await enrichStep3WarningModels(
      [
        reviewableRow({
          linkedShowRef: { id: "show-1", slug: SLUG },
          stagedIgnoredWarnings: [{ fingerprint: FP_A, code: warnA.code, ignored_by: "d@e.co" }],
        }),
      ],
      okLoader([FP_A]),
    );
    expect(row?.warningModel?.ignored[0]?.ignoreOrigin).toBe("staged");
  });

  it("a FIRST-SEEN row's ignores are staged by construction", async () => {
    const [row] = await enrichStep3WarningModels(
      [
        reviewableRow({
          stagedIgnoredWarnings: [{ fingerprint: FP_A, code: warnA.code, ignored_by: "d@e.co" }],
        }),
      ],
      okLoader([]),
    );
    expect(row?.warningModel?.ignored[0]?.ignoreOrigin).toBe("staged");
  });
});
