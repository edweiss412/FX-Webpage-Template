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
import { cleanup, render, fireEvent, waitFor, within } from "@testing-library/react";
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

describe("Step3SheetCard — summary (§4.2)", () => {
  test("renders the show title, and client when present", () => {
    const FIX = parseResult();
    const q = render(<Step3SheetCard row={stagedRow(FIX)} wizardSessionId={WSID} />);
    expect(q.getByTestId(`wizard-step3-card-${DFID}-title`).textContent).toContain(FIX.show.title);
    expect(q.getByTestId(`wizard-step3-card-${DFID}-client`).textContent).toContain(
      FIX.show.client_label,
    );
  });

  test("title falls back to driveFileName when parseResult title is empty", () => {
    const FIX = parseResult({ show: show({ title: "" }) });
    const row = stagedRow(FIX, { driveFileName: "fallback-name.sheet" });
    const q = render(<Step3SheetCard row={row} wizardSessionId={WSID} />);
    expect(q.getByTestId(`wizard-step3-card-${DFID}-title`).textContent).toContain(
      "fallback-name.sheet",
    );
  });

  // Variant B: the venue NAME renders inline on the compact meta line (-venue);
  // the standalone -city row, "Venue not detected" fallback, and Totals strip are
  // all gone (venue segment simply omits when absent — see the Task 4 meta tests).
  test("venue name renders on the compact meta line", () => {
    const FIX = parseResult({
      show: show({
        venue: { name: "The Drake Hotel", address: "140 E Walton Pl, Chicago, IL 60611" },
      }),
    });
    const q = render(<Step3SheetCard row={stagedRow(FIX)} wizardSessionId={WSID} />);
    expect(q.getByTestId(`wizard-step3-card-${DFID}-venue`).textContent).toContain(
      "The Drake Hotel",
    );
    expect(q.queryByTestId(`wizard-step3-card-${DFID}-city`)).toBeNull();
    expect(q.queryByTestId(`wizard-step3-card-${DFID}-totals`)).toBeNull();
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

  test("event-details breakdown renders all known TEXT specs as-parsed (incl. sentinels), not just keynote+reel (BL-EVENT-DETAILS-UNRENDERED)", () => {
    const FIX = parseResult({
      show: show({
        event_details: {
          stage_size: "8'x24'",
          podium_type: "(2) Acrylic",
          polling: "YES",
          keynote_requirements: "TBD", // sentinel → SHOWN as-parsed (review surface)
          opening_reel: "Plays from house https://drive.google.com/x",
          led: "N/A", // sentinel → SHOWN as-parsed (review surface, NOT hidden like crew)
          diagrams: "https://drive.google.com/folder", // folder link — NOT a text spec
          notes: "   ", // whitespace-only → omitted (empty after trim)
          // non-string JSONB value → coerced + shown, no throw:
          test_pattern: 169 as unknown as string,
        },
      }),
    });
    const q = render(<Step3SheetCard row={stagedRow(FIX)} wizardSessionId={WSID} />);
    fireEvent.click(q.getByTestId(`wizard-step3-card-${DFID}-more`));
    // Scope to the event-details breakdown only (anti-tautology).
    const txt =
      q.getByTestId(`wizard-step3-card-${DFID}-breakdown-event-details`).textContent ?? "";
    expect(txt).toContain("Stage size:");
    expect(txt).toContain("8'x24'");
    expect(txt).toContain("Podium:");
    expect(txt).toContain("Audience polling:");
    expect(txt).toContain("Keynote:");
    expect(txt).toContain("Opening reel:");
    expect(txt).toContain("169"); // non-string coerced + shown
    // Sentinels are SHOWN as-parsed on the review surface (existing contract,
    // Step3Review.test.tsx) — the crew card hides them; the operator modal does not.
    expect(txt).toContain("LED wall:");
    expect(txt).toContain("N/A");
    expect(txt).not.toMatch(/diagrams/i); // folder link excluded (text-key scope)
    expect(txt).not.toContain("Notes:"); // whitespace-only omitted (empty after trim)
    expect(txt).not.toContain("https://"); // opening_reel URL stripped
    // header count = 7 shown (stage/podium/polling/keynote/reel/led/test_pattern);
    // notes(ws) + diagrams(non-text) excluded.
    expect(txt).toContain("(7)");
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

  test("dates render humanized present segments only on the -dates meta cell", () => {
    const FIX = parseResult({
      show: show({
        dates: { travelIn: "2026-04-09", set: null, showDays: ["2026-04-10"], travelOut: null },
      }),
    });
    const q = render(<Step3SheetCard row={stagedRow(FIX)} wizardSessionId={WSID} />);
    const s = q.getByTestId(`wizard-step3-card-${DFID}-dates`).textContent ?? "";
    // Humanized, not the raw ISO chain.
    expect(s).toContain("Travel in Apr 9");
    expect(s).toContain("Show Apr 10");
    expect(s).not.toContain("2026-04-09"); // humanized, not raw ISO
    expect(s).not.toContain("Travel out"); // travelOut null → segment omitted
  });

  test("show-days that can't be humanized fall back to the raw ISO (a present date is never dropped)", () => {
    const FIX = parseResult({
      show: show({
        dates: { travelIn: null, set: null, showDays: ["BADDATE-1", "BADDATE-2"], travelOut: null },
      }),
    });
    const q = render(<Step3SheetCard row={stagedRow(FIX)} wizardSessionId={WSID} />);
    const s = q.getByTestId(`wizard-step3-card-${DFID}-dates`).textContent ?? "";
    // humanizeDayRange → null on all-malformed; the builder falls back to the
    // raw first–last so the Show segment is rendered, not silently omitted.
    expect(s).toContain("Show BADDATE-1 – BADDATE-2");
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
      // a warn code that is NOT a data-gap class (benign autocorrect) + an info code.
      { severity: "warn" as const, code: "STAGE_WORD_AUTOCORRECTED", message: "one" },
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

  test("the collapsed crew preview is gone — crew now lives ONLY in the review modal", () => {
    const FIX = parseResult({ crewMembers: crew(12) });
    const q = render(<Step3SheetCard row={stagedRow(FIX)} wizardSessionId={WSID} />);
    // The old collapsed crew-preview testid no longer exists, and no crew name
    // appears on the compact card face.
    expect(q.queryByTestId(`wizard-step3-card-${DFID}-crew-summary`)).toBeNull();
    expect(card(q).textContent ?? "").not.toContain(FIX.crewMembers[0]!.name);
    // Crew appears only after opening the review modal (the breakdown roster).
    fireEvent.click(q.getByTestId(`wizard-step3-card-${DFID}-more`));
    expect(q.getByTestId(`wizard-step3-card-${DFID}-breakdown-crew`).textContent).toContain(
      FIX.crewMembers[0]!.name,
    );
  });
});

describe("Step3SheetCard — title deep link + wrapping", () => {
  // The title link is an un-anchored whole-sheet link (no section anchor), so
  // buildSheetDeepLink pins it to the first tab (`#gid=0`) for a deterministic
  // landing rather than a gid-less base URL that opens the doc's last-active tab.
  const SHEET_URL = (dfid: string) => `https://docs.google.com/spreadsheets/d/${dfid}/edit#gid=0`;

  // Variant B: the SELECTABLE card's title is plain text (-title); the source-sheet
  // deep link (-title-link) is retained only on the non-selectable variants
  // (no-details below + demoted, covered in the Task 4 block). The modal trigger
  // opens the review dialog.
  test("the selectable card's Review/View button opens the review DIALOG (haspopup=dialog)", () => {
    const q = render(<Step3SheetCard row={stagedRow(parseResult())} wizardSessionId={WSID} />);
    const btn = q.getByTestId(`wizard-step3-card-${DFID}-more`);
    // Clean row (no warnings) → View.
    expect(btn.textContent).toContain("View");
    expect(btn.getAttribute("aria-haspopup")).toBe("dialog");
    // It is a modal trigger, not an inline expand toggle: no aria-expanded, and
    // no dialog exists until it is clicked.
    expect(btn.getAttribute("aria-expanded")).toBeNull();
    expect(q.queryByRole("dialog")).toBeNull();
  });

  test("the selectable card's title truncates on the compact row (single-line)", () => {
    const FIX = parseResult({
      show: show({ title: "A Very Long Show Title That Would Otherwise Truncate Off The Card" }),
    });
    const q = render(<Step3SheetCard row={stagedRow(FIX)} wizardSessionId={WSID} />);
    const titleEl = q.getByTestId(`wizard-step3-card-${DFID}-title`);
    // The compact row keeps titles to one line (truncate); no source link on the
    // selectable variant.
    expect(titleEl.className).toMatch(/\btruncate\b/);
    expect(q.queryByTestId(`wizard-step3-card-${DFID}-title-link`)).toBeNull();
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
  test("the review chip shows the data-gap COUNT (non-DQ warns excluded); never the raw code", () => {
    const w = [
      { severity: "warn" as const, code: "FIELD_UNREADABLE", message: "phone unreadable" },
      { severity: "warn" as const, code: "FIELD_UNREADABLE", message: "phone 2 unreadable" },
      { severity: "warn" as const, code: "BLOCK_DISAPPEARED", message: "hotel block gone" },
      // a non-data-quality warn (benign autocorrect) → NOT counted; it lives only
      // in the review modal.
      { severity: "warn" as const, code: "STAGE_WORD_AUTOCORRECTED", message: "x" },
    ];
    const FIX = parseResult({ warnings: w });
    const q = render(
      <Step3SheetCard row={stagedRow(FIX, { status: "applied" })} wizardSessionId={WSID} />,
    );
    const chip = q.getByTestId(`wizard-step3-card-${DFID}-review-chip`);
    // total derives from the SEEDED data-quality warnings (anti-tautology), never a literal.
    const total = w.filter((x) =>
      ["FIELD_UNREADABLE", "UNKNOWN_SECTION_HEADER", "BLOCK_DISAPPEARED"].includes(x.code),
    ).length;
    expect(chip.textContent).toContain(`${total} ${total === 1 ? "needs" : "need"} a look`);
    // invariant 5: no raw §12.4 code literal in the chip.
    expect(chip.textContent).not.toMatch(/FIELD_UNREADABLE|BLOCK_DISAPPEARED/);
    // The per-class breakdown moved to the review modal — no -data-gaps on the card face.
    expect(q.queryByTestId(`wizard-step3-card-${DFID}-data-gaps`)).toBeNull();
  });

  test("a lone non-data-quality warning → no summary chip row at all", () => {
    const FIX = parseResult({
      // benign warn-severity autocorrect — a warn code that is NOT a data-gap class.
      warnings: [{ severity: "warn" as const, code: "STAGE_WORD_AUTOCORRECTED", message: "x" }],
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
    // "More" now opens <Step3ReviewModal>; the scrolling content pane hosts
    // every registry section (the retired dialog's `-breakdown` body).
    fireEvent.click(q.getByTestId(`wizard-step3-card-${DFID}-more`));
    return q.getByTestId(`wizard-step3-card-${DFID}-review-content`);
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

  test("the section bodies are mounted ONLY while the review modal is open (absent, not merely inert, when closed)", () => {
    // A day with >6 entries means the schedule section contains a focusable
    // "Show all" button; when the modal is closed the WHOLE body is out of the
    // DOM, so that control is unreachable by construction (no `inert`
    // bookkeeping needed).
    const FIX = parseResult({ runOfShow: runOfShow(1, 9) });
    const q = render(<Step3SheetCard row={stagedRow(FIX)} wizardSessionId={WSID} />);
    // Closed: no content pane, no modal, no Show-all control in the DOM at all.
    expect(q.queryByTestId(`wizard-step3-card-${DFID}-review-content`)).toBeNull();
    expect(q.queryByTestId(`wizard-step3-card-${DFID}-review-modal`)).toBeNull();
    expect(q.queryByText("Show all 9 times")).toBeNull();
    // Open: the sections mount inside the modal; their controls are reachable.
    fireEvent.click(q.getByTestId(`wizard-step3-card-${DFID}-more`));
    expect(q.queryByTestId(`wizard-step3-card-${DFID}-review-content`)).not.toBeNull();
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
  // modal (spec 2026-07-02 §6) the section bodies render as REGISTRY panels in
  // one scrolling content pane — the retired dialog's balanced column flow
  // (`-breakdown-grid`) is gone entirely. Real geometry is Task 10's e2e spec.
  test("'More' mounts the review modal's registry sections — the retired column-flow breakdown grid is gone", () => {
    const FIX = parseResult();
    const q = render(<Step3SheetCard row={stagedRow(FIX)} wizardSessionId={WSID} />);
    const content = expand(q);
    // The retired columns machinery is not in the DOM under ANY testid.
    expect(q.queryByTestId(`wizard-step3-card-${DFID}-breakdown-grid`)).toBeNull();
    // Every carried section body renders inside the modal's content pane.
    for (const sec of ["crew", "schedule", "rooms", "hotels", "venue", "warnings"]) {
      const body = q.getByTestId(`wizard-step3-card-${DFID}-breakdown-${sec}`);
      expect(content.contains(body)).toBe(true);
    }
  });

  test("warnings render as the registry's OWN checks section, not nested inside another section's panel", () => {
    const FIX = parseResult({
      warnings: [{ severity: "warn" as const, code: "SCHEDULE_TIME_UNPARSED", message: "x" }],
    });
    const q = render(<Step3SheetCard row={stagedRow(FIX)} wizardSessionId={WSID} />);
    const content = expand(q);
    const section = within(content).getByTestId(
      `wizard-step3-card-${DFID}-review-section-warnings`,
    );
    const warnings = within(content).getByTestId(`wizard-step3-card-${DFID}-breakdown-warnings`);
    // The warnings body lives inside the warnings SECTION…
    expect(section.contains(warnings)).toBe(true);
    // …and inside no other registry section (e.g. it never leaks into schedule).
    const schedule = within(content).getByTestId(
      `wizard-step3-card-${DFID}-review-section-schedule`,
    );
    expect(schedule.contains(warnings)).toBe(false);
  });

  test("zero warnings still renders the checks section with the AFFIRMATIVE empty state (spec §3.10 — never an absent panel)", () => {
    const q = render(
      <Step3SheetCard row={stagedRow(parseResult({ warnings: [] }))} wizardSessionId={WSID} />,
    );
    const content = expand(q);
    expect(
      within(content).queryByTestId(`wizard-step3-card-${DFID}-breakdown-warnings`),
    ).not.toBeNull();
    expect(
      within(content).getByTestId(`wizard-step3-card-${DFID}-warnings-empty`).textContent,
    ).toContain("No parse warnings");
  });
});

describe("Step3SheetCard — UNKNOWN_FIELD row-label surfacing + legacy shim (Part A/D)", () => {
  test("Part A: two UNKNOWN_FIELD warnings render distinguishable row labels", () => {
    const FIX = parseResult({
      warnings: [
        {
          severity: "warn" as const,
          code: "UNKNOWN_FIELD",
          message: "Unrecognized event_details row label: 'Floor Plan'",
          rawSnippet: "Floor Plan | LINK",
        },
        {
          severity: "warn" as const,
          code: "UNKNOWN_FIELD",
          message: "Unrecognized event_details row label: 'GS Podium Type'",
          rawSnippet: "GS Podium Type | (2) Acrylic Podium",
        },
      ],
    });
    const q = render(<Step3SheetCard row={stagedRow(FIX)} wizardSessionId={WSID} />);
    fireEvent.click(q.getByTestId(`wizard-step3-card-${DFID}-more`));
    const panel = q.getByTestId(`wizard-step3-card-${DFID}-breakdown-warnings`);
    // The two entries share the generic title but are distinguishable by label.
    expect(within(panel).queryByText("Floor Plan")).not.toBeNull();
    expect(within(panel).queryByText("GS Podium Type")).not.toBeNull();
  });

  test("Part A shim: a legacy A55-range UNKNOWN_FIELD renders NO 'Open in Sheet' link", () => {
    const FIX = parseResult({
      warnings: [
        {
          severity: "warn" as const,
          code: "UNKNOWN_FIELD",
          message: "x",
          rawSnippet: "Floor Plan | LINK",
          sourceCell: { title: "INFO", gid: 0, a1: "A55:B74" },
        },
      ],
    });
    const q = render(<Step3SheetCard row={stagedRow(FIX)} wizardSessionId={WSID} />);
    fireEvent.click(q.getByTestId(`wizard-step3-card-${DFID}-more`));
    const panel = q.getByTestId(`wizard-step3-card-${DFID}-breakdown-warnings`);
    expect(within(panel).queryByRole("link", { name: /Open in Sheet/ })).toBeNull();
  });
});

describe("Step3SheetCard compact list row (Task 4)", () => {
  // Each warning is a data-quality FIELD_UNREADABLE so summarizeDataGaps().total
  // equals the count (derived from the fixture, not hardcoded).
  const warn = (n: number) =>
    Array.from({ length: n }, (_, i) => ({
      code: "FIELD_UNREADABLE",
      severity: "warn" as const,
      message: `field ${i} unreadable`,
    }));

  test("clean, no warnings → View button, no chip, plain title (no -title-link)", () => {
    const q = render(
      <Step3SheetCard row={stagedRow(parseResult({ warnings: [] }))} wizardSessionId={WSID} />,
    );
    expect(within(card(q)).getByTestId(`wizard-step3-card-${DFID}-more`).textContent).toContain(
      "View",
    );
    expect(q.queryByTestId(`wizard-step3-card-${DFID}-review-chip`)).toBeNull();
    expect(q.queryByTestId(`wizard-step3-card-${DFID}-title-link`)).toBeNull();
    expect(q.getByTestId(`wizard-step3-card-${DFID}-title`)).toBeTruthy();
  });

  test("clean, N data-gap warnings → Review button + chip 'N need a look' (verb-agreed)", () => {
    const q = render(
      <Step3SheetCard row={stagedRow(parseResult({ warnings: warn(2) }))} wizardSessionId={WSID} />,
    );
    const chip = within(card(q)).getByTestId(`wizard-step3-card-${DFID}-review-chip`);
    expect(chip.textContent).toContain("2 need a look"); // total===2 from fixture
    expect(within(card(q)).getByTestId(`wizard-step3-card-${DFID}-more`).textContent).toContain(
      "Review",
    );
  });

  test("single warning → 'needs' singular", () => {
    const q = render(
      <Step3SheetCard row={stagedRow(parseResult({ warnings: warn(1) }))} wizardSessionId={WSID} />,
    );
    expect(
      within(card(q)).getByTestId(`wizard-step3-card-${DFID}-review-chip`).textContent,
    ).toContain("1 needs a look");
  });

  test("meta line shows client · dates · venue from parseResult.show", () => {
    const q = render(
      <Step3SheetCard
        row={stagedRow(
          parseResult({
            show: show({ client_label: "Acme", venue: { name: "Grand Ballroom", address: "" } }),
          }),
        )}
        wizardSessionId={WSID}
      />,
    );
    expect(q.getByTestId(`wizard-step3-card-${DFID}-client`).textContent).toContain("Acme");
    expect(q.getByTestId(`wizard-step3-card-${DFID}-venue`).textContent).toContain(
      "Grand Ballroom",
    );
    expect(
      (q.getByTestId(`wizard-step3-card-${DFID}-dates`).textContent ?? "").trim().length,
    ).toBeGreaterThan(0);
  });

  test("meta line omits each absent segment (no empty node, no dangling separator)", () => {
    const q = render(
      <Step3SheetCard
        row={stagedRow(
          parseResult({
            show: show({
              client_label: "",
              venue: null,
              dates: { travelIn: null, set: null, showDays: [], travelOut: null },
            }),
          }),
        )}
        wizardSessionId={WSID}
      />,
    );
    expect(q.queryByTestId(`wizard-step3-card-${DFID}-client`)).toBeNull();
    expect(q.queryByTestId(`wizard-step3-card-${DFID}-dates`)).toBeNull();
    expect(q.queryByTestId(`wizard-step3-card-${DFID}-venue`)).toBeNull();
    expect(q.getByTestId(`wizard-step3-card-${DFID}-title`)).toBeTruthy();
  });

  test("demoted RESCAN → no checkbox, 'Needs another look' chip, rescan banner, title-link, Review modal trigger", async () => {
    const q = render(
      <Step3SheetCard
        row={{
          ...stagedRow(parseResult({ warnings: [] })),
          lastFinalizeFailureCode: "RESCAN_REVIEW_REQUIRED",
        }}
        wizardSessionId={WSID}
      />,
    );
    expect(q.queryByTestId(`wizard-step3-checkbox-${DFID}`)).toBeNull();
    expect(
      within(card(q)).getByTestId(`wizard-step3-card-${DFID}-review-chip`).textContent,
    ).toContain("Needs another look");
    expect(q.getByTestId(`wizard-step3-rescan-review-${DFID}`)).toBeTruthy();
    expect(q.getByTestId(`wizard-step3-card-${DFID}-title-link`)).toBeTruthy();
    const more = q.getByTestId(`wizard-step3-card-${DFID}-more`);
    expect(more.textContent).toContain("Review");
    fireEvent.click(more);
    await waitFor(() => expect(q.getByRole("dialog")).toBeTruthy());
  });

  test("demoted NON-RESCAN (WIZARD_SESSION_SUPERSEDED) → no checkbox, chip, NotPublishableNote, title-link, Review trigger", async () => {
    const q = render(
      <Step3SheetCard
        row={{
          ...stagedRow(parseResult({ warnings: [] })),
          lastFinalizeFailureCode: "WIZARD_SESSION_SUPERSEDED",
        }}
        wizardSessionId={WSID}
      />,
    );
    expect(q.queryByTestId(`wizard-step3-checkbox-${DFID}`)).toBeNull();
    expect(
      within(card(q)).getByTestId(`wizard-step3-card-${DFID}-review-chip`).textContent,
    ).toContain("Needs another look");
    expect(q.getByTestId(`wizard-step3-card-${DFID}-not-publishable`)).toBeTruthy();
    expect(q.queryByTestId(`wizard-step3-rescan-review-${DFID}`)).toBeNull();
    expect(q.getByTestId(`wizard-step3-card-${DFID}-title-link`)).toBeTruthy();
    fireEvent.click(q.getByTestId(`wizard-step3-card-${DFID}-more`));
    await waitFor(() => expect(q.getByRole("dialog")).toBeTruthy());
  });

  test("no-details (parseResult null) → couldn't-read card, no checkbox/chip/button, keeps -title-link", () => {
    const q = render(
      <Step3SheetCard
        row={stagedRow(null, { driveFileName: "broken.sheet" })}
        wizardSessionId={WSID}
      />,
    );
    expect(card(q).getAttribute("data-no-details")).toBe("true");
    expect(card(q).textContent).toContain("broken.sheet");
    expect(q.queryByTestId(`wizard-step3-card-${DFID}-more`)).toBeNull();
    expect(q.getByTestId(`wizard-step3-card-${DFID}-title-link`)).toBeTruthy();
  });

  test("View/Review opens the modal (mounts on click)", async () => {
    const q = render(
      <Step3SheetCard row={stagedRow(parseResult({ warnings: [] }))} wizardSessionId={WSID} />,
    );
    fireEvent.click(q.getByTestId(`wizard-step3-card-${DFID}-more`));
    await waitFor(() => expect(q.getByRole("dialog")).toBeTruthy());
  });
});
