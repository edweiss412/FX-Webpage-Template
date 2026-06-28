// @vitest-environment jsdom
/**
 * tests/components/step3SheetCard.test.tsx (Task D2 — spec §4.2/§4.3/§4.6)
 *
 * Pins the presentational contract of <Step3SheetCard>: the inline step-3
 * card for ONE cleanly-parsed `staged` Step3Row. Summary (always visible) +
 * breakdown (expand toggle) are rendered from `row.parseResult`.
 *
 * Anti-tautology discipline (AGENTS.md): every count / badge / cap assertion
 * DERIVES its expected value from the fixture's own array lengths
 * (`FIX.crewMembers.length`, etc.) — NEVER a hardcoded numeral. A fixture
 * with N crew cannot satisfy a hardcoded "12 crew" by accident; the assertion
 * is computed from N so it tracks any fixture change.
 *
 * Scope is D2 ONLY: no checkbox, no select-all, no approve/ignore wiring
 * (those are D3/D4). The card here is purely presentational (a `row` prop).
 */
import { afterEach, describe, expect, test, vi } from "vitest";
import { cleanup, render, fireEvent, within } from "@testing-library/react";
import { MESSAGE_CATALOG } from "@/lib/messages/catalog";
import type {
  ParseResult,
  ShowRow,
  CrewMemberRow,
  RoomRow,
  HotelReservationRow,
  RunOfShow,
} from "@/lib/parser/types";
import { Step3SheetCard } from "@/components/admin/wizard/Step3SheetCard";
import type { Step3Row } from "@/components/admin/wizard/Step3Review";

// D3: the card now hosts the publish checkbox, which calls useRouter().refresh().
// The presentational assertions below don't toggle it, but the hook must resolve.
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

afterEach(() => cleanup());

const DFID = "drive-abc-123";
const WSID = "00000000-1111-4222-8333-444444444444";

// ── Fixture builders (every expectation derives from THESE dimensions) ──
function crew(n: number): CrewMemberRow[] {
  return Array.from({ length: n }, (_, i) => ({
    name: `Crew Person ${i + 1}`,
    email: null,
    phone: null,
    role: `Role ${i + 1}`,
    role_flags: i % 2 === 0 ? (["LEAD"] as const).slice() : [],
    date_restriction: { kind: "none" } as const,
    stage_restriction: { kind: "none" } as const,
    flight_info: null,
  }));
}

function rooms(n: number): RoomRow[] {
  return Array.from({ length: n }, (_, i) => ({
    kind: "gs" as const,
    name: `Ballroom ${i + 1}`,
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
  }));
}

function hotels(n: number): HotelReservationRow[] {
  return Array.from({ length: n }, (_, i) => ({
    ordinal: i + 1,
    hotel_name: `Hotel ${i + 1}`,
    hotel_address: null,
    names: [`Guest ${i + 1}`],
    confirmation_no: null,
    check_in: "2026-04-10",
    check_out: "2026-04-12",
    notes: null,
  }));
}

function runOfShow(days: number, entriesPerDay: number): RunOfShow {
  const out: RunOfShow = {};
  for (let d = 0; d < days; d++) {
    const iso = `2026-04-${String(10 + d).padStart(2, "0")}`;
    out[iso] = {
      entries: Array.from({ length: entriesPerDay }, (_, e) => ({
        start: `${8 + e}:00 AM`,
        title: `Session ${d + 1}.${e + 1}`,
      })),
      showStart: "8:00 AM",
      window: null,
    };
  }
  return out;
}

function show(overrides: Partial<ShowRow> = {}): ShowRow {
  return {
    title: "Asset Mgmt Summit",
    client_label: "Acme Capital",
    client_contact: null,
    template_version: "v4",
    venue: null,
    dates: {
      travelIn: "2026-04-09",
      set: null,
      showDays: ["2026-04-10", "2026-04-11"],
      travelOut: "2026-04-12",
    },
    schedule_phases: {},
    event_details: {},
    agenda_links: [],
    coi_status: null,
    po: null,
    proposal: null,
    invoice: null,
    invoice_notes: null,
    ...overrides,
  };
}

function parseResult(overrides: Partial<ParseResult> = {}): ParseResult {
  return {
    show: show(),
    crewMembers: crew(12),
    hotelReservations: hotels(2),
    rooms: rooms(4),
    transportation: null,
    contacts: [],
    pullSheet: null,
    diagrams: { linkedFolder: null, embeddedImages: [], linkedFolderItems: [] },
    openingReel: null,
    raw_unrecognized: [],
    warnings: [],
    runOfShow: runOfShow(3, 2),
    hardErrors: [],
    ...overrides,
  };
}

function stagedRow(pr: ParseResult | null, overrides: Partial<Step3Row> = {}): Step3Row {
  return {
    driveFileId: DFID,
    driveFileName: "asset-mgmt-summit.sheet",
    status: "staged",
    parseResult: pr,
    ...overrides,
  };
}

const card = (q: ReturnType<typeof render>) => q.getByTestId(`wizard-step3-card-${DFID}`);
const summary = (q: ReturnType<typeof render>) =>
  q.getByTestId(`wizard-step3-card-${DFID}-summary`);

