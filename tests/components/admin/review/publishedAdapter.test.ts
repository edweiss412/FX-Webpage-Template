import { describe, expect, it } from "vitest";
import { buildPublishedSectionData } from "@/components/admin/review/publishedAdapter";
import type { ShowReviewSnapshot } from "@/lib/admin/readShowReviewSnapshot";
import { AGENDA_MAX_PDFS_PER_SHEET } from "@/lib/agenda/constants";

const SHOW_ID = "11111111-1111-1111-1111-111111111111";
const SLUG = "east-coast-expo";

/** A high-confidence extraction the render-boundary validator accepts (days>0). */
function validExtraction() {
  return {
    confidence: "high",
    corrections: 0,
    extractorVersion: 1,
    days: [
      {
        dayLabel: "Day 1",
        date: "2026-05-01",
        sessions: [{ time: "09:00", title: "Opening", room: null, drift: null, tracks: [] }],
      },
    ],
  };
}

function baseSnapshot(overrides: Partial<ShowReviewSnapshot> = {}): ShowReviewSnapshot {
  const show = {
    id: SHOW_ID,
    title: "East Coast Expo",
    client_label: "Acme Corp",
    client_contact: { name: "Dana", email: "dana@example.com", phone: "555" },
    dates: { travelIn: "2026-05-01", set: null, showDays: ["2026-05-02"], travelOut: "2026-05-03" },
    venue: { name: "Hall A", address: "1 Main St" },
    event_details: { a: "1" },
    agenda_links: [],
    coi_status: "received",
    diagrams: { snapshot_revision_id: "r1", embeddedImages: [] },
    pull_sheet: [{ caseLabel: "Case 1", items: [] }],
    source_anchors: { venue: "A1" },
    drive_file_id: "DRIVE_XYZ",
    archived: false,
    published: true,
    ...(overrides.show ?? {}),
  };
  return {
    show,
    internal:
      "internal" in overrides
        ? (overrides.internal ?? null)
        : {
            financials: { po: "PO-9", proposal: "PR-3", invoice: "INV-7", invoice_notes: "net30" },
            parse_warnings: [{ code: "W1" }],
            raw_unrecognized: [{ block: "b", key: "k", value: "v" }],
            run_of_show: { "2026-05-02": { rows: [] } },
            use_raw_decisions: [],
            applied_role_mappings: [],
            show_id: SHOW_ID,
          },
    crew_members: overrides.crew_members ?? [],
    rooms: overrides.rooms ?? [],
    hotel_reservations: overrides.hotel_reservations ?? [],
    transportation: overrides.transportation ?? [],
    contacts: overrides.contacts ?? [],
  };
}

describe("buildPublishedSectionData — header + mode fields", () => {
  it("maps shows columns to SectionCore header/content and mode discriminant", () => {
    const d = buildPublishedSectionData(baseSnapshot(), { slug: SLUG });
    expect(d.mode).toBe("published");
    expect(d.showId).toBe(SHOW_ID);
    expect(d.slug).toBe(SLUG);
    expect(d.archived).toBe(false);
    expect(d.published).toBe(true);
    expect(d.title).toBe("East Coast Expo");
    expect(d.clientLabel).toBe("Acme Corp");
    expect(d.dates).toEqual({
      travelIn: "2026-05-01",
      set: null,
      showDays: ["2026-05-02"],
      travelOut: "2026-05-03",
    });
    expect(d.venue).toEqual({ name: "Hall A", address: "1 Main St" });
    expect(d.eventDetails).toEqual({ a: "1" });
    expect(d.clientContact).toEqual({ name: "Dana", email: "dana@example.com", phone: "555" });
    expect(d.diagrams).toEqual({ snapshot_revision_id: "r1", embeddedImages: [] });
    expect(d.pullSheet).toEqual([{ caseLabel: "Case 1", items: [] }]);
    expect(d.sourceAnchors).toEqual({ venue: "A1" });
    expect(d.driveFileId).toBe("DRIVE_XYZ");
    expect(d.archivedPullSheetTabs).toEqual([]);
  });

  it("coerces empty client_label to null and null drive_file_id to null", () => {
    const d = buildPublishedSectionData(
      baseSnapshot({
        show: { client_label: "", drive_file_id: null },
      } as Partial<ShowReviewSnapshot>),
      { slug: SLUG },
    );
    expect(d.clientLabel).toBeNull();
    expect(d.driveFileId).toBeNull();
  });
});

