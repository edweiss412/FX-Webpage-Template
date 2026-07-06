import { describe, expect, test } from "vitest";
import { parseSheet } from "@/lib/parser";
import { enrichWithDrivePins } from "@/lib/sync/enrichWithDrivePins";
import { mockDriveClient } from "@/lib/sync/mocks/mockDriveClient";
import { runInvariants } from "@/lib/parser/invariants";

// baseCtx mirrors tests/sync/enrichWithDrivePins.runOfShow.test.ts:39-48.
const baseCtx = {
  driveFileId: "garbage-file-1",
  fileMeta: {
    driveFileId: "garbage-file-1",
    headRevisionId: "garbage-head-1",
    md5Checksum: "x".repeat(32),
    mimeType: "application/vnd.google-apps.spreadsheet",
    modifiedTime: "2026-05-01T00:00:00.000Z",
  },
};

// Message literal copied verbatim from lib/parser/index.ts:539-541. If the production
// message changes, update this in the SAME commit (deliberate change-detector on the
// user-facing MI-1 text).
const MI1_MESSAGE =
  "Could not detect sheet template version (v1/v2/v4). " +
  "The markdown does not match any known FXAV sheet layout.";

// Genuinely-garbage inputs — each must classify not_a_sheet (no pipe-table markers).
const GARBAGE_INPUTS: Array<[label: string, md: string]> = [
  ["empty string", ""],
  ["prose, no tables", "# A document\n\nno pipe tables here"],
  ["whitespace only", "   \n\t\n   "],
  ["single prose line", "Just one line of plain text with no pipes"],
];

describe("MI-1 garbage-sheet early-return (audit rec-6b) — end-to-end at parseSheet", () => {
  describe("stub contract: parseSheet returns the fail-closed stub without throwing", () => {
    test.each(GARBAGE_INPUTS)("%s → single MI-1 hardError + empty stub", (_label, md) => {
      const parsed = parseSheet(md, "garbage.md"); // must not throw
      // Exactly ONE hardError, the MI-1 code, carrying the production message.
      expect(parsed.hardErrors).toEqual([
        { code: "MI-1_VERSION_DETECTION_FAILED", message: MI1_MESSAGE },
      ]);
      expect(parsed.crewMembers).toEqual([]);
      expect(parsed.rooms).toEqual([]);
      expect(parsed.hotelReservations).toEqual([]);
      expect(parsed.contacts).toEqual([]);
      expect(parsed.transportation).toBeNull();
      expect(parsed.pullSheet).toBeNull();
      expect(parsed.show.template_version).toBe("v4");
      expect(parsed.show.title).toBe("");
      expect(parsed.show.venue).toBeNull();
      expect(parsed.warnings).toEqual([]);
    });
  });

  test("composed seam: garbage → enrichWithDrivePins → runInvariants hard-fails with MI-1", async () => {
    const parsed = parseSheet("# A document\n\nno pipe tables here", "garbage.md");
    // Real production seam (lib/sync/enrichWithDrivePins.ts:12-13). venue is null →
    // enrichVenueGeocode noops before any Supabase (enrichVenueGeocode.ts:74). Hermetic.
    const enriched = await enrichWithDrivePins(parsed, mockDriveClient, baseCtx);
    const outcome = runInvariants(null, enriched); // prior=null: first-seen, harshest
    expect(outcome.outcome).toBe("hard_fail");
    if (outcome.outcome === "hard_fail") {
      // toContain, not toEqual: empty crew/rooms may also trip MI-2/MI-3; the contract
      // is "garbage hard-fails AND MI-1 is a stated cause", not "MI-1 is the only cause".
      expect(outcome.failedCodes).toContain("MI-1_VERSION_DETECTION_FAILED");
    }
  });

  test("negative control: a version-valid venue-less sheet does NOT hard-fail on MI-1 (same chain)", async () => {
    // Verified at authoring time: classifyVersion → {status:"confident", version:"v4"},
    // parseSheet hardErrors=[], show.venue=null (so enrich stays hermetic). This proves the
    // MI-1 hard-fail above is caused by the garbage, not by the harness always MI-1-failing.
    const valid =
      "| RENTAL PICKUP | Mon |\n| RENTAL RETURN | Fri |\n| CONTACT OFFICE | 555 |\n| SITE CONTACT | Jane |";
    const parsed = parseSheet(valid, "valid.md");
    expect(parsed.hardErrors).toEqual([]);
    expect(parsed.show.venue).toBeNull();
    const enriched = await enrichWithDrivePins(parsed, mockDriveClient, baseCtx);
    const outcome = runInvariants(null, enriched);
    // It may hard-fail on MI-2/MI-3 (no crew/rooms) — that is fine; assert only MI-1 absence.
    if (outcome.outcome === "hard_fail") {
      expect(outcome.failedCodes).not.toContain("MI-1_VERSION_DETECTION_FAILED");
    }
  });
});
