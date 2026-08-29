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
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

// The staged ignore action is a "use server" module; the focus repair below asserts
// what happens on its SUCCESS branch, which the real action never reaches under test
// (no admin session). Mocked to the ok arm so the branch is reachable at all.
const stagedIgnoreImpl: { current: () => Promise<unknown> } = {
  current: async () => ({ ok: true, state: "ignored" }),
};
vi.mock("@/app/admin/onboarding/_actions/stagedWarningIgnore", () => ({
  setStagedWarningIgnore: () => stagedIgnoreImpl.current(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/admin",
  useSearchParams: () => new URLSearchParams(),
}));
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
  REPORT_GENERIC_ERROR_COPY,
  REPORT_MESSAGE_MAX_CHARS,
  reviewWarningTitle,
  roomHasScope,
  Step3RunStateContext,
  step3Sections,
  STEP3_SECTION_GROUPS,
  type Step3SectionDef,
} from "@/components/admin/wizard/step3ReviewSections";
import {
  buildStagedSectionData,
  type StagedSectionData,
} from "@/components/admin/review/sectionData";
import { buildParseResult, stagedRow, show, STEP3_FIXTURE_WSID } from "./_step3ReviewFixture";

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
    ...buildStagedSectionData({
      pr,
      row,
      dfid,
      wizardSessionId: WSID,
      crewMembers: pr.crewMembers,
      rooms: pr.rooms,
      hotels: pr.hotelReservations,
      pullSheet: pr.pullSheet ?? [],
      archivedPullSheetTabs: pr.archivedPullSheetTabs ?? [],
      pullSheetOverride: null,
      ros: pr.runOfShow ?? {},
      warnings: pr.warnings,
      agendaBaseline: [],
      useRawDecisions: [],
    }),
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
    warnings: "Sheet warnings",
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
  // Owner decision (2026-07-05): only Crew, Contacts, Rooms, and Sheet warnings
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
    // warning-surface-trim §3.2: every railCount now takes a second `opts`
    // argument carrying the trim gate. Only the `warnings` row reads it; these
    // assertions pass the gate-OFF value, which is the staged wizard's state and
    // therefore the behavior this suite has always pinned.
    const railOpts = { routedWarningsRenderElsewhere: false };
    // Values derive from the fixture's OWN dimensions (anti-tautology).
    expect(defById(defs, "crew").railCount!(d, railOpts)).toBe(d.crewMembers.length);
    // Rooms rail count = only A/V-scoped rooms (roomHasScope), NOT raw length.
    // The default fixture rooms all carry A/V, so scoped === length here.
    expect(defById(defs, "rooms").railCount!(d, railOpts)).toBe(
      d.rooms.filter(roomHasScope).length,
    );
    // And with a no-A/V room MIXED in, the rail count drops it (exclusion path).
    const mixed = sectionData({ rooms: [...d.rooms, { ...d.rooms[0]!, video: null }] });
    expect(defById(step3Sections(mixed), "rooms").railCount!(mixed, railOpts)).toBe(d.rooms.length);
    expect(defById(defs, "warnings").railCount!(d, railOpts)).toBe(d.warnings.length);
    // Contacts: block count as rendered today — fixture has no client contact
    // and no contacts → 0.
    expect(defById(defs, "contacts").railCount!(d, railOpts)).toBe(0);
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
  // §S3C-1: flagged dot is filled (`bg-status-review`); clean dot is a hollow
  // ring (`border-status-positive`). Match either via the shared `status-` stem.
  const DOT = '[class*="status-"]';
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
    expect(railItem(q, "rooms").querySelector(DOT)!.className).toMatch(
      /\bborder-status-positive\b/,
    );
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
        `+${stubs.length - DIAGRAM_TILE_CAP} more. All images are snapshotted when the show publishes.`,
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

  /*
   * spec 2026-08-07-step3-a11y-cluster §2.4 / AC-5, closing
   * NEWTAB-A11Y-RESIDUE-1(a). All three tests below encoded the old
   * belt-and-braces contract, where the wrapping <a> and the inner <img> BOTH
   * carried the same name and a screen reader navigating into the link heard it
   * twice. The anchor's aria-label (step3ReviewSections.tsx:3706) now solves the
   * nameless-link risk permanently, including its empty-alt fallback, so the
   * duplicate alt is redundant and the img becomes decorative.
   *
   * This deliberately REVERSES a previously accepted audit fix (spec R5), which
   * is why the anchor half of each test is preserved unchanged and each name is
   * rewritten to state the new contract — a name still promising the old one is
   * how the next reader concludes the change was a mistake.
   */

  test("the img is decorative (alt=''), and the ANCHOR carries the sheetTab-derived fallback name when alt is absent", () => {
    const stub = diagramStub(); // no alt
    const { container, scoped } = renderDiagrams(diagramsOf({ embeddedImages: [stub] }));
    expect(container.querySelector("img")?.getAttribute("alt")).toBe("");
    // Without this the test would no longer check the fallback AT ALL and would
    // be strictly weaker than the one it replaces (spec §2.4).
    const tile = scoped.getByTestId(`${TILE_PREFIX}0`);
    expect(tile.getAttribute("aria-label")).toBe(
      `Diagram from ${stub.sheetTab} (opens in a new tab)`,
    );
  });

  test("alt: '' (and whitespace-only) leaves the img decorative while the ANCHOR still names the tile — a persisted empty alt must never yield a nameless link (WCAG 2.4.4/4.1.2)", () => {
    for (const empty of ["", "   "]) {
      const stub = diagramStub({ alt: empty });
      const { container, scoped } = renderDiagrams(diagramsOf({ embeddedImages: [stub] }));
      const fallback = `Diagram from ${stub.sheetTab}`;
      const tile = scoped.getByTestId(`${TILE_PREFIX}0`);
      // The anchor half is the load-bearing contract and is UNCHANGED.
      expect(tile.tagName).toBe("A");
      expect(tile.getAttribute("aria-label")).toBe(`${fallback} (opens in a new tab)`);
      expect(container.querySelector("img")?.getAttribute("alt")).toBe("");
      cleanup();
    }
  });

  test("a real alt names the tile ONCE, on the wrapping anchor; the img stays decorative", () => {
    const stub = diagramStub({ alt: "Stage plot" });
    const { scoped } = renderDiagrams(diagramsOf({ embeddedImages: [stub] }));
    const tile = scoped.getByTestId(`${TILE_PREFIX}0`);
    expect(tile.getAttribute("aria-label")).toBe("Stage plot (opens in a new tab)");
    expect(tile.querySelector("img")?.getAttribute("alt")).toBe("");
  });

  test("tile img src (and wrapping anchor href) is the Task-3 staged-diagram route URL derived from the fixture", () => {
    const stub = diagramStub({ objectId: "obj-abc_123" });
    const { scoped } = renderDiagrams(diagramsOf({ embeddedImages: [stub] }));
    const tile = scoped.getByTestId(`${TILE_PREFIX}0`);
    const img = tile.querySelector("img");
    const expected = `/api/admin/onboarding/staged-diagram/${WSID}/${DFID}/${encodeURIComponent(stub.objectId)}`;
    // Path and origin separately: `next/image` writes an absolute `src`, so the
    // single relative literal this replaces compared a path to a full URL. The
    // pair is stronger than the literal was — that one string pinned neither
    // path nor origin on its own. Convention from
    // tests/components/diagrams/Gallery.test.tsx:246-248.
    const src = new URL(img?.getAttribute("src") ?? "", document.baseURI);
    expect(src.pathname).toBe(expected);
    expect(src.origin).toBe(window.location.origin);
    expect(tile.tagName).toBe("A");
    // The anchor href is authored by us and stays relative — asserted as the
    // literal, which is the right form for a value nothing normalizes.
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
  const SUCCESS_COPY = "Sent. Thanks, the developer will take a look.";

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

  test("T-D3z: the report status region is mounted while the disclosure is COLLAPSED", () => {
    // BL-LIVE-REGION-AST-WALK-RESIDUE, the failing half. The send is
    // asynchronous and the operator can collapse the disclosure mid-flight, so
    // the outcome settles while the region is ABSENT and re-expansion mounts the
    // region together with its already-settled text — a dead announcement, the
    // exact class defect. The region has to pre-exist the text, which means
    // existing at the one moment there is no form at all.
    const q = renderBody(sectionData(), "report");
    expect(q.queryByTestId(TEXTAREA)).toBeNull(); // genuinely collapsed
    const status = q.getByTestId(STATUS);
    expect(status.getAttribute("role")).toBe("status");
    expect(status.getAttribute("aria-live")).toBe("polite");
    expect(status.textContent).toBe("");
    // Present for AT, invisible on screen: the collapsed disclosure must not
    // grow a visible status line or a box.
    expect(status.className).toContain("sr-only");
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
    // The region survives the collapse rather than unmounting with the form: it
    // goes visually hidden, keeping the settled copy available to AT.
    expect(q.getByTestId(STATUS).className).toContain("sr-only");
    expect(q.getByTestId(STATUS).textContent).toBe(SUCCESS_COPY);
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
    // The region PRE-EXISTS the settled text. This used to assert the region was
    // gone, which is the same statement as "the outcome cannot be announced":
    // it settles below, while collapsed, and a region that arrives with the
    // settled copy on re-expansion announces nothing (the class this repairs).
    const statusEl = q.getByTestId(STATUS);
    expect(statusEl.className).toContain("sr-only");
    expect(statusEl.textContent).toBe("Sending…");
    await act(async () => {
      resolveFetch({ ok: true, status: 201, json: async () => ({ ok: true, status: "created" }) });
    });
    // Settled INTO the same node while collapsed — the mutation AT observes.
    expect(q.getByTestId(STATUS)).toBe(statusEl);
    expect(statusEl.textContent).toBe(SUCCESS_COPY);
    // Rotate-on-success is observable while collapsed (spec T-D3).
    expect(window.sessionStorage.getItem(STORAGE_KEY)).toBeNull();
    fireEvent.click(q.getByTestId(TOGGLE)); // re-expand
    expect(q.getByTestId(STATUS).textContent).toBe(SUCCESS_COPY);
  });
});

