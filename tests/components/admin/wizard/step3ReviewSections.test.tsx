// @vitest-environment jsdom
/**
 * tests/components/admin/wizard/step3ReviewSections.test.tsx (Task 3 — spec §6.1/§8/§3.10)
 *
 * Pins the Step-3 review section REGISTRY (`step3Sections` + STEP3_SECTION_GROUPS),
 * the hardened warning-title derivation (`reviewWarningTitle`), and the restyled
 * section bodies moved out of Step3SheetCard.tsx.
 *
 * Concrete failure modes each block catches:
 *  - reviewWarningTitle matrix: a persisted warning whose `message` IS the raw
 *    code (`reelWarning`, lib/sync/phase2.ts) rendering a machine token in the
 *    UI (invariant 5). Each guard clause (contains-check, case-insensitivity,
 *    whitespace, token-shape regex) has a case that fails if the clause is
 *    dropped.
 *  - Registry: a future edit reordering/renaming sections, dropping the agenda
 *    conditional, or adding a rail count to a non-list section silently breaks
 *    the modal rail (Task 4 renders it verbatim from this registry).
 *  - Bodies: the crew restyle collapsing the 44x44 anchor to the 32px visual
 *    (border-box trap, spec §15), caps/empty-state copy drifting (existing
 *    suites pin them through the card; these pin them through `render(d)`).
 *
 * Anti-tautology: counts derive from the fixture's own array lengths; DOM
 * label scans are scoped `within(...)` the section's own testid container so a
 * sibling can never satisfy an assertion by accident.
 */
import { afterEach, describe, expect, test } from "vitest";
import { cleanup, render, within } from "@testing-library/react";
import { MESSAGE_CATALOG } from "@/lib/messages/catalog";
import { isMessageCode } from "@/lib/messages/lookup";
import type { CrewMemberRow, ParseResult, ParseWarning, PullSheetCase } from "@/lib/parser/types";
import {
  reviewWarningTitle,
  step3Sections,
  STEP3_SECTION_GROUPS,
  type SectionData,
  type Step3SectionDef,
} from "@/components/admin/wizard/step3ReviewSections";
import { buildParseResult, stagedRow } from "./_step3ReviewFixture";

// AgendaBreakdown (rendered by the agenda registry entry) calls fetch in an
// effect; no test here renders it, but the module graph pulls next/navigation
// via nothing — no router mock needed. Keep RTL clean between tests.
afterEach(() => cleanup());

const DFID = "drive-abc-123";
const WSID = "00000000-1111-4222-8333-444444444444";

const GENERIC_FALLBACK = "A parse issue was recorded for this sheet.";

function warning(overrides: Partial<ParseWarning> = {}): ParseWarning {
  return { severity: "warn", code: "SOME_CODE", message: "", ...overrides };
}

/** Assemble the registry's SectionData from the shared fixture builders. */
function sectionData(
  prOverrides: Partial<ParseResult> = {},
  dataOverrides: Partial<SectionData> = {},
): SectionData {
  const pr = buildParseResult(prOverrides);
  const row = stagedRow(pr);
  return {
    pr,
    row,
    dfid: DFID,
    wizardSessionId: WSID,
    crewMembers: pr.crewMembers,
    rooms: pr.rooms,
    hotels: pr.hotelReservations,
    pullSheet: pr.pullSheet ?? [],
    ros: pr.runOfShow ?? {},
    warnings: pr.warnings,
    agendaBaseline: [],
    ...dataOverrides,
  };
}

function defById(defs: Step3SectionDef[], id: string): Step3SectionDef {
  const def = defs.find((s) => s.id === id);
  if (!def) throw new Error(`registry has no section '${id}'`);
  return def;
}

function renderBody(d: SectionData, id: string) {
  const def = defById(step3Sections(d), id);
  return render(<>{def.render(d)}</>);
}

// ── reviewWarningTitle — hardening matrix (spec §8) ─────────────────────────