describe("Step3SheetCard — summary (§4.2)", () => {
  test("renders the show title, and client when present", () => {
    const FIX = parseResult();
    const q = render(<Step3SheetCard row={stagedRow(FIX)} wizardSessionId={WSID} />);
    const s = summary(q);
    expect(s.textContent).toContain(FIX.show.title);
    expect(s.textContent).toContain(FIX.show.client_label);
  });

  test("title falls back to driveFileName when parseResult title is empty", () => {
    const FIX = parseResult({ show: show({ title: "" }) });
    const row = stagedRow(FIX, { driveFileName: "fallback-name.sheet" });
    const q = render(<Step3SheetCard row={row} wizardSessionId={WSID} />);
    expect(summary(q).textContent).toContain("fallback-name.sheet");
  });

  test("collapsed summary shows Venue (name only) + a dedicated City row, not the old Totals strip", () => {
    const FIX = parseResult({
      show: show({
        venue: { name: "The Drake Hotel", address: "140 E Walton Pl, Chicago, IL 60611" },
      }),
    });
    const q = render(<Step3SheetCard row={stagedRow(FIX)} wizardSessionId={WSID} />);
    const venue = q.getByTestId(`wizard-step3-card-${DFID}-venue`);
    const city = q.getByTestId(`wizard-step3-card-${DFID}-city`);
    expect(venue.textContent).toContain("The Drake Hotel");
    // The city moved OUT of the Venue row into its own dedicated City row.
    expect(venue.textContent ?? "").not.toContain("Chicago");
    expect(city.textContent).toContain("Chicago"); // city mined from the address
    // The Totals strip is gone: its testid no longer exists and the collapsed
    // summary no longer carries the "N crew · N rooms" run-on count string.
    expect(q.queryByTestId(`wizard-step3-card-${DFID}-totals`)).toBeNull();
    expect(summary(q).textContent ?? "").not.toMatch(/\d+ crew · \d+ rooms/);
  });

  test("splits the city out of the venue NAME (the real FXAV pattern: '<Brand> <City>', blank address)", () => {
    const FIX = parseResult({
      show: show({ venue: { name: "Four Seasons Hotel Chicago", address: "" } }),
    });
    const q = render(<Step3SheetCard row={stagedRow(FIX)} wizardSessionId={WSID} />);
    const venue = q.getByTestId(`wizard-step3-card-${DFID}-venue`);
    const city = q.getByTestId(`wizard-step3-card-${DFID}-city`);
    // The trailing city is split into the City row; the Venue keeps the rest.
    expect(venue.textContent).toContain("Four Seasons Hotel");
    expect(venue.textContent ?? "").not.toContain("Chicago");
    expect(city.textContent).toContain("Chicago");
  });

  test("venue falls back to 'Venue not detected'; the City row is OMITTED (no noise) when no city", () => {
    const FIX = parseResult({ show: show({ venue: null }) });
    const q = render(<Step3SheetCard row={stagedRow(FIX)} wizardSessionId={WSID} />);
    expect(q.getByTestId(`wizard-step3-card-${DFID}-venue`).textContent).toContain(
      "Venue not detected",
    );
    // City is best-effort ("Venue Name + City IF POSSIBLE") — when it can't be
    // derived the row drops entirely rather than showing "City not detected" on
    // every card (the address is usually blank; the city lives in the venue name).
    expect(q.queryByTestId(`wizard-step3-card-${DFID}-city`)).toBeNull();
  });

  test("per-section counts move to the expanded breakdown headers (anti-tautology)", () => {
    const FIX = parseResult();
    const q = render(<Step3SheetCard row={stagedRow(FIX)} wizardSessionId={WSID} />);
    fireEvent.click(q.getByTestId(`wizard-step3-card-${DFID}-more`));
    const days = Object.keys(FIX.runOfShow ?? {}).length;
    // Each breakdown section header renders "<Label> (<count>)"; every count
    // derives from the fixture array length, never a hardcoded numeral.
    expect(q.getByTestId(`wizard-step3-card-${DFID}-breakdown-crew`).textContent).toContain(
      `(${FIX.crewMembers.length})`,
    );
    expect(q.getByTestId(`wizard-step3-card-${DFID}-breakdown-rooms`).textContent).toContain(
      `(${FIX.rooms.length})`,
    );
    expect(q.getByTestId(`wizard-step3-card-${DFID}-breakdown-hotels`).textContent).toContain(
      `(${FIX.hotelReservations.length})`,
    );
    expect(q.getByTestId(`wizard-step3-card-${DFID}-breakdown-schedule`).textContent).toContain(
      `(${days})`,
    );
    expect(FIX.crewMembers.length).toBeGreaterThan(0);
    expect(days).toBe(3);
  });

  test("schedule-day count uses Object.keys(runOfShow), NOT showDays.length", () => {
    // runOfShow has 5 days; showDays has only 2 — the rendered count must be 5.
    const FIX = parseResult({
      runOfShow: runOfShow(5, 1),
      show: show({
        dates: {
          travelIn: null,
          set: null,
          showDays: ["2026-04-10", "2026-04-11"],
          travelOut: null,
        },
      }),
    });
    const q = render(<Step3SheetCard row={stagedRow(FIX)} wizardSessionId={WSID} />);
    fireEvent.click(q.getByTestId(`wizard-step3-card-${DFID}-more`));
    const days = Object.keys(FIX.runOfShow ?? {}).length;
    expect(days).toBe(5);
    expect(FIX.show.dates.showDays.length).toBe(2);
    expect(q.getByTestId(`wizard-step3-card-${DFID}-breakdown-schedule`).textContent).toContain(
      `(${days})`,
    );
  });

  test("dates render role-labeled, humanized, present segments only", () => {
    const FIX = parseResult({
      show: show({
        dates: { travelIn: "2026-04-09", set: null, showDays: ["2026-04-10"], travelOut: null },
      }),
    });
    const q = render(<Step3SheetCard row={stagedRow(FIX)} wizardSessionId={WSID} />);
    const s = summary(q).textContent ?? "";
    // Humanized + role-labeled (Task 3), not the raw ISO chain.
    expect(s).toContain("Travel in Apr 9");
    expect(s).toContain("Show Apr 10");
    expect(s).not.toContain("2026-04-09"); // humanized, not raw ISO
    expect(s).not.toContain("Travel out"); // travelOut null → segment omitted
    expect(s).not.toContain("Dates not detected");
  });

  test("'Dates not detected' when no date segments are present", () => {
    const FIX = parseResult({
      show: show({ dates: { travelIn: null, set: null, showDays: [], travelOut: null } }),
    });
    const q = render(<Step3SheetCard row={stagedRow(FIX)} wizardSessionId={WSID} />);
    expect(summary(q).textContent).toContain("Dates not detected");
  });

  test("show-days that can't be humanized fall back to the raw ISO (a present date is never dropped)", () => {
    const FIX = parseResult({
      show: show({
        dates: { travelIn: null, set: null, showDays: ["BADDATE-1", "BADDATE-2"], travelOut: null },
      }),
    });
    const q = render(<Step3SheetCard row={stagedRow(FIX)} wizardSessionId={WSID} />);
    const s = summary(q).textContent ?? "";
    // humanizeDayRange → null on all-malformed; the builder falls back to the
    // raw first–last so the Show segment is rendered, not silently omitted.
    expect(s).toContain("Show BADDATE-1 – BADDATE-2");
    expect(s).not.toContain("Dates not detected");
  });

  test("diagrams badge shown iff linkedFolder OR embeddedImages present", () => {
    const withDiagrams = parseResult({
      diagrams: {
        linkedFolder: { driveFolderId: "f", driveFolderUrl: "https://x" },
        embeddedImages: [],
        linkedFolderItems: [],
      },
    });
    const q1 = render(<Step3SheetCard row={stagedRow(withDiagrams)} wizardSessionId={WSID} />);
    expect(q1.queryByTestId(`wizard-step3-card-${DFID}-badge-diagrams`)).not.toBeNull();
    cleanup();
    const noDiagrams = parseResult();
    const q2 = render(<Step3SheetCard row={stagedRow(noDiagrams)} wizardSessionId={WSID} />);
    expect(q2.queryByTestId(`wizard-step3-card-${DFID}-badge-diagrams`)).toBeNull();
  });

  test("reel badge shown iff openingReel present", () => {
    const withReel = parseResult({
      openingReel: {
        driveFileId: "reel-1",
        drive_modified_time: "2026-04-01T00:00:00Z",
        headRevisionId: "r1",
        mimeType: "video/mp4",
      },
    });
    const q1 = render(<Step3SheetCard row={stagedRow(withReel)} wizardSessionId={WSID} />);
    expect(q1.queryByTestId(`wizard-step3-card-${DFID}-badge-reel`)).not.toBeNull();
    cleanup();
    const q2 = render(<Step3SheetCard row={stagedRow(parseResult())} wizardSessionId={WSID} />);
    expect(q2.queryByTestId(`wizard-step3-card-${DFID}-badge-reel`)).toBeNull();
  });

  // The summary warning row shows ONLY the self-explanatory per-class data-gap
  // chips ("2 unreadable fields"). The generic "N warnings" total chip and the
  // cryptic "+K other" chip were both removed — non-data-gap warnings (info or
  // non-DQ codes) carry NO summary chip; they live in the the "More" details list.
  test("no generic warning-colored total chip in the summary", () => {
    const FIX = parseResult({
      warnings: [{ severity: "warn" as const, code: "FIELD_UNREADABLE", message: "x" }],
    });
    const q = render(<Step3SheetCard row={stagedRow(FIX)} wizardSessionId={WSID} />);
    expect(q.queryByTestId(`wizard-step3-card-${DFID}-warnings`)).toBeNull();
  });

  test("non-data-gap warnings (info or non-DQ codes) get NO summary chip at all", () => {
    const w = [
      { severity: "warn" as const, code: "SECTION_HEADER_NO_FIELDS", message: "one" },
      { severity: "info" as const, code: "FLIGHT_UNMATCHED", message: "two" },
    ];
    const FIX = parseResult({ warnings: w });
    const q = render(<Step3SheetCard row={stagedRow(FIX)} wizardSessionId={WSID} />);
    // No "+K other" chip, and no data-gap row at all (none of these is a data-gap class).
    expect(q.queryByTestId(`wizard-step3-card-${DFID}-warnings-other`)).toBeNull();
    expect(q.queryByTestId(`wizard-step3-card-${DFID}-data-gaps`)).toBeNull();
  });

  test("no warning row at all when warnings is empty", () => {
    const q = render(
      <Step3SheetCard row={stagedRow(parseResult({ warnings: [] }))} wizardSessionId={WSID} />,
    );
    expect(q.queryByTestId(`wizard-step3-card-${DFID}-warnings`)).toBeNull();
    expect(q.queryByTestId(`wizard-step3-card-${DFID}-warnings-other`)).toBeNull();
    expect(q.queryByTestId(`wizard-step3-card-${DFID}-data-gaps`)).toBeNull();
  });

  test("the City row is OMITTED for an ambiguous address (no wrong guess, no noise); the venue name still shows", () => {
    // An ambiguous two-segment address that cityFromAddress deliberately can't
    // resolve to a confident city (it returns null rather than guess wrong).
    const FIX = parseResult({
      show: show({ venue: { name: "Navy Pier", address: "Navy Pier, Chicago" } }),
    });
    const q = render(<Step3SheetCard row={stagedRow(FIX)} wizardSessionId={WSID} />);
    // The venue name still renders; the ambiguous address yields no city → the row drops.
    expect(q.getByTestId(`wizard-step3-card-${DFID}-venue`).textContent).toContain("Navy Pier");
    expect(q.queryByTestId(`wizard-step3-card-${DFID}-city`)).toBeNull();
  });

  test("the City row IS shown when a structured address yields a confident city", () => {
    const FIX = parseResult({
      show: show({
        venue: { name: "The Drake Hotel", address: "140 E Walton Pl, Chicago, IL 60611" },
      }),
    });
    const q = render(<Step3SheetCard row={stagedRow(FIX)} wizardSessionId={WSID} />);
    expect(q.getByTestId(`wizard-step3-card-${DFID}-city`).textContent).toContain("Chicago");
  });

  test("the collapsed crew preview is gone — crew now lives ONLY in the expanded breakdown", () => {
    const FIX = parseResult({ crewMembers: crew(12) });
    const q = render(<Step3SheetCard row={stagedRow(FIX)} wizardSessionId={WSID} />);
    // The old collapsed crew-preview testid no longer exists, and no crew name
    // appears in the always-visible summary block.
    expect(q.queryByTestId(`wizard-step3-card-${DFID}-crew-summary`)).toBeNull();
    expect(summary(q).textContent ?? "").not.toContain(FIX.crewMembers[0]!.name);
    // Crew appears only after expanding (the breakdown roster).
    fireEvent.click(q.getByTestId(`wizard-step3-card-${DFID}-more`));
    expect(q.getByTestId(`wizard-step3-card-${DFID}-breakdown-crew`).textContent).toContain(
      FIX.crewMembers[0]!.name,
    );
  });
});

