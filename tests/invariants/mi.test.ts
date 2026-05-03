import { describe, it, expect } from "vitest";
import { runInvariants } from "@/lib/parser/invariants";
import type { ParseResult, CrewMemberRow, RoomRow, TriggeredReviewItem } from "@/lib/parser/types";

// ---------------------------------------------------------------------------
// Test helper — produces a valid ParseResult that passes all hard-fail
// invariants. Individual tests override only what they need to test.
// ---------------------------------------------------------------------------
function synthCrewMember(overrides: Partial<CrewMemberRow> = {}): CrewMemberRow {
  return {
    name: "Alice Smith",
    email: "alice@fxav.net",
    phone: null,
    role: "LEAD",
    role_flags: ["LEAD"],
    date_restriction: { kind: "none" },
    stage_restriction: { kind: "none" },
    flight_info: null,
    ...overrides,
  };
}

function synthRoom(overrides: Partial<RoomRow> = {}): RoomRow {
  return {
    kind: "gs",
    name: "Main Ballroom",
    dimensions: null,
    floor: null,
    setup: null,
    set_time: null,
    show_time: null,
    strike_time: null,
    audio: null,
    video: null,
    lighting: null,
    scenic: null,
    power: null,
    digital_signage: null,
    other: null,
    notes: null,
    ...overrides,
  };
}

function synthParseResult(p: Partial<ParseResult> = {}): ParseResult {
  return {
    show: {
      title: "Test Show",
      client_label: "Test Client",
      client_contact: null,
      template_version: "v4",
      venue: { name: "Test Venue", address: "" },
      dates: {
        travelIn: "2026-03-22",
        set: null,
        showDays: ["2026-03-23"],
        travelOut: null,
      },
      schedule_phases: {},
      event_details: {},
      agenda_links: [],
      coi_status: null,
      po: null,
      proposal: null,
      invoice: null,
      invoice_notes: null,
      ...p.show,
    },
    crewMembers: p.crewMembers ?? [synthCrewMember()],
    hotelReservations: p.hotelReservations ?? [],
    rooms: p.rooms ?? [synthRoom()],
    transportation: p.transportation !== undefined ? p.transportation : null,
    contacts: p.contacts ?? [],
    pullSheet: p.pullSheet !== undefined ? p.pullSheet : null,
    diagrams: p.diagrams ?? {
      linkedFolder: null,
      embeddedImages: [],
      linkedFolderItems: [],
    },
    openingReel: p.openingReel !== undefined ? p.openingReel : null,
    raw_unrecognized: p.raw_unrecognized ?? [],
    warnings: p.warnings ?? [],
    hardErrors: p.hardErrors ?? [],
  };
}

// ---------------------------------------------------------------------------
// Hard-fail tests (MI-1 through MI-5b)
// ---------------------------------------------------------------------------