describe("buildPublishedSectionData — billing + internal-derived fields", () => {
  it("derives billing from shows.coi_status + shows_internal.financials", () => {
    const d = buildPublishedSectionData(baseSnapshot(), { slug: SLUG });
    expect(d.billing).toEqual({
      coiStatus: "received",
      proposal: "PR-3",
      po: "PO-9",
      invoice: "INV-7",
      invoiceNotes: "net30",
    });
    expect(d.warnings).toEqual([{ code: "W1" }]);
    expect(d.rawUnrecognized).toEqual([{ block: "b", key: "k", value: "v" }]);
    expect(d.ros).toEqual({ "2026-05-02": { rows: [] } });
  });

  it("null internal ⇒ empty warnings/ros/useRawDecisions, null rawUnrecognized, null financials (coiStatus still from show)", () => {
    const d = buildPublishedSectionData(baseSnapshot({ internal: null }), { slug: SLUG });
    expect(d.warnings).toEqual([]);
    expect(d.ros).toEqual({});
    expect(d.useRawDecisions).toEqual([]);
    expect(d.rawUnrecognized).toBeNull();
    expect(d.billing).toEqual({
      coiStatus: "received",
      proposal: null,
      po: null,
      invoice: null,
      invoiceNotes: null,
    });
  });
});

describe("buildPublishedSectionData — row ordering", () => {
  it("re-sorts rooms by (kind, name)", () => {
    const rooms = [
      { kind: "gs", name: "B", id: "r1" },
      { kind: "additional", name: "A", id: "r2" },
      { kind: "gs", name: "A", id: "r3" },
    ];
    const d = buildPublishedSectionData(baseSnapshot({ rooms }), { slug: SLUG });
    expect(d.rooms.map((r) => `${r.kind}/${r.name}`)).toEqual(["additional/A", "gs/A", "gs/B"]);
  });

  it("re-sorts contacts by (kind, name)", () => {
    const contacts = [
      { kind: "venue", name: "Zed", id: "c1" },
      { kind: "in_house_av", name: "Amy", id: "c2" },
      { kind: "in_house_av", name: "Bob", id: "c3" },
    ];
    const d = buildPublishedSectionData(baseSnapshot({ contacts }), { slug: SLUG });
    expect(d.contacts.map((c) => `${c.kind}/${c.name}`)).toEqual([
      "in_house_av/Amy",
      "in_house_av/Bob",
      "venue/Zed",
    ]);
  });

  it("re-sorts crew by (name, id) — id breaks name ties", () => {
    const crew_members = [
      { name: "Zoe", id: "cm1", role: "PM", email: null, phone: null, role_flags: [] },
      { name: "Al", id: "cm3", role: "A2", email: null, phone: null, role_flags: [] },
      { name: "Al", id: "cm2", role: "A1", email: null, phone: null, role_flags: [] },
    ];
    const d = buildPublishedSectionData(baseSnapshot({ crew_members }), { slug: SLUG });
    expect(d.crewMembers.map((c) => `${c.name}/${c.role}`)).toEqual(["Al/A1", "Al/A2", "Zoe/PM"]);
  });

  it("preserves RPC (ordinal) order for hotels — does NOT re-sort by id", () => {
    // Input already ordinal-ordered but id-descending; an accidental id sort
    // would swap them.
    const hotel_reservations = [
      { ordinal: 1, id: "h-zzz", hotel_name: "First", names: ["Guest A"] },
      { ordinal: 2, id: "h-aaa", hotel_name: "Second", names: [] },
    ];
    const d = buildPublishedSectionData(baseSnapshot({ hotel_reservations }), { slug: SLUG });
    expect(d.hotels.map((h) => h.hotel_name)).toEqual(["First", "Second"]);
    expect(d.hotels[0]!.names).toEqual(["Guest A"]);
  });

  it("collapses transportation rows to the lowest-id single row; empty ⇒ null", () => {
    const transportation = [
      {
        id: "t-b",
        driver_name: "Bob",
        schedule: [{ stage: "load", date: null, time: null, assigned_names: [] }],
      },
      { id: "t-a", driver_name: "Al", schedule: [] },
    ];
    const d = buildPublishedSectionData(baseSnapshot({ transportation }), { slug: SLUG });
    expect(d.transportation?.driver_name).toBe("Al");
    expect(d.transportation?.schedule).toEqual([]);

    const empty = buildPublishedSectionData(baseSnapshot({ transportation: [] }), { slug: SLUG });
    expect(empty.transportation).toBeNull();
  });
});