// ── wizard-warning-ignore-controls spec §2.2 / §2.3 — Task 9 ───────────────────
//
// The panel learns the active/ignored partition. Two things make this delicate.
//
// First, the JUMP ANCHORS. Today `data-warning-index` and `data-attention-anchor`
// carry the RENDERED position `i`, which is valid only because staged rendering has
// always shown every row. Rendering the active subset breaks that equality, and the
// attention menu resolves rows by `[data-attention-anchor="warning:${index}"]` over
// the FULL array — so a rendered row keeping its position index sends every menu jump
// to the wrong warning, silently.
//
// Second, the no-`dq` render must stay byte-identical, because that is every
// published mount and every standalone fixture. The 62 cases above are the pin for
// that; they run untouched.

describe("WarningsBreakdown — dq threading and construction (§2.2)", () => {
  const WARN_A: ParseWarning = {
    severity: "warn",
    code: "UNKNOWN_FIELD",
    message: "Unrecognized field.",
    rawSnippet: "Hotel notes | double occupancy",
  };
  const WARN_B: ParseWarning = {
    severity: "warn",
    code: "UNKNOWN_FIELD",
    message: "Unrecognized field.",
    rawSnippet: "Parking | validated onsite",
  };
  const INFO_C: ParseWarning = {
    severity: "info",
    code: "SCHEDULE_NOTE",
    message: "Informational.",
    rawSnippet: "call time moved",
  };

  /** A model over `warnings`, ignoring the ORIGINAL indices in `ignoredIndices`. */
  function modelFor(warnings: ParseWarning[], ignoredIndices: number[]) {
    const active: Array<{ index: number; reportSurfaceId: string }> = [];
    const ignored: Array<{ index: number; reportSurfaceId: string }> = [];
    warnings.forEach((_, index) => {
      const item = { index, reportSurfaceId: `sid-${index}` };
      if (ignoredIndices.includes(index)) ignored.push(item);
      else active.push(item);
    });
    return { active, ignored };
  }

  const STAGED_TARGET = {
    kind: "staged" as const,
    wizardSessionId: STEP3_FIXTURE_WSID,
    driveFileId: DFID,
  };

  function dqFor(warnings: ParseWarning[], ignoredIndices: number[]) {
    return { target: STAGED_TARGET, model: modelFor(warnings, ignoredIndices) };
  }

  describe("dq construction from the production builder (§2.2)", () => {
    test("a FIRST-SEEN row builds the staged target from the row's own identity", () => {
      const pr = buildParseResult({ warnings: [WARN_A, WARN_B] });
      const row = stagedRow(pr, { warningModel: modelFor([WARN_A, WARN_B], [0]) });
      const d = sectionData({ warnings: [WARN_A, WARN_B] }, { row });
      expect(d.dq?.target).toEqual({
        kind: "staged",
        wizardSessionId: STEP3_FIXTURE_WSID,
        driveFileId: DFID,
      });
      expect(d.dq?.model).toEqual(row.warningModel);
    });

    test("a LINKED row builds the show target from linkedShowRef", () => {
      const pr = buildParseResult({ warnings: [WARN_A] });
      const row = stagedRow(pr, {
        warningModel: modelFor([WARN_A], []),
        linkedShowRef: { id: "show-77", slug: "east-coast-2026" },
      });
      const d = sectionData({ warnings: [WARN_A] }, { row });
      expect(d.dq?.target).toEqual({
        kind: "show",
        slug: "east-coast-2026",
        showId: "show-77",
      });
    });

    test("a row with NO warningModel gets no dq key at all", () => {
      const pr = buildParseResult({ warnings: [WARN_A] });
      const d = sectionData({ warnings: [WARN_A] }, { row: stagedRow(pr) });
      // Key ABSENT, not present-and-undefined: exactOptionalPropertyTypes, and the
      // registry gates the prop on presence.
      expect("dq" in d).toBe(false);
    });
  });

  describe("panel render with dq (§2.3)", () => {
    test("renders ONLY the active rows, each carrying its ORIGINAL index in every jump attribute", () => {
      // Index 0 ignored, index 1 active. A row that kept its RENDERED position would
      // carry 0 here and send the attention menu's `warning:1` entry nowhere.
      const warnings = [WARN_A, WARN_B];
      const q = renderBody(sectionData({ warnings }, { dq: dqFor(warnings, [0]) }), "warnings");
      const items = q.container.querySelectorAll("li[data-warning-index]");
      expect(items.length).toBe(1);
      const only = items[0]!;
      expect(only.getAttribute("data-warning-index")).toBe("1");
      expect(only.getAttribute("data-attention-anchor")).toBe("warning:1");
      expect(only.getAttribute("data-testid")).toBe(`wizard-step3-card-${DFID}-warning-1`);
    });

    test("warn rows get dq-controls; info rows get none", () => {
      const warnings = [WARN_A, INFO_C];
      const q = renderBody(sectionData({ warnings }, { dq: dqFor(warnings, []) }), "warnings");
      const rows = Array.from(q.container.querySelectorAll("li[data-warning-index]"));
      const byIndex = new Map(rows.map((r) => [r.getAttribute("data-warning-index"), r]));
      expect(within(byIndex.get("0") as HTMLElement).queryByTestId("dq-controls")).toBeTruthy();
      expect(within(byIndex.get("1") as HTMLElement).queryByTestId("dq-controls")).toBeNull();
    });

    test("a snippet-less warn row renders Report but not Ignore", () => {
      const noSnippet: ParseWarning = {
        severity: "warn",
        code: "UNKNOWN_FIELD",
        message: "Unrecognized field.",
      };
      const warnings = [noSnippet];
      const q = renderBody(sectionData({ warnings }, { dq: dqFor(warnings, []) }), "warnings");
      const controls = q.getByTestId("dq-controls");
      expect(within(controls).getByRole("button", { name: /report/i })).toBeTruthy();
      expect(within(controls).queryByRole("button", { name: /^ignore$/i })).toBeNull();
    });

    test("dfid null renders NO controls in either arm (the panel's existing gate)", () => {
      const warnings = [WARN_A];
      for (const target of [STAGED_TARGET, { kind: "show" as const, slug: "s", showId: "id-1" }]) {
        const q = renderBody(
          sectionData(
            { warnings },
            {
              // The panel receives `dfid={s.driveFileId}` from the registry — the
              // SectionCore locator, NOT StagedSectionData.dfid. Overriding the wrong
              // one leaves the real id flowing through and the assertion vacuous.
              driveFileId: null,
              dq: { target, model: modelFor(warnings, []) },
            },
          ),
          "warnings",
        );
        expect(q.queryByTestId("dq-controls")).toBeNull();
        q.unmount();
      }
    });

    test("an out-of-range model index is SKIPPED rather than crashing the panel", () => {
      // A model built against a longer array than the one rendered. Server-side this
      // cannot happen (both derive from one array in one pass), which is exactly why
      // the client must not assume it.
      const warnings = [WARN_A];
      const q = renderBody(
        sectionData(
          { warnings },
          {
            dq: {
              target: STAGED_TARGET,
              model: {
                active: [
                  { index: 0, reportSurfaceId: "sid-0" },
                  { index: 7, reportSurfaceId: "sid-7" },
                ],
                ignored: [],
              },
            },
          },
        ),
        "warnings",
      );
      expect(q.container.querySelectorAll("li[data-warning-index]").length).toBe(1);
    });
  });

  describe("Ignored (N) disclosure (§2.3)", () => {
    test("renders a details disclosure with ignored rows in ignored mode and NO jump attributes", () => {
      const warnings = [WARN_A, WARN_B];
      const q = renderBody(sectionData({ warnings }, { dq: dqFor(warnings, [0]) }), "warnings");
      const details = q.getByTestId(`wizard-step3-card-${DFID}-ignored-warnings`);
      expect(details.tagName.toLowerCase()).toBe("details");
      expect(details.textContent).toContain("Ignored (1)");

      // A disclosure row must carry NEITHER jump attribute — it is filtered out of
      // attention, so a stale anchor there would shadow the active target.
      const list = q.getByTestId(`wizard-step3-card-${DFID}-ignored-list`);
      expect(list.querySelectorAll("[data-attention-anchor]").length).toBe(0);
      expect(list.querySelectorAll("[data-warning-index]").length).toBe(0);
      // And it renders the un-ignore affordance, not the ignore one.
      expect(within(list).getByRole("button", { name: /un-ignore/i })).toBeTruthy();
    });

    test("no ignored rows → no disclosure element at all, not an empty one", () => {
      const warnings = [WARN_A];
      const q = renderBody(sectionData({ warnings }, { dq: dqFor(warnings, []) }), "warnings");
      expect(q.queryByTestId(`wizard-step3-card-${DFID}-ignored-warnings`)).toBeNull();
    });

    test("closed → open reveals the body INSTANTLY, with only the chevron animating", () => {
      const warnings = [WARN_A, WARN_B];
      const q = renderBody(sectionData({ warnings }, { dq: dqFor(warnings, [0]) }), "warnings");
      const details = q.getByTestId(
        `wizard-step3-card-${DFID}-ignored-warnings`,
      ) as HTMLDetailsElement;
      expect(details.open).toBe(false);
      fireEvent.click(q.getByTestId(`wizard-step3-card-${DFID}-ignored-summary`));

      const list = q.getByTestId(`wizard-step3-card-${DFID}-ignored-list`);
      // No height/opacity wrapper around the body: the published pattern this copies
      // is "chevron transform only, body instant".
      expect(list.className).not.toMatch(/transition|animate|duration/);
      // The chevron itself DOES rotate, and the group-open class is what drives it.
      const summary = q.getByTestId(`wizard-step3-card-${DFID}-ignored-summary`);
      expect(summary.innerHTML).toContain("group-open:rotate-90");
    });

    test("all rows ignored → the clean sentence PLUS the disclosure, never the empty-warnings one", () => {
      const warnings = [WARN_A];
      const q = renderBody(sectionData({ warnings }, { dq: dqFor(warnings, [0]) }), "warnings");
      expect(q.getByTestId(`wizard-step3-card-${DFID}-warnings-clean`).textContent).toContain(
        "Nothing needs a look on this sheet.",
      );
      expect(q.queryByTestId(`wizard-step3-card-${DFID}-warnings-empty`)).toBeNull();
      expect(q.getByTestId(`wizard-step3-card-${DFID}-ignored-warnings`)).toBeTruthy();
    });

    test("zero warnings → the existing empty sentence and no disclosure", () => {
      const q = renderBody(sectionData({ warnings: [] }, { dq: dqFor([], []) }), "warnings");
      expect(q.getByTestId(`wizard-step3-card-${DFID}-warnings-empty`)).toBeTruthy();
      expect(q.queryByTestId(`wizard-step3-card-${DFID}-ignored-warnings`)).toBeNull();
    });
  });

  describe("registry forwarding (§2.2)", () => {
    test("the warnings section def passes dq through to the panel", () => {
      // Rendered through the REGISTRY, not by calling WarningsBreakdown directly: the
      // pass-through is the wiring under test, and a panel that accepts the prop while
      // the registry never sends it renders no controls in production.
      const warnings = [WARN_A];
      const q = renderBody(sectionData({ warnings }, { dq: dqFor(warnings, []) }), "warnings");
      expect(q.getByTestId("dq-controls")).toBeTruthy();
    });

    test("no BulkIgnoreControls in the wizard panel (§1.1.3 deferred, absence probe)", () => {
      const warnings = [WARN_A, WARN_B];
      const q = renderBody(sectionData({ warnings }, { dq: dqFor(warnings, []) }), "warnings");
      expect(q.queryByTestId("bulk-ignore-controls")).toBeNull();
    });
  });

  describe("row identity survives an upstream insert (§2.3 React keys)", () => {
    // React keys are not DOM-visible, and deriving expectations from stableWarningKeys
    // would test the helper against itself. So: open a row-local control state, then
    // re-render with a DIFFERENT warning inserted ABOVE it. Content-derived keys keep
    // the state on the row it belongs to; index-derived keys migrate it to the
    // neighbour, which is the rescan bug the content keys exist to prevent.
    async function openErrorPlateOn(
      q: ReturnType<typeof render>,
      surfaceId: string,
    ): Promise<void> {
      const btn = q.getByTestId(`dq-ignore-${surfaceId}`);
      fireEvent.click(btn);
      await waitFor(() => expect(q.getByTestId(`dq-error-${surfaceId}`)).toBeTruthy());
    }

    test("active list: the error plate follows the row's CONTENT, not its position", async () => {
      // The staged arm calls the server action, not fetch — fail the action so the
      // row-local error plate opens.
      stagedIgnoreImpl.current = async () => {
        throw new Error("network down");
      };
      const warnings = [WARN_B];
      const first = sectionData({ warnings }, { dq: dqFor(warnings, []) });
      const q = renderBody(first, "warnings");
      await openErrorPlateOn(q, "sid-0");

      // Insert WARN_A above WARN_B. WARN_B is now index 1, surface id sid-1.
      const grown = [WARN_A, WARN_B];
      const def = defById(
        step3Sections(sectionData({ warnings: grown }, { dq: dqFor(grown, []) })),
        "warnings",
      );
      q.rerender(<>{def.render(sectionData({ warnings: grown }, { dq: dqFor(grown, []) }))}</>);

      // The plate is on WARN_B's NEW surface id — it travelled with the content.
      await waitFor(() => expect(q.queryByTestId("dq-error-sid-1")).toBeTruthy());
      expect(q.queryByTestId("dq-error-sid-0")).toBeNull();
      stagedIgnoreImpl.current = async () => ({ ok: true, state: "ignored" });
    });
  });
});