describe("reviewWarningTitle (spec §8 hardening matrix)", () => {
  // A real cataloged code with a non-null title, discovered from the live
  // catalog (never hardcoded — the catalog is the source of truth).
  const titled = Object.entries(MESSAGE_CATALOG).find(([, v]) => v.title != null)!;
  const titledCode = titled[0];
  const titledTitle = titled[1].title as string;

  test("cataloged code → the catalog title (message ignored)", () => {
    expect(isMessageCode(titledCode)).toBe(true);
    expect(reviewWarningTitle(warning({ code: titledCode, message: "RAW-SHOULD-NOT-SHOW" }))).toBe(
      titledTitle,
    );
  });

  test("uncataloged code whose message IS the raw code → generic fallback (reelWarning shape)", () => {
    // Guard the premise: OPENING_REEL_UNREADABLE must stay uncataloged for
    // this case to exercise the fallback path.
    expect(isMessageCode("OPENING_REEL_UNREADABLE")).toBe(false);
    expect(
      reviewWarningTitle(
        warning({ code: "OPENING_REEL_UNREADABLE", message: "OPENING_REEL_UNREADABLE" }),
      ),
    ).toBe(GENERIC_FALLBACK);
  });

  test("message embedding the code mid-sentence → generic fallback", () => {
    expect(
      reviewWarningTitle(
        warning({
          code: "OPENING_REEL_UNREADABLE",
          message: "The parser hit OPENING_REEL_UNREADABLE while reading the reel.",
        }),
      ),
    ).toBe(GENERIC_FALLBACK);
  });

  test("lowercase code variant as the message → generic fallback (case-insensitive contains)", () => {
    expect(
      reviewWarningTitle(
        warning({ code: "OPENING_REEL_UNREADABLE", message: "opening_reel_unreadable" }),
      ),
    ).toBe(GENERIC_FALLBACK);
  });

  test("whitespace-padded code as the message → generic fallback", () => {
    expect(
      reviewWarningTitle(
        warning({ code: "OPENING_REEL_UNREADABLE", message: "  OPENING_REEL_UNREADABLE  " }),
      ),
    ).toBe(GENERIC_FALLBACK);
  });

  test("machine-token-shaped message that is NOT the code → generic fallback (token-shape regex)", () => {
    expect(reviewWarningTitle(warning({ code: "FOO_BAR", message: "SOME_OTHER_TOKEN_9" }))).toBe(
      GENERIC_FALLBACK,
    );
  });

  test("legitimate human message for an uncataloged code passes through unchanged", () => {
    const msg = "Two flights could not be matched to crew";
    expect(reviewWarningTitle(warning({ code: "UNKNOWN_PARSER_WARNING_XYZ", message: msg }))).toBe(
      msg,
    );
  });

  test("empty / whitespace-only message → generic fallback", () => {
    expect(reviewWarningTitle(warning({ code: "UNKNOWN_XYZ", message: "" }))).toBe(
      GENERIC_FALLBACK,
    );
    expect(reviewWarningTitle(warning({ code: "UNKNOWN_XYZ", message: "   " }))).toBe(
      GENERIC_FALLBACK,
    );
  });
});

// ── Registry (spec §6.1) ────────────────────────────────────────────────────

describe("step3Sections registry (spec §6.1)", () => {
  const EXPECTED_NO_AGENDA = [
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
    "warnings",
  ];
  const EXPECTED_WITH_AGENDA = [
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
    "warnings",
  ];
  const LABELS: Record<string, string> = {
    venue: "Venue",
    event: "Event details",
    crew: "Crew",
    contacts: "Contacts",
    schedule: "Crew schedule",
    agenda: "Agenda",
    hotels: "Hotels",
    transport: "Transport",
    rooms: "Rooms & scope",
    packlist: "Pack list",
    billing: "Billing & docs",
    warnings: "Parse warnings",
  };
  const GROUPS: Record<string, string> = {
    venue: "The show",
    event: "The show",
    crew: "People",
    contacts: "People",
    schedule: "Schedule",
    agenda: "Schedule",
    hotels: "Logistics",
    transport: "Logistics",
    rooms: "Gear",
    packlist: "Gear",
    billing: "Money",
    warnings: "Checks",
  };
  const COUNTED = ["crew", "contacts", "schedule", "hotels", "rooms", "packlist", "warnings"];

  test("group list is exactly the §6.1 order", () => {
    expect([...STEP3_SECTION_GROUPS]).toEqual([
      "The show",
      "People",
      "Schedule",
      "Logistics",
      "Gear",
      "Money",
      "Checks",
    ]);
  });

  test("11 defs without an agenda baseline; 12 (agenda after schedule) with one", () => {
    const without = step3Sections(sectionData());
    expect(without.map((s) => s.id)).toEqual(EXPECTED_NO_AGENDA);

    const withAgenda = step3Sections(
      sectionData(
        {},
        {
          agendaBaseline: [{ label: "Agenda PDF", badge: null, href: null, block: null }],
        },
      ),
    );
    expect(withAgenda.map((s) => s.id)).toEqual(EXPECTED_WITH_AGENDA);
  });

  test("labels and groups are exact; every group value is a member of STEP3_SECTION_GROUPS", () => {
    const defs = step3Sections(
      sectionData(
        {},
        { agendaBaseline: [{ label: "Agenda PDF", badge: null, href: null, block: null }] },
      ),
    );
    for (const def of defs) {
      expect(def.label).toBe(LABELS[def.id]);
      expect(def.group).toBe(GROUPS[def.id]);
      expect(STEP3_SECTION_GROUPS).toContain(def.group);
      expect(typeof def.Icon).not.toBe("undefined");
    }
  });

  test("railCount is non-null exactly for the §6.1 counted subset, and derives from the data", () => {
    const d = sectionData();
    const defs = step3Sections(d);
    for (const def of defs) {
      if (COUNTED.includes(def.id)) {
        expect(def.railCount, `railCount for ${def.id}`).not.toBeNull();
      } else {
        expect(def.railCount, `railCount for ${def.id}`).toBeNull();
      }
    }
    // Values derive from the fixture's OWN dimensions (anti-tautology).
    expect(defById(defs, "crew").railCount!(d)).toBe(d.crewMembers.length);
    expect(defById(defs, "hotels").railCount!(d)).toBe(d.hotels.length);
    expect(defById(defs, "rooms").railCount!(d)).toBe(d.rooms.length);
    expect(defById(defs, "packlist").railCount!(d)).toBe(d.pullSheet.length);
    expect(defById(defs, "schedule").railCount!(d)).toBe(Object.keys(d.ros).length);
    expect(defById(defs, "warnings").railCount!(d)).toBe(d.warnings.length);
    // Contacts: block count as rendered today — fixture has no client contact
    // and no contacts → 0.
    expect(defById(defs, "contacts").railCount!(d)).toBe(0);
  });
});