describe("Step3SheetCard — title deep link + wrapping", () => {
  const SHEET_URL = (dfid: string) => `https://docs.google.com/spreadsheets/d/${dfid}/edit`;

  test("the show title is a deep link to the SOURCE sheet, opening in a new tab", () => {
    const FIX = parseResult();
    const q = render(<Step3SheetCard row={stagedRow(FIX)} wizardSessionId={WSID} />);
    const link = q.getByTestId(`wizard-step3-card-${DFID}-title-link`) as HTMLAnchorElement;
    expect(link.tagName).toBe("A");
    // Derived from the fixture's driveFileId, not a hardcoded literal.
    expect(link.getAttribute("href")).toBe(SHEET_URL(DFID));
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toContain("noopener");
    expect(link.textContent).toContain(FIX.show.title);
    // Persistent (non-hover) link affordance: a trailing external-link icon. Removing
    // it must fail this test (the link's only at-rest "opens elsewhere" cue).
    expect(link.querySelector("svg")).not.toBeNull();
  });

  test("'More' is a quiet left-aligned button that OPENS A DIALOG, NOT a boxed full-width dropdown", () => {
    const q = render(<Step3SheetCard row={stagedRow(parseResult())} wizardSessionId={WSID} />);
    const btn = q.getByTestId(`wizard-step3-card-${DFID}-more`);
    expect(btn.textContent).toContain("More");
    // Quiet text button: sizes to its content at the card's left edge…
    expect(btn.className).toMatch(/\bself-start\b/);
    // …not a boxed, full-width dropdown-styled button (no border, no spread).
    expect(btn.className).not.toMatch(/\bborder\b/);
    expect(btn.className).not.toMatch(/\bjustify-between\b/);
    // It OPENS A MODAL (haspopup=dialog) — so it is not an inline expand toggle:
    // it carries no aria-expanded, and no dialog exists until it is clicked.
    expect(btn.getAttribute("aria-haspopup")).toBe("dialog");
    expect(btn.getAttribute("aria-expanded")).toBeNull();
    expect(q.queryByTestId(`wizard-step3-card-${DFID}-details-dialog`)).toBeNull();
    // Persistent (non-hover) chevron affordance.
    expect(btn.querySelector("svg")).not.toBeNull();
  });

  test("the title WRAPS (no `truncate`) so a long show name stays fully readable", () => {
    const FIX = parseResult({
      show: show({ title: "A Very Long Show Title That Would Otherwise Truncate Off The Card" }),
    });
    const q = render(<Step3SheetCard row={stagedRow(FIX)} wizardSessionId={WSID} />);
    const link = q.getByTestId(`wizard-step3-card-${DFID}-title-link`);
    expect(link.className).not.toMatch(/\btruncate\b/);
    expect(link.className).toMatch(/wrap-break-word/);
  });

  test("even a no-details (null parseResult) row links its title to the source sheet", () => {
    const q = render(
      <Step3SheetCard
        row={stagedRow(null, { driveFileName: "broken.sheet" })}
        wizardSessionId={WSID}
      />,
    );
    const link = q.getByTestId(`wizard-step3-card-${DFID}-title-link`) as HTMLAnchorElement;
    expect(link.getAttribute("href")).toBe(SHEET_URL(DFID));
    expect(link.textContent).toContain("broken.sheet");
  });
});

