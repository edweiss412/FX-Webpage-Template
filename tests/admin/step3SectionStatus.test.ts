/**
 * tests/admin/step3SectionStatus.test.ts (Task 1 — spec §7)
 *
 * Unit tests for sectionForWarning() and deriveSectionStatuses().
 * Maps every ParseWarning blockRef.kind to its corresponding SectionId.
 * Pins the "no false clean" contract: unmapped warnings flag the "warnings" section.
 */
import { describe, expect, test } from "vitest";
import type { ParseWarning } from "@/lib/parser/types";
import {
  sectionForWarning,
  deriveSectionStatuses,
  warningsBySection,
  SECTION_REGION_MAP,
  type SectionId,
} from "@/lib/admin/step3SectionStatus";
import { REGION_IDS } from "@/lib/sheet-links/buildSheetDeepLink";

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

describe("warningsBySection", () => {
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
    "diagrams",
    "packlist",
    "billing",
    "report",
  ] as const);

  test("index fidelity: indices are positions in the FULL input array, info rows included", () => {
    const warnings = [
      warn("crew", "info"),
      warn("crew", "warn"),
      warn("rooms", "info"),
      warn("unknown_section", "warn"),
    ];
    const map = warningsBySection(warnings, renderedSections);
    expect(map.get("crew")).toEqual([{ warning: warnings[1], index: 1 }]);
    expect(map.get("warnings")).toEqual([{ warning: warnings[3], index: 3 }]);
    // rooms only has an info-severity warning → no entry
    expect(map.has("rooms")).toBe(false);
  });

  test("mapped/unmapped/info rules mirror deriveSectionStatuses", () => {
    const warnings = [
      warn("crew", "warn"), // mapped + rendered → crew
      warn("agenda", "warn"), // mapped + rendered → agenda
      warn("unknown_section", "warn"), // unmapped → warnings
      warn("crew", "info"), // info → absent from every value list
    ];
    const map = warningsBySection(warnings, renderedSections);
    expect(map.get("crew")).toEqual([{ warning: warnings[0], index: 0 }]);
    expect(map.get("agenda")).toEqual([{ warning: warnings[1], index: 1 }]);
    expect(map.get("warnings")).toEqual([{ warning: warnings[2], index: 2 }]);
    // info-severity warning must not appear in ANY value list
    for (const list of map.values()) {
      expect(list.some((entry) => entry.warning === warnings[3])).toBe(false);
    }
  });

  test("mapped + NOT rendered → warnings bucket", () => {
    const narrowSections = new Set([
      "venue",
      "event",
      "crew",
      "contacts",
      "schedule",
      "hotels",
      "transport",
      "rooms",
      "diagrams",
      "packlist",
      "billing",
      "report",
    ] as const);
    const warnings = [warn("agenda", "warn")];
    const map = warningsBySection(warnings, narrowSections);
    expect(map.get("warnings")).toEqual([{ warning: warnings[0], index: 0 }]);
    expect(map.has("agenda")).toBe(false);
  });

  test("diagrams/report never flagged: fabricated kinds land in warnings bucket, never own key", () => {
    const warnings = [warn("diagrams", "warn"), warn("report", "warn")];
    const map = warningsBySection(warnings, renderedSections);
    expect(map.has("diagrams")).toBe(false);
    expect(map.has("report")).toBe(false);
    expect(map.get("warnings")).toEqual([
      { warning: warnings[0], index: 0 },
      { warning: warnings[1], index: 1 },
    ]);
  });

  const warningMixes: { name: string; warnings: ParseWarning[] }[] = [
    { name: "empty", warnings: [] },
    { name: "single mapped warn", warnings: [warn("crew", "warn")] },
    { name: "single unmapped warn", warnings: [warn("unknown_section", "warn")] },
    { name: "info only", warnings: [warn("crew", "info")] },
    {
      name: "mixed mapped + unmapped + info",
      warnings: [warn("crew", "warn"), warn("unknown_section", "warn"), warn("hotels", "info")],
    },
    {
      name: "multiple mapped, some unrendered",
      warnings: [warn("crew", "warn"), warn("agenda", "warn"), warn("financials", "warn")],
    },
    {
      name: "diagrams/report fabricated kinds",
      warnings: [warn("diagrams", "warn"), warn("report", "warn"), warn("crew", "warn")],
    },
  ];

  test.each(warningMixes)(
    "no-false-All-clean property: $name",
    ({ warnings }: { warnings: ParseWarning[] }) => {
      const map = warningsBySection(warnings, renderedSections);
      const hasWarnSeverity = warnings.some((w) => w.severity === "warn");
      const totalMapped = Array.from(map.values()).reduce((sum, list) => sum + list.length, 0);
      const status = deriveSectionStatuses(warnings, renderedSections);
      if (hasWarnSeverity) {
        expect(totalMapped).toBeGreaterThanOrEqual(1);
        expect(status.flaggedCount).toBeGreaterThanOrEqual(1);
      }
    },
  );

  test.each(warningMixes)(
    "derivation consistency: $name",
    ({ warnings }: { warnings: ParseWarning[] }) => {
      const map = warningsBySection(warnings, renderedSections);
      const status = deriveSectionStatuses(warnings, renderedSections);
      const mapKeys = new Set<SectionId>(map.keys());
      expect(status.flagged).toEqual(mapKeys);
      expect(status.flaggedCount).toBe(mapKeys.size);
    },
  );
});

