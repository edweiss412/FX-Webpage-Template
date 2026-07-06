import { afterEach, describe, expect, test, vi } from "vitest";
import type { ParsedSheet } from "@/lib/parser/types";

// audit idx57/#166 — enrichWithDrivePins must FORWARD the step's AbortSignal to enrichAgenda so an
// overrun of the enrich budget aborts the in-flight agenda-PDF downloads. Mock enrichAgenda so we
// observe exactly what enrichWithDrivePins hands it (spying the real thing would couple to its
// Drive-call internals; a mock isolates the forwarding contract).
const enrichAgendaMock = vi.hoisted(() => vi.fn(async () => ({ perLink: [] })));
vi.mock("@/lib/sync/enrichAgenda", () => ({ enrichAgenda: enrichAgendaMock }));

import { enrichWithDrivePins } from "@/lib/sync/enrichWithDrivePins";
import { mockDriveClient } from "@/lib/sync/mocks/mockDriveClient";

function emptyParsed(): ParsedSheet {
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
    archivedPullSheetTabs: [],
    hardErrors: [],
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

afterEach(() => {
  enrichAgendaMock.mockClear();
});

describe("enrichWithDrivePins forwards ctx.signal to enrichAgenda (audit idx57/#166)", () => {
  test("passes the provided AbortSignal through as enrichAgenda opts.signal", async () => {
    const controller = new AbortController();
    await enrichWithDrivePins(emptyParsed(), mockDriveClient, {
      ...baseCtx,
      signal: controller.signal,
    });

    expect(enrichAgendaMock).toHaveBeenCalledTimes(1);
    expect(enrichAgendaMock).toHaveBeenCalledWith(
      expect.anything(), // the mutable ParseResult accumulator
      mockDriveClient,
      baseCtx.driveFileId,
      { signal: controller.signal },
    );
  });

  test("omits opts entirely when no signal is provided (backward-compatible with existing callers)", async () => {
    await enrichWithDrivePins(emptyParsed(), mockDriveClient, baseCtx);

    expect(enrichAgendaMock).toHaveBeenCalledTimes(1);
    expect(enrichAgendaMock).toHaveBeenCalledWith(
      expect.anything(),
      mockDriveClient,
      baseCtx.driveFileId,
      undefined,
    );
  });
});