// ── wizard-warning-ignore-controls spec §2.4 counts + §5 transitions — Task 11 ──
describe("panel + rail counts read the active partition (§2.4)", () => {
  const ACTIVE_WARN: ParseWarning = {
    severity: "warn",
    code: "FIELD_UNREADABLE",
    message: "Unreadable field.",
    rawSnippet: "Parking | validated onsite",
  };
  const IGNORED_WARN: ParseWarning = {
    severity: "warn",
    code: "FIELD_UNREADABLE",
    message: "Unreadable field.",
    rawSnippet: "Hotel notes | double occupancy",
  };
  const INFO_ROW: ParseWarning = {
    severity: "info",
    code: "SCHEDULE_NOTE",
    message: "Informational.",
  };
  // 1 ignored warn + 1 active warn + 1 info.
  const FIXTURE = [IGNORED_WARN, ACTIVE_WARN, INFO_ROW];
  const DQ = {
    target: {
      kind: "staged" as const,
      wizardSessionId: STEP3_FIXTURE_WSID,
      driveFileId: DFID,
    },
    model: {
      active: [
        { index: 1, reportSurfaceId: "sid-1" },
        { index: 2, reportSurfaceId: "sid-2" },
      ],
      ignored: [{ index: 0, reportSurfaceId: "sid-0" }],
    },
  };
  // Derived from the fixture: three rows, one ignored.
  const EXPECTED = FIXTURE.length - DQ.model.ignored.length;

  test("the heading count shows the active total, not the raw row count", () => {
    const q = renderBody(sectionData({ warnings: FIXTURE }, { dq: DQ }), "warnings");
    const heading = q.getByTestId(`wizard-step3-card-${DFID}-breakdown-warnings`);
    // Scope the extraction: clone the section and REMOVE the disclosure subtree first,
    // so the ignored row's own copy of a count-shaped string cannot satisfy this.
    const clone = heading.cloneNode(true) as HTMLElement;
    clone.querySelector(`[data-testid="wizard-step3-card-${DFID}-ignored-warnings"]`)?.remove();
    expect(clone.textContent).toContain(String(EXPECTED));
  });

  test("the rail count matches the heading for the same row", () => {
    const d = sectionData({ warnings: FIXTURE }, { dq: DQ });
    const def = defById(step3Sections(d), "warnings");
    expect(def.railCount?.(d, { routedWarningsRenderElsewhere: false })).toBe(EXPECTED);
  });

  test("with no dq the rail count is unchanged (published and standalone)", () => {
    const d = sectionData({ warnings: FIXTURE });
    const def = defById(step3Sections(d), "warnings");
    expect(def.railCount?.(d, { routedWarningsRenderElsewhere: false })).toBe(FIXTURE.length);
  });
});