describe("deriveSectionStatuses derives from warningsBySection", () => {
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
    "diagrams",
    "packlist",
    "billing",
    "report",
  ] as const);

  test("flagged set equals the key set of warningsBySection", () => {
    const warnings = [
      warn("crew", "warn"),
      warn("agenda", "warn"),
      warn("unknown_section", "warn"),
      warn("crew", "info"),
    ];
    const map = warningsBySection(warnings, renderedSections);
    const status = deriveSectionStatuses(warnings, renderedSections);
    expect(status.flagged).toEqual(new Set(map.keys()));
    expect(status.flaggedCount).toBe(map.size);
  });

  test("diagrams/report kinds never produce a flagged diagrams/report key", () => {
    const warnings = [warn("diagrams", "warn"), warn("report", "warn")];
    const status = deriveSectionStatuses(warnings, renderedSections);
    expect(status.flagged.has("diagrams" as SectionId)).toBe(false);
    expect(status.flagged.has("report" as SectionId)).toBe(false);
    expect(status.flagged).toEqual(new Set(["warnings"]));
  });
});

// Canonical list of every SectionId — kept in lockstep with the union at
// step3SectionStatus.ts:3. If a SectionId is added without a SECTION_REGION_MAP
// entry, the completeness assertion below fails.
const ALL_SECTION_IDS: SectionId[] = [
  "venue",
  "event",
  "crew",
  "contacts",
  "schedule",
  "agenda",
  "hotels",
  "transport",
  "rooms",
  "diagrams",
  "packlist",
  "billing",
  "warnings",
  "report",
];

describe("SECTION_REGION_MAP", () => {
  test("maps every SectionId member", () => {
    for (const id of ALL_SECTION_IDS) {
      expect(Object.prototype.hasOwnProperty.call(SECTION_REGION_MAP, id)).toBe(true);
    }
    // No stray keys beyond the 14 SectionId members.
    expect(Object.keys(SECTION_REGION_MAP).sort()).toEqual([...ALL_SECTION_IDS].sort());
  });

  test("every non-null target is a real RegionId", () => {
    const regions = new Set<string>(REGION_IDS);
    for (const [id, region] of Object.entries(SECTION_REGION_MAP)) {
      if (region !== null) {
        expect(regions.has(region), `${id} → ${region}`).toBe(true);
      }
    }
  });

  test("content sections resolve to their primary region", () => {
    expect(SECTION_REGION_MAP.crew).toBe("crew");
    expect(SECTION_REGION_MAP.event).toBe("details"); // primary region (dress is a shared sub-block)
    expect(SECTION_REGION_MAP.schedule).toBe("schedule");
    expect(SECTION_REGION_MAP.agenda).toBe("schedule");
    expect(SECTION_REGION_MAP.transport).toBe("transportation");
    expect(SECTION_REGION_MAP.billing).toBe("financials");
    expect(SECTION_REGION_MAP.packlist).toBe("gear_packlist");
    // Non-region sections fall back to whole-sheet.
    expect(SECTION_REGION_MAP.diagrams).toBeNull();
    expect(SECTION_REGION_MAP.warnings).toBeNull();
    expect(SECTION_REGION_MAP.report).toBeNull();
  });
});
