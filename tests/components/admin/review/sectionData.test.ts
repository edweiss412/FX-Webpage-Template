import { describe, expect, it } from "vitest";
import { isPublished, isStaged, type SectionData } from "@/components/admin/review/sectionData";

const core = {
  title: "T",
  clientLabel: null,
  dates: null,
  venue: null,
  eventDetails: null,
  clientContact: null,
  contacts: [],
  ros: {},
  agendaBaseline: [],
  hotels: [],
  transportation: null,
  rooms: [],
  diagrams: null,
  crewMembers: [],
  pullSheet: [],
  archivedPullSheetTabs: [],
  billing: { coiStatus: null, proposal: null, po: null, invoice: null, invoiceNotes: null },
  warnings: [],
  useRawDecisions: [],
  rawUnrecognized: null,
  sourceAnchors: {},
  driveFileId: null,
};

describe("sectionData mode guards", () => {
  it("narrows published", () => {
    const d = {
      ...core,
      mode: "published",
      showId: "s",
      slug: "x",
      archived: false,
      published: true,
    } as SectionData;
    expect(isPublished(d)).toBe(true);
    expect(isStaged(d)).toBe(false);
  });
  it("narrows staged", () => {
    const d = {
      ...core,
      mode: "staged",
      pr: {} as never,
      row: {} as never,
      dfid: "d",
      wizardSessionId: "w",
    } as SectionData;
    expect(isStaged(d)).toBe(true);
  });
});
