// @vitest-environment jsdom
/**
 * tests/components/admin/wizard/step3ReviewSections.test.tsx (Task 3 — spec §6.1/§8/§3.10)
 *
 * Pins the Step-3 review section REGISTRY (`step3Sections` + STEP3_SECTION_GROUPS),
 * the hardened warning-title derivation (`reviewWarningTitle`), and the restyled
 * section bodies moved out of Step3SheetCard.tsx. Extended by follow-ups Task 5
 * (spec 2026-07-03-step3-modal-followups.md §B2/§D2): the conditional `diagrams`
 * def, the unconditional `report` def (hideDot), and both navs' dot consumption.
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
import { afterEach, describe, expect, test, vi } from "vitest";
import { cleanup, render, within } from "@testing-library/react";
import { MESSAGE_CATALOG } from "@/lib/messages/catalog";
import { isMessageCode } from "@/lib/messages/lookup";
import type {
  CrewMemberRow,
  EmbeddedImageStub,
  LinkedFolderItemStub,
  ParseResult,
  ParseWarning,
  PullSheetCase,
} from "@/lib/parser/types";

// The review modal (rendered by the hideDot nav tests below) mounts
// RescanSheetButton, which calls useRouter().refresh().
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
// (vi.mock is hoisted above imports, so plain import order is safe here.)
import { Step3ReviewModal } from "@/components/admin/wizard/Step3ReviewModal";
import {
  BreakdownSection,
  DIAGRAM_TILE_CAP,
  DiagramsBreakdown,
  reviewWarningTitle,
  step3Sections,
  STEP3_SECTION_GROUPS,
  type SectionData,
  type Step3SectionDef,
} from "@/components/admin/wizard/step3ReviewSections";
import { buildParseResult, stagedRow } from "./_step3ReviewFixture";

// AgendaBreakdown (rendered by the agenda registry entry) calls fetch in an
// effect; no test here renders it (the hideDot modal tests use an empty
// agendaBaseline, so the agenda def never mounts). Keep RTL clean between
// tests.
afterEach(() => cleanup());

const DFID = "drive-abc-123";
const WSID = "00000000-1111-4222-8333-444444444444";

const GENERIC_FALLBACK = "A parse issue was recorded for this sheet.";

// ── §B2 diagram fixtures ─────────────────────────────────────────────────────
// A minimally-valid ENRICHED stub (shape: EmbeddedImageStub, lib/parser/types.ts)
// and the linked-folder variants. Counts below always derive from these arrays'
// own lengths (anti-tautology), never restated literals.

const VALID_STUB: EmbeddedImageStub = {
  sheetTab: "Diagrams",
  objectId: "obj-1",
  mimeType: "image/png",
  contentUrl: "https://lh3.googleusercontent.com/d/obj-1",
  sheetsRevisionId: "rev-1",
  embeddedFingerprint: "fp_abc",
  recovery_disposition: "normal",
  snapshotPath: null,
};

function folderItem(id: string): LinkedFolderItemStub {
  return {
    driveFileId: id,
    mimeType: "image/png",
    drive_modified_time: "2026-07-01T00:00:00Z",
    headRevisionId: `head-${id}`,
    md5Checksum: "d41d8cd98f00b204e9800998ecf8427e",
    snapshotPath: null,
  };
}

/** Embedded image only — the brief's canonical presence fixture. */
const EMBEDDED_DIAGRAMS: ParseResult["diagrams"] = {
  linkedFolder: null,
  embeddedImages: [VALID_STUB],
  linkedFolderItems: [],
};

/** Folder link only — present in the registry but NO rail count (§B2). */
const FOLDER_ONLY_DIAGRAMS: ParseResult["diagrams"] = {
  linkedFolder: {
    driveFolderId: "f1",
    driveFolderUrl: "https://drive.google.com/drive/folders/f1",
  },
  embeddedImages: [],
  linkedFolderItems: [],
};

/** BOTH railCount terms non-zero, so a dropped term fails the sum assertion. */
const MIXED_DIAGRAMS: ParseResult["diagrams"] = {
  linkedFolder: {
    driveFolderId: "f1",
    driveFolderUrl: "https://drive.google.com/drive/folders/f1",
  },
  embeddedImages: [VALID_STUB],
  linkedFolderItems: [folderItem("file-1"), folderItem("file-2")],
};