describe("panel transition inventory (spec §5)", () => {
  const W: ParseWarning = {
    severity: "warn",
    code: "FIELD_UNREADABLE",
    message: "Unreadable field.",
    rawSnippet: "Parking | validated onsite",
  };
  const dq = (activeIdx: number[], ignoredIdx: number[]) => ({
    target: {
      kind: "staged" as const,
      wizardSessionId: STEP3_FIXTURE_WSID,
      driveFileId: DFID,
    },
    model: {
      active: activeIdx.map((index) => ({ index, reportSurfaceId: `sid-${index}` })),
      ignored: ignoredIdx.map((index) => ({ index, reportSurfaceId: `sid-${index}` })),
    },
  });

  test("no new AnimatePresence anywhere in the panel — every treatment is instant", () => {
    // §5: the ONLY animation this feature introduces is the disclosure chevron rotate,
    // which is a CSS transform. A mount/unmount animation would make the active↔ignored
    // swap lag the server truth it is supposed to be showing.
    const source = readFileSync(
      join(process.cwd(), "components/admin/wizard/step3ReviewSections.tsx"),
      "utf8",
    );
    expect(source).not.toMatch(/AnimatePresence/);
  });

  test("two active rows each own their control state (compound: second while first runs)", () => {
    const warnings = [W, { ...W, rawSnippet: "Storage | second row" }];
    const q = renderBody(sectionData({ warnings }, { dq: dq([0, 1], []) }), "warnings");
    const controls = q.getAllByTestId("dq-controls");
    expect(controls.length).toBe(2);
    // Distinct testids per row means distinct component instances, so neither row's
    // running state can disable the other's button.
    expect(q.getByTestId("dq-ignore-sid-0")).toBeTruthy();
    expect(q.getByTestId("dq-ignore-sid-1")).toBeTruthy();
    expect((q.getByTestId("dq-ignore-sid-1") as HTMLButtonElement).disabled).toBe(false);
  });
});

describe("jump-anchor contract survives the partition (§2.4)", () => {
  const W = (snippet: string): ParseWarning => ({
    severity: "warn",
    code: "FIELD_UNREADABLE",
    message: "Unreadable field.",
    rawSnippet: snippet,
  });

  test("the menu's `warning:1` entry resolves through the SAME selector the surface uses", () => {
    // With warning 0 ignored, the surviving row is the FULL-array index 1. The surface
    // resolves an attention jump with
    // `scroller.querySelector('[data-attention-anchor="${id}"]')`
    // (components/admin/review/ShowReviewSurface.tsx:583), so this asserts against that
    // exact selector expression rather than a testid that only the test knows.
    const warnings = [W("Hotel notes | double"), W("Parking | validated")];
    const q = renderBody(
      sectionData(
        { warnings },
        {
          dq: {
            target: {
              kind: "staged" as const,
              wizardSessionId: STEP3_FIXTURE_WSID,
              driveFileId: DFID,
            },
            model: {
              active: [{ index: 1, reportSurfaceId: "sid-1" }],
              ignored: [{ index: 0, reportSurfaceId: "sid-0" }],
            },
          },
        },
      ),
      "warnings",
    );
    const target = q.container.querySelector('[data-attention-anchor="warning:1"]');
    expect(target).toBeTruthy();
    // And the STALE anchor is gone — an ignored row keeping it would shadow this one.
    expect(q.container.querySelector('[data-attention-anchor="warning:0"]')).toBeNull();
  });
});

describe("§5 transition dispositions — publish-run independence", () => {
  test("an ignore control is NOT disabled while a publish run is active", () => {
    // The §4.4 footer freeze set does not include these controls, exactly as it does not
    // include the use-raw toggle. A freeze here would strand the operator mid-run with no
    // way to dismiss a warning they had already judged.
    const warnings: ParseWarning[] = [
      {
        severity: "warn",
        code: "FIELD_UNREADABLE",
        message: "Unreadable field.",
        rawSnippet: "Parking | validated onsite",
      },
    ];
    const d = sectionData(
      { warnings },
      {
        dq: {
          target: {
            kind: "staged" as const,
            wizardSessionId: STEP3_FIXTURE_WSID,
            driveFileId: DFID,
          },
          model: { active: [{ index: 0, reportSurfaceId: "sid-0" }], ignored: [] },
        },
      },
    );
    const def = defById(step3Sections(d), "warnings");
    const q = render(
      <Step3RunStateContext.Provider value={{ isPublishRunActive: true }}>
        {def.render(d)}
      </Step3RunStateContext.Provider>,
    );
    expect((q.getByTestId("dq-ignore-sid-0") as HTMLButtonElement).disabled).toBe(false);
  });
});

