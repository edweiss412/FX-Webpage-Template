import { describe, expect, it, test } from "vitest";
import {
  buildStagedSectionData,
  isPublished,
  isStaged,
  type SectionData,
} from "@/components/admin/review/sectionData";
import { buildPublishedSectionData } from "@/components/admin/review/publishedAdapter";
import type { ParseResult } from "@/lib/parser/types";
import type { Step3Row } from "@/components/admin/wizard/Step3Review";
import type { ShowReviewSnapshot } from "@/lib/admin/readShowReviewSnapshot";

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
  pullSheetOverride: null,
  billing: { coiStatus: null, proposal: null, po: null, invoice: null, invoiceNotes: null },
  warnings: [],
  useRawDecisions: [],
  rawUnrecognized: null,
  sourceAnchors: {},
  driveFileId: null,
};

const PR = {
  show: {
    title: "T",
    client_label: null,
    dates: null,
    venue: null,
    event_details: null,
    client_contact: null,
    coi_status: null,
    proposal: null,
    po: null,
    invoice: null,
    invoice_notes: null,
  },
  contacts: [],
  transportation: null,
  diagrams: null,
  raw_unrecognized: null,
} as unknown as ParseResult;

function baseInput() {
  return {
    pr: PR,
    row: { driveFileName: null, sourceAnchors: {} } as unknown as Step3Row,
    dfid: "d",
    wizardSessionId: "w",
    crewMembers: [],
    rooms: [],
    hotels: [],
    pullSheet: [],
    archivedPullSheetTabs: [],
    ros: {},
    warnings: [],
    agendaBaseline: [],
    useRawDecisions: [],
  };
}

function publishedInput(): ShowReviewSnapshot {
  return {
    show: {
      id: "s",
      title: "T",
      client_label: null,
      client_contact: null,
      dates: null,
      venue: null,
      event_details: null,
      agenda_links: [],
      coi_status: null,
      diagrams: null,
      pull_sheet: [],
      source_anchors: {},
      drive_file_id: null,
      archived: false,
      published: true,
    },
    internal: null,
    crew_members: [],
    rooms: [],
    hotel_reservations: [],
    transportation: [],
    contacts: [],
  } as unknown as ShowReviewSnapshot;
}

test("buildStagedSectionData carries pullSheetOverride through", () => {
  const data = buildStagedSectionData({ ...baseInput(), pullSheetOverride: { tabName: "OLD A", fingerprint: "fp1" } });
  expect(data.pullSheetOverride).toEqual({ tabName: "OLD A", fingerprint: "fp1" });
});
test("buildStagedSectionData accepts null override", () => {
  const data = buildStagedSectionData({ ...baseInput(), pullSheetOverride: null });
  expect(data.pullSheetOverride).toBeNull();
});
test("buildPublishedSectionData sets pullSheetOverride null (published never shows S5, spec §3.6)", () => {
  const data = buildPublishedSectionData(publishedInput(), { slug: "x" });
  expect(data.pullSheetOverride).toBeNull();
});

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