// parse-data-quality-warnings §6.2a (Task 8) — the publish-decision point. A
// checked/applied-clean row that carries data-gap warnings must show the
// PER-CLASS detail (not just the generic count) before the publish checkbox.
describe("Step3SheetCard — data-gap detail (P3 primary, §6.2a)", () => {
  test("renders per-class detail for data-gap warnings; the non-DQ warn gets no chip; never the raw code", () => {
    const w = [
      { severity: "warn" as const, code: "FIELD_UNREADABLE", message: "phone unreadable" },
      { severity: "warn" as const, code: "FIELD_UNREADABLE", message: "phone 2 unreadable" },
      { severity: "warn" as const, code: "BLOCK_DISAPPEARED", message: "hotel block gone" },
      // a non-data-quality warn → NO summary chip; it lives only in the "More" details
      { severity: "warn" as const, code: "SECTION_HEADER_NO_FIELDS", message: "x" },
    ];
    // An applied (checked) row at the publish decision point.
    const FIX = parseResult({ warnings: w });
    const q = render(
      <Step3SheetCard row={stagedRow(FIX, { status: "applied" })} wizardSessionId={WSID} />,
    );
    const detail = q.getByTestId(`wizard-step3-card-${DFID}-data-gaps`);
    // Counts derive from the SEEDED warning array (anti-tautology), never literals.
    const fieldCount = w.filter((x) => x.code === "FIELD_UNREADABLE").length;
    const blockCount = w.filter((x) => x.code === "BLOCK_DISAPPEARED").length;
    expect(
      q.getByTestId(`wizard-step3-card-${DFID}-data-gap-FIELD_UNREADABLE`).textContent,
    ).toContain(`${fieldCount} unreadable field${fieldCount === 1 ? "" : "s"}`);
    expect(
      q.getByTestId(`wizard-step3-card-${DFID}-data-gap-BLOCK_DISAPPEARED`).textContent,
    ).toContain(`${blockCount} removed section${blockCount === 1 ? "" : "s"}`);
    // UNKNOWN_SECTION_HEADER count is 0 here → no entry.
    expect(q.queryByTestId(`wizard-step3-card-${DFID}-data-gap-UNKNOWN_SECTION_HEADER`)).toBeNull();
    // The non-DQ warn is NOT chipped in the summary (no "+K other" anymore).
    expect(q.queryByTestId(`wizard-step3-card-${DFID}-warnings-other`)).toBeNull();
    // invariant 5: no raw §12.4 code literal in the detail DOM.
    expect(detail.textContent).not.toMatch(/FIELD_UNREADABLE|BLOCK_DISAPPEARED/);
  });

  test("a lone non-data-quality warning → no summary chip row at all", () => {
    const FIX = parseResult({
      warnings: [{ severity: "warn" as const, code: "SECTION_HEADER_NO_FIELDS", message: "x" }],
    });
    const q = render(<Step3SheetCard row={stagedRow(FIX)} wizardSessionId={WSID} />);
    // No data-gap row and no "+K other" chip — the warning is only in the "More" details.
    expect(q.queryByTestId(`wizard-step3-card-${DFID}-data-gaps`)).toBeNull();
    expect(q.queryByTestId(`wizard-step3-card-${DFID}-warnings-other`)).toBeNull();
  });

  test("no data-gap detail when warnings is empty", () => {
    const q = render(
      <Step3SheetCard row={stagedRow(parseResult({ warnings: [] }))} wizardSessionId={WSID} />,
    );
    expect(q.queryByTestId(`wizard-step3-card-${DFID}-data-gaps`)).toBeNull();
  });
});