// ── Crew body — §8 avatar rows + 44×44 anchor DOM ───────────────────────────

describe("crew body (spec §8 anchor DOM)", () => {
  function crewMember(overrides: Partial<CrewMemberRow> = {}): CrewMemberRow {
    return {
      name: "Doug Larson",
      email: null,
      phone: null,
      role: "Lead",
      role_flags: [],
      date_restriction: { kind: "none" },
      stage_restriction: { kind: "none" },
      flight_info: null,
      ...overrides,
    };
  }

  test("each crew row renders the Avatar atom; tel/mailto anchors present iff phone/email have content", () => {
    const members = [
      crewMember({ name: "Doug Larson", phone: "917-331-4885", email: "doug@fxav.com" }),
      crewMember({ name: "No Contact", phone: null, email: "   " }),
    ];
    const d = sectionData({ crewMembers: members });
    const q = renderBody(d, "crew");
    const region = within(q.getByTestId(`wizard-step3-card-${DFID}-breakdown-crew`));

    expect(region.getAllByTestId("avatar")).toHaveLength(members.length);

    const call = region.getByLabelText("Call Doug Larson") as HTMLAnchorElement;
    expect(call.tagName.toLowerCase()).toBe("a");
    expect(call.getAttribute("href")).toBe("tel:917-331-4885");
    // §15: the INTERACTIVE element itself carries the 44×44 border box.
    expect(call.className).toContain("size-tap-min");

    const email = region.getByLabelText("Email Doug Larson") as HTMLAnchorElement;
    expect(email.tagName.toLowerCase()).toBe("a");
    expect(email.getAttribute("href")).toBe("mailto:doug@fxav.com");
    expect(email.className).toContain("size-tap-min");

    // The second member has no usable phone/email → no action anchors.
    expect(region.queryByLabelText("Call No Contact")).toBeNull();
    expect(region.queryByLabelText("Email No Contact")).toBeNull();
    // Exactly one tel: and one mailto: anchor across the whole body.
    const anchors = q.container.querySelectorAll("a");
    expect(
      Array.from(anchors).filter((a) => (a.getAttribute("href") ?? "").startsWith("tel:")),
    ).toHaveLength(1);
    expect(
      Array.from(anchors).filter((a) => (a.getAttribute("href") ?? "").startsWith("mailto:")),
    ).toHaveLength(1);
  });

  test("crew cap: 31 members → 30 rendered + the existing overflow note", () => {
    const members = Array.from({ length: 31 }, (_, i) => crewMember({ name: `Member ${i + 1}` }));
    const d = sectionData({ crewMembers: members });
    const q = renderBody(d, "crew");
    const region = q.getByTestId(`wizard-step3-card-${DFID}-breakdown-crew`);
    expect(within(region).getAllByTestId("avatar")).toHaveLength(30);
    expect(region.textContent).toContain(`Member 30`);
    expect(region.textContent).not.toContain(`Member 31`);
    expect(region.textContent).toContain(`…and ${members.length - 30} more people`);
  });

  test("role + partial-attendance subline copy is preserved", () => {
    const members = [
      crewMember({
        name: "Calvin",
        role: "BO",
        date_restriction: { kind: "explicit", days: ["10/7", "10/9"] },
      }),
    ];
    const q = renderBody(sectionData({ crewMembers: members }), "crew");
    const region = q.getByTestId(`wizard-step3-card-${DFID}-breakdown-crew`);
    expect(region.textContent).toContain("BO");
    expect(region.textContent).toContain("10/7, 10/9 only");
  });
});