// ── Impeccable critique repairs (2026-08-28) ───────────────────────────────────
describe("impeccable critique repairs", () => {
  const W = (snippet: string): ParseWarning => ({
    severity: "warn",
    code: "UNKNOWN_FIELD",
    message: "Unrecognized field.",
    rawSnippet: snippet,
  });
  const dqFor = (activeIdx: number[], ignoredIdx: number[]) => ({
    target: {
      kind: "staged" as const,
      wizardSessionId: STEP3_FIXTURE_WSID,
      driveFileId: DFID,
    },
    model: {
      active: activeIdx.map((index) => ({ index, reportSurfaceId: `sid-${index}` })),
      ignored: ignoredIdx.map((index) => ({ index, reportSurfaceId: `sid-${index}` })),
    },
  });

  test("P1: an ignored row carries its Sheet row label, so identical titles stay distinguishable", () => {
    // Both warnings share the code, so `reviewWarningTitle` gives both the SAME class
    // title. Without the row label the drawer renders two identical lines above two
    // identical Un-ignore buttons and the operator cannot tell them apart.
    const warnings = [W("Hotel notes | double occupancy"), W("Parking | validated onsite")];
    const q = renderBody(sectionData({ warnings }, { dq: dqFor([], [0, 1]) }), "warnings");
    const list = q.getByTestId(`wizard-step3-card-${DFID}-ignored-list`);
    const rows = Array.from(list.querySelectorAll("li"));
    expect(rows).toHaveLength(2);

    const texts = rows.map((r) => r.textContent ?? "");
    // Derived from the fixture snippets, not hardcoded: the label is the part before
    // the pipe.
    expect(texts[0]).toContain("Hotel notes");
    expect(texts[1]).toContain("Parking");
    // And the premise that makes this test mean anything: the TITLES really are equal,
    // so the label is the only thing telling the rows apart.
    const titles = rows.map((r) => r.querySelector("span.text-sm")?.textContent ?? "");
    expect(titles[0]).toBe(titles[1]);
  });

  test("P1: the controls declare the panel's own ground, not a published card's", () => {
    // The panel card is `bg-surface`. Shipping the published `warning-bg` /
    // `surface-sunken` offsets here paints a focus halo in a colour the ground never
    // has — the exact defect the component's own comment warns about.
    const warnings = [W("Hotel notes | double occupancy")];
    const q = renderBody(sectionData({ warnings }, { dq: dqFor([0], []) }), "warnings");
    const btn = q.getByTestId("dq-ignore-sid-0");
    expect(btn.className).toContain("focus-visible:ring-offset-surface");
    expect(btn.className).not.toContain("ring-offset-warning-bg");
    expect(btn.className).not.toContain("ring-offset-surface-sunken");
  });

  test("P0: a successful ignore leaves focus INSIDE the panel, never on <body>", async () => {
    // Inside the review modal, focus on <body> escapes the Tab trap
    // (lib/a11y/dialogFocus.ts binds keydown to the panel container), so the next Tab
    // walks the background behind the dialog. The control hands focus to the panel's
    // anchor before the refresh unmounts it.
    const warnings = [W("Hotel notes | double occupancy")];
    const q = renderBody(sectionData({ warnings }, { dq: dqFor([0], []) }), "warnings");
    const panel = q.getByTestId(`wizard-step3-card-${DFID}-breakdown-warnings`);
    const btn = q.getByTestId("dq-ignore-sid-0");
    btn.focus();
    expect(document.activeElement).toBe(btn);

    fireEvent.click(btn);
    await waitFor(() => {
      expect(document.activeElement).not.toBe(btn);
    });
    expect(document.activeElement).not.toBe(document.body);
    expect(panel.contains(document.activeElement)).toBe(true);
  });
});

// ── Whole-diff review R1 repairs ──────────────────────────────────────────────
describe("whole-diff R1 repairs", () => {
  const UNKNOWN = (snippet: string): ParseWarning => ({
    severity: "warn",
    code: "UNKNOWN_FIELD",
    message: "Unrecognized field.",
    rawSnippet: snippet,
  });
  // The parser's two committed HOTEL_GUEST_SPLIT_AMBIGUOUS emit sites both write
  // `rawSnippet: params.rawCell`, so two of them differ ONLY by that cell.
  const HOTEL = (cell: string): ParseWarning => ({
    severity: "warn",
    code: "HOTEL_GUEST_SPLIT_AMBIGUOUS",
    message: "Ambiguous guest split.",
    rawSnippet: cell,
  });
  const dqFor = (activeIdx: number[], ignoredIdx: number[]) => ({
    target: {
      kind: "staged" as const,
      wizardSessionId: STEP3_FIXTURE_WSID,
      driveFileId: DFID,
    },
    model: {
      active: activeIdx.map((index) => ({ index, reportSurfaceId: `sid-${index}` })),
      ignored: ignoredIdx.map((index) => ({ index, reportSurfaceId: `sid-${index}` })),
    },
  });

  test("P1: a control-bearing row renders the catalog's controlsNote", () => {
    // The catalog copy is what promised this affordance; the wizard was the surface
    // where it was false. Expectation read from the CATALOG, never hardcoded — a test
    // carrying its own copy of the sentence would pass against a catalog edit.
    const expected = MESSAGE_CATALOG.UNKNOWN_FIELD.controlsNote as string;
    expect(typeof expected).toBe("string");
    const warnings = [UNKNOWN("Hotel notes | double occupancy")];
    const q = renderBody(sectionData({ warnings }, { dq: dqFor([0], []) }), "warnings");
    const note = q.getByTestId(`wizard-step3-card-${DFID}-warning-0-controls-note`);
    expect(note.textContent).toBe(expected);
  });

  test("P1: a row with NO controls renders no controlsNote", () => {
    // The 2026-08-27 §4.3 gate: the note describes controls, so it may not appear
    // where none mounted. An info row is the case that would otherwise leak it.
    const warnings: ParseWarning[] = [
      { severity: "info", code: "UNKNOWN_FIELD", message: "Informational." },
    ];
    const q = renderBody(sectionData({ warnings }, { dq: dqFor([0], []) }), "warnings");
    expect(q.queryByTestId(`wizard-step3-card-${DFID}-warning-0-controls-note`)).toBeNull();
  });

  test("P1: two ignored rows of a NON-UNKNOWN_FIELD family are still distinguishable", () => {
    // The earlier repair gated the discriminator to UNKNOWN_FIELD, so this family
    // rendered one repeated catalog title above two identical Un-ignore buttons.
    const warnings = [HOTEL("Room 214 | 2 guests"), HOTEL("Room 318 | 3 guests")];
    const q = renderBody(sectionData({ warnings }, { dq: dqFor([], [0, 1]) }), "warnings");
    const rows = Array.from(
      q.getByTestId(`wizard-step3-card-${DFID}-ignored-list`).querySelectorAll("li"),
    );
    expect(rows).toHaveLength(2);
    // Derived from the fixture cells, not hardcoded prose.
    expect(rows[0]?.textContent).toContain("Room 214");
    expect(rows[1]?.textContent).toContain("Room 318");
    // The premise that makes this discriminating: the TITLES really are identical.
    const titles = rows.map((r) => r.querySelector("span.text-sm")?.textContent ?? "");
    expect(titles[0]).toBe(titles[1]);
  });

  test("P1: a long snippet is capped rather than dominating the disclosure", () => {
    const long = "x".repeat(400);
    const q = renderBody(
      sectionData({ warnings: [HOTEL(long)] }, { dq: dqFor([], [0]) }),
      "warnings",
    );
    const text = q.getByTestId(`wizard-step3-card-${DFID}-ignored-list`).textContent ?? "";
    expect(text).toContain("…");
    expect(text.length).toBeLessThan(long.length);
  });
});

describe("whole-diff P0: the ignored control targets the store its ignore lives in", () => {
  const W: ParseWarning = {
    severity: "warn",
    code: "UNKNOWN_FIELD",
    message: "Unrecognized field.",
    rawSnippet: "Hotel notes | double occupancy",
  };

  test("a LINKED row's STAGED ignore routes Un-ignore to the staged action, not the slug route", async () => {
    // The row reads as a show row (it gained one via a concurrent finalize), but this
    // dismissal lives in the staged column. Routing by linkage sent it to the slug
    // route, which deletes nothing and still answers `unignored`, so the operator got
    // "Warning restored" and the warning stayed hidden.
    const d = sectionData(
      { warnings: [W] },
      {
        row: stagedRow(buildParseResult({ warnings: [W] }), {
          linkedShowRef: { id: "show-1", slug: "east-coast-2026" },
        }),
        dq: {
          target: { kind: "show" as const, slug: "east-coast-2026", showId: "show-1" },
          model: {
            active: [],
            ignored: [{ index: 0, reportSurfaceId: "sid-0", ignoreOrigin: "staged" as const }],
          },
        },
      },
    );
    const calls: Array<{ action: string }> = [];
    stagedIgnoreImpl.current = async () => {
      calls.push({ action: "staged" });
      return { ok: true, state: "unignored" };
    };
    const fetchMock = vi.fn(async () => {
      calls.push({ action: "fetch" });
      return { ok: true, json: async () => ({ status: "unignored" }) } as unknown as Response;
    });
    vi.stubGlobal("fetch", fetchMock);

    const q = renderBody(d, "warnings");
    const list = q.getByTestId(`wizard-step3-card-${DFID}-ignored-list`);
    fireEvent.click(within(list).getByRole("button", { name: /un-ignore/i }));
    await waitFor(() => expect(calls.length).toBe(1));

    // THE assertion: the staged action, not the slug route. The slug route would delete
    // nothing from the staged column and still answer `unignored`.
    expect(calls[0]?.action).toBe("staged");
    expect(fetchMock).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
    stagedIgnoreImpl.current = async () => ({ ok: true, state: "ignored" });
  });

  test("a LINKED row's DURABLE ignore keeps the show target", async () => {
    const d = sectionData(
      { warnings: [W] },
      {
        row: stagedRow(buildParseResult({ warnings: [W] }), {
          linkedShowRef: { id: "show-1", slug: "east-coast-2026" },
        }),
        dq: {
          target: { kind: "show" as const, slug: "east-coast-2026", showId: "show-1" },
          model: {
            active: [],
            ignored: [{ index: 0, reportSurfaceId: "sid-0", ignoreOrigin: "show" as const }],
          },
        },
      },
    );
    const calls: string[] = [];
    stagedIgnoreImpl.current = async () => {
      calls.push("staged");
      return { ok: true, state: "unignored" };
    };
    const fetchMock = vi.fn(async (url: unknown) => {
      calls.push(String(url));
      return { ok: true, json: async () => ({ status: "unignored" }) } as unknown as Response;
    });
    vi.stubGlobal("fetch", fetchMock);

    const q = renderBody(d, "warnings");
    fireEvent.click(
      within(q.getByTestId(`wizard-step3-card-${DFID}-ignored-list`)).getByRole("button", {
        name: /un-ignore/i,
      }),
    );
    await waitFor(() => expect(calls.length).toBe(1));
    expect(calls[0]).toBe("/api/admin/show/east-coast-2026/data-quality/unignore");
    vi.unstubAllGlobals();
    stagedIgnoreImpl.current = async () => ({ ok: true, state: "ignored" });
  });
});