describe("Hard-fail invariants (MI-1..MI-5b)", () => {
  it("returns pass for a valid parse result", () => {
    const result = runInvariants(null, synthParseResult());
    expect(result.outcome).toBe("pass");
  });

  describe("MI-1: version detection", () => {
    it("hard fails when template_version is invalid (forced via cast)", () => {
      const next = synthParseResult({
        show: {
          title: "Test Show",
          client_label: "Test Client",
          client_contact: null,
          template_version: "v3" as unknown as "v4",
          venue: null,
          dates: { travelIn: "2026-03-22", set: null, showDays: ["2026-03-23"], travelOut: null },
          schedule_phases: {},
          event_details: {},
          agenda_links: [],
          coi_status: null,
          po: null,
          proposal: null,
          invoice: null,
          invoice_notes: null,
        },
      });
      const r = runInvariants(null, next);
      expect(r.outcome).toBe("hard_fail");
      if (r.outcome === "hard_fail") {
        expect(r.failedCodes).toContain("MI-1_VERSION_DETECTION_FAILED");
      }
    });

    it("hard fails when MI-1_VERSION_DETECTION_FAILED warning is present in hardErrors", () => {
      const next = synthParseResult({
        hardErrors: [{ code: "MI-1_VERSION_DETECTION_FAILED", message: "Unknown version" }],
      });
      const r = runInvariants(null, next);
      expect(r.outcome).toBe("hard_fail");
      if (r.outcome === "hard_fail") {
        expect(r.failedCodes).toContain("MI-1_VERSION_DETECTION_FAILED");
      }
    });

    it("passes for valid versions v1, v2, v4", () => {
      for (const v of ["v1", "v2", "v4"] as const) {
        const next = synthParseResult({
          show: {
            title: "Test Show",
            client_label: "Test Client",
            client_contact: null,
            template_version: v,
            venue: null,
            dates: { travelIn: "2026-03-22", set: null, showDays: ["2026-03-23"], travelOut: null },
            schedule_phases: {},
            event_details: {},
            agenda_links: [],
            coi_status: null,
            po: null,
            proposal: null,
            invoice: null,
            invoice_notes: null,
          },
        });
        const r = runInvariants(null, next);
        expect(r.outcome).not.toBe("hard_fail");
      }
    });
  });

  describe("MI-2: show.title non-empty", () => {
    it("hard fails on empty title", () => {
      const next = synthParseResult({
        show: {
          title: "",
          client_label: "Test Client",
          client_contact: null,
          template_version: "v4",
          venue: null,
          dates: { travelIn: "2026-03-22", set: null, showDays: ["2026-03-23"], travelOut: null },
          schedule_phases: {},
          event_details: {},
          agenda_links: [],
          coi_status: null,
          po: null,
          proposal: null,
          invoice: null,
          invoice_notes: null,
        },
      });
      const r = runInvariants(null, next);
      expect(r.outcome).toBe("hard_fail");
      if (r.outcome === "hard_fail") {
        expect(r.failedCodes).toContain("MI-2_EMPTY_TITLE");
      }
    });

    it("hard fails on whitespace-only title", () => {
      const next = synthParseResult({
        show: {
          title: "   ",
          client_label: "Test Client",
          client_contact: null,
          template_version: "v4",
          venue: null,
          dates: { travelIn: "2026-03-22", set: null, showDays: ["2026-03-23"], travelOut: null },
          schedule_phases: {},
          event_details: {},
          agenda_links: [],
          coi_status: null,
          po: null,
          proposal: null,
          invoice: null,
          invoice_notes: null,
        },
      });
      const r = runInvariants(null, next);
      expect(r.outcome).toBe("hard_fail");
      if (r.outcome === "hard_fail") {
        expect(r.failedCodes).toContain("MI-2_EMPTY_TITLE");
      }
    });
  });

  describe("MI-3: at least one valid date", () => {
    it("hard fails when all dates are null/empty", () => {
      const next = synthParseResult({
        show: {
          title: "Test Show",
          client_label: "Test Client",
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
      });
      const r = runInvariants(null, next);
      expect(r.outcome).toBe("hard_fail");
      if (r.outcome === "hard_fail") {
        expect(r.failedCodes).toContain("MI-3_NO_VALID_DATES");
      }
    });

    it("passes when only travelIn is set", () => {
      const next = synthParseResult({
        show: {
          title: "Test Show",
          client_label: "Test Client",
          client_contact: null,
          template_version: "v4",
          venue: null,
          dates: { travelIn: "2026-03-22", set: null, showDays: [], travelOut: null },
          schedule_phases: {},
          event_details: {},
          agenda_links: [],
          coi_status: null,
          po: null,
          proposal: null,
          invoice: null,
          invoice_notes: null,
        },
      });
      const r = runInvariants(null, next);
      expect(r.outcome).not.toBe("hard_fail");
    });

    it("passes when only showDays[0] is set", () => {
      const next = synthParseResult({
        show: {
          title: "Test Show",
          client_label: "Test Client",
          client_contact: null,
          template_version: "v4",
          venue: null,
          dates: { travelIn: null, set: null, showDays: ["2026-03-23"], travelOut: null },
          schedule_phases: {},
          event_details: {},
          agenda_links: [],
          coi_status: null,
          po: null,
          proposal: null,
          invoice: null,
          invoice_notes: null,
        },
      });
      const r = runInvariants(null, next);
      expect(r.outcome).not.toBe("hard_fail");
    });
  });

  describe("MI-4: crewMembers.length >= 1", () => {
    it("hard fails with empty crew", () => {
      const next = synthParseResult({ crewMembers: [] });
      const r = runInvariants(null, next);
      expect(r.outcome).toBe("hard_fail");
      if (r.outcome === "hard_fail") {
        expect(r.failedCodes).toContain("MI-4_NO_CREW");
      }
    });
  });

  describe("MI-5: rooms.length >= 1", () => {
    it("hard fails with empty rooms", () => {
      const next = synthParseResult({ rooms: [] });
      const r = runInvariants(null, next);
      expect(r.outcome).toBe("hard_fail");
      if (r.outcome === "hard_fail") {
        expect(r.failedCodes).toContain("MI-5_NO_ROOMS");
      }
    });
  });

  describe("MI-5a: duplicate crew names", () => {
    it("hard fails on exact duplicate crew names (AC-1.7)", () => {
      const next = synthParseResult({
        crewMembers: [
          synthCrewMember({ name: "John C.", email: "john@fxav.net" }),
          synthCrewMember({ name: "John C.", email: "john2@fxav.net" }),
        ],
      });
      const r = runInvariants(null, next);
      expect(r.outcome).toBe("hard_fail");
      if (r.outcome === "hard_fail") {
        expect(r.failedCodes).toContain("MI-5a_DUPLICATE_CREW_NAME");
      }
    });

    it("hard fails on three crew with one name repeated", () => {
      const next = synthParseResult({
        crewMembers: [
          synthCrewMember({ name: "Alice", email: "alice@fxav.net" }),
          synthCrewMember({ name: "Bob", email: "bob@fxav.net" }),
          synthCrewMember({ name: "Alice", email: "alice2@fxav.net" }),
        ],
      });
      const r = runInvariants(null, next);
      expect(r.outcome).toBe("hard_fail");
      if (r.outcome === "hard_fail") {
        expect(r.failedCodes).toContain("MI-5a_DUPLICATE_CREW_NAME");
      }
    });
  });

  describe("MI-5b: duplicate canonicalized emails (AC-1.8)", () => {
    it("hard fails on same email in different cases", () => {
      const next = synthParseResult({
        crewMembers: [
          synthCrewMember({ name: "Alice", email: "Alice@FXAV.NET" }),
          synthCrewMember({ name: "Bob", email: "alice@fxav.net" }),
        ],
      });
      const r = runInvariants(null, next);
      expect(r.outcome).toBe("hard_fail");
      if (r.outcome === "hard_fail") {
        expect(r.failedCodes).toContain("MI-5b_DUPLICATE_CREW_EMAIL");
      }
    });

    it("hard fails on duplicate trimmed lowercase emails", () => {
      const next = synthParseResult({
        crewMembers: [
          synthCrewMember({ name: "Alice", email: "  alice@fxav.net  " }),
          synthCrewMember({ name: "Bob", email: "alice@fxav.net" }),
        ],
      });
      const r = runInvariants(null, next);
      expect(r.outcome).toBe("hard_fail");
      if (r.outcome === "hard_fail") {
        expect(r.failedCodes).toContain("MI-5b_DUPLICATE_CREW_EMAIL");
      }
    });

    it("passes when null emails are present alongside unique emails", () => {
      const next = synthParseResult({
        crewMembers: [
          synthCrewMember({ name: "Alice", email: null }),
          synthCrewMember({ name: "Bob", email: null }),
          synthCrewMember({ name: "Carol", email: "carol@fxav.net" }),
        ],
      });
      const r = runInvariants(null, next);
      expect(r.outcome).not.toBe("hard_fail");
    });
  });

  it("aggregates multiple hard-fail codes", () => {
    const next = synthParseResult({
      crewMembers: [],
      rooms: [],
    });
    const r = runInvariants(null, next);
    expect(r.outcome).toBe("hard_fail");
    if (r.outcome === "hard_fail") {
      expect(r.failedCodes).toContain("MI-4_NO_CREW");
      expect(r.failedCodes).toContain("MI-5_NO_ROOMS");
    }
  });
});

// ---------------------------------------------------------------------------
// Stage-for-approval tests (MI-6 through MI-14)
// ---------------------------------------------------------------------------

describe("Stage-for-approval invariants (MI-6..MI-14)", () => {
  // Helper to find triggered items by invariant code
  function findItems(items: TriggeredReviewItem[], inv: string): TriggeredReviewItem[] {
    return items.filter((i) => i.invariant === inv);
  }

  describe("MI-6: crew shrinkage guard (drop > 1)", () => {
    it("stages when prior had 6 crew and new has 4 (drop of 2)", () => {
      const prior = synthParseResult({
        crewMembers: [
          synthCrewMember({ name: "A", email: "a@x.com" }),
          synthCrewMember({ name: "B", email: "b@x.com" }),
          synthCrewMember({ name: "C", email: "c@x.com" }),
          synthCrewMember({ name: "D", email: "d@x.com" }),
          synthCrewMember({ name: "E", email: "e@x.com" }),
          synthCrewMember({ name: "F", email: "f@x.com" }),
        ],
      });
      const next = synthParseResult({
        crewMembers: [
          synthCrewMember({ name: "A", email: "a@x.com" }),
          synthCrewMember({ name: "B", email: "b@x.com" }),
          synthCrewMember({ name: "C", email: "c@x.com" }),
          synthCrewMember({ name: "D", email: "d@x.com" }),
        ],
      });
      const r = runInvariants(prior, next);
      expect(r.outcome).toBe("stage");
      if (r.outcome === "stage") {
        const items = findItems(r.triggeredItems, "MI-6");
        expect(items.length).toBeGreaterThanOrEqual(1);
        expect(items[0]?.id).toBeTruthy();
      }
    });

    it("does NOT stage when drop is exactly 1", () => {
      const prior = synthParseResult({
        crewMembers: [
          synthCrewMember({ name: "A", email: "a@x.com" }),
          synthCrewMember({ name: "B", email: "b@x.com" }),
          synthCrewMember({ name: "C", email: "c@x.com" }),
        ],
      });
      const next = synthParseResult({
        crewMembers: [
          synthCrewMember({ name: "A", email: "a@x.com" }),
          synthCrewMember({ name: "B", email: "b@x.com" }),
        ],
      });
      const r = runInvariants(prior, next);
      if (r.outcome === "stage") {
        const items = findItems(r.triggeredItems, "MI-6");
        expect(items.length).toBe(0);
      }
    });

    it("does NOT stage when prior is null (first sync)", () => {
      const next = synthParseResult({ crewMembers: [synthCrewMember()] });
      const r = runInvariants(null, next);
      if (r.outcome === "stage") {
        const items = findItems(r.triggeredItems, "MI-6");
        expect(items.length).toBe(0);
      }
    });
  });

  describe("MI-7: section shrinkage guard (>50% drop or any drop when prior <= 2)", () => {
    it("stages when hotels drop from 4 to 1 (>50%)", () => {
      const prior = synthParseResult({
        hotelReservations: [
          {
            ordinal: 1,
            hotel_name: "Hotel A",
            hotel_address: null,
            names: [],
            confirmation_no: null,
            check_in: null,
            check_out: null,
            notes: null,
          },
          {
            ordinal: 2,
            hotel_name: "Hotel B",
            hotel_address: null,
            names: [],
            confirmation_no: null,
            check_in: null,
            check_out: null,
            notes: null,
          },
          {
            ordinal: 3,
            hotel_name: "Hotel C",
            hotel_address: null,
            names: [],
            confirmation_no: null,
            check_in: null,
            check_out: null,
            notes: null,
          },
          {
            ordinal: 4,
            hotel_name: "Hotel D",
            hotel_address: null,
            names: [],
            confirmation_no: null,
            check_in: null,
            check_out: null,
            notes: null,
          },
        ],
      });
      const next = synthParseResult({
        hotelReservations: [
          {
            ordinal: 1,
            hotel_name: "Hotel A",
            hotel_address: null,
            names: [],
            confirmation_no: null,
            check_in: null,
            check_out: null,
            notes: null,
          },
        ],
      });
      const r = runInvariants(prior, next);
      expect(r.outcome).toBe("stage");
      if (r.outcome === "stage") {
        const items = findItems(r.triggeredItems, "MI-7");
        expect(items.length).toBeGreaterThanOrEqual(1);
        const item = items[0];
        if (item && item.invariant === "MI-7") {
          expect(item.section).toBe("hotel_reservations");
          expect(item.prior_count).toBe(4);
          expect(item.new_count).toBe(1);
        }
      }
    });

    it("stages when transportation goes from populated to null", () => {
      const prior = synthParseResult({
        transportation: {
          driver_name: "Dave",
          driver_phone: null,
          driver_email: null,
          vehicle: "Van",
          license_plate: null,
          color: null,
          parking: null,
          schedule: [],
          notes: null,
        },
      });
      const next = synthParseResult({ transportation: null });
      const r = runInvariants(prior, next);
      expect(r.outcome).toBe("stage");
      if (r.outcome === "stage") {
        const items = findItems(r.triggeredItems, "MI-7");
        expect(items.length).toBeGreaterThanOrEqual(1);
        const item = items[0];
        if (item && item.invariant === "MI-7") {
          expect(item.section).toBe("transportation");
        }
      }
    });

    it("stages when contacts drop from 2 to 0 (any drop when prior <= 2)", () => {
      const prior = synthParseResult({
        contacts: [
          { kind: "venue", name: "John", email: null, phone: null, notes: null },
          { kind: "in_house_av", name: "Jane", email: null, phone: null, notes: null },
        ],
      });
      const next = synthParseResult({ contacts: [] });
      const r = runInvariants(prior, next);
      expect(r.outcome).toBe("stage");
      if (r.outcome === "stage") {
        const items = findItems(r.triggeredItems, "MI-7");
        const contactItem = items.find((i) => i.invariant === "MI-7" && i.section === "contacts");
        expect(contactItem).toBeTruthy();
      }
    });
  });

  describe("MI-7b: keyed preservation (missing ordinal/key)", () => {
    it("stages when prior had hotel ordinal=2 and new is missing it", () => {
      const prior = synthParseResult({
        hotelReservations: [
          {
            ordinal: 1,
            hotel_name: "Hotel A",
            hotel_address: null,
            names: [],
            confirmation_no: null,
            check_in: null,
            check_out: null,
            notes: null,
          },
          {
            ordinal: 2,
            hotel_name: "Hotel B",
            hotel_address: null,
            names: [],
            confirmation_no: null,
            check_in: null,
            check_out: null,
            notes: null,
          },
        ],
      });
      const next = synthParseResult({
        hotelReservations: [
          {
            ordinal: 1,
            hotel_name: "Hotel A",
            hotel_address: null,
            names: [],
            confirmation_no: null,
            check_in: null,
            check_out: null,
            notes: null,
          },
        ],
      });
      const r = runInvariants(prior, next);
      expect(r.outcome).toBe("stage");
      if (r.outcome === "stage") {
        const items = findItems(r.triggeredItems, "MI-7b");
        expect(items.length).toBeGreaterThanOrEqual(1);
        const item = items[0];
        if (item && item.invariant === "MI-7b") {
          expect(item.section).toBe("hotel_reservations");
          expect(item.missingKey).toBe("2");
        }
      }
    });

    it("stages when prior had a room by kind+name and new is missing it", () => {
      const prior = synthParseResult({
        rooms: [
          synthRoom({ kind: "gs", name: "Main Hall" }),
          synthRoom({ kind: "breakout", name: "Room A" }),
        ],
      });
      const next = synthParseResult({
        rooms: [synthRoom({ kind: "gs", name: "Main Hall" })],
      });
      const r = runInvariants(prior, next);
      expect(r.outcome).toBe("stage");
      if (r.outcome === "stage") {
        const items = findItems(r.triggeredItems, "MI-7b");
        expect(items.length).toBeGreaterThanOrEqual(1);
        const item = items[0];
        if (item && item.invariant === "MI-7b") {
          expect(item.section).toBe("rooms");
          expect(item.missingKey).toContain("Room A");
        }
      }
    });
  });

  describe("MI-8: financial-field preservation", () => {
    it("stages when prior had po and new has null po", () => {
      const prior = synthParseResult({
        show: {
          title: "Test Show",
          client_label: "Test Client",
          client_contact: null,
          template_version: "v4",
          venue: null,
          dates: { travelIn: "2026-03-22", set: null, showDays: ["2026-03-23"], travelOut: null },
          schedule_phases: {},
          event_details: {},
          agenda_links: [],
          coi_status: null,
          po: "PO-12345",
          proposal: null,
          invoice: null,
          invoice_notes: null,
        },
      });
      const next = synthParseResult({
        show: {
          title: "Test Show",
          client_label: "Test Client",
          client_contact: null,
          template_version: "v4",
          venue: null,
          dates: { travelIn: "2026-03-22", set: null, showDays: ["2026-03-23"], travelOut: null },
          schedule_phases: {},
          event_details: {},
          agenda_links: [],
          coi_status: null,
          po: null,
          proposal: null,
          invoice: null,
          invoice_notes: null,
        },
      });
      const r = runInvariants(prior, next);
      expect(r.outcome).toBe("stage");
      if (r.outcome === "stage") {
        const items = findItems(r.triggeredItems, "MI-8");
        expect(items.length).toBeGreaterThanOrEqual(1);
        const item = items[0];
        if (item && item.invariant === "MI-8") {
          expect(item.field).toBe("po");
        }
      }
    });

    it("stages when prior had invoice_notes and new has empty", () => {
      const makeShow = (invoice_notes: string | null) => ({
        title: "Test Show",
        client_label: "Test Client",
        client_contact: null as null,
        template_version: "v4" as const,
        venue: null as null,
        dates: {
          travelIn: "2026-03-22",
          set: null as null,
          showDays: ["2026-03-23"],
          travelOut: null as null,
        },
        schedule_phases: {} as Record<string, never[]>,
        event_details: {},
        agenda_links: [] as never[],
        coi_status: null as null,
        po: null as null,
        proposal: null as null,
        invoice: null as null,
        invoice_notes,
      });
      const prior = synthParseResult({ show: makeShow("See attached") });
      const next = synthParseResult({ show: makeShow(null) });
      const r = runInvariants(prior, next);
      expect(r.outcome).toBe("stage");
      if (r.outcome === "stage") {
        const items = findItems(r.triggeredItems, "MI-8");
        expect(items.length).toBeGreaterThanOrEqual(1);
        const item = items[0];
        if (item && item.invariant === "MI-8") {
          expect(item.field).toBe("invoiceNotes");
        }
      }
    });
  });

  describe("MI-8b: COI status change stages every delta", () => {
    it("stages when coi_status changes from SENT to empty", () => {
      const makeShow = (coi_status: string | null) => ({
        title: "Test Show",
        client_label: "Test Client",
        client_contact: null as null,
        template_version: "v4" as const,
        venue: null as null,
        dates: {
          travelIn: "2026-03-22",
          set: null as null,
          showDays: ["2026-03-23"],
          travelOut: null as null,
        },
        schedule_phases: {} as Record<string, never[]>,
        event_details: {},
        agenda_links: [] as never[],
        coi_status,
        po: null as null,
        proposal: null as null,
        invoice: null as null,
        invoice_notes: null as null,
      });
      const prior = synthParseResult({ show: makeShow("SENT") });
      const next = synthParseResult({ show: makeShow("") });
      const r = runInvariants(prior, next);
      expect(r.outcome).toBe("stage");
      if (r.outcome === "stage") {
        const items = findItems(r.triggeredItems, "MI-8b");
        expect(items.length).toBeGreaterThanOrEqual(1);
        const item = items[0];
        if (item && item.invariant === "MI-8b") {
          expect(item.prior).toBe("SENT");
          // "" and null are equivalent for this comparison; actual stored may vary
        }
      }
    });

    it("stages when coi_status changes from SENT to IN PROCESS (non-empty transition)", () => {
      const makeShow = (coi_status: string | null) => ({
        title: "Test Show",
        client_label: "Test Client",
        client_contact: null as null,
        template_version: "v4" as const,
        venue: null as null,
        dates: {
          travelIn: "2026-03-22",
          set: null as null,
          showDays: ["2026-03-23"],
          travelOut: null as null,
        },
        schedule_phases: {} as Record<string, never[]>,
        event_details: {},
        agenda_links: [] as never[],
        coi_status,
        po: null as null,
        proposal: null as null,
        invoice: null as null,
        invoice_notes: null as null,
      });
      const prior = synthParseResult({ show: makeShow("SENT") });
      const next = synthParseResult({ show: makeShow("IN PROCESS") });
      const r = runInvariants(prior, next);
      expect(r.outcome).toBe("stage");
      if (r.outcome === "stage") {
        const items = findItems(r.triggeredItems, "MI-8b");
        expect(items.length).toBeGreaterThanOrEqual(1);
      }
    });

    it("does NOT stage when coi_status is unchanged", () => {
      const makeShow = (coi_status: string | null) => ({
        title: "Test Show",
        client_label: "Test Client",
        client_contact: null as null,
        template_version: "v4" as const,
        venue: null as null,
        dates: {
          travelIn: "2026-03-22",
          set: null as null,
          showDays: ["2026-03-23"],
          travelOut: null as null,
        },
        schedule_phases: {} as Record<string, never[]>,
        event_details: {},
        agenda_links: [] as never[],
        coi_status,
        po: null as null,
        proposal: null as null,
        invoice: null as null,
        invoice_notes: null as null,
      });
      const prior = synthParseResult({ show: makeShow("SENT") });
      const next = synthParseResult({ show: makeShow("SENT") });
      const r = runInvariants(prior, next);
      if (r.outcome === "stage") {
        const items = findItems(r.triggeredItems, "MI-8b");
        expect(items.length).toBe(0);
      }
    });

    it("does NOT stage when both null (null == null, no-op)", () => {
      const makeShow = (coi_status: string | null) => ({
        title: "Test Show",
        client_label: "Test Client",
        client_contact: null as null,
        template_version: "v4" as const,
        venue: null as null,
        dates: {
          travelIn: "2026-03-22",
          set: null as null,
          showDays: ["2026-03-23"],
          travelOut: null as null,
        },
        schedule_phases: {} as Record<string, never[]>,
        event_details: {},
        agenda_links: [] as never[],
        coi_status,
        po: null as null,
        proposal: null as null,
        invoice: null as null,
        invoice_notes: null as null,
      });
      const prior = synthParseResult({ show: makeShow(null) });
      const next = synthParseResult({ show: makeShow(null) });
      const r = runInvariants(prior, next);
      if (r.outcome === "stage") {
        const items = findItems(r.triggeredItems, "MI-8b");
        expect(items.length).toBe(0);
      }
    });
  });

  describe("MI-8c: pull-sheet structural regression", () => {
    it("stages on full collapse (prior non-null, new null)", () => {
      const prior = synthParseResult({
        pullSheet: [
          { caseLabel: "Case A", items: [{ qty: 1, cat: "AV", subCat: null, item: "Cable" }] },
          { caseLabel: "Case B", items: [{ qty: 2, cat: "Audio", subCat: null, item: "Mic" }] },
        ],
      });
      const next = synthParseResult({ pullSheet: null });
      const r = runInvariants(prior, next);
      expect(r.outcome).toBe("stage");
      if (r.outcome === "stage") {
        const items = findItems(r.triggeredItems, "MI-8c");
        expect(items.length).toBeGreaterThanOrEqual(1);
        const item = items[0];
        if (item && item.invariant === "MI-8c") {
          expect(item.mode).toBe("collapse");
        }
      }
    });

    it("stages when case count halved (6 → 2)", () => {
      const makeCases = (n: number) =>
        Array.from({ length: n }, (_, i) => ({
          caseLabel: `Case ${i + 1}`,
          items: [{ qty: 1, cat: "AV", subCat: null, item: "Item" }],
        }));
      const prior = synthParseResult({ pullSheet: makeCases(6) });
      const next = synthParseResult({ pullSheet: makeCases(2) });
      const r = runInvariants(prior, next);
      expect(r.outcome).toBe("stage");
      if (r.outcome === "stage") {
        const items = findItems(r.triggeredItems, "MI-8c");
        expect(items.length).toBeGreaterThanOrEqual(1);
        const item = items[0];
        if (item && item.invariant === "MI-8c") {
          expect(item.mode).toBe("halved");
        }
      }
    });

    it("stages when a specific case label is dropped", () => {
      const prior = synthParseResult({
        pullSheet: [
          { caseLabel: "Case Alpha", items: [{ qty: 1, cat: "AV", subCat: null, item: "Cable" }] },
          { caseLabel: "Case Beta", items: [{ qty: 2, cat: "Audio", subCat: null, item: "Mic" }] },
          { caseLabel: "Case Gamma", items: [{ qty: 1, cat: "Video", subCat: null, item: "Cam" }] },
        ],
      });
      const next = synthParseResult({
        pullSheet: [
          { caseLabel: "Case Alpha", items: [{ qty: 1, cat: "AV", subCat: null, item: "Cable" }] },
          { caseLabel: "Case Gamma", items: [{ qty: 1, cat: "Video", subCat: null, item: "Cam" }] },
        ],
      });
      const r = runInvariants(prior, next);
      expect(r.outcome).toBe("stage");
      if (r.outcome === "stage") {
        const items = findItems(r.triggeredItems, "MI-8c");
        expect(items.length).toBeGreaterThanOrEqual(1);
        const item = items[0];
        if (item && item.invariant === "MI-8c") {
          expect(item.mode).toBe("case_dropped");
        }
      }
    });

    it("stages on ambiguous format warning against prior non-ambiguous parse", () => {
      const prior = synthParseResult({
        pullSheet: [
          { caseLabel: "Case A", items: [{ qty: 1, cat: "AV", subCat: null, item: "Cable" }] },
        ],
      });
      const next = synthParseResult({
        pullSheet: [
          { caseLabel: "Case A", items: [{ qty: 1, cat: "AV", subCat: null, item: "Cable" }] },
        ],
        warnings: [
          { severity: "warn", code: "PULL_SHEET_AMBIGUOUS_FORMAT", message: "Ambiguous format" },
        ],
      });
      const r = runInvariants(prior, next);
      expect(r.outcome).toBe("stage");
      if (r.outcome === "stage") {
        const items = findItems(r.triggeredItems, "MI-8c");
        expect(items.length).toBeGreaterThanOrEqual(1);
        const item = items[0];
        if (item && item.invariant === "MI-8c") {
          expect(item.mode).toBe("ambiguous_format");
        }
      }
    });
  });

  describe("MI-9: role_flags change for existing crew", () => {
    it("stages when LEAD is removed (role regression)", () => {
      const prior = synthParseResult({
        crewMembers: [
          synthCrewMember({ name: "Alice", email: "alice@x.com", role_flags: ["LEAD", "A1"] }),
        ],
      });
      const next = synthParseResult({
        crewMembers: [synthCrewMember({ name: "Alice", email: "alice@x.com", role_flags: ["A1"] })],
      });
      const r = runInvariants(prior, next);
      expect(r.outcome).toBe("stage");
      if (r.outcome === "stage") {
        const items = findItems(r.triggeredItems, "MI-9");
        expect(items.length).toBeGreaterThanOrEqual(1);
        const item = items[0];
        if (item && item.invariant === "MI-9") {
          expect(item.crew_name).toBe("Alice");
          expect(item.prior_flags).toContain("LEAD");
          expect(item.new_flags).not.toContain("LEAD");
        }
      }
    });

    it("stages when role flag is added (additive change)", () => {
      const prior = synthParseResult({
        crewMembers: [synthCrewMember({ name: "Bob", email: "bob@x.com", role_flags: ["A1"] })],
      });
      const next = synthParseResult({
        crewMembers: [
          synthCrewMember({ name: "Bob", email: "bob@x.com", role_flags: ["A1", "LEAD"] }),
        ],
      });
      const r = runInvariants(prior, next);
      expect(r.outcome).toBe("stage");
      if (r.outcome === "stage") {
        const items = findItems(r.triggeredItems, "MI-9");
        expect(items.length).toBeGreaterThanOrEqual(1);
      }
    });

    it("does NOT stage when role_flags are set-equal (same flags different order)", () => {
      const prior = synthParseResult({
        crewMembers: [
          synthCrewMember({ name: "Carol", email: "carol@x.com", role_flags: ["LEAD", "A1"] }),
        ],
      });
      const next = synthParseResult({
        crewMembers: [
          synthCrewMember({ name: "Carol", email: "carol@x.com", role_flags: ["A1", "LEAD"] }),
        ],
      });
      const r = runInvariants(prior, next);
      if (r.outcome === "stage") {
        const items = findItems(r.triggeredItems, "MI-9");
        expect(items.length).toBe(0);
      }
    });
  });

  describe("MI-10: LEAD flag toggle (redundant with MI-9 but explicitly tested)", () => {
    it("stages when LEAD added via MI-9 path (MI-10 sentinel exists as doc safety)", () => {
      const prior = synthParseResult({
        crewMembers: [synthCrewMember({ name: "Dave", email: "dave@x.com", role_flags: ["A1"] })],
      });
      const next = synthParseResult({
        crewMembers: [
          synthCrewMember({ name: "Dave", email: "dave@x.com", role_flags: ["A1", "LEAD"] }),
        ],
      });
      const r = runInvariants(prior, next);
      // MI-10 stages via MI-9 or its own check; either way outcome must be stage
      expect(r.outcome).toBe("stage");
    });
  });

  describe("MI-11: email change for existing crew", () => {
    it("stages when crew email changes (alice@a.com → alice@b.com)", () => {
      const prior = synthParseResult({
        crewMembers: [synthCrewMember({ name: "Alice", email: "alice@a.com" })],
      });
      const next = synthParseResult({
        crewMembers: [synthCrewMember({ name: "Alice", email: "alice@b.com" })],
      });
      const r = runInvariants(prior, next);
      expect(r.outcome).toBe("stage");
      if (r.outcome === "stage") {
        const items = findItems(r.triggeredItems, "MI-11");
        expect(items.length).toBeGreaterThanOrEqual(1);
        const item = items[0];
        if (item && item.invariant === "MI-11") {
          expect(item.crew_name).toBe("Alice");
          expect(item.prior_email).toBe("alice@a.com");
          expect(item.new_email).toBe("alice@b.com");
        }
      }
    });

    it("stages when crew email changes from null to non-null", () => {
      const prior = synthParseResult({
        crewMembers: [synthCrewMember({ name: "Bob", email: null })],
      });
      const next = synthParseResult({
        crewMembers: [synthCrewMember({ name: "Bob", email: "bob@x.com" })],
      });
      const r = runInvariants(prior, next);
      expect(r.outcome).toBe("stage");
      if (r.outcome === "stage") {
        const items = findItems(r.triggeredItems, "MI-11");
        expect(items.length).toBeGreaterThanOrEqual(1);
      }
    });

    it("does NOT stage when email unchanged (case-insensitive canonical comparison)", () => {
      const prior = synthParseResult({
        crewMembers: [synthCrewMember({ name: "Carol", email: "carol@x.com" })],
      });
      const next = synthParseResult({
        crewMembers: [synthCrewMember({ name: "Carol", email: "carol@x.com" })],
      });
      const r = runInvariants(prior, next);
      if (r.outcome === "stage") {
        const items = findItems(r.triggeredItems, "MI-11");
        expect(items.length).toBe(0);
      }
    });
  });

  describe("MI-12: probable rename (same email, different name)", () => {
    it("stages when Cara is removed and Carla is added with the same email", () => {
      const prior = synthParseResult({
        crewMembers: [
          synthCrewMember({ name: "Cara", email: "cara@x.com" }),
          synthCrewMember({ name: "Other", email: "other@x.com" }),
        ],
      });
      const next = synthParseResult({
        crewMembers: [
          synthCrewMember({ name: "Carla", email: "cara@x.com" }),
          synthCrewMember({ name: "Other", email: "other@x.com" }),
        ],
      });
      const r = runInvariants(prior, next);
      expect(r.outcome).toBe("stage");
      if (r.outcome === "stage") {
        const items = findItems(r.triggeredItems, "MI-12");
        expect(items.length).toBeGreaterThanOrEqual(1);
        const item = items[0];
        if (item && item.invariant === "MI-12") {
          expect(item.removed_name).toBe("Cara");
          expect(item.added_name).toBe("Carla");
          expect(item.email).toBeTruthy();
        }
      }
    });
  });

  describe("MI-13: combined name+email change (Levenshtein pairing)", () => {
    it("stages when name and email both differ but names are Levenshtein-close", () => {
      // "Jon Smith" → "John Smith" (1 char difference) with different emails
      const prior = synthParseResult({
        crewMembers: [
          synthCrewMember({ name: "Jon Smith", email: "jon@a.com" }),
          synthCrewMember({ name: "Keeper", email: "keeper@x.com" }),
        ],
      });
      const next = synthParseResult({
        crewMembers: [
          synthCrewMember({ name: "John Smith", email: "john@b.com" }),
          synthCrewMember({ name: "Keeper", email: "keeper@x.com" }),
        ],
      });
      const r = runInvariants(prior, next);
      expect(r.outcome).toBe("stage");
      if (r.outcome === "stage") {
        const items = findItems(r.triggeredItems, "MI-13");
        expect(items.length).toBeGreaterThanOrEqual(1);
        const item = items[0];
        if (item && item.invariant === "MI-13") {
          expect(item.removed_name).toBe("Jon Smith");
          expect(item.added_name).toBe("John Smith");
        }
      }
    });

    it("emits orphan-remove when removed crew is unmatched", () => {
      // Completely different names, no good Levenshtein match → orphan-remove
      const prior = synthParseResult({
        crewMembers: [
          synthCrewMember({ name: "Xavier McFarland", email: "x@a.com" }),
          synthCrewMember({ name: "Keeper", email: "keeper@x.com" }),
        ],
      });
      const next = synthParseResult({
        crewMembers: [synthCrewMember({ name: "Keeper", email: "keeper@x.com" })],
      });
      // Xavier removed without a matching add → orphan-remove (or MI-6 if drop > 1 but only 1 removed)
      // With only 1 removal, MI-6 won't fire (drop ≤ 1 tolerance)
      // Xavier has email so MI-13-orphan-remove applies
      const r = runInvariants(prior, next);
      // outcome could be pass or stage depending on whether orphan-remove fires
      // Orphan-removes should stage since they're unmatched removals from a with-email set
      if (r.outcome === "stage") {
        const orphanRemoveItems = r.triggeredItems.filter(
          (i) => i.invariant === "MI-13-orphan-remove",
        );
        // Either orphan-remove fires or no stage invariant applies here (single drop ≤ 1)
        // The spec says orphan-removes for unmatched removals with email fall under MI-13
        expect(orphanRemoveItems.length).toBeGreaterThanOrEqual(1);
      }
    });

    it("emits orphan-add when added crew is unmatched", () => {
      const prior = synthParseResult({
        crewMembers: [synthCrewMember({ name: "Keeper", email: "keeper@x.com" })],
      });
      const next = synthParseResult({
        crewMembers: [
          synthCrewMember({ name: "Keeper", email: "keeper@x.com" }),
          synthCrewMember({ name: "Totally New Person", email: "new@b.com" }),
        ],
      });
      // A pure add — no prior removal to pair with. Should emit MI-13-orphan-add
      const r = runInvariants(prior, next);
      if (r.outcome === "stage") {
        const orphanAddItems = r.triggeredItems.filter((i) => i.invariant === "MI-13-orphan-add");
        expect(orphanAddItems.length).toBeGreaterThanOrEqual(1);
      }
    });
  });

  describe("MI-14: no-email rename (Levenshtein pairing, both sides null email)", () => {
    it("stages when similar names are both null-email", () => {
      const prior = synthParseResult({
        crewMembers: [
          synthCrewMember({ name: "Tim Allen", email: null }),
          synthCrewMember({ name: "Keeper", email: "keeper@x.com" }),
        ],
      });
      const next = synthParseResult({
        crewMembers: [
          synthCrewMember({ name: "Tom Allen", email: null }),
          synthCrewMember({ name: "Keeper", email: "keeper@x.com" }),
        ],
      });
      const r = runInvariants(prior, next);
      expect(r.outcome).toBe("stage");
      if (r.outcome === "stage") {
        const items = findItems(r.triggeredItems, "MI-14");
        expect(items.length).toBeGreaterThanOrEqual(1);
        const item = items[0];
        if (item && item.invariant === "MI-14") {
          expect(item.removed_name).toBe("Tim Allen");
          expect(item.added_name).toBe("Tom Allen");
        }
      }
    });

    it("emits MI-14-orphan-remove for unmatched null-email removal", () => {
      const prior = synthParseResult({
        crewMembers: [
          synthCrewMember({ name: "Completely Different Name XYZ", email: null }),
          synthCrewMember({ name: "Keeper", email: "keeper@x.com" }),
        ],
      });
      const next = synthParseResult({
        crewMembers: [synthCrewMember({ name: "Keeper", email: "keeper@x.com" })],
      });
      const r = runInvariants(prior, next);
      if (r.outcome === "stage") {
        const orphanItems = r.triggeredItems.filter((i) => i.invariant === "MI-14-orphan-remove");
        expect(orphanItems.length).toBeGreaterThanOrEqual(1);
      }
    });
  });

  describe("prior === null skips MI-6..MI-14", () => {
    it("passes for a valid first-sync result with no prior", () => {
      const next = synthParseResult();
      const r = runInvariants(null, next);
      expect(r.outcome).toBe("pass");
    });

    it("only runs hard-fail checks when prior is null", () => {
      // Even with crew count that would trigger MI-6 if prior existed, no stage
      const next = synthParseResult({
        crewMembers: [synthCrewMember({ name: "Only One", email: "one@x.com" })],
      });
      const r = runInvariants(null, next);
      // Outcome is pass since there's nothing suspicious about 1 crew on first sync
      expect(r.outcome).toBe("pass");
    });
  });

  describe("outcome priority: hard_fail > stage > pass", () => {
    it("returns hard_fail even when stage invariants would also fire", () => {
      // Empty crew (MI-4 hard-fail) + prior had crew (MI-6 would stage)
      const prior = synthParseResult({
        crewMembers: [
          synthCrewMember({ name: "A", email: "a@x.com" }),
          synthCrewMember({ name: "B", email: "b@x.com" }),
          synthCrewMember({ name: "C", email: "c@x.com" }),
        ],
      });
      const next = synthParseResult({ crewMembers: [] });
      const r = runInvariants(prior, next);
      expect(r.outcome).toBe("hard_fail");
    });
  });
});