/** Non-empty agenda baseline (gates the conditional `agenda` def). */
const AGENDA_ITEM = { label: "Agenda PDF", badge: null, href: null, block: null };

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

describe("step3Sections registry (spec §6.1 + §B2/§D2)", () => {
  // `report` is UNCONDITIONAL and always LAST (§D2); `diagrams` is conditional
  // (like agenda) and sits after `rooms`, before `packlist` (§B2).
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
    "report",
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
    "report",
  ];
  const EXPECTED_WITH_DIAGRAMS = [
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
    "warnings",
    "report",
  ];
  const EXPECTED_WITH_BOTH = [
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
    diagrams: "Diagrams",
    packlist: "Pack list",
    billing: "Billing & docs",
    warnings: "Parse warnings",
    report: "Report an issue",
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
    diagrams: "Gear",
    packlist: "Gear",
    billing: "Money",
    warnings: "Checks",
    report: "Checks",
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

  test("12 defs base; 13 with agenda; 13 with diagrams; 14 with both (order exact, report always last)", () => {
    const without = step3Sections(sectionData());
    expect(without.map((s) => s.id)).toEqual(EXPECTED_NO_AGENDA);

    const withAgenda = step3Sections(sectionData({}, { agendaBaseline: [AGENDA_ITEM] }));
    expect(withAgenda.map((s) => s.id)).toEqual(EXPECTED_WITH_AGENDA);

    const withDiagrams = step3Sections(sectionData({ diagrams: EMBEDDED_DIAGRAMS }));
    expect(withDiagrams.map((s) => s.id)).toEqual(EXPECTED_WITH_DIAGRAMS);

    const withBoth = step3Sections(
      sectionData({ diagrams: EMBEDDED_DIAGRAMS }, { agendaBaseline: [AGENDA_ITEM] }),
    );
    expect(withBoth.map((s) => s.id)).toEqual(EXPECTED_WITH_BOTH);
  });

  test("diagrams presence gate (§B2): absent for all-empty AND missing pr.diagrams; any one signal renders it", () => {
    // Fixture default: all-empty diagrams object → absent (catches the
    // conditional insert regressing to unconditional / badge-section drift).
    expect(step3Sections(sectionData()).some((s) => s.id === "diagrams")).toBe(false);
    // pr.diagrams deleted entirely (untrusted persisted JSONB) → absent, no throw.
    const gone = sectionData();
    delete (gone.pr as unknown as Record<string, unknown>).diagrams;
    expect(step3Sections(gone).some((s) => s.id === "diagrams")).toBe(false);
    // Each single signal of the gate is sufficient on its own.
    for (const diagrams of [
      FOLDER_ONLY_DIAGRAMS,
      EMBEDDED_DIAGRAMS,
      { linkedFolder: null, embeddedImages: [], linkedFolderItems: [folderItem("file-9")] },
    ]) {
      const defs = step3Sections(sectionData({ diagrams }));
      expect(
        defs.some((s) => s.id === "diagrams"),
        `presence for ${JSON.stringify(diagrams.linkedFolder)}/${diagrams.embeddedImages.length}/${diagrams.linkedFolderItems.length}`,
      ).toBe(true);
      // Order invariant holds for every conditional shape.
      expect(defs.map((s) => s.id).join(",")).toContain("rooms,diagrams,packlist");
    }
  });

  test("labels and groups are exact; every group value is a member of STEP3_SECTION_GROUPS", () => {
    const defs = step3Sections(
      sectionData({ diagrams: EMBEDDED_DIAGRAMS }, { agendaBaseline: [AGENDA_ITEM] }),
    );
    // All 14 defs (both conditionals present) iterate the maps.
    expect(defs.map((s) => s.id)).toEqual(EXPECTED_WITH_BOTH);
    for (const def of defs) {
      expect(def.label).toBe(LABELS[def.id]);
      expect(def.group).toBe(GROUPS[def.id]);
      expect(STEP3_SECTION_GROUPS).toContain(def.group);
      expect(typeof def.Icon).not.toBe("undefined");
    }
  });

  test("hideDot is present-true ONLY on report (§D2); every other def leaves it absent", () => {
    const defs = step3Sections(
      sectionData({ diagrams: MIXED_DIAGRAMS }, { agendaBaseline: [AGENDA_ITEM] }),
    );
    expect(defs.filter((s) => s.hideDot === true).map((s) => s.id)).toEqual(["report"]);
    for (const def of defs) {
      if (def.id !== "report") {
        // exactOptionalPropertyTypes: absent, never `hideDot: undefined`.
        expect(def.hideDot, `hideDot for ${def.id}`).toBeUndefined();
      }
    }
  });

  test("railCount is non-null exactly for the §6.1 counted subset, and derives from the data", () => {
    const d = sectionData();
    const defs = step3Sections(d);
    for (const def of defs) {
      if (COUNTED.includes(def.id)) {
        expect(def.railCount, `railCount for ${def.id}`).not.toBeNull();
      } else {
        // venue/event/transport/billing — and report, ALWAYS null (§D2).
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

  test("diagrams railCount (§B2): embedded+folder-item sum when > 0; folder-link-only → null", () => {
    const d = sectionData({ diagrams: MIXED_DIAGRAMS });
    const defs = step3Sections(d);
    // Counted subset extends with diagrams when the sum is non-zero.
    for (const def of defs) {
      if ([...COUNTED, "diagrams"].includes(def.id)) {
        expect(def.railCount, `railCount for ${def.id}`).not.toBeNull();
      } else {
        expect(def.railCount, `railCount for ${def.id}`).toBeNull();
      }
    }
    // BOTH terms are non-zero in the fixture, so a dropped term fails here.
    expect(d.pr.diagrams.embeddedImages.length).toBeGreaterThan(0);
    expect(d.pr.diagrams.linkedFolderItems.length).toBeGreaterThan(0);
    expect(defById(defs, "diagrams").railCount!(d)).toBe(
      d.pr.diagrams.embeddedImages.length + d.pr.diagrams.linkedFolderItems.length,
    );
    // Folder-link-only: the section renders but shows NO rail count.
    const folderOnly = sectionData({ diagrams: FOLDER_ONLY_DIAGRAMS });
    expect(defById(step3Sections(folderOnly), "diagrams").railCount).toBeNull();
  });
});

// ── Modal navs consume hideDot (§D2) + diagrams dot tone (§B2) ──────────────

describe("Step3ReviewModal navs — hideDot + diagrams dot tone (spec §B2/§D2)", () => {
  function renderModal(d: SectionData) {
    return render(
      <Step3ReviewModal
        data={d}
        checked={false}
        isDirtyRescan={false}
        onRequestSetChecked={async () => true}
        onClose={() => {}}
      />,
    );
  }
  const DOT = '[class*="bg-status-"]';
  const railItem = (q: ReturnType<typeof render>, id: string) =>
    q.getByTestId(`wizard-step3-card-${DFID}-review-rail-item-${id}`);
  const chipItem = (q: ReturnType<typeof render>, id: string) =>
    q.getByTestId(`wizard-step3-card-${DFID}-review-chip-item-${id}`);

  test("report renders NO status dot in EITHER nav; warnings keeps its dot in both", () => {
    const q = renderModal(sectionData());
    // Catches: one nav consuming hideDot while the other still renders a dot.
    expect(railItem(q, "report").querySelector(DOT)).toBeNull();
    expect(chipItem(q, "report").querySelector(DOT)).toBeNull();
    // Sibling sanity: the dot span itself was not removed wholesale.
    expect(railItem(q, "warnings").querySelector(DOT)).not.toBeNull();
    expect(chipItem(q, "warnings").querySelector(DOT)).not.toBeNull();
  });

  test("diagrams dot is ALWAYS bg-status-positive — even with a warn whose fabricated kind is 'diagrams'", () => {
    // Task 1 contract: KIND_TO_SECTION maps nothing to `diagrams`; a fabricated
    // diagram-kind warn falls to the warnings bucket (row-local red), never to
    // the diagrams rail dot. Catches: a dotToneClass/KIND_TO_SECTION regression.
    const d = sectionData({
      diagrams: EMBEDDED_DIAGRAMS,
      warnings: [
        { severity: "warn", code: "SOME_CODE", message: "", blockRef: { kind: "diagrams" } },
      ],
    });
    const q = renderModal(d);
    const railDot = railItem(q, "diagrams").querySelector(DOT)!;
    expect(railDot.className).toMatch(/\bbg-status-positive\b/);
    const chipDot = chipItem(q, "diagrams").querySelector(DOT)!;
    expect(chipDot.className).toMatch(/\bbg-status-positive\b/);
    // The warn registered somewhere: the warnings row-local dot is red.
    expect(railItem(q, "warnings").querySelector(DOT)!.className).toMatch(/\bbg-status-review\b/);
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

// ── BreakdownSection count widening (Task 7 — count: number | null) ─────────

describe("BreakdownSection — count={null} on the legacy (no-chrome) path", () => {
  test("label renders with NO count span — catches the legacy h4 rendering '(null)' or '()'", () => {
    const q = render(
      <BreakdownSection testId="x-breakdown-null-count" label="Report an issue" count={null}>
        <span>body</span>
      </BreakdownSection>,
    );
    const h4 = q.getByTestId("x-breakdown-null-count").querySelector("h4")!;
    expect(h4).not.toBeNull();
    expect(h4.textContent).toContain("Report an issue");
    expect(h4.textContent).not.toContain("(");
  });

  test("numeric count still renders on the legacy path (widening is source-compatible)", () => {
    const q = render(
      <BreakdownSection testId="x-breakdown-num-count" label="Crew" count={7}>
        <span>body</span>
      </BreakdownSection>,
    );
    expect(q.getByTestId("x-breakdown-num-count").querySelector("h4")!.textContent).toContain(
      "(7)",
    );
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

describe("DiagramsBreakdown body (follow-ups spec §B3 + §K8)", () => {
  // All queries are scoped `within(...)` the section's own testid container so
  // a sibling can never satisfy an assertion by accident (anti-tautology).
  const SECTION_TESTID = `wizard-step3-card-${DFID}-section-diagrams`;
  const TILE_PREFIX = `wizard-step3-card-${DFID}-diagram-tile-`;

  /** A fully valid EmbeddedImageStub. `alt` is ABSENT by default so the
   *  alt-fallback test derives from `sheetTab`, never a hardcoded literal. */
  function diagramStub(overrides: Partial<EmbeddedImageStub> = {}): EmbeddedImageStub {
    return {
      sheetTab: "DIAGRAMS",
      objectId: "obj-1",
      mimeType: "image/png",
      contentUrl: "https://lh3.googleusercontent.com/img-1",
      sheetsRevisionId: "rev-1",
      embeddedFingerprint: "fp-1",
      recovery_disposition: "normal",
      snapshotPath: null,
      ...overrides,
    };
  }

  function folderItem(n: number): LinkedFolderItemStub {
    return {
      driveFileId: `folder-file-${n}`,
      mimeType: "image/png",
      drive_modified_time: "2026-01-01T00:00:00Z",
      headRevisionId: `head-${n}`,
      md5Checksum: `md5-${n}`,
      snapshotPath: null,
    };
  }

  function diagramsOf(overrides: Partial<ParseResult["diagrams"]> = {}): ParseResult["diagrams"] {
    return { linkedFolder: null, embeddedImages: [], linkedFolderItems: [], ...overrides };
  }

  function renderDiagrams(diagrams: ParseResult["diagrams"]) {
    const utils = render(
      <DiagramsBreakdown dfid={DFID} wizardSessionId={WSID} diagrams={diagrams} />,
    );
    const container = utils.getByTestId(SECTION_TESTID);
    return { container, scoped: within(container) };
  }

  test("caps the grid at DIAGRAM_TILE_CAP tiles with a derived '+N more' note (catches: unbounded grid blowing up the pane)", () => {
    // Build in a loop; every expectation derives from stubs.length, never a literal.
    const stubs = Array.from({ length: DIAGRAM_TILE_CAP + 3 }, (_, i) =>
      diagramStub({
        objectId: `obj-${i}`,
        contentUrl: `https://lh3.googleusercontent.com/img-${i}`,
      }),
    );
    const { container, scoped } = renderDiagrams(diagramsOf({ embeddedImages: stubs }));
    const tiles = container.querySelectorAll(`[data-testid^="${TILE_PREFIX}"]`);
    expect(tiles.length).toBe(DIAGRAM_TILE_CAP);
    expect(
      scoped.getByText(
        `+${stubs.length - DIAGRAM_TILE_CAP} more — all images are snapshotted when the show publishes.`,
      ),
    ).toBeTruthy();
    // Count summary reflects ALL valid stubs (not the capped subset).
    expect(scoped.getByText(`${stubs.length} embedded images`)).toBeTruthy();
  });

  test("null-contentUrl stub renders the placeholder upfront with NO <img> (catches: an <img src> fetch attempt for an unfetchable stub)", () => {
    const { container, scoped } = renderDiagrams(
      diagramsOf({ embeddedImages: [diagramStub({ contentUrl: null })] }),
    );
    const tile = scoped.getByTestId(`${TILE_PREFIX}0`);
    expect(within(tile).getByText("Preview unavailable")).toBeTruthy();
    expect(tile.querySelector("img")).toBeNull();
    expect(container.querySelectorAll("img").length).toBe(0);
  });

  test("folder-only: folder-link anchor (target/rel), file count derived from fixture, NO grid", () => {
    const items = [folderItem(1), folderItem(2)];
    const { container, scoped } = renderDiagrams(
      diagramsOf({
        linkedFolder: {
          driveFolderId: "f1",
          driveFolderUrl: "https://drive.google.com/drive/folders/f1",
        },
        linkedFolderItems: items,
      }),
    );
    const link = scoped.getByTestId(`wizard-step3-card-${DFID}-diagram-folder-link`);
    expect(link.tagName).toBe("A");
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");
    expect(container.querySelectorAll(`[data-testid^="${TILE_PREFIX}"]`).length).toBe(0);
    expect(scoped.getByText(`${items.length} files`)).toBeTruthy();
  });

  test("hostile folder URL → counts text renders, NO <a> anywhere in the body (catches: unvalidated href)", () => {
    const items = [folderItem(1), folderItem(2)];
    const { container, scoped } = renderDiagrams(
      diagramsOf({
        linkedFolder: {
          driveFolderId: "x",
          driveFolderUrl: "https://evil.example/drive/folders/x",
        },
        linkedFolderItems: items,
      }),
    );
    expect(container.querySelectorAll("a").length).toBe(0);
    expect(scoped.getByText(`${items.length} files`)).toBeTruthy();
  });

  test("http://drive.google.com folder URL is upgraded to https before rendering the anchor", () => {
    const { scoped } = renderDiagrams(
      diagramsOf({
        linkedFolder: {
          driveFolderId: "f1",
          driveFolderUrl: "http://drive.google.com/drive/folders/f1",
        },
      }),
    );
    const link = scoped.getByTestId(`wizard-step3-card-${DFID}-diagram-folder-link`);
    const href = link.getAttribute("href");
    expect(href?.startsWith("https://drive.google.com/")).toBe(true);
  });

  test("§K8 malformed-element fixture: exactly ONE tile, header count (1), no crash, no corrupt substrings (catches: client-side dereference of corrupt staged JSON incl. the alt-fallback sheetTab read)", () => {
    const validStub = diagramStub({ objectId: "valid-1", alt: "Stage plot" });
    // Spec §K8 verbatim shape — only `validStub` survives the shared predicate.
    const embeddedImages = [
      null,
      { objectId: 123 },
      { objectId: "x", mimeType: "image/png", contentUrl: null }, // missing sheetTab
      { ...validStub, alt: 7 },
      validStub,
    ] as unknown as EmbeddedImageStub[];
    const { container } = renderDiagrams(diagramsOf({ embeddedImages }));
    const tiles = container.querySelectorAll(`[data-testid^="${TILE_PREFIX}"]`);
    expect(tiles.length).toBe(1);
    expect(container.textContent).toContain("(1)");
    expect(container.textContent).not.toContain("(5)");
    expect(container.innerHTML).not.toContain("[object Object]");
    expect(container.innerHTML).not.toContain("undefined");
  });

  test("alt fallback derives from the stub's sheetTab when alt is absent", () => {
    const stub = diagramStub(); // no alt
    const { container } = renderDiagrams(diagramsOf({ embeddedImages: [stub] }));
    const img = container.querySelector("img");
    expect(img?.getAttribute("alt")).toBe(`Diagram from ${stub.sheetTab}`);
  });

  test("tile img src (and wrapping anchor href) is the Task-3 staged-diagram route URL derived from the fixture", () => {
    const stub = diagramStub({ objectId: "obj-abc_123" });
    const { scoped } = renderDiagrams(diagramsOf({ embeddedImages: [stub] }));
    const tile = scoped.getByTestId(`${TILE_PREFIX}0`);
    const img = tile.querySelector("img");
    const expected = `/api/admin/onboarding/staged-diagram/${WSID}/${DFID}/${encodeURIComponent(stub.objectId)}`;
    expect(img?.getAttribute("src")).toBe(expected);
    expect(tile.tagName).toBe("A");
    expect(tile.getAttribute("href")).toBe(expected);
  });
});

// ── RoomsBreakdown — room notes visual separation (spec §F, Task 11) ────────
// The room-detail list currently blends into the gear-scope grid above it.
// This inset container (mt-2 rounded-md bg-surface-sunken px-3 py-2) + "Room
// notes" eyebrow gives it a distinct visual scope. Concrete failure modes:
//  - inset container missing → notes still flush against the scope grid.
//  - eyebrow missing/mis-scoped → operator can't tell where "scope" ends and
//    "notes" begins.
//  - pl-7 retained → double-indent (old scheme relied on padding, not a box).
//  - a border-l side-stripe sneaking in → spec §F absolute ban.
//  - the sibling gear-scope grid's class string drifting → accidental
//    restyle of L768-793 while touching the neighboring detail block.
describe("RoomsBreakdown — room notes inset separation (spec §F, Task 11)", () => {
  function detailRoomData(): SectionData {
    return sectionData({
      rooms: [
        {
          kind: "gs",
          name: "GRAND BALLROOM",
          dimensions: "60' x 45'",
          floor: null,
          setup: "18 tables of 7",
          set_time: null,
          show_time: null,
          strike_time: null,
          audio: "(1) QU32",
          video: null,
          lighting: null,
          scenic: null,
          power: null,
          digital_signage: null,
          other: null,
          notes: null,
        },
      ],
    });
  }

  test("detail <ul> keeps its testid and sits inside a rounded-md bg-surface-sunken px-3 py-2 inset container", () => {
    const { getByTestId } = renderBody(detailRoomData(), "rooms");
    const detail = getByTestId(`wizard-step3-card-${DFID}-room-0-detail`);
    const container = detail.closest(".bg-surface-sunken");
    expect(container).not.toBeNull();
    expect(container!.className).toContain("rounded-md");
    expect(container!.className).toContain("px-3");
    expect(container!.className).toContain("py-2");
  });

  test('an eyebrow reading "Room notes" precedes the detail <ul> inside the inset container', () => {
    const { getByTestId } = renderBody(detailRoomData(), "rooms");
    const detail = getByTestId(`wizard-step3-card-${DFID}-room-0-detail`);
    const container = detail.closest(".bg-surface-sunken") as HTMLElement;
    const scoped = within(container);
    const eyebrow = scoped.getByText("Room notes");
    expect(container.textContent!.indexOf("Room notes")).toBeLessThan(
      container.textContent!.indexOf("Dimensions:"),
    );
    expect(container.contains(eyebrow)).toBe(true);
  });

  test("detail <ul> no longer carries pl-7; label spans are font-medium text-text-strong, values render in text-text", () => {
    const { getByTestId } = renderBody(detailRoomData(), "rooms");
    const detail = getByTestId(`wizard-step3-card-${DFID}-room-0-detail`);
    expect(detail.className).not.toContain("pl-7");
    expect(detail.className).toContain("text-text");
    const labelSpan = within(detail).getByText("Dimensions:");
    expect(labelSpan.className).toContain("font-medium");
    expect(labelSpan.className).toContain("text-text-strong");
  });

  test("gear-scope grid is unchanged (L768-793 sibling, byte-pinned class string)", () => {
    const { getByTestId } = renderBody(detailRoomData(), "rooms");
    const scope = getByTestId(`wizard-step3-card-${DFID}-room-0-scope`);
    expect(scope.className).toBe("mt-1.5 flex flex-col gap-1 text-xs text-text-subtle");
  });

  test("no side-stripe: no border-l class anywhere in the rooms body HTML (spec §F absolute ban)", () => {
    const { container } = renderBody(detailRoomData(), "rooms");
    expect(container.innerHTML).not.toContain("border-l");
  });
});