// ── ReportIssueSection — draft persistence (BL-WIZARD-REPORT-DRAFT-LOST-ON-ESCAPE)
// Spec 2026-08-29-wizard-report-draft-escape.md §2, AC-4..AC-8, AC-10.
// The draft outlives the section's unmount, which is what a modal close is.
// Failure modes: the key unscoped (one show's draft appearing under another),
// a sent report returning as a ghost, a failed send losing the text it exists
// to keep, an over-length stored value defeating the cap, storage throwing and
// taking the section down with it, and a trigger label that lies about whether
// there is anything to continue.

describe("ReportIssueSection — draft persistence across unmount (spec §2)", () => {
  const TOGGLE = `wizard-step3-card-${DFID}-report-toggle`;
  const TEXTAREA = `wizard-step3-card-${DFID}-report-textarea`;
  const SUBMIT = `wizard-step3-card-${DFID}-report-submit`;
  const STATUS = `wizard-step3-card-${DFID}-report-status`;
  // Mirrors reportDraftStorageKey — deliberately restated so a key-format drift
  // fails HERE rather than silently orphaning every operator's saved draft.
  const DRAFT_KEY = `fxav-report-draft-wizard-${WSID}-${DFID}`;
  // The ATTEMPT key, restated here for the same reason DRAFT_KEY is: a format
  // drift should fail in this block rather than silently stop asserting.
  const ATTEMPT_KEY = `fxav-report-attempt-wizard-${WSID}-${DFID}`;
  const TYPED = "the crew list is missing two people";
  const SUCCESS_COPY = "Sent. Thanks, the developer will take a look.";

  beforeEach(() => window.sessionStorage.clear());
  afterEach(() => {
    vi.unstubAllGlobals();
    // This project sets no `restoreMocks`, so a Storage.prototype spy survives
    // the test that installed it and breaks every later one. Today the only
    // spying test is last in the file, which is luck, not a contract.
    vi.restoreAllMocks();
  });

  /** Expand and type, the way an operator reaches this field. */
  function typeInto(q: ReturnType<typeof renderBody>, text: string) {
    fireEvent.click(q.getByTestId(TOGGLE));
    fireEvent.change(q.getByTestId(TEXTAREA), { target: { value: text } });
  }

  test("AC-1/AC-2: a typed draft is written under the scoped key and restored on a fresh mount", () => {
    const q = renderBody(sectionData(), "report");
    typeInto(q, TYPED);
    expect(window.sessionStorage.getItem(DRAFT_KEY)).toBe(TYPED);

    cleanup(); // the unmount a modal close performs
    const q2 = renderBody(sectionData(), "report");
    fireEvent.click(q2.getByTestId(TOGGLE));
    expect((q2.getByTestId(TEXTAREA) as HTMLTextAreaElement).value).toBe(TYPED);
  });

  test("AC-8: the trigger says 'Continue your report' whenever the draft is non-empty, and reverts when it is cleared in place", () => {
    const q = renderBody(sectionData(), "report");
    expect(q.getByTestId(TOGGLE).textContent).toBe("Write a report");
    typeInto(q, TYPED);
    expect(q.getByTestId(TOGGLE).textContent).toBe("Continue your report");

    cleanup();
    const q2 = renderBody(sectionData(), "report");
    // Restored, and the trigger says so BEFORE the operator expands anything.
    expect(q2.getByTestId(TOGGLE).textContent).toBe("Continue your report");
    // Clearing in place must not leave the label promising a report to continue.
    fireEvent.click(q2.getByTestId(TOGGLE));
    fireEvent.change(q2.getByTestId(TEXTAREA), { target: { value: "" } });
    expect(q2.getByTestId(TOGGLE).textContent).toBe("Write a report");
    expect(window.sessionStorage.getItem(DRAFT_KEY)).toBeNull(); // emptied, not stored as ""
  });

  test("AC-8: the disclosure is COLLAPSED on mount even when a draft was restored", () => {
    window.sessionStorage.setItem(DRAFT_KEY, TYPED);
    const q = renderBody(sectionData(), "report");
    expect(q.getByTestId(TOGGLE).getAttribute("aria-expanded")).toBe("false");
    expect(q.queryByTestId(TEXTAREA)).toBeNull();
  });

  test("AC-7: a stored value longer than the cap is truncated on read, from the FRONT", () => {
    // Diff review R2 F2: the first version of this fixture was `"x".repeat(n)`,
    // which cannot tell prefix-preserving truncation from a suffix, from
    // hard-coded filler, or from boundary corruption — every candidate answer
    // is the same string. Distinct characters make each of those fail.
    const overLong = Array.from({ length: REPORT_MESSAGE_MAX_CHARS + 250 }, (_, i) =>
      String.fromCharCode(97 + (i % 26)),
    ).join("");
    window.sessionStorage.setItem(DRAFT_KEY, overLong);
    const q = renderBody(sectionData(), "report");
    fireEvent.click(q.getByTestId(TOGGLE));
    const value = (q.getByTestId(TEXTAREA) as HTMLTextAreaElement).value;
    // Length and content both derived from the exported cap and the fixture,
    // never restated as literals.
    expect(value.length).toBe(REPORT_MESSAGE_MAX_CHARS);
    expect(value).toBe(overLong.slice(0, REPORT_MESSAGE_MAX_CHARS));
    expect(value[value.length - 1]).toBe(overLong[REPORT_MESSAGE_MAX_CHARS - 1]);
  });

  test("AC-7b: the cap never splits a character in half", () => {
    // A code point outside the BMP is two UTF-16 code units, so a cap landing
    // between them yields a lone high surrogate: malformed text, not truncated
    // text. The operator may lose the character they were warned about; they
    // must never gain a broken one (diff review R2 F2).
    const emoji = "😀"; // U+1F600, one code point, two code units
    const stored = "a".repeat(REPORT_MESSAGE_MAX_CHARS - 1) + emoji;
    window.sessionStorage.setItem(DRAFT_KEY, stored);
    const q = renderBody(sectionData(), "report");
    fireEvent.click(q.getByTestId(TOGGLE));
    const value = (q.getByTestId(TEXTAREA) as HTMLTextAreaElement).value;

    // One code unit SHORT of the cap, because the half character was dropped
    // rather than kept.
    expect(value.length).toBe(REPORT_MESSAGE_MAX_CHARS - 1);
    // The decisive assertion: no unpaired surrogate survives anywhere.
    expect(
      /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(value),
    ).toBe(false);
    expect(value.endsWith("a")).toBe(true);
  });

  test("AC-4b: an OVER-LENGTH stored draft does not survive a successful send as a ghost", () => {
    // Diff review R2 F1. The restored state is capped; the store was not. The
    // compare-and-clear added in R1 read the store RAW, so the two never
    // matched, the key was never cleared, and a sent report came back on the
    // next open — AC-4 broken by the guard that protects AC-15.
    const overLong = "b".repeat(REPORT_MESSAGE_MAX_CHARS + 40);
    window.sessionStorage.setItem(DRAFT_KEY, overLong);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 201,
        json: async () => ({ ok: true, status: "created" }),
      }),
    );
    const q = renderBody(sectionData(), "report");
    fireEvent.click(q.getByTestId(TOGGLE));
    expect((q.getByTestId(TEXTAREA) as HTMLTextAreaElement).value.length).toBe(
      REPORT_MESSAGE_MAX_CHARS,
    );
    fireEvent.click(q.getByTestId(SUBMIT));
    return waitFor(() => expect(q.getByTestId(STATUS).textContent).toBe(SUCCESS_COPY)).then(() => {
      expect(window.sessionStorage.getItem(DRAFT_KEY)).toBeNull();
    });
  });

  test("AC-10: drafts are scoped per drive file — one card's text never appears under another", () => {
    const q = renderBody(sectionData(), "report");
    typeInto(q, TYPED);
    cleanup();

    const otherDfid = `${DFID}-other`;
    const other = sectionData({}, { dfid: otherDfid });
    const q2 = renderBody(other, "report");
    fireEvent.click(q2.getByTestId(`wizard-step3-card-${otherDfid}-report-toggle`));
    expect(
      (q2.getByTestId(`wizard-step3-card-${otherDfid}-report-textarea`) as HTMLTextAreaElement)
        .value,
    ).toBe("");
    // The first card's key is untouched by the second card's mount.
    expect(window.sessionStorage.getItem(DRAFT_KEY)).toBe(TYPED);
  });

  test("AC-4: a successful submit clears the stored draft, so it cannot come back as a ghost", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 201,
        json: async () => ({ ok: true, status: "created" }),
      }),
    );
    const q = renderBody(sectionData(), "report");
    typeInto(q, TYPED);
    expect(window.sessionStorage.getItem(DRAFT_KEY)).toBe(TYPED);
    fireEvent.click(q.getByTestId(SUBMIT));
    await waitFor(() => expect(q.getByTestId(STATUS).textContent).toBe(SUCCESS_COPY));
    expect(window.sessionStorage.getItem(DRAFT_KEY)).toBeNull();

    cleanup();
    const q2 = renderBody(sectionData(), "report");
    fireEvent.click(q2.getByTestId(TOGGLE));
    expect((q2.getByTestId(TEXTAREA) as HTMLTextAreaElement).value).toBe("");
  });

  test("AC-5: a FAILED submit keeps the draft — that text is exactly what the operator would have to retype", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({ ok: false, code: "REPORT_SEND_FAILED" }),
      }),
    );
    const q = renderBody(sectionData(), "report");
    typeInto(q, TYPED);
    fireEvent.click(q.getByTestId(SUBMIT));
    // The EXACT settled error copy, never "non-empty": "Sending…" is non-empty
    // too, so a not-empty poll resolves on the pending frame and the assertion
    // below would read storage before the request had settled at all.
    await waitFor(() => expect(q.getByTestId(STATUS).textContent).toBe(REPORT_GENERIC_ERROR_COPY));
    expect(window.sessionStorage.getItem(DRAFT_KEY)).toBe(TYPED);
  });

  test("AC-11: the persistence guarantee is stated whenever there is a draft, in BOTH disclosure states", () => {
    const GUARANTEE = "Kept on this device until you close the tab.";
    const q = renderBody(sectionData(), "report");
    // Nothing to keep, nothing to promise.
    expect(q.queryByText(GUARANTEE)).toBeNull();

    typeInto(q, TYPED);
    expect(q.getByText(GUARANTEE)).toBeTruthy(); // expanded, beside the text
    fireEvent.click(q.getByTestId(TOGGLE)); // collapse
    expect(q.queryByTestId(TEXTAREA)).toBeNull(); // genuinely collapsed
    expect(q.getByText(GUARANTEE)).toBeTruthy(); // still stated, and now the only cue

    // Emptying the field withdraws the promise rather than leaving it stale.
    fireEvent.click(q.getByTestId(TOGGLE));
    fireEvent.change(q.getByTestId(TEXTAREA), { target: { value: "" } });
    expect(q.queryByText(GUARANTEE)).toBeNull();
  });

  test("AC-12: focus is never on the trigger at the moment its label flips, so no accessible name changes under the user", async () => {
    // Assessment B: the label swap is not a WCAG 4.1.2 problem as implemented,
    // but only because focus is provably elsewhere at the two ONCHANGE flip
    // moments, and nothing pinned that. A later focus-restore-on-collapse change
    // would reintroduce it silently. Both onChange flips are asserted here.
    //
    // There is a THIRD flip, and an earlier version of this comment claimed
    // there were only two (diff review R1 F2): the success branch calls
    // setDraft("") after two awaits, and the operator may have collapsed while
    // pending, leaving focus on the trigger. AC-12b covers that one, including
    // why it is acceptable.
    const q = renderBody(sectionData(), "report");
    const toggle = q.getByTestId(TOGGLE);

    // Flip 1: empty -> non-empty, on the first keystroke. The §D1 effect has
    // moved focus to the textarea by then.
    fireEvent.click(toggle);
    const textarea = q.getByTestId(TEXTAREA) as HTMLTextAreaElement;
    await waitFor(() => expect(document.activeElement).toBe(textarea));
    fireEvent.change(textarea, { target: { value: "x" } });
    expect(toggle.textContent).toBe("Continue your report"); // it really did flip
    expect(document.activeElement).not.toBe(toggle);

    // Flip 2: non-empty -> empty, clearing in place.
    fireEvent.change(q.getByTestId(TEXTAREA), { target: { value: "" } });
    expect(toggle.textContent).toBe("Write a report");
    expect(document.activeElement).not.toBe(toggle);
  });

  test("AC-13: a whitespace-only draft is not a report — label, guarantee line and Send agree", () => {
    const GUARANTEE = "Kept on this device until you close the tab.";
    const q = renderBody(sectionData(), "report");
    typeInto(q, "   ");
    // The three predicates that read `draft` must not disagree. Untrimmed, the
    // trigger promised a report to continue while Send sat disabled with
    // nothing on screen explaining the contradiction.
    expect(q.getByTestId(TOGGLE).textContent).toBe("Write a report");
    expect(q.queryByText(GUARANTEE)).toBeNull();
    expect((q.getByTestId(SUBMIT) as HTMLButtonElement).disabled).toBe(true);
    // Real text flips all three together.
    fireEvent.change(q.getByTestId(TEXTAREA), { target: { value: TYPED } });
    expect(q.getByTestId(TOGGLE).textContent).toBe("Continue your report");
    expect(q.getByText(GUARANTEE)).toBeTruthy();
    expect((q.getByTestId(SUBMIT) as HTMLButtonElement).disabled).toBe(false);
  });

  test("AC-14: a write that throws after an earlier one succeeded clears the key rather than leaving a stale prefix", () => {
    const q = renderBody(sectionData(), "report");
    typeInto(q, "the crew list is");
    expect(window.sessionStorage.getItem(DRAFT_KEY)).toBe("the crew list is");

    // Now the store starts refusing writes mid-session, the QuotaExceededError
    // shape. removeItem still works, which is the case this guards.
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("quota", "QuotaExceededError");
    });
    fireEvent.change(q.getByTestId(TEXTAREA), {
      target: { value: "the crew list is missing two people" },
    });
    // The stale PREFIX is the danger: restored later it reads as a complete
    // draft that silently lost its tail. Gone is the correct outcome.
    expect(window.sessionStorage.getItem(DRAFT_KEY)).toBeNull();

    // The typed value is still on screen; only the persistence was lost.
    expect((q.getByTestId(TEXTAREA) as HTMLTextAreaElement).value).toBe(
      "the crew list is missing two people",
    );
  });

  test("AC-15: a detached submit's success does not erase text a newer mount has typed", async () => {
    // Diff review R1 F1. Submit A, close the modal while it is pending, reopen,
    // type B, then let A's request succeed. The detached handler is still alive
    // by design, and before the guard it cleared the SHARED key — taking B with
    // it. B stayed on screen until the next close and then was gone, which is
    // the exact loss this arc exists to stop, reintroduced by its own repair.
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
    typeInto(q, "draft A");
    fireEvent.click(q.getByTestId(SUBMIT));
    expect(q.getByTestId(STATUS).textContent).toBe("Sending…");

    // The modal closes mid-flight. The section unmounts; the handler does not.
    cleanup();
    // A fresh mount restores A, and the operator replaces it with B.
    const q2 = renderBody(sectionData(), "report");
    fireEvent.click(q2.getByTestId(TOGGLE));
    expect((q2.getByTestId(TEXTAREA) as HTMLTextAreaElement).value).toBe("draft A");
    fireEvent.change(q2.getByTestId(TEXTAREA), { target: { value: "draft B" } });
    expect(window.sessionStorage.getItem(DRAFT_KEY)).toBe("draft B");

    // Now the old request succeeds.
    await act(async () => {
      resolveFetch({ ok: true, status: 201, json: async () => ({ ok: true, status: "created" }) });
    });

    // B survives, in the store and on screen. The assertion is on the STORE,
    // because the on-screen value would look fine either way until the next
    // close — which is precisely what made the bug invisible.
    expect(window.sessionStorage.getItem(DRAFT_KEY)).toBe("draft B");
    expect((q2.getByTestId(TEXTAREA) as HTMLTextAreaElement).value).toBe("draft B");
  });

  test("AC-12b: the THIRD label flip — success while collapsed, with focus on the trigger — is announced by the status region", async () => {
    // Diff review R1 F2: AC-12's conclusion was false as written. There are
    // three flips, not two. The success branch calls setDraft("") after two
    // awaits, and T-D3b ratifies collapsing while pending — which leaves focus
    // on the trigger the operator just clicked. So the accessible name CAN
    // change under focus here. It is acceptable because the same commit that
    // changes it announces the outcome in the live region, and the change is a
    // consequence of an action the operator took. That is the claim, and this
    // pins it rather than pretending the flip does not happen.
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
    typeInto(q, TYPED);
    fireEvent.click(q.getByTestId(SUBMIT));

    const toggle = q.getByTestId(TOGGLE);
    toggle.focus();
    fireEvent.click(toggle); // collapse while pending — T-D3b's ratified move
    expect(document.activeElement).toBe(toggle);
    expect(toggle.textContent).toBe("Continue your report");

    await act(async () => {
      resolveFetch({ ok: true, status: 201, json: async () => ({ ok: true, status: "created" }) });
    });

    // The flip really does happen under focus.
    expect(document.activeElement).toBe(toggle);
    expect(toggle.textContent).toBe("Write a report");
    // And it is not silent: the live region carries the reason.
    expect(q.getByTestId(STATUS).textContent).toBe(SUCCESS_COPY);
  });

  test("AC-5b: the 410 terminal branch keeps the draft — a fresh attempt needs the text", async () => {
    // Diff review R3 F2. The 410 REPORT_HORIZON_EXPIRED branch rotates the
    // attempt key, because a retry after it is a NEW report, and deliberately
    // does NOT clear the draft — the operator still has to send that text. AC-5
    // exercised only a 500, and the existing 410 test checks only the attempt
    // key, so clearing the draft in this branch would have passed both.
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 410,
        json: async () => ({ ok: false, code: "REPORT_HORIZON_EXPIRED" }),
      }),
    );
    const q = renderBody(sectionData(), "report");
    typeInto(q, TYPED);
    fireEvent.click(q.getByTestId(SUBMIT));
    await waitFor(() => expect(q.getByTestId(STATUS).textContent).not.toBe("Sending…"));

    // The text survives, in the store and on screen.
    expect(window.sessionStorage.getItem(DRAFT_KEY)).toBe(TYPED);
    expect((q.getByTestId(TEXTAREA) as HTMLTextAreaElement).value).toBe(TYPED);
    // And the attempt key IS rotated, since a retry is a new report.
    expect(window.sessionStorage.getItem(ATTEMPT_KEY)).toBeNull();
  });

  test("AC-15b: the clear compares the UNTRIMMED draft, so surrounding spaces cannot make it clobber a newer edit", async () => {
    // Diff review R3 F3. The store holds what onChange wrote, untrimmed, so the
    // comparison must use the raw draft and not the trimmed `message`. AC-15's
    // fixture had no surrounding whitespace, so swapping submittedDraft for
    // message would have passed it — and then submit A of "  spaced  " would
    // match a newer mount's "spaced" and erase it.
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
    const padded = "  spaced draft  ";
    const trimmed = padded.trim();
    const q = renderBody(sectionData(), "report");
    typeInto(q, padded);
    expect(window.sessionStorage.getItem(DRAFT_KEY)).toBe(padded); // stored raw
    fireEvent.click(q.getByTestId(SUBMIT));

    // The modal closes mid-flight; a newer mount trims the same text by hand.
    cleanup();
    const q2 = renderBody(sectionData(), "report");
    fireEvent.click(q2.getByTestId(TOGGLE));
    fireEvent.change(q2.getByTestId(TEXTAREA), { target: { value: trimmed } });
    expect(window.sessionStorage.getItem(DRAFT_KEY)).toBe(trimmed);

    await act(async () => {
      resolveFetch({ ok: true, status: 201, json: async () => ({ ok: true, status: "created" }) });
    });

    // Compared untrimmed, `padded` !== `trimmed`, so the newer edit stands.
    expect(window.sessionStorage.getItem(DRAFT_KEY)).toBe(trimmed);
  });

  test("AC-6b: a sessionStorage ACCESSOR that throws is survived, not just throwing methods", () => {
    // Diff review R3 F4. AC-6 makes Storage.prototype methods throw, which
    // leaves `window.sessionStorage` itself readable. Real browsers throw
    // SecurityError from the PROPERTY ACCESS when site data is blocked, so a
    // future edit hoisting that read out of its try would pass AC-6 and crash
    // the section in the one environment AC-6 exists to cover.
    const descriptor = Object.getOwnPropertyDescriptor(window, "sessionStorage");
    Object.defineProperty(window, "sessionStorage", {
      configurable: true,
      get() {
        throw new DOMException("blocked", "SecurityError");
      },
    });
    try {
      const q = renderBody(sectionData(), "report");
      // Mounts, restores nothing, and the trigger reads the empty-draft label.
      expect(q.getByTestId(TOGGLE).textContent).toBe("Write a report");
      fireEvent.click(q.getByTestId(TOGGLE));
      fireEvent.change(q.getByTestId(TEXTAREA), { target: { value: TYPED } });
      expect((q.getByTestId(TEXTAREA) as HTMLTextAreaElement).value).toBe(TYPED);
      expect(q.getByTestId(TOGGLE).textContent).toBe("Continue your report");
    } finally {
      if (descriptor) Object.defineProperty(window, "sessionStorage", descriptor);
    }
  });

  test("AC-6: sessionStorage throwing on every access degrades to today's behaviour, never to a crash — including the submit path", async () => {
    const boom = () => {
      throw new DOMException("denied", "SecurityError");
    };
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(boom);
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(boom);
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(boom);

    const q = renderBody(sectionData(), "report");
    expect(q.getByTestId(TOGGLE).textContent).toBe("Write a report");
    fireEvent.click(q.getByTestId(TOGGLE));
    // Typing still works; only the persistence is lost.
    fireEvent.change(q.getByTestId(TEXTAREA), { target: { value: TYPED } });
    expect((q.getByTestId(TEXTAREA) as HTMLTextAreaElement).value).toBe(TYPED);
    expect(q.getByTestId(TOGGLE).textContent).toBe("Continue your report");

    // AC-6 promises the section still SUBMITS, and diff review R2 F3 found this
    // test stopping at typing — it would have passed while throwing storage
    // broke attempt-key minting, the success settlement, or the compare-and-clear.
    // The submit path touches storage three times, so it is the half of AC-6
    // most likely to break and was the half going unasserted.
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 201,
        json: async () => ({ ok: true, status: "created" }),
      }),
    );
    fireEvent.click(q.getByTestId(SUBMIT));
    await waitFor(() => expect(q.getByTestId(STATUS).textContent).toBe(SUCCESS_COPY));
    expect(q.getByTestId(TOGGLE).textContent).toBe("Write a report");
  });
});