describe("Step3SheetCard — guard conditions (§4.6)", () => {
  test("parseResult null → couldn't-read note, no expand toggle", () => {
    const q = render(
      <Step3SheetCard
        row={stagedRow(null, { driveFileName: "broken.sheet" })}
        wizardSessionId={WSID}
      />,
    );
    expect(card(q).textContent).toContain("broken.sheet");
    // Apostrophe-agnostic (the component uses a typographic ’): assert the
    // human "couldn't read" sentence is present.
    expect(card(q).textContent).toContain("read the details of this sheet");
    expect(q.queryByTestId(`wizard-step3-card-${DFID}-more`)).toBeNull();
    expect(q.queryByTestId(`wizard-step3-card-${DFID}-breakdown`)).toBeNull();
  });

  test("parseResult null still falls back to driveFileId when name missing", () => {
    const q = render(
      <Step3SheetCard row={stagedRow(null, { driveFileName: null })} wizardSessionId={WSID} />,
    );
    expect(card(q).textContent).toContain(DFID);
  });

  test("undefined count arrays coerce to 0 ('(0)' in every breakdown header)", () => {
    // Simulate untyped jsonb that lost its arrays (parse_result is cast from
    // untyped jsonb on the wire, OnboardingWizard.tsx:199). Build via a loose
    // record so the deletions mimic missing keys without per-line ts-ignores.
    const broken = parseResult() as unknown as Record<string, unknown>;
    delete broken.crewMembers;
    delete broken.rooms;
    delete broken.hotelReservations;
    delete broken.runOfShow;
    const q = render(
      <Step3SheetCard row={stagedRow(broken as unknown as ParseResult)} wizardSessionId={WSID} />,
    );
    fireEvent.click(q.getByTestId(`wizard-step3-card-${DFID}-more`));
    // A 0 is a signal, not hidden: every breakdown header reads "(0)".
    expect(q.getByTestId(`wizard-step3-card-${DFID}-breakdown-crew`).textContent).toContain("(0)");
    expect(q.getByTestId(`wizard-step3-card-${DFID}-breakdown-rooms`).textContent).toContain("(0)");
    expect(q.getByTestId(`wizard-step3-card-${DFID}-breakdown-hotels`).textContent).toContain(
      "(0)",
    );
    expect(q.getByTestId(`wizard-step3-card-${DFID}-breakdown-schedule`).textContent).toContain(
      "(0)",
    );
  });

  test("undefined warnings → no chip", () => {
    const broken = parseResult() as unknown as Record<string, unknown>;
    delete broken.warnings;
    const q = render(
      <Step3SheetCard row={stagedRow(broken as unknown as ParseResult)} wizardSessionId={WSID} />,
    );
    expect(q.queryByTestId(`wizard-step3-card-${DFID}-warnings`)).toBeNull();
  });

  test("zero-count clean sheet still renders the counts (a 0 is a signal)", () => {
    const FIX = parseResult({ crewMembers: [], rooms: [], hotelReservations: [], runOfShow: {} });
    const q = render(<Step3SheetCard row={stagedRow(FIX)} wizardSessionId={WSID} />);
    // a clean (non-null parseResult) sheet still has an expand toggle
    expect(q.queryByTestId(`wizard-step3-card-${DFID}-more`)).not.toBeNull();
    fireEvent.click(q.getByTestId(`wizard-step3-card-${DFID}-more`));
    expect(q.getByTestId(`wizard-step3-card-${DFID}-breakdown-crew`).textContent).toContain("(0)");
    expect(q.getByTestId(`wizard-step3-card-${DFID}-breakdown-schedule`).textContent).toContain(
      "(0)",
    );
  });
});