describe("buildPublishedSectionData — agenda baseline", () => {
  it("emits a block only for links whose extracted is non-null, and rewrites fileId hrefs to the published asset route", () => {
    const agenda_links = [
      { label: "Day 1", fileId: "FID_A", extracted: validExtraction() },
      { label: "Day 2", fileId: "FID_B" },
      { label: "Ext", url: "https://ex.com/a.pdf" },
    ];
    const d = buildPublishedSectionData(
      baseSnapshot({
        show: { ...baseSnapshot().show, agenda_links },
      } as Partial<ShowReviewSnapshot>),
      { slug: SLUG },
    );

    // Exactly one block, and it belongs to the extracted fixture link (by label).
    const withBlock = d.agendaBaseline.filter((it) => it.block !== null);
    expect(withBlock).toHaveLength(1);
    expect(withBlock[0]!.label).toBe("Day 1");

    // Anti-tautology: find each item by its label, assert the href embeds THAT
    // fixture link's own id.
    const day1 = d.agendaBaseline.find((it) => it.label === "Day 1")!;
    const day2 = d.agendaBaseline.find((it) => it.label === "Day 2")!;
    const ext = d.agendaBaseline.find((it) => it.label === "Ext")!;
    expect(day1.href).toBe(`/api/asset/agenda/${SHOW_ID}/FID_A`);
    expect(day2.href).toBe(`/api/asset/agenda/${SHOW_ID}/FID_B`);
    expect(day2.block).toBeNull();
    // url-only link keeps the builder's validated external URL, not the asset route.
    expect(ext.href).toBe("https://ex.com/a.pdf");
  });

  it("maps only the visible slice for over-cap agenda_links (cap + 2)", () => {
    const overCap = AGENDA_MAX_PDFS_PER_SHEET + 2;
    const agenda_links = Array.from({ length: overCap }, (_, i) => ({
      label: `L${i}`,
      fileId: `FID${i}`,
    }));
    const d = buildPublishedSectionData(
      baseSnapshot({
        show: { ...baseSnapshot().show, agenda_links },
      } as Partial<ShowReviewSnapshot>),
      { slug: SLUG },
    );

    expect(d.agendaBaseline).toHaveLength(AGENDA_MAX_PDFS_PER_SHEET);
    // Each visible item's href embeds its own fixture link's fileId (by label).
    for (let i = 0; i < AGENDA_MAX_PDFS_PER_SHEET; i++) {
      const item = d.agendaBaseline.find((it) => it.label === `L${i}`)!;
      expect(item.href).toBe(`/api/asset/agenda/${SHOW_ID}/FID${i}`);
    }
    // The over-cap links never surface.
    expect(d.agendaBaseline.find((it) => it.label === `L${overCap - 1}`)).toBeUndefined();
  });
});

describe("buildPublishedSectionData — pull_sheet_override wire projection (spec 2026-07-23 §4)", () => {
  const wireOf = (pso: unknown) =>
    buildPublishedSectionData(baseSnapshot({ show: { drive_file_id: "D", pull_sheet_override: pso } as never }), {
      slug: SLUG,
    }).pullSheetOverrideWire;

  it("null → null", () => {
    expect(wireOf(null)).toBeNull();
  });
  it("full 4-field object → two string fields, acceptedBy/At dropped", () => {
    expect(wireOf({ tabName: "OLD", fingerprint: "fp1", acceptedBy: "a@b", acceptedAt: "t" })).toEqual({
      tabName: "OLD",
      fingerprint: "fp1",
    });
  });
  it("missing fingerprint → fingerprint null (verbatim string tabName)", () => {
    expect(wireOf({ tabName: "x" })).toEqual({ tabName: "x", fingerprint: null });
  });
  it("string root (garbage) → both fields null", () => {
    expect(wireOf("garbage")).toEqual({ tabName: null, fingerprint: null });
  });
  it("whitespace/empty strings preserved verbatim (no trim, no empty-collapse)", () => {
    expect(wireOf({ tabName: "  x ", fingerprint: "" })).toEqual({ tabName: "  x ", fingerprint: "" });
  });
  it("non-string field values (number/boolean) → null (representation stays DB-owned)", () => {
    expect(wireOf({ tabName: 123, fingerprint: false })).toEqual({ tabName: null, fingerprint: null });
  });
  it("object/array field values → null", () => {
    expect(wireOf({ tabName: { a: 1 }, fingerprint: [1, 2] })).toEqual({ tabName: null, fingerprint: null });
  });
  it("adapter always emits archivedTabOffer null (modal attaches)", () => {
    expect(buildPublishedSectionData(baseSnapshot(), { slug: SLUG }).archivedTabOffer).toBeNull();
  });
});
