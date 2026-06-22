import { describe, expect, test } from "vitest";
import { enrichWithDrivePins } from "@/lib/sync/enrichWithDrivePins";
import { mockDriveClient } from "@/lib/sync/mocks/mockDriveClient";
import type { ParsedSheet } from "@/lib/parser/types";

// Mirror the emptyParsed builder + baseCtx from tests/sync/enrichWithDrivePins.test.ts.
function emptyParsed(overrides: Partial<ParsedSheet> = {}): ParsedSheet {
  return {
    show: {
      title: "",
      client_label: "",
      client_contact: null,
      template_version: "v4",
      venue: null,
      dates: { travelIn: null, set: null, showDays: [], travelOut: null },
      schedule_phases: {},
      event_details: {},
      agenda_links: [],
      coi_status: null,
      po: null,
      proposal: null,
      invoice: null,
      invoice_notes: null,
    },
    crewMembers: [],
    hotelReservations: [],
    rooms: [],
    transportation: null,
    contacts: [],
    pullSheet: null,
    diagrams: { linkedFolder: null, embeddedImages: [], linkedFolderItems: [] },
    openingReel: null,
    raw_unrecognized: [],
    warnings: [],
    hardErrors: [],
    ...overrides,
  };
}
const baseCtx = {
  driveFileId: "show-file-id-1",
  fileMeta: {
    driveFileId: "show-file-id-1",
    headRevisionId: "show-head-1",
    md5Checksum: "x".repeat(32),
    mimeType: "application/vnd.google-apps.spreadsheet",
    modifiedTime: "2026-05-01T00:00:00.000Z",
  },
};

describe("enrichWithDrivePins — runOfShow survives the ParsedSheet→ParseResult bridge", () => {
  test("a filled runOfShow deep-equals on the ParseResult (NOT dropped)", async () => {
    const runOfShow = { "2026-05-14": { entries: [{ start: "8:00 AM", title: "X" }], showStart: "8:00 AM", window: null } };
    const parsed = emptyParsed({ runOfShow });
    const result = await enrichWithDrivePins(parsed, mockDriveClient, baseCtx);
    expect(result.runOfShow).toEqual(runOfShow);
  });

  test("undefined runOfShow → omitted on the ParseResult (exactOptionalPropertyTypes)", async () => {
    const parsed = emptyParsed(); // no runOfShow key
    const result = await enrichWithDrivePins(parsed, mockDriveClient, baseCtx);
    expect(result.runOfShow).toBeUndefined();
    expect("runOfShow" in result).toBe(false); // truly absent, not present-as-undefined
  });
});