// ── Empty states + caps preserved through the registry render ───────────────

describe("section bodies — empty-state copy preserved (registry render)", () => {
  const EMPTY_COPY: Record<string, string> = {
    crew: "No crew parsed.",
    contacts: "No contacts parsed.",
    schedule: "No run-of-show parsed.",
    hotels: "No hotels parsed.",
    transport: "No transportation parsed.",
    rooms: "No rooms parsed.",
    packlist: "No pack list parsed.",
    venue: "No venue details parsed.",
    event: "No event details parsed.",
    billing: "No billing details parsed.",
  };

  test.each(Object.entries(EMPTY_COPY))("%s body renders '%s' when empty", (id, copy) => {
    const d = sectionData({
      crewMembers: [],
      rooms: [],
      hotelReservations: [],
      pullSheet: [],
      runOfShow: {},
      contacts: [],
      transportation: null,
    });
    const q = renderBody(d, id);
    expect(q.container.textContent).toContain(copy);
  });

  test("pack-list caps + overflow note are preserved (13 cases → 12 + tail)", () => {
    const cases: PullSheetCase[] = Array.from({ length: 13 }, (_, i) => ({
      caseLabel: `CASE-${i + 1}`,
      items: [],
    })) as unknown as PullSheetCase[];
    const d = sectionData({ pullSheet: cases });
    const q = renderBody(d, "packlist");
    const region = q.getByTestId(`wizard-step3-card-${DFID}-breakdown-pack-list`);
    expect(region.textContent).toContain("CASE-12");
    expect(region.textContent).not.toContain("CASE-13");
    expect(region.textContent).toContain(`…and ${cases.length - 12} more cases`);
  });
});

// ── Warnings body (spec §3.10 + §8) ─────────────────────────────────────────

describe("warnings body (spec §3.10 affirmative empty state + §8 hardening)", () => {
  test("renders both severities; the raw code NEVER appears in the panel", () => {
    const warnings: ParseWarning[] = [
      { severity: "warn", code: "OPENING_REEL_UNREADABLE", message: "OPENING_REEL_UNREADABLE" },
      {
        severity: "info",
        code: "UNKNOWN_PARSER_WARNING_XYZ",
        message: "Two flights could not be matched to crew",
      },
    ];
    const d = sectionData({ warnings });
    const q = renderBody(d, "warnings");
    const panel = q.getByTestId(`wizard-step3-card-${DFID}-breakdown-warnings`);
    const t = panel.textContent ?? "";
    // Hardened title: the code-as-message row falls back to the generic copy.
    expect(t).toContain(GENERIC_FALLBACK);
    expect(t).not.toContain("OPENING_REEL_UNREADABLE");
    // The human message passes through; its code never renders.
    expect(t).toContain("Two flights could not be matched to crew");
    expect(t).not.toContain("UNKNOWN_PARSER_WARNING_XYZ");
    // Both severities render as list rows with their severity labels.
    expect(within(panel).getByTestId(`wizard-step3-card-${DFID}-warning-0`).textContent).toContain(
      "warn",
    );
    expect(within(panel).getByTestId(`wizard-step3-card-${DFID}-warning-1`).textContent).toContain(
      "info",
    );
    // Non-blocking note preserved.
    expect(t).toMatch(/don.t block publishing/i);
  });

  test("zero warnings → the affirmative empty state renders (panel no longer returns null)", () => {
    const d = sectionData({ warnings: [] });
    const q = renderBody(d, "warnings");
    const panel = q.getByTestId(`wizard-step3-card-${DFID}-breakdown-warnings`);
    expect(panel.textContent).toContain("No parse warnings for this sheet.");
  });
});
