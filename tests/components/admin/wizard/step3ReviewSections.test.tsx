// @vitest-environment jsdom
/**
 * tests/components/admin/wizard/step3ReviewSections.test.tsx (Task 3 — spec §6.1/§8/§3.10)
 *
 * Pins the Step-3 review section REGISTRY (`step3Sections` + STEP3_SECTION_GROUPS),
 * the hardened warning-title derivation (`reviewWarningTitle`), and the restyled
 * section bodies moved out of Step3SheetCard.tsx. Extended by follow-ups Task 5
 * (spec 2026-07-03-step3-modal-followups.md §D2): the unconditional `report`
 * def (hideDot) and both navs' dot consumption. Diagrams are consolidated INTO
 * the `rooms` section (rendered below the rooms as a subordinate sub-block), so
 * they are no longer a standalone registry def / nav entry.
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
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { act, cleanup, fireEvent, render, waitFor, within } from "@testing-library/react";
import { MESSAGE_CATALOG } from "@/lib/messages/catalog";
import { isMessageCode } from "@/lib/messages/lookup";
import type {
  CrewMemberRow,
  EmbeddedImageStub,
  LinkedFolderItemStub,
  ParseResult,
  ParseWarning,
  PullSheetCase,
  RoomRow,
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
  roomHasScope,
  step3Sections,
  STEP3_SECTION_GROUPS,
  type StagedSectionData,
  type Step3SectionDef,
} from "@/components/admin/wizard/step3ReviewSections";
import { buildParseResult, stagedRow, show } from "./_step3ReviewFixture";

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
  dataOverrides: Partial<StagedSectionData> = {},
): StagedSectionData {
  const pr = buildParseResult(prOverrides);
  // Row/dfid may be overridden via dataOverrides; derive the row/dfid-dependent
  // SectionCore fields from the FINAL values so an overridden row propagates.
  const row = dataOverrides.row ?? stagedRow(pr);
  const dfid = dataOverrides.dfid ?? DFID;
  return {
    mode: "staged",
    pr,
    row,
    dfid,
    wizardSessionId: WSID,
    // SectionCore (spec §3.2) — mechanical staged derivation (Task 4's builder
    // will replace these literals across all construction sites).
    title: pr.show.title || row.driveFileName || dfid,
    clientLabel: pr.show.client_label || null,
    dates: pr.show.dates,
    venue: pr.show.venue,
    eventDetails: pr.show.event_details,
    clientContact: pr.show.client_contact,
    contacts: pr.contacts ?? [],
    transportation: pr.transportation,
    diagrams: pr.diagrams,
    billing: {
      coiStatus: pr.show.coi_status,
      proposal: pr.show.proposal,
      po: pr.show.po,
      invoice: pr.show.invoice,
      invoiceNotes: pr.show.invoice_notes,
    },
    rawUnrecognized: pr.raw_unrecognized,
    sourceAnchors: row.sourceAnchors ?? {},
    driveFileId: dfid,
    crewMembers: pr.crewMembers,
    rooms: pr.rooms,
    hotels: pr.hotelReservations,
    pullSheet: pr.pullSheet ?? [],
    archivedPullSheetTabs: pr.archivedPullSheetTabs ?? [],
    ros: pr.runOfShow ?? {},
    warnings: pr.warnings,
    agendaBaseline: [],
    useRawDecisions: [],
    ...dataOverrides,
  };
}

function defById(defs: Step3SectionDef[], id: string): Step3SectionDef {
  const def = defs.find((s) => s.id === id);
  if (!def) throw new Error(`registry has no section '${id}'`);
  return def;
}

function renderBody(d: StagedSectionData, id: string) {
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
  // `report` is UNCONDITIONAL and always LAST (§D2); `agenda` is conditional.
  // Diagrams are NOT a section — they fold into the `rooms` section render.
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
    packlist: "Gear",
    billing: "Money",
    warnings: "Checks",
    report: "Checks",
  };
  // Owner decision (2026-07-05): only Crew, Contacts, Rooms, and Parse warnings
  // carry a count — nav rail AND card title. Everything else drops it.
  const COUNTED = ["crew", "contacts", "rooms", "warnings"];

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

  test("12 defs base; 13 with agenda; diagrams is NOT a separate section (order exact, report always last)", () => {
    const without = step3Sections(sectionData());
    expect(without.map((s) => s.id)).toEqual(EXPECTED_NO_AGENDA);

    const withAgenda = step3Sections(sectionData({}, { agendaBaseline: [AGENDA_ITEM] }));
    expect(withAgenda.map((s) => s.id)).toEqual(EXPECTED_WITH_AGENDA);

    // Diagrams are consolidated into the rooms section — a diagram signal does
    // NOT add a registry def (catches a regression re-adding the standalone
    // section / a stray "diagrams" nav entry).
    const withDiagrams = step3Sections(sectionData({ diagrams: EMBEDDED_DIAGRAMS }));
    expect(withDiagrams.map((s) => s.id)).toEqual(EXPECTED_NO_AGENDA);
    expect(withDiagrams.some((s) => s.id === "diagrams")).toBe(false);

    const withBoth = step3Sections(
      sectionData({ diagrams: EMBEDDED_DIAGRAMS }, { agendaBaseline: [AGENDA_ITEM] }),
    );
    expect(withBoth.map((s) => s.id)).toEqual(EXPECTED_WITH_AGENDA);
  });

  test("diagrams sub-block renders BELOW the rooms inside the rooms section, only on a signal (§B2 gate)", () => {
    const DIAGRAMS_TESTID = `wizard-step3-card-${DFID}-section-diagrams`;
    const ROOMS_TESTID = `wizard-step3-card-${DFID}-breakdown-rooms`;

    // No diagram signal (fixture default all-empty, and pr.diagrams deleted) →
    // no Diagrams sub-block.
    expect(renderBody(sectionData(), "rooms").queryByTestId(DIAGRAMS_TESTID)).toBeNull();
    const gone = sectionData();
    delete (gone.pr as unknown as Record<string, unknown>).diagrams;
    expect(renderBody(gone, "rooms").queryByTestId(DIAGRAMS_TESTID)).toBeNull();

    // Each single signal renders the sub-block, positioned AFTER the rooms
    // breakdown (DOM order), under its own "Diagrams" heading (not "Rooms &
    // scope").
    for (const diagrams of [
      FOLDER_ONLY_DIAGRAMS,
      EMBEDDED_DIAGRAMS,
      { linkedFolder: null, embeddedImages: [], linkedFolderItems: [folderItem("file-9")] },
    ]) {
      const { container } = renderBody(sectionData({ diagrams }), "rooms");
      const scoped = within(container);
      const rooms = scoped.getByTestId(ROOMS_TESTID);
      const diag = scoped.getByTestId(DIAGRAMS_TESTID);
      expect(diag).not.toBeNull();
      // Diagrams sits after the rooms breakdown in document order.
      expect(rooms.compareDocumentPosition(diag) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      // Its own heading, never the outer section's "Rooms & scope".
      expect(within(diag).getByText("Diagrams")).toBeTruthy();
    }
  });

  test("labels and groups are exact; every group value is a member of STEP3_SECTION_GROUPS", () => {
    const defs = step3Sections(
      sectionData({ diagrams: EMBEDDED_DIAGRAMS }, { agendaBaseline: [AGENDA_ITEM] }),
    );
    // All 13 defs (agenda present; diagrams folds into rooms) iterate the maps.
    expect(defs.map((s) => s.id)).toEqual(EXPECTED_WITH_AGENDA);
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
        // venue/event/schedule/hotels/transport/packlist/billing — and report,
        // ALWAYS null (owner decision 2026-07-05; §D2 for report).
        expect(def.railCount, `railCount for ${def.id}`).toBeNull();
      }
    }
    // Values derive from the fixture's OWN dimensions (anti-tautology).
    expect(defById(defs, "crew").railCount!(d)).toBe(d.crewMembers.length);
    // Rooms rail count = only A/V-scoped rooms (roomHasScope), NOT raw length.
    // The default fixture rooms all carry A/V, so scoped === length here.
    expect(defById(defs, "rooms").railCount!(d)).toBe(d.rooms.filter(roomHasScope).length);
    // And with a no-A/V room MIXED in, the rail count drops it (exclusion path).
    const mixed = sectionData({ rooms: [...d.rooms, { ...d.rooms[0]!, video: null }] });
    expect(defById(step3Sections(mixed), "rooms").railCount!(mixed)).toBe(d.rooms.length);
    expect(defById(defs, "warnings").railCount!(d)).toBe(d.warnings.length);
    // Contacts: block count as rendered today — fixture has no client contact
    // and no contacts → 0.
    expect(defById(defs, "contacts").railCount!(d)).toBe(0);
  });
});

// ── Modal navs consume hideDot (§D2) ────────────────────────────────────────

describe("Step3ReviewModal navs — hideDot (spec §D2)", () => {
  function renderModal(d: StagedSectionData) {
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

  test("no standalone 'diagrams' nav item; a fabricated diagrams-kind warn routes to warnings, never flags rooms", () => {
    // Diagrams are consolidated into the rooms section — there is no diagrams
    // rail/chip item. KIND_TO_SECTION still maps nothing to `diagrams` (nor to
    // rooms), so a fabricated diagram-kind warn falls to the warnings bucket
    // (red) and leaves the rooms dot positive. Catches: a stray diagrams nav
    // item regressing back, or a KIND_TO_SECTION mis-route flagging rooms.
    const d = sectionData({
      diagrams: EMBEDDED_DIAGRAMS,
      warnings: [
        { severity: "warn", code: "SOME_CODE", message: "", blockRef: { kind: "diagrams" } },
      ],
    });
    const q = renderModal(d);
    expect(q.queryByTestId(`wizard-step3-card-${DFID}-review-rail-item-diagrams`)).toBeNull();
    expect(q.queryByTestId(`wizard-step3-card-${DFID}-review-chip-item-diagrams`)).toBeNull();
    // The warn lands in warnings (red); rooms stays positive.
    expect(railItem(q, "warnings").querySelector(DOT)!.className).toMatch(/\bbg-status-review\b/);
    expect(railItem(q, "rooms").querySelector(DOT)!.className).toMatch(/\bbg-status-positive\b/);
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
      // Schedule now renders the aggregate day domain (travelIn/set/showDays/travelOut)
      // in ADDITION to run-of-show entries (bug #316 item 1), so a truly-empty schedule
      // requires empty dates too — otherwise the default fixture's dates surface bookend
      // rows and the "No run-of-show parsed." empty state never shows.
      show: show({ dates: { travelIn: null, set: null, showDays: [], travelOut: null } }),
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

  // Flow 3 (audit 3.1) — the correction-loop callout (re-scan verb) rides alongside
  // the existing non-blocking note; copy-only (the wizard already carries RescanSheetButton).
  test("renders the correction-loop callout (re-scan copy) alongside the non-blocking note when warnings exist", () => {
    const warnings: ParseWarning[] = [
      { severity: "warn", code: "UNKNOWN_FIELD", message: "Unrecognized row" },
    ];
    const d = sectionData({ warnings });
    const q = renderBody(d, "warnings");
    const panel = q.getByTestId(`wizard-step3-card-${DFID}-breakdown-warnings`);
    const callout = within(panel).getByTestId("correction-loop-callout");
    expect(callout.textContent).toContain(
      "Fixed it in the sheet? Edit the cell, save, then re-scan. We'll re-read the sheet and clear this.",
    );
    // the existing non-blocking reassurance is NOT lost
    expect(panel.textContent).toMatch(/don.t block publishing/i);
    // no em dash in the callout copy
    expect(callout.textContent).not.toMatch(/[—]|--/);
  });

  test("zero warnings → no correction-loop callout (nothing to fix)", () => {
    const d = sectionData({ warnings: [] });
    const q = renderBody(d, "warnings");
    const panel = q.getByTestId(`wizard-step3-card-${DFID}-breakdown-warnings`);
    expect(within(panel).queryByTestId("correction-loop-callout")).toBeNull();
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

  test("XLSX-media stub (null contentUrl + media pair) mounts the <img>; null-fingerprint stub keeps the placeholder; BOTH count in the summary (spec §A4 / T-A5 — catches: pre-failing every stub without a legacy contentUrl)", () => {
    const mediaStub = diagramStub({
      objectId: "obj-media",
      contentUrl: null,
      mediaPartName: "xl/media/image1.png",
      embeddedFingerprint: "fp-media",
    });
    // Restage-only entry (lib/parser/types.ts:258): fingerprint null → not
    // servable by the preview route → placeholder upfront, no fetch attempt.
    const restageStub = diagramStub({
      objectId: "obj-restage",
      contentUrl: null,
      mediaPartName: "xl/media/image2.png",
      embeddedFingerprint: null,
    });
    const { scoped } = renderDiagrams(diagramsOf({ embeddedImages: [mediaStub, restageStub] }));
    // Queries scoped to each tile's own testid (anti-tautology): the sibling
    // tile also renders one of the two outcomes.
    const mediaTile = scoped.getByTestId(`${TILE_PREFIX}0`);
    expect(mediaTile.tagName).toBe("A");
    expect(mediaTile.querySelector("img")).not.toBeNull();
    expect(within(mediaTile).queryByText("Preview unavailable")).toBeNull();
    const restageTile = scoped.getByTestId(`${TILE_PREFIX}1`);
    expect(within(restageTile).getByText("Preview unavailable")).toBeTruthy();
    expect(restageTile.querySelector("img")).toBeNull();
    // Guard condition (§A4): non-servable stubs still count in summary/cap math.
    expect(scoped.getByText("2 embedded images")).toBeTruthy();
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
    // Focus ring-offset color matches the bg-bg content pane (impeccable
    // critique P2 — Tailwind's default offset is white → dark-mode halo).
    expect(link.className.split(/\s+/)).toContain("focus-visible:ring-offset-bg");
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

  test("alt: '' (and whitespace-only) falls back for BOTH the img alt and the anchor aria-label — a persisted empty alt must never yield a nameless link (impeccable audit P2, WCAG 2.4.4/4.1.2)", () => {
    for (const empty of ["", "   "]) {
      const stub = diagramStub({ alt: empty });
      const { container, scoped } = renderDiagrams(diagramsOf({ embeddedImages: [stub] }));
      const fallback = `Diagram from ${stub.sheetTab}`;
      const tile = scoped.getByTestId(`${TILE_PREFIX}0`);
      expect(tile.tagName).toBe("A");
      expect(tile.getAttribute("aria-label")).toBe(fallback);
      expect(container.querySelector("img")?.getAttribute("alt")).toBe(fallback);
      cleanup();
    }
  });

  test("a real alt names both the img and the wrapping anchor (aria-label mirrors alt)", () => {
    const stub = diagramStub({ alt: "Stage plot" });
    const { scoped } = renderDiagrams(diagramsOf({ embeddedImages: [stub] }));
    const tile = scoped.getByTestId(`${TILE_PREFIX}0`);
    expect(tile.getAttribute("aria-label")).toBe("Stage plot");
    expect(tile.querySelector("img")?.getAttribute("alt")).toBe("Stage plot");
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

// ── RoomsBreakdown — redesigned per-room cards ──────────────────────────────
// Mock: "Step 3 Review - Publish (B)" (docs/superpowers/specs/
// 2026-07-04-rooms-scope-cards-redesign-mock). Each room is a self-contained
// bordered card: an accent-tinted header (name + humanized kind pill + floor,
// then Set·Show·Strike meta with Show emphasized, Setup, Room Dimensions) over
// a fixed 5-row discipline scope list. Empty disciplines read "Not specified".
describe("RoomsBreakdown — redesigned per-room cards", () => {
  const FULL_ROOM: RoomRow = {
    kind: "gs",
    name: "GRAND BALLROOM",
    dimensions: "82' x 94' x 14'",
    floor: "8th Floor",
    setup: "17 tables of 8, center aisle",
    set_time: "Sep 9 · 8:00 AM",
    show_time: "Sep 10 · 7:45 AM",
    strike_time: "Sep 12 · 5:00 PM",
    audio: "L-Acoustics K2",
    video: "7.6m LED 2.9mm",
    lighting: "48x spot",
    scenic: null,
    power: null,
    digital_signage: null,
    other: null,
    notes: null,
  };

  function roomsData(rooms: RoomRow[]): StagedSectionData {
    return sectionData({ rooms });
  }

  function card(i: number, q: ReturnType<typeof renderBody>): HTMLElement {
    const scope = q.getByTestId(`wizard-step3-card-${DFID}-room-${i}-scope`);
    const li = scope.closest("li");
    if (!li) throw new Error(`room ${i} card <li> not found`);
    return li as HTMLElement;
  }

  // A room whose every A/V discipline is empty (null OR an "N/A"/"Not specified"
  // sentinel, case/spacing tolerant) — e.g. an "additional rooms" placeholder
  // that only holds a setup note. roomHasScope → false, so it is NOT counted.
  const NO_AV_ROOM: RoomRow = {
    ...FULL_ROOM,
    kind: "additional",
    name: "Boardroom (TBD)",
    audio: "N/A",
    video: null,
    lighting: "Not specified",
    scenic: null,
    other: "  n/a ",
  };

  test("Rooms & scope count EXCLUDES rooms with no A/V, but they still RENDER (owner decision 2026-07-06)", () => {
    const roomsFixture = [FULL_ROOM, NO_AV_ROOM];
    // Premise guard (anti-tautology): exactly one of the two has A/V scope.
    expect(roomHasScope(FULL_ROOM)).toBe(true);
    expect(roomHasScope(NO_AV_ROOM)).toBe(false);
    const expected = roomsFixture.filter(roomHasScope).length; // === 1, derived not hardcoded
    expect(expected).toBe(1);

    const q = renderBody(roomsData(roomsFixture), "rooms");
    // BOTH rooms render (the no-A/V room is not hidden, just uncounted).
    expect(q.getByTestId(`wizard-step3-card-${DFID}-room-0-scope`)).toBeTruthy();
    expect(q.getByTestId(`wizard-step3-card-${DFID}-room-1-scope`)).toBeTruthy();
    // The header count reflects ONLY the A/V-scoped rooms. Scope to the heading
    // (the non-chrome fallback renders the count inside the section <h4>) so a
    // "(5)"-shaped body value can't satisfy the assertion.
    const heading = q.getByTestId(`wizard-step3-card-${DFID}-breakdown-rooms`).querySelector("h4")!;
    expect(heading.textContent).toContain(`(${expected})`);
    expect(heading.textContent).not.toContain(`(${roomsFixture.length})`); // never the raw length
  });

  test("each room is a bordered card with an accent-tinted header holding name, kind pill, and floor", () => {
    const q = renderBody(roomsData([FULL_ROOM]), "rooms");
    const li = card(0, q);
    expect(li.className).toContain("rounded-md");
    expect(li.className).toContain("border");

    const header = q.getByTestId(`wizard-step3-card-${DFID}-room-0-header`);
    // Accent-tinted header panel (mock --accent-tint → bg-accent/… opacity).
    expect(header.className).toMatch(/bg-accent\//);
    const scoped = within(header);
    expect(scoped.getByText("GRAND BALLROOM")).toBeTruthy();
    expect(scoped.getByText("General session")).toBeTruthy(); // humanized kind
    expect(scoped.getByText("8th Floor")).toBeTruthy();
  });

  test("kind pill is humanized, never the raw enum", () => {
    const q = renderBody(
      roomsData([
        { ...FULL_ROOM, kind: "gs", name: "GS Room" },
        { ...FULL_ROOM, kind: "breakout", name: "BO Room" },
        { ...FULL_ROOM, kind: "additional", name: "Add Room" },
      ]),
      "rooms",
    );
    expect(within(card(0, q)).getByText("General session")).toBeTruthy();
    expect(within(card(1, q)).getByText("Breakout")).toBeTruthy();
    expect(within(card(2, q)).getByText("Additional")).toBeTruthy();
    // Raw enum tokens must not leak as visible pill text.
    expect(q.container.textContent).not.toContain("gs");
    expect(q.container.textContent).not.toContain("additional");
  });

  test("Set·Show·Strike meta renders all three, with Show emphasized in the accent color", () => {
    const q = renderBody(roomsData([FULL_ROOM]), "rooms");
    const times = q.getByTestId(`wizard-step3-card-${DFID}-room-0-times`);
    const scoped = within(times);
    expect(scoped.getByText("Set")).toBeTruthy();
    expect(scoped.getByText("Show")).toBeTruthy();
    expect(scoped.getByText("Strike")).toBeTruthy();
    expect(scoped.getByText("Sep 9 · 8:00 AM")).toBeTruthy();
    expect(scoped.getByText("Sep 12 · 5:00 PM")).toBeTruthy();
    // The Show value is the emphasized one (accent-on-bg), Set/Strike are not.
    const showVal = scoped.getByText("Sep 10 · 7:45 AM");
    expect(showVal.className).toContain("text-accent-on-bg");
    expect(scoped.getByText("Sep 9 · 8:00 AM").className).not.toContain("text-accent-on-bg");
  });

  test("Setup and Room Dimensions render their labels + values", () => {
    const q = renderBody(roomsData([FULL_ROOM]), "rooms");
    const li = card(0, q);
    const scoped = within(li);
    expect(scoped.getByText("Setup")).toBeTruthy();
    expect(scoped.getByText(/17 tables of 8/)).toBeTruthy();
    expect(scoped.getByText("Room Dimensions")).toBeTruthy();
    expect(scoped.getByText("82' x 94' x 14'")).toBeTruthy();
  });

  test("scope list shows all 5 disciplines, gear-first; parsed values as-parsed", () => {
    const q = renderBody(roomsData([FULL_ROOM]), "rooms");
    const scope = q.getByTestId(`wizard-step3-card-${DFID}-room-0-scope`);
    const rows = scope.querySelectorAll("li");
    expect(rows).toHaveLength(5);
    const keys = Array.from(scope.querySelectorAll("li")).map(
      (li) => within(li as HTMLElement).getByTestId("room-scope-key").textContent,
    );
    // FULL_ROOM's gear (Audio/Video/Lighting) already precedes its empties
    // (Scenic/Other), so the gear-first sort preserves the canonical order here.
    expect(keys).toEqual(["Audio", "Video", "Lighting", "Scenic", "Other"]);
    // Parsed values shown as-parsed (review surface).
    expect(within(scope).getByText("L-Acoustics K2")).toBeTruthy();
    expect(within(scope).getByText("48x spot")).toBeTruthy();
  });

  test("disciplines with gear sort ABOVE empty (null / N/A / Not specified) ones; stable within each group (owner decision 2026-07-05)", () => {
    // audio empty, video has gear, lighting "N/A", scenic has gear, other "Not
    // specified" → gear group = [Video, Scenic] (original order), empty group =
    // [Audio, Lighting, Other] (original order). Catches: no sort (audio-first),
    // or an unstable sort that scrambles same-group order.
    const MIXED: RoomRow = {
      ...FULL_ROOM,
      name: "MIXED",
      audio: null,
      video: "d&b V-Series",
      lighting: "N/A",
      scenic: "Grey spandex",
      other: "Not specified",
    };
    const q = renderBody(roomsData([MIXED]), "rooms");
    const scope = q.getByTestId(`wizard-step3-card-${DFID}-room-0-scope`);
    const keys = Array.from(scope.querySelectorAll("li")).map(
      (li) => within(li as HTMLElement).getByTestId("room-scope-key").textContent,
    );
    expect(keys).toEqual(["Video", "Scenic", "Audio", "Lighting", "Other"]);
  });

  test('empty disciplines read "Not specified" (muted italic), never "Not needed"', () => {
    const q = renderBody(roomsData([FULL_ROOM]), "rooms");
    const scope = q.getByTestId(`wizard-step3-card-${DFID}-room-0-scope`);
    // FULL_ROOM has scenic + other null → exactly two "Not specified" rows.
    const naVals = within(scope).getAllByText("Not specified");
    expect(naVals).toHaveLength(2);
    for (const v of naVals) {
      expect(v.className).toContain("italic");
      // Muted but WCAG-AA legible (subtle, not faint) — impeccable audit P2.
      expect(v.className).toContain("text-text-subtle");
    }
    expect(scope.textContent).not.toContain("Not needed");
  });

  test("scope values are shown as-parsed on this review surface (sentinels visible, not hidden)", () => {
    const q = renderBody(roomsData([{ ...FULL_ROOM, audio: "TBD" }]), "rooms");
    const scope = q.getByTestId(`wizard-step3-card-${DFID}-room-0-scope`);
    expect(within(scope).getByText("TBD")).toBeTruthy();
  });

  test("a room with no header detail fields still renders its 5 scope rows and no dangling divider", () => {
    const bare: RoomRow = {
      ...FULL_ROOM,
      floor: null,
      setup: null,
      dimensions: null,
      set_time: null,
      show_time: null,
      strike_time: null,
    };
    const q = renderBody(roomsData([bare]), "rooms");
    // No times row when no times parsed.
    expect(q.queryByTestId(`wizard-step3-card-${DFID}-room-0-times`)).toBeNull();
    const scope = q.getByTestId(`wizard-step3-card-${DFID}-room-0-scope`);
    expect(scope.querySelectorAll("li")).toHaveLength(5);
    // Header still shows name + kind pill.
    expect(within(card(0, q)).getByText("GRAND BALLROOM")).toBeTruthy();
  });

  test("no side-stripe: no border-l class anywhere in the rooms body HTML (impeccable + §F ban)", () => {
    const { container } = renderBody(roomsData([FULL_ROOM]), "rooms");
    expect(container.innerHTML).not.toContain("border-l");
  });
});

// ── ReportIssueSection — §D progressive disclosure (T-D1 / T-D3) ─────────────
// The form subtree is gated behind a disclosure trigger; `draft`/`status` and
// the submit flow live at component level so they SURVIVE collapse/re-expand.
// Failure modes: disclosure missing, focus lost on expand, draft wiped,
// status/submit state moved into the conditionally-mounted subtree, or the
// pending POST orphaned by a mid-flight collapse.

describe("ReportIssueSection — §D disclosure (collapsed by default; state survives collapse)", () => {
  const TOGGLE = `wizard-step3-card-${DFID}-report-toggle`;
  const TEXTAREA = `wizard-step3-card-${DFID}-report-textarea`;
  const SUBMIT = `wizard-step3-card-${DFID}-report-submit`;
  const STATUS = `wizard-step3-card-${DFID}-report-status`;
  // Mirrors reportAttemptStorageKey (step3ReviewSections.tsx) — deliberately
  // restated so a key-format drift fails here.
  const STORAGE_KEY = `fxav-report-attempt-wizard-${WSID}-${DFID}`;
  const SUCCESS_COPY = "Sent — thanks. The developer will take a look.";

  beforeEach(() => window.sessionStorage.clear());
  afterEach(() => vi.unstubAllGlobals());

  test("T-D1: collapsed by default — toggle 'Write a report' with aria-expanded=false, textarea ABSENT; expand mounts the form (aria-controls wired) + focuses the textarea; a typed draft survives collapse → re-expand", async () => {
    const q = renderBody(sectionData(), "report");
    const toggle = q.getByTestId(TOGGLE);
    expect(toggle.textContent).toBe("Write a report");
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(q.queryByTestId(TEXTAREA)).toBeNull();

    fireEvent.click(toggle); // expand
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    const textarea = q.getByTestId(TEXTAREA) as HTMLTextAreaElement;
    const controls = toggle.getAttribute("aria-controls");
    expect(controls).toBeTruthy();
    const form = document.getElementById(controls!)!;
    expect(form.tagName).toBe("FORM");
    expect(form.contains(textarea)).toBe(true);
    // Async focus contract (§D1) — poll, never assert synchronously.
    await waitFor(() => expect(document.activeElement).toBe(textarea));

    fireEvent.change(textarea, { target: { value: "the crew list is wrong" } });
    fireEvent.click(toggle); // collapse — subtree unmounts, state persists
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(q.queryByTestId(TEXTAREA)).toBeNull();
    fireEvent.click(toggle); // re-expand
    expect((q.getByTestId(TEXTAREA) as HTMLTextAreaElement).value).toBe("the crew list is wrong");
  });

  test("T-D3a: submit → success, collapse, re-expand — the sent confirmation still renders (status lives OUTSIDE the conditional subtree)", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({ ok: true, status: "created" }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const q = renderBody(sectionData(), "report");
    fireEvent.click(q.getByTestId(TOGGLE));
    fireEvent.change(q.getByTestId(TEXTAREA), { target: { value: "something broke" } });
    fireEvent.click(q.getByTestId(SUBMIT));
    await waitFor(() => expect(q.getByTestId(STATUS).textContent).toBe(SUCCESS_COPY));

    fireEvent.click(q.getByTestId(TOGGLE)); // collapse
    expect(q.queryByTestId(STATUS)).toBeNull();
    fireEvent.click(q.getByTestId(TOGGLE)); // re-expand
    expect(q.getByTestId(STATUS).textContent).toBe(SUCCESS_COPY);
  });

  test("T-D3b: collapse while pending — the in-flight POST settles fire-and-forget; re-expand renders success and the sessionStorage attempt key is rotated (removed)", async () => {
    let resolveFetch!: (r: unknown) => void;
    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          new Promise((resolve) => {
            resolveFetch = resolve;
          }),
      ),
    );
    const q = renderBody(sectionData(), "report");
    fireEvent.click(q.getByTestId(TOGGLE));
    fireEvent.change(q.getByTestId(TEXTAREA), { target: { value: "mid-flight collapse" } });
    fireEvent.click(q.getByTestId(SUBMIT));
    expect(q.getByTestId(STATUS).textContent).toBe("Sending…");
    expect(window.sessionStorage.getItem(STORAGE_KEY)).toBeTruthy(); // key persisted for the attempt

    fireEvent.click(q.getByTestId(TOGGLE)); // collapse mid-flight — allowed (§D1 guards)
    expect(q.queryByTestId(STATUS)).toBeNull();
    await act(async () => {
      resolveFetch({ ok: true, status: 201, json: async () => ({ ok: true, status: "created" }) });
    });
    // Rotate-on-success is observable while collapsed (spec T-D3).
    expect(window.sessionStorage.getItem(STORAGE_KEY)).toBeNull();
    fireEvent.click(q.getByTestId(TOGGLE)); // re-expand
    expect(q.getByTestId(STATUS).textContent).toBe(SUCCESS_COPY);
  });
});