describe("Step3SheetCard — breakdown (§4.3)", () => {
  function expand(q: ReturnType<typeof render>) {
    fireEvent.click(q.getByTestId(`wizard-step3-card-${DFID}-more`));
    return q.getByTestId(`wizard-step3-card-${DFID}-breakdown`);
  }
  // Non-null indexer for the fixtures we build with known length (the project
  // runs noUncheckedIndexedAccess).
  function at<T>(xs: T[], i: number): T {
    return xs[i] as T;
  }

  test("crew breakdown lists names + roles, capped at 30 with '…and K more'", () => {
    const FIX = parseResult({ crewMembers: crew(34) });
    const q = render(<Step3SheetCard row={stagedRow(FIX)} wizardSessionId={WSID} />);
    const b = expand(q);
    const region = within(b).getByTestId(`wizard-step3-card-${DFID}-breakdown-crew`);
    // first member is shown with name + role
    expect(region.textContent).toContain(at(FIX.crewMembers, 0).name);
    expect(region.textContent).toContain(at(FIX.crewMembers, 0).role);
    // 30th shown, 31st NOT shown
    expect(region.textContent).toContain(at(FIX.crewMembers, 29).name);
    expect(region.textContent).not.toContain(at(FIX.crewMembers, 30).name);
    const overflow = FIX.crewMembers.length - 30;
    expect(region.textContent).toContain(`${overflow} more`);
  });

  test("rooms breakdown caps at 20 with overflow note", () => {
    const FIX = parseResult({ rooms: rooms(23) });
    const q = render(<Step3SheetCard row={stagedRow(FIX)} wizardSessionId={WSID} />);
    const region = within(expand(q)).getByTestId(`wizard-step3-card-${DFID}-breakdown-rooms`);
    expect(region.textContent).toContain(at(FIX.rooms, 19).name);
    expect(region.textContent).not.toContain(at(FIX.rooms, 20).name);
    expect(region.textContent).toContain(`${FIX.rooms.length - 20} more`);
  });

  test("hotels breakdown caps at 12 with overflow note", () => {
    const FIX = parseResult({ hotelReservations: hotels(15) });
    const q = render(<Step3SheetCard row={stagedRow(FIX)} wizardSessionId={WSID} />);
    const region = within(expand(q)).getByTestId(`wizard-step3-card-${DFID}-breakdown-hotels`);
    expect(region.textContent).toContain(at(FIX.hotelReservations, 11).hotel_name);
    expect(region.textContent).not.toContain(at(FIX.hotelReservations, 12).hotel_name);
    expect(region.textContent).toContain(`${FIX.hotelReservations.length - 12} more`);
  });

  test("schedule: a day with >6 entries reveals every entry via 'Show all' (no silent truncation), in a 2-track time|title grid", () => {
    const FIX = parseResult({ runOfShow: runOfShow(1, 9) }); // 1 day, 9 entries (> the 6 cap)
    const q = render(<Step3SheetCard row={stagedRow(FIX)} wizardSessionId={WSID} />);
    const region = within(expand(q)).getByTestId(`wizard-step3-card-${DFID}-breakdown-schedule`);
    // Collapsed: first 6 entries render as SEPARATE time + title cells (the 2-track
    // grid that column-aligns them — not one joined span).
    expect(within(region).getAllByTestId(`wizard-step3-card-${DFID}-sched-time`).length).toBe(6);
    expect(within(region).getAllByTestId(`wizard-step3-card-${DFID}-sched-title`).length).toBe(6);
    // The cap is an in-place disclosure, NOT a dead '+N' tail.
    fireEvent.click(within(region).getByText("Show all 9 times"));
    // All 9 now present — nothing is hidden.
    expect(within(region).getAllByTestId(`wizard-step3-card-${DFID}-sched-time`).length).toBe(9);
    expect(within(region).getAllByTestId(`wizard-step3-card-${DFID}-sched-title`).length).toBe(9);
  });

  // followup E: the breakdown day headers were raw ISO keys ("2026-04-10") while
  // the summary humanizes the same dates — an internal inconsistency in one card.
  test("schedule breakdown day headers are humanized (matching the summary), not raw ISO", () => {
    const FIX = parseResult({ runOfShow: runOfShow(1, 2) }); // 1 day; key "2026-04-10"
    const q = render(<Step3SheetCard row={stagedRow(FIX)} wizardSessionId={WSID} />);
    const region = within(expand(q)).getByTestId(`wizard-step3-card-${DFID}-breakdown-schedule`);
    expect(region.textContent).toContain("Apr 10"); // humanizeDate("2026-04-10")
    expect(region.textContent).not.toContain("2026-04-10"); // raw ISO never shown
  });

  test("warnings breakdown: catalog title when cataloged, raw message (never the bare code) otherwise, + non-blocking note", () => {
    const titled = Object.entries(MESSAGE_CATALOG).find(([, v]) => v.title != null)!;
    const titledCode = titled[0];
    const titledTitle = titled[1].title as string;
    const FIX = parseResult({
      warnings: [
        { severity: "warn" as const, code: titledCode, message: "RAW-FALLBACK-SHOULD-NOT-SHOW" },
        {
          severity: "info" as const,
          code: "UNKNOWN_PARSER_WARNING_XYZ",
          message: "Two flights could not be matched to crew",
        },
      ],
    });
    const q = render(<Step3SheetCard row={stagedRow(FIX)} wizardSessionId={WSID} />);
    const region = within(expand(q)).getByTestId(`wizard-step3-card-${DFID}-breakdown-warnings`);
    // Cataloged code → the catalog title (NOT the raw fallback message).
    expect(region.textContent).toContain(titledTitle);
    expect(region.textContent).not.toContain("RAW-FALLBACK-SHOULD-NOT-SHOW");
    // Unknown code → the human message, and NEVER the bare code (invariant 5).
    expect(region.textContent).toContain("Two flights could not be matched to crew");
    expect(region.textContent).not.toContain("UNKNOWN_PARSER_WARNING_XYZ");
    // Explicit non-blocking affordance.
    expect(region.textContent).toMatch(/don.t block publishing/i);
  });

  test("a warning with a sourceCell renders an 'Open in Sheet' deep link to that cell; none otherwise", () => {
    const cell = { title: "INFO", gid: 5, a1: "E12" }; // INFO is allowlisted → cell-precise link
    const FIX = parseResult({
      warnings: [
        {
          severity: "warn" as const,
          code: "SCHEDULE_TIME_UNPARSED",
          message: "x",
          sourceCell: cell,
        },
        { severity: "warn" as const, code: "UNKNOWN_ROLE_TOKEN", message: "y" }, // no sourceCell
      ],
    });
    const q = render(<Step3SheetCard row={stagedRow(FIX)} wizardSessionId={WSID} />);
    const region = within(expand(q));
    const link = region.getByTestId(
      `wizard-step3-card-${DFID}-warning-0-open`,
    ) as HTMLAnchorElement;
    // href derived from the seeded anchor (gid + range), not hardcoded.
    expect(link.getAttribute("href")).toContain(`#gid=${cell.gid}`);
    expect(link.getAttribute("href")).toContain(`range=${cell.a1}`);
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toContain("noopener");
    // The second warning (no sourceCell) has no link.
    expect(region.queryByTestId(`wizard-step3-card-${DFID}-warning-1-open`)).toBeNull();
  });

  test("a newly-anchored UNKNOWN_ROLE_TOKEN (with sourceCell) renders the link + catalog title on the real Step-3 card", () => {
    const cell = { title: "INFO", gid: 0, a1: "C3" }; // crew ROLE cell (parse-warning deep links)
    const FIX = parseResult({
      warnings: [
        {
          severity: "warn" as const,
          code: "UNKNOWN_ROLE_TOKEN",
          message: "Unknown role token: 'WIDGET'",
          sourceCell: cell,
        },
      ],
    });
    const q = render(<Step3SheetCard row={stagedRow(FIX)} wizardSessionId={WSID} />);
    const region = within(expand(q));
    const link = region.getByTestId(
      `wizard-step3-card-${DFID}-warning-0-open`,
    ) as HTMLAnchorElement;
    expect(link.getAttribute("href")).toContain(`range=${cell.a1}`);
    // invariant 5: the rendered title is the catalog title, not the raw code/message.
    expect(region.getByText("Role we didn't recognize")).toBeTruthy();
  });

  test("the breakdown is mounted ONLY while the details dialog is open (absent, not merely inert, when closed)", () => {
    // A day with >6 entries means the breakdown contains a focusable "Show all"
    // button; when the dialog is closed the WHOLE breakdown is out of the DOM, so
    // that control is unreachable by construction (no `inert` bookkeeping needed).
    const FIX = parseResult({ runOfShow: runOfShow(1, 9) });
    const q = render(<Step3SheetCard row={stagedRow(FIX)} wizardSessionId={WSID} />);
    // Closed: no breakdown, no dialog, no Show-all control in the DOM at all.
    expect(q.queryByTestId(`wizard-step3-card-${DFID}-breakdown`)).toBeNull();
    expect(q.queryByTestId(`wizard-step3-card-${DFID}-details-dialog`)).toBeNull();
    expect(q.queryByText("Show all 9 times")).toBeNull();
    // Open: the breakdown mounts inside the dialog; its controls are reachable.
    fireEvent.click(q.getByTestId(`wizard-step3-card-${DFID}-more`));
    expect(q.queryByTestId(`wizard-step3-card-${DFID}-breakdown`)).not.toBeNull();
    expect(q.queryByText("Show all 9 times")).not.toBeNull();
  });

  test("schedule outline caps days at 14 and entries per day at 6", () => {
    const FIX = parseResult({ runOfShow: runOfShow(16, 8) });
    const q = render(<Step3SheetCard row={stagedRow(FIX)} wizardSessionId={WSID} />);
    const region = within(expand(q)).getByTestId(`wizard-step3-card-${DFID}-breakdown-schedule`);
    const ros = FIX.runOfShow ?? {};
    const days = Object.keys(ros);
    const titleAt = (dayIdx: number, entryIdx: number): string => {
      const day = ros[days[dayIdx] as string];
      return (day?.entries[entryIdx] as { title: string }).title;
    };
    // day 14 (index 13) shown, day 15 (index 14) not
    expect(region.textContent).toContain(titleAt(13, 0));
    expect(region.textContent).not.toContain(titleAt(14, 0));
    expect(region.textContent).toContain(`${days.length - 14} more days`);
    // within a shown day, first 6 entries shown, 7th not
    expect(region.textContent).toContain(titleAt(0, 5));
    expect(region.textContent).not.toContain(titleAt(0, 6));
  });

  test("breakdown handles empty arrays without crashing", () => {
    const FIX = parseResult({ crewMembers: [], rooms: [], hotelReservations: [], runOfShow: {} });
    const q = render(<Step3SheetCard row={stagedRow(FIX)} wizardSessionId={WSID} />);
    expect(() => expand(q)).not.toThrow();
  });

  // Layout intent (real geometry verified in the e2e harness): inside the details
  // dialog the breakdown lays its sections out as a balanced 2-column flow in the
  // desktop popup (1 column in the mobile sheet), bounded by the dialog width —
  // not a single narrow column. jsdom can't compute columns, so this pins the
  // class contract; the browser assertion in tests/e2e/step3-grid-layout.spec.ts
  // proves >1 column at the popup width.
  test("breakdown uses a balanced 2-column flow in the popup (1 column in the sheet)", () => {
    const FIX = parseResult();
    const q = render(<Step3SheetCard row={stagedRow(FIX)} wizardSessionId={WSID} />);
    const grid = within(expand(q)).getByTestId(`wizard-step3-card-${DFID}-breakdown-grid`);
    // 2 columns at the sm popup width; 1 column in the mobile sheet (default).
    expect(grid.className).toMatch(/\bsm:columns-2\b/);
    expect(grid.className).toMatch(/\bcolumns-1\b/);
    // Sections stay intact across a column break.
    expect(grid.className).toContain("break-inside-avoid");
    // It is NOT the old single-track flex column.
    expect(grid.className).not.toMatch(/\bflex-col\b/);
  });

  test("warnings render in a dedicated FULL-WIDTH bordered panel BELOW the data grid, not inside it", () => {
    const FIX = parseResult({
      warnings: [{ severity: "warn" as const, code: "SCHEDULE_TIME_UNPARSED", message: "x" }],
    });
    const q = render(<Step3SheetCard row={stagedRow(FIX)} wizardSessionId={WSID} />);
    const breakdown = expand(q);
    const grid = within(breakdown).getByTestId(`wizard-step3-card-${DFID}-breakdown-grid`);
    const panel = within(breakdown).getByTestId(`wizard-step3-card-${DFID}-warnings-panel`);
    const warnings = within(breakdown).getByTestId(`wizard-step3-card-${DFID}-breakdown-warnings`);
    // The warnings section lives inside the dedicated panel, NOT inside the column grid.
    expect(panel.contains(warnings)).toBe(true);
    expect(grid.contains(warnings)).toBe(false);
    // A full-border callout (DESIGN.md: full border, never a side-stripe accent).
    expect(panel.className).toMatch(/\bborder\b/);
    expect(panel.className).not.toMatch(/\bborder-[lrtb]\b/);
  });

  test("no warnings panel when there are no warnings (no empty bordered box)", () => {
    const q = render(
      <Step3SheetCard row={stagedRow(parseResult({ warnings: [] }))} wizardSessionId={WSID} />,
    );
    expand(q);
    expect(q.queryByTestId(`wizard-step3-card-${DFID}-warnings-panel`)).toBeNull();
  });
});
