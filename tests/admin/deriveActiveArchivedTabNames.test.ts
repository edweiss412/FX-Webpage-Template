import { describe, expect, it } from "vitest";
import { deriveActiveArchivedTabNames } from "@/lib/admin/deriveActiveArchivedTabNames";
import type { SectionWarningRecord } from "@/lib/admin/sectionWarningModel";
import type { ParseWarning } from "@/lib/parser/types";

/**
 * Failure modes caught: offer drawing from IGNORED (not active) warnings; trimming/altering the
 * RPC-identity tab name; leaking blank names; duplicate cards for the same tab; wrong code.
 */

function warn(name: string | undefined, code = "PULL_SHEET_ON_ARCHIVED_TAB"): ParseWarning {
  return {
    code,
    message: "m",
    severity: "warn",
    ...(name === undefined ? {} : { blockRef: { kind: "pull_sheet_archived_tab", name } }),
  } as ParseWarning;
}

function rec(
  active: ParseWarning[],
  ignored: ParseWarning[] = [],
  section = "packlist",
): SectionWarningRecord {
  const item = (w: ParseWarning) => ({ warning: w, reportSurfaceId: "x" });
  return {
    [section]: {
      active: active.map(item),
      ignored: ignored.map(item),
      bulkGroups: [],
      activeGroups: [],
      warningsByCrewKey: {},
    },
  } as unknown as SectionWarningRecord;
}

describe("deriveActiveArchivedTabNames (spec 2026-07-23 §2.1)", () => {
  it("returns raw names from ACTIVE archived-tab warnings only", () => {
    expect(deriveActiveArchivedTabNames(rec([warn("OLD PULL SHEET")]))).toEqual(["OLD PULL SHEET"]);
  });

  it("ignores IGNORED-partition warnings (a durable Ignore hides the offer)", () => {
    expect(deriveActiveArchivedTabNames(rec([], [warn("OLD PULL SHEET")]))).toEqual([]);
  });

  it("does NOT trim — the RPC tab identity is exact", () => {
    expect(deriveActiveArchivedTabNames(rec([warn(" OLD PULL SHEET ")]))).toEqual([
      " OLD PULL SHEET ",
    ]);
  });

  it("drops blank / whitespace-only / missing names", () => {
    expect(deriveActiveArchivedTabNames(rec([warn(""), warn("   "), warn(undefined)]))).toEqual([]);
  });

  it("exact-dedupes preserving first-seen order across sections", () => {
    const merged: SectionWarningRecord = {
      ...rec([warn("A"), warn("B"), warn("A")], [], "packlist"),
      ...rec([warn("B"), warn("C")], [], "venue"),
    };
    expect(deriveActiveArchivedTabNames(merged)).toEqual(["A", "B", "C"]);
  });

  it("ignores non-archived-tab codes", () => {
    expect(deriveActiveArchivedTabNames(rec([warn("X", "SOME_OTHER_CODE")]))).toEqual([]);
  });

  it("empty model → empty", () => {
    expect(deriveActiveArchivedTabNames({})).toEqual([]);
  });
});
