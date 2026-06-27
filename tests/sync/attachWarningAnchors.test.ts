import { describe, it, expect, vi } from "vitest";
import * as XLSX from "xlsx";
import { attachWarningAnchors } from "@/lib/sync/attachWarningAnchors";
import * as crewMod from "@/lib/drive/crewRoleAnchors";
import type { ParseWarning } from "@/lib/parser/types";

function xlsxBuffer(aoa: string[][]): ArrayBuffer {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), "INFO");
  const u8 = new Uint8Array(
    XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayLike<number>,
  );
  return u8.buffer as ArrayBuffer;
}

const CREW = xlsxBuffer([
  ["CREW", "NAME", "ROLE", "PHONE"],
  ["", "Jane Doe", "- WIDGETMASTER", "555"],
]);
const gids = () => Promise.resolve(new Map([["INFO", 0]]));

describe("attachWarningAnchors", () => {
  it("attaches crew-role sourceCell (UNKNOWN_ROLE_TOKEN) via the lazy gids thunk", async () => {
    const warnings: ParseWarning[] = [
      {
        severity: "warn",
        code: "UNKNOWN_ROLE_TOKEN",
        message: "x",
        blockRef: { kind: "crew", index: 0, name: "Jane Doe" },
      },
    ];
    await attachWarningAnchors(warnings, CREW, gids);
    // ROLE col index 2 → C; data row grid index 1 → row 2 → C2.
    expect(warnings[0]!.sourceCell).toEqual({ title: "INFO", gid: 0, a1: "C2" });
  });

  it("does NOT call resolveGids when no anchored warning is present (cost gate)", async () => {
    const resolveGids = vi.fn(gids);
    await attachWarningAnchors(
      [{ severity: "warn", code: "UNKNOWN_SECTION_HEADER", message: "x" }],
      CREW,
      resolveGids,
    );
    expect(resolveGids).not.toHaveBeenCalled();
  });

  it("returns early when bytes are undefined (link-less, no throw)", async () => {
    const warnings: ParseWarning[] = [
      {
        severity: "warn",
        code: "UNKNOWN_ROLE_TOKEN",
        message: "x",
        blockRef: { kind: "crew", index: 0, name: "Jane Doe" },
      },
    ];
    await attachWarningAnchors(warnings, undefined, gids);
    expect(warnings[0]!.sourceCell).toBeUndefined();
  });

  it("swallows a thrown error (scan never breaks)", async () => {
    const warnings: ParseWarning[] = [
      {
        severity: "warn",
        code: "UNKNOWN_ROLE_TOKEN",
        message: "x",
        blockRef: { kind: "crew", index: 0, name: "Jane Doe" },
      },
    ];
    await expect(
      attachWarningAnchors(warnings, CREW, () => Promise.reject(new Error("boom"))),
    ).resolves.toBeUndefined();
    expect(warnings[0]!.sourceCell).toBeUndefined();
  });

  it("degrades PER anchor family — a crew-scan throw still leaves valid schedule-time links", async () => {
    // whole-diff R1 [high]: one extractor throwing must NOT drop the others. Force
    // the crew-role extractor to throw and assert the SCHEDULE_TIME_UNPARSED anchor
    // still attaches.
    const spy = vi.spyOn(crewMod, "extractCrewRoleAnchors").mockImplementation(() => {
      throw new Error("bad crew geometry");
    });
    const DATES = xlsxBuffer([
      ["DATES", "", "", "", ""],
      ["", "SHOW DAY 1", "", "5/12/2026", "GS: ..."],
    ]);
    const warnings: ParseWarning[] = [
      {
        severity: "warn",
        code: "SCHEDULE_TIME_UNPARSED",
        message: "x",
        blockRef: { kind: "dates", index: 0, iso: "2026-05-12" },
      },
    ];
    await attachWarningAnchors(warnings, DATES, gids);
    // SHOW DAY 1 = grid row index 1, TIME col index 4 → E2. Survives the crew throw.
    expect(warnings[0]!.sourceCell).toEqual({ title: "INFO", gid: 0, a1: "E2" });
    spy.mockRestore();
  });

  it("reuses a precomputed region map when supplied (no recompute)", async () => {
    const warnings: ParseWarning[] = [
      {
        severity: "warn",
        code: "FIELD_UNREADABLE",
        message: "f",
        blockRef: { kind: "crew", index: 0 },
      },
    ];
    const region = { crew: { title: "INFO", gid: 0, a1: "A1:D2" } };
    await attachWarningAnchors(warnings, CREW, gids, region);
    expect(warnings[0]!.sourceCell).toEqual({ title: "INFO", gid: 0, a1: "A1:D2" });
  });
});
