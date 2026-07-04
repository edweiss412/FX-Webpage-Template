/**
 * tests/admin/step3SectionStatus.test.ts (Task 1 — spec §7)
 *
 * Unit tests for sectionForWarning() and deriveSectionStatuses().
 * Maps every ParseWarning blockRef.kind to its corresponding SectionId.
 * Pins the "no false clean" contract: unmapped warnings flag the "warnings" section.
 */
import { describe, expect, test } from "vitest";
import type { ParseWarning } from "@/lib/parser/types";
import { sectionForWarning, deriveSectionStatuses } from "@/lib/admin/step3SectionStatus";

// ── Test helpers ──
function warn(kind?: string, severity: "warn" | "info" = "warn"): ParseWarning {
  return {
    severity,
    code: "TEST_CODE",
    message: "Test warning",
    ...(kind && { blockRef: { kind } }),
  };
}

describe("sectionForWarning", () => {
  // Crew section: crew, travel, flights
  test("crew → crew", () => {
    expect(sectionForWarning(warn("crew"))).toBe("crew");
    expect(sectionForWarning(warn("travel"))).toBe("crew");
    expect(sectionForWarning(warn("flights"))).toBe("crew");
  });

  // Contacts section: contacts, client
  test("contacts/client → contacts", () => {
    expect(sectionForWarning(warn("contacts"))).toBe("contacts");
    expect(sectionForWarning(warn("client"))).toBe("contacts");
  });

  // Schedule section: schedule, dates, strike, loadout
  test("schedule/dates/strike/loadout → schedule", () => {
    expect(sectionForWarning(warn("schedule"))).toBe("schedule");
    expect(sectionForWarning(warn("dates"))).toBe("schedule");
    expect(sectionForWarning(warn("strike"))).toBe("schedule");
    expect(sectionForWarning(warn("loadout"))).toBe("schedule");
  });

  // Agenda section
  test("agenda → agenda", () => {
    expect(sectionForWarning(warn("agenda"))).toBe("agenda");
  });

  // Hotels section: hotels, hotel_reservations
  test("hotels/hotel_reservations → hotels", () => {
    expect(sectionForWarning(warn("hotels"))).toBe("hotels");
    expect(sectionForWarning(warn("hotel_reservations"))).toBe("hotels");
  });

  // Transport section
  test("transportation → transport", () => {
    expect(sectionForWarning(warn("transportation"))).toBe("transport");
  });

  // Rooms section: rooms, gear_scope
  test("rooms/gear_scope → rooms", () => {
    expect(sectionForWarning(warn("rooms"))).toBe("rooms");
    expect(sectionForWarning(warn("gear_scope"))).toBe("rooms");
  });

  // Packlist section: pull_sheet, gear_packlist
  test("pull_sheet/gear_packlist → packlist", () => {
    expect(sectionForWarning(warn("pull_sheet"))).toBe("packlist");
    expect(sectionForWarning(warn("gear_packlist"))).toBe("packlist");
  });

  // Venue section
  test("venue → venue", () => {
    expect(sectionForWarning(warn("venue"))).toBe("venue");
  });

  // Event section: details, event_details, dress
  test("details/event_details/dress → event", () => {
    expect(sectionForWarning(warn("details"))).toBe("event");
    expect(sectionForWarning(warn("event_details"))).toBe("event");
    expect(sectionForWarning(warn("dress"))).toBe("event");
  });

  // Billing section
  test("financials → billing", () => {
    expect(sectionForWarning(warn("financials"))).toBe("billing");
  });

  // Unmapped cases → null
  test("unknown_section → null", () => {
    expect(sectionForWarning(warn("unknown_section"))).toBeNull();
  });

  test("missing blockRef → null", () => {
    expect(sectionForWarning(warn())).toBeNull();
  });

  test("fabricated future kind → null", () => {
    expect(sectionForWarning(warn("zzz_future"))).toBeNull();
  });
});

describe("deriveSectionStatuses", () => {
  const renderedSections = new Set([
    "venue",
    "event",
    "crew",
    "contacts",
    "schedule",
    "agenda",
    "hotels",
    "transport",
    "rooms",
    "packlist",
    "billing",
  ] as const);

  test("warn-severity mapped warning + rendered section → flagged contains section only, count 1", () => {
    const warnings = [warn("crew", "warn")];
    const result = deriveSectionStatuses(warnings, renderedSections);
    expect(result.flagged).toEqual(new Set(["crew"]));
    expect(result.flaggedCount).toBe(1);
  });

  test("info-severity mapped warning → NOT flagged", () => {
    const warnings = [warn("crew", "info")];
    const result = deriveSectionStatuses(warnings, renderedSections);
    expect(result.flagged).toEqual(new Set());
    expect(result.flaggedCount).toBe(0);
  });

  test("agenda warn + renderedSections WITHOUT agenda → flagged = {warnings}, count 1", () => {
    const narrowSections = new Set([
      "venue",
      "event",
      "crew",
      "contacts",
      "schedule",
      "hotels",
      "transport",
      "rooms",
      "packlist",
      "billing",
    ] as const);
    const warnings = [warn("agenda", "warn")];
    const result = deriveSectionStatuses(warnings, narrowSections);
    expect(result.flagged).toEqual(new Set(["warnings"]));
    expect(result.flaggedCount).toBe(1);
  });

  test("warn-severity unmapped (unknown_section) → flagged = {warnings}, count 1", () => {
    const warnings = [warn("unknown_section", "warn")];
    const result = deriveSectionStatuses(warnings, renderedSections);
    expect(result.flagged).toEqual(new Set(["warnings"]));
    expect(result.flaggedCount).toBe(1);
  });

  test("warn mapped + warn unmapped → both content section and warnings flagged, count 2", () => {
    const warnings = [warn("crew", "warn"), warn("unknown_section", "warn")];
    const result = deriveSectionStatuses(warnings, renderedSections);
    expect(result.flagged).toEqual(new Set(["crew", "warnings"]));
    expect(result.flaggedCount).toBe(2);
  });

  test("info-only unmapped → flaggedCount = 0", () => {
    const warnings = [warn("unknown_section", "info")];
    const result = deriveSectionStatuses(warnings, renderedSections);
    expect(result.flagged).toEqual(new Set());
    expect(result.flaggedCount).toBe(0);
  });

  test("empty warnings → empty set, count 0", () => {
    const warnings: ParseWarning[] = [];
    const result = deriveSectionStatuses(warnings, renderedSections);
    expect(result.flagged).toEqual(new Set());
    expect(result.flaggedCount).toBe(0);
  });

  test("multiple warn-severity mapped warnings → all sections flagged", () => {
    const warnings = [warn("crew", "warn"), warn("hotels", "warn"), warn("event_details", "warn")];
    const result = deriveSectionStatuses(warnings, renderedSections);
    expect(result.flagged).toEqual(new Set(["crew", "hotels", "event"]));
    expect(result.flaggedCount).toBe(3);
  });

  test("warn mapped to section not in renderedSections → flags warnings instead", () => {
    const narrowSections = new Set(["crew"] as const);
    const warnings = [warn("event", "warn")];
    const result = deriveSectionStatuses(warnings, narrowSections);
    expect(result.flagged).toEqual(new Set(["warnings"]));
    expect(result.flaggedCount).toBe(1);
  });
});
