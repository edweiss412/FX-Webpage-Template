// @vitest-environment jsdom
/**
 * tests/components/admin/showpage/publishedReviewModal.test.tsx
 * (admin-show-modal spec §6 — Task 6)
 *
 * Unit contract for `PublishedReviewModal`: the published review surface
 * composed inside the extracted `ReviewModalShell` chrome. Pins the §6.1
 * header composition (heading-safe h2 accessible name, title→slug fallback,
 * conditional sheet icon, close-button initial focus, NO h1 in the panel),
 * the §6.1 body composition (StatusStrip — titleless — with the publish
 * toggle, ShowReviewSurface layout="modal" + syncHash with Overview-first /
 * Changes-last extras), the §6.2 guards (feed=null infra notice, not-eligible
 * inactive-share notice), the §3 one-shot alert_id scroll effect (li
 * aria-current target, #overview fallback, never re-fires on rerender), and
 * the §6.1 NO-footer contract.
 *
 * Fixture-derived: every expected value (title, slug, sheet href, alert
 * count) reads from the shared snapshot/props fixture, never a duplicated
 * literal.
 */
import "@testing-library/jest-dom/vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

// One unified next/navigation mock: useShowModalNav (useRouter/useSearchParams),
// StatusStrip's copy-link + feed/warning controls (useRouter().refresh()).
const routerPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: routerPush }),
  usePathname: () => "/admin",
  useSearchParams: () => new URLSearchParams(),
}));

import {
  PublishedReviewModal,
  type PublishedReviewModalProps,
} from "@/components/admin/showpage/PublishedReviewModal";
import {
  DURATION_NORMAL_FALLBACK_MS,
  EXIT_FALLBACK_BUFFER_MS,
} from "@/components/admin/review/ReviewModalShell";
import { ShareTokenProvider } from "@/app/admin/show/[slug]/ShareTokenContext";
import { buildPublishedSectionData } from "@/components/admin/review/publishedAdapter";
import { buildSectionWarningModel } from "@/lib/admin/sectionWarningModel";
import { dateSummarySegments, step3Sections } from "@/components/admin/wizard/step3ReviewSections";
import type { PublishedSectionData } from "@/components/admin/review/sectionData";
import type { SectionId } from "@/lib/admin/step3SectionStatus";
import type { ShowReviewSnapshot } from "@/lib/admin/readShowReviewSnapshot";
import type { ParseWarning } from "@/lib/parser/types";
import type { FeedEntry } from "@/lib/sync/holds/types";

const SHOW_ID = "22222222-2222-2222-2222-222222222222";
const SLUG = "published-fixture-show";
const DRIVE_FILE_ID = "DRIVE_PUB";
const TITLE = "Published Fixture Show";
const SHEET_HREF = "https://docs.google.com/spreadsheets/d/DRIVE_PUB/edit";
const NOW = new Date("2026-07-16T12:00:00.000Z");
const ALERT_ID = "33333333-3333-4333-8333-333333333333";

const TB = "published-show-review";
const railTid = (name: string) => `wizard-step3-card-${DRIVE_FILE_ID}-review-${name}`;

const crewWarning: ParseWarning = {
  severity: "warn",
  code: "UNKNOWN_ROLE_TOKEN",
  message: "Unrecognized role token",
  roleToken: "Grip",
  blockRef: { kind: "crew" },
};

function snapshot(warnings: ParseWarning[] = []): ShowReviewSnapshot {
  return {
    show: {
      id: SHOW_ID,
      title: TITLE,
      client_label: "Acme",
      client_contact: null,
      dates: {
        travelIn: "2026-05-01",
        set: null,
        showDays: ["2026-05-02"],
        travelOut: "2026-05-03",
      },
      venue: { name: "Hall A", address: "1 Main St" },
      event_details: null,
      agenda_links: [],
      coi_status: "received",
      diagrams: null,
      pull_sheet: [],
      source_anchors: {},
      drive_file_id: DRIVE_FILE_ID,
      archived: false,
      published: true,
    },
    internal: {
      financials: null,
      parse_warnings: warnings,
      raw_unrecognized: null,
      run_of_show: {},
      use_raw_decisions: [],
      show_id: SHOW_ID,
    },
    crew_members: [
      { id: "aaaaaaaa-0000-4000-8000-000000000001", name: "Alice Anders", role: "PM" },
    ],
    rooms: [],
    hotel_reservations: [],
    transportation: [],
    contacts: [],
  };
}

function renderedSectionIds(d: PublishedSectionData): Set<SectionId> {
  return new Set(step3Sections(d).map((s) => s.id));
}

function feedEntry(): FeedEntry {
  return {
    id: "entry-1",
    occurredAt: "2026-07-16T11:00:00.000Z",
    status: "applied",
    summary: "Crew updated",
    action: "none",
    entityRef: null,
    acceptable: false,
    acknowledgedAt: null,
  };
}

function baseProps(
  overrides: Partial<PublishedReviewModalProps> = {},
  warnings: ParseWarning[] = [],
): PublishedReviewModalProps {
  const data = buildPublishedSectionData(snapshot(warnings), { slug: SLUG });
  const bySection = buildSectionWarningModel({
    slug: SLUG,
    warnings: data.warnings,
    ignoredFingerprints: new Set<string>(),
    renderedSectionIds: renderedSectionIds(data),
  });
  return {
    data,
    bySection,
    slug: SLUG,
    showId: SHOW_ID,
    title: TITLE,
    archived: false,
    published: true,
    finalizeOwned: false,
    setPublished: vi.fn(async () => ({ ok: true }) as const),
    isLive: false,
    lastSyncedAt: "2026-07-16T11:48:00.000Z",
    lastCheckedAt: "2026-07-16T11:58:00.000Z",
    lastSyncStatus: "ok",
    now: NOW,
    alertCount: 0,
    openSheetHref: SHEET_HREF,
    hasActionableWarnings: false,
    archiveAction: vi.fn(async () => ({ ok: true }) as const),
    unarchiveAction: vi.fn(async () => {}),
    alertSlot: null,
    shareSlot: <div data-testid="share-slot-fixture" />,
    feed: { entries: [feedEntry()], truncated: false },
    undoAction: vi.fn(),
    acceptAction: vi.fn(),
    acceptAllAction: vi.fn(),
    approveAction: vi.fn(),
    rejectAction: vi.fn(),
    alertId: null,
    ...overrides,
  };
}

function renderModal(
  overrides: Partial<PublishedReviewModalProps> = {},
  warnings?: ParseWarning[],
) {
  const props = baseProps(overrides, warnings);
  const view = render(
    <ShareTokenProvider initialToken="TOK" initialEpoch={5}>
      <PublishedReviewModal {...props} />
    </ShareTokenProvider>,
  );
  const rerenderWith = (next: Partial<PublishedReviewModalProps>) =>
    view.rerender(
      <ShareTokenProvider initialToken="TOK" initialEpoch={5}>
        <PublishedReviewModal {...props} {...next} />
      </ShareTokenProvider>,
    );
  return { ...view, props, rerenderWith };
}

// jsdom implements neither scrollIntoView nor Element#scrollTo; stub both so
// the alert effect and the rail-click hash write are observable.
const scrollIntoViewSpy = vi.fn();
const hadScrollIntoView = "scrollIntoView" in HTMLElement.prototype;
const originalScrollIntoView = (HTMLElement.prototype as unknown as { scrollIntoView?: () => void })
  .scrollIntoView;
const originalScrollTo = (HTMLElement.prototype as unknown as { scrollTo?: () => void }).scrollTo;

beforeEach(() => {
  (HTMLElement.prototype as unknown as { scrollIntoView: unknown }).scrollIntoView =
    scrollIntoViewSpy;
  (HTMLElement.prototype as unknown as { scrollTo: unknown }).scrollTo = vi.fn();
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.resolve({ ok: true, status: 200, json: async () => ({}) } as Response)),
  );
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  window.location.hash = "";
  if (hadScrollIntoView) {
    (HTMLElement.prototype as unknown as { scrollIntoView: unknown }).scrollIntoView =
      originalScrollIntoView;
  } else {
    delete (HTMLElement.prototype as unknown as { scrollIntoView?: unknown }).scrollIntoView;
  }
  (HTMLElement.prototype as unknown as { scrollTo: unknown }).scrollTo = originalScrollTo;
});

const ROOT = join(__dirname, "..", "..", "..", "..");
const componentSrc = () =>
  readFileSync(join(ROOT, "components/admin/showpage/PublishedReviewModal.tsx"), "utf8");

// ── §6.1 header ───────────────────────────────────────────────────────────────

describe("PublishedReviewModal header (spec §6.1/§6.2)", () => {
  it("the dialog's accessible name is the show title via aria-labelledby onto an h2 holding ONLY the title text", () => {
    renderModal();
    const dialog = screen.getByRole("dialog");
    const labelId = dialog.getAttribute("aria-labelledby");
    expect(labelId).toBeTruthy();
    const label = document.getElementById(labelId!)!;
    expect(label.tagName).toBe("H2");
    // ONLY the title text — the sheet icon anchor must live OUTSIDE the h2 so
    // the accessible name never picks up icon-label noise.
    expect(label.textContent).toBe(TITLE);
    const sheet = screen.getByTestId(`${TB}-sheetlink`);
    expect(label.contains(sheet)).toBe(false);
  });

  it('title="" falls back to the slug (published adapter can yield an empty title)', () => {
    renderModal({ title: "" });
    const dialog = screen.getByRole("dialog");
    const label = document.getElementById(dialog.getAttribute("aria-labelledby")!)!;
    expect(label.textContent).toBe(SLUG);
  });

  it("title=null falls back to the slug", () => {
    renderModal({ title: null });
    const dialog = screen.getByRole("dialog");
    const label = document.getElementById(dialog.getAttribute("aria-labelledby")!)!;
    expect(label.textContent).toBe(SLUG);
  });

  it("openSheetHref renders the 44px sheet deep-link icon anchor with the fixture href", () => {
    renderModal();
    const sheet = screen.getByTestId(`${TB}-sheetlink`);
    expect(sheet.getAttribute("href")).toBe(SHEET_HREF);
    expect(sheet.getAttribute("aria-label")).toBe(`Open the source sheet for ${TITLE}`);
  });

  it("openSheetHref=null omits the sheet icon entirely (no dead anchor)", () => {
    renderModal({ openSheetHref: null });
    expect(screen.queryByTestId(`${TB}-sheetlink`)).toBeNull();
  });

  it("NO h1 inside the modal panel — the h2 is the only title node (StatusStrip title suppressed)", () => {
    renderModal();
    const panel = document.querySelector("[data-review-modal-panel]")!;
    expect(panel).not.toBeNull();
    expect(panel.querySelector("h1")).toBeNull();
    // modal-header-reconciliation §6.5: the strip renders no title node of its
    // own — the h1 branch and its divider were deleted with the `renderTitle` prop.
    expect(screen.queryByTestId("strip-title")).toBeNull();
    expect(screen.queryByTestId("strip-title-divider")).toBeNull();
  });

  it("the close button carries the modal's initial focus (useDialogFocus via initialFocusRef)", async () => {
    renderModal();
    const close = screen.getByTestId(`${TB}-close`);
    await waitFor(() => expect(document.activeElement).toBe(close));
  });
});

// ── §6.3 header subline (modal-header-reconciliation Task 4) ─────────────────
// The header's second line: the client label (omitted when null, WITH its
// trailing bullet) followed by the humanized date segments — or the
// "Dates not detected" fallback, which never lets the line disappear entirely.
// Every expected string is DERIVED from the fixture through the same helper the
// component uses; a hardcoded date literal could not prove the helper was called.

describe("PublishedReviewModal header subline (modal-header-reconciliation §6.3)", () => {
  /** Build the published contract off the shared snapshot, then override fields. */
  const dataWith = (overrides: Partial<PublishedSectionData>): PublishedSectionData => ({
    ...buildPublishedSectionData(snapshot(), { slug: SLUG }),
    ...overrides,
  });

  it("renders client → bullet → the helper-derived date segments", () => {
    const { props } = renderModal();
    const subline = screen.getByTestId(`${TB}-subline`);
    const expectedDates = dateSummarySegments(props.data.dates ?? undefined).join(" · ");
    // Non-vacuity: the fixture must actually produce segments, or the assertion
    // below would collapse into the empty-dates case.
    expect(expectedDates.length).toBeGreaterThan(0);
    expect(props.data.clientLabel).not.toBeNull();
    expect(subline).toHaveTextContent(props.data.clientLabel!);
    expect(subline).toHaveTextContent(expectedDates);
    // The separator between the two entries is the aria-hidden bullet.
    expect(subline.querySelector('[aria-hidden="true"]')).not.toBeNull();
  });

  // T-SUBLINE-CLIENT-NULL — the defect is the ORPHAN SEPARATOR, not just the
  // missing text: a bullet with nothing before it reads as a rendering bug.
  it("clientLabel=null omits the client entry AND its bullet (no orphan separator)", () => {
    renderModal({ data: dataWith({ clientLabel: null }) });
    const subline = screen.getByTestId(`${TB}-subline`);
    expect(subline.querySelector('[aria-hidden="true"]')).toBeNull();
    const expectedDates = dateSummarySegments(
      buildPublishedSectionData(snapshot(), { slug: SLUG }).dates ?? undefined,
    ).join(" · ");
    expect(subline.textContent).toBe(expectedDates);
  });

  // T-SUBLINE-DATES-EMPTY — the subline NEVER vanishes.
  it("dates=null still renders the subline, with the 'Dates not detected' fallback", () => {
    renderModal({ data: dataWith({ dates: null }) });
    const subline = screen.getByTestId(`${TB}-subline`);
    expect(subline).toHaveTextContent("Dates not detected");
  });

  it("clientLabel=null AND dates=null still renders the subline with only the fallback", () => {
    renderModal({ data: dataWith({ clientLabel: null, dates: null }) });
    const subline = screen.getByTestId(`${TB}-subline`);
    expect(subline.textContent).toBe("Dates not detected");
    expect(subline.querySelector('[aria-hidden="true"]')).toBeNull();
  });
});

// ── §6.6 header alert pill (modal-header-reconciliation Task 5) ──────────────
// The alert count MOVES here from the control strip, ATOMICALLY. It stays an
// `<a href="#overview">` (§F1, Watchpoint 4): the mock draws an inert <span>,
// but that is a static-canvas artifact — turning the pill into a span would
// delete the only affordance connecting the header count to the alert list.
//
// The count is CAPPED at 99+ because `alertCount` is unbounded and the pill
// sits in the header's shrink-0 right group beside Close; four digits there
// squeeze the title at 375px. The UNIT stays visible (a bare "99+" is not
// self-explanatory) and the exact count is preserved for assistive tech.

describe("PublishedReviewModal header alert pill (modal-header-reconciliation §6.6)", () => {
  const pill = () => screen.getByTestId(`${TB}-alert-pill`);

  /** Visible text = the subtree with every sr-only node removed. Asserting
   *  against raw textContent would let the sr-only suffix satisfy a "visible
   *  text" claim, which is exactly the confusion the cap introduces. */
  const visibleText = (el: HTMLElement): string => {
    const clone = el.cloneNode(true) as HTMLElement;
    clone.querySelectorAll(".sr-only").forEach((n) => n.remove());
    return clone.textContent!.replace(/\s+/g, " ").trim();
  };

  it("T-ALERT-PILL-LINK: renders an <a href='#overview'>, not an inert span", () => {
    renderModal({ alertCount: 2 });
    const el = pill();
    expect(el.tagName).toBe("A");
    expect(el.getAttribute("href")).toBe("#overview");
    // The jump target the pill points at is pinned by overviewSection.test.tsx.
    expect(screen.getByRole("link", { name: /^2 alerts$/ })).toBe(el);
  });

  it("T-ALERT-PILL-ZERO: alertCount=0 renders NO pill (not an empty one, not '0 alerts')", () => {
    renderModal({ alertCount: 0 });
    expect(screen.queryByTestId(`${TB}-alert-pill`)).toBeNull();
    expect(screen.queryByText(/0 alerts/)).toBeNull();
  });

  it("T-ALERT-CAP: 1 → visible '1 alert', accessible name '1 alert' (singular, no suffix)", () => {
    renderModal({ alertCount: 1 });
    expect(visibleText(pill())).toBe("1 alert");
    expect(screen.getByRole("link", { name: /^1 alert$/ })).toBe(pill());
  });

  it("T-ALERT-CAP: 2 → visible '2 alerts', accessible name '2 alerts' (below the cap, no suffix)", () => {
    renderModal({ alertCount: 2 });
    expect(visibleText(pill())).toBe("2 alerts");
    expect(screen.getByRole("link", { name: /^2 alerts$/ })).toBe(pill());
  });

  it("T-ALERT-CAP: 1200 → visible '99+ alerts', accessible name '99+ alerts (1200 open alerts)'", () => {
    renderModal({ alertCount: 1200 });
    // The UNIT stays visible past the cap — a bare "99+" carries no meaning.
    expect(visibleText(pill())).toBe("99+ alerts");
    // Anchored: a name of "99+ alerts(1200 open alerts)" (the trimmed-leading-
    // space bug this repo has hit before) must NOT satisfy this.
    expect(screen.getByRole("link", { name: /^99\+ alerts \(1200 open alerts\)$/ })).toBe(pill());
  });

  it("T-ALERT-CAP: 99 is NOT capped (boundary — the cap fires strictly above 99)", () => {
    renderModal({ alertCount: 99 });
    expect(visibleText(pill())).toBe("99 alerts");
    expect(screen.getByRole("link", { name: /^99 alerts$/ })).toBe(pill());
  });

  it("T-ALERT-CAP: 100 IS capped (boundary — the first capped value)", () => {
    renderModal({ alertCount: 100 });
    expect(visibleText(pill())).toBe("99+ alerts");
    expect(screen.getByRole("link", { name: /^99\+ alerts \(100 open alerts\)$/ })).toBe(pill());
  });

  // §7 guard row. Defensive-only — `alertCount` is server-derived at
  // _showReviewModal.tsx:270 (an array length, so a non-negative integer by
  // construction) — but §7 promises stated behavior for EVERY input, and an
  // unguarded render puts a literal "NaN alerts" in the header.
  it.each([
    ["negative", -1],
    ["non-integer", 2.5],
    ["NaN", Number.NaN],
  ])("§7 guard: alertCount %s renders no pill (matches the 0 row, not an error state)", (_l, n) => {
    renderModal({ alertCount: n });
    expect(screen.queryByTestId(`${TB}-alert-pill`)).toBeNull();
    expect(screen.queryByText(/NaN/)).toBeNull();
  });

  // T-ALERT-NOT-IN-STRIP — the relocation is a MOVE. Rendered twice is the
  // failure mode a "moved but not removed" commit produces, and it is
  // invisible to any assertion that only checks the pill exists.
  it("T-ALERT-NOT-IN-STRIP: the count renders ONCE — the strip carries no alert element", () => {
    renderModal({ alertCount: 2 });
    expect(screen.queryByTestId("strip-alert-badge")).toBeNull();
    const strip = screen.getByTestId("show-status-strip");
    expect(strip.querySelector('a[href="#overview"]')).toBeNull();
    expect(screen.getAllByRole("link", { name: /alerts?$/ })).toHaveLength(1);
  });

  // T-DIVIDER-ALERT-ONLY (§7). Asserted HERE, at the modal, because this is the
  // only surface where `alertCount` is still a real prop — Task 5 deletes it
  // from StatusStripProps, so the strip's own suite can no longer construct the
  // alerts-only case and a strip-level version of this test would pass
  // vacuously (undefined > 0 is false) rather than proving anything.
  //
  // Pre-change this renders a control divider followed by NOTHING: `hasSignal`
  // includes an `alertCount > 0` disjunct, but the element that disjunct was
  // standing in for has just moved to the header.
  it("T-DIVIDER-ALERT-ONLY: alerts-only show renders NO strip control divider", () => {
    renderModal({ alertCount: 2, isLive: false, lastSyncedAt: null, lastCheckedAt: null });
    // The pill is present, so the show genuinely has alerts — without this the
    // assertion below could pass for the trivial no-alerts reason.
    expect(screen.getByTestId(`${TB}-alert-pill`)).toBeTruthy();
    expect(screen.queryByTestId("strip-control-divider")).toBeNull();
    // Non-vacuity for the divider itself: nothing follows the toggle in the strip.
    expect(screen.queryByTestId("strip-live-badge")).toBeNull();
    expect(screen.queryByTestId("strip-sync-age")).toBeNull();
  });
});

// ── Instant close (perceived-latency tier 1) ─────────────────────────────────
// The close nav (`router.push` minus `show`/`alert_id`) is a full RSC
// round-trip of the dashboard; the modal is server-rendered off searchParams,
// so without a client-side hide it stays mounted until the new payload lands
// (~1s perceived close lag). Failure mode caught: close only funnels into
// router.push and the dialog persists in the DOM while navigation is pending.

/** Force the reduced-motion branch. `tests/setup.ts:70` stubs matchMedia with
 *  `matches: false` (MOTION ENABLED), so without this the close plays the exit
 *  animation and resolves only on the fallback timer. */
function withReducedMotion(run: () => void) {
  const original = window.matchMedia;
  window.matchMedia = ((query: string) => ({
    matches: query.includes("prefers-reduced-motion"),
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
  try {
    run();
  } finally {
    window.matchMedia = original;
  }
}

describe("PublishedReviewModal instant close (client hide before nav commit)", () => {
  // #485's contract: the hide is CLIENT-SIDE and does not wait for the close
  // navigation. Under reduced motion that hide is still synchronous — pinned
  // verbatim so the exit animation cannot regress the instant-close guarantee.
  it("X click removes the dialog synchronously under reduced motion, while router.push is still pending", () => {
    withReducedMotion(() => {
      renderModal();
      expect(screen.getByRole("dialog")).toBeInTheDocument();
      fireEvent.click(screen.getByTestId(`${TB}-close`));
      // The push mock never resolves a navigation in jsdom — the dialog must be
      // gone anyway, purely from client state.
      expect(screen.queryByRole("dialog")).toBeNull();
      expect(routerPush).toHaveBeenCalledWith("/admin", { scroll: false });
    });
  });

  it("Escape removes the dialog synchronously under reduced motion and fires the close nav", () => {
    withReducedMotion(() => {
      renderModal();
      fireEvent.keyDown(document, { key: "Escape" });
      expect(screen.queryByRole("dialog")).toBeNull();
      expect(routerPush).toHaveBeenCalledWith("/admin", { scroll: false });
    });
  });

  it("scrim click removes the dialog synchronously under reduced motion and fires the close nav", () => {
    withReducedMotion(() => {
      renderModal();
      fireEvent.click(screen.getByTestId(`${TB}-backdrop`));
      expect(screen.queryByRole("dialog")).toBeNull();
      expect(routerPush).toHaveBeenCalledWith("/admin", { scroll: false });
    });
  });

  // The animated half. Without this, the suite would pin ONLY the reduced-motion
  // path and a broken exit (or no exit at all) would ship green here.
  it("with motion enabled the exit plays BEFORE the dialog leaves and the nav fires", () => {
    vi.useFakeTimers();
    try {
      renderModal();
      fireEvent.keyDown(document, { key: "Escape" });
      // Exit in flight: still mounted, close nav not yet fired.
      expect(screen.getByRole("dialog")).toBeInTheDocument();
      expect(routerPush).not.toHaveBeenCalled();
      // jsdom never fires transitionend — exit-end arrives via the fallback.
      // act() so the `closing` state update the close triggers is flushed.
      act(() => {
        vi.advanceTimersByTime(DURATION_NORMAL_FALLBACK_MS + EXIT_FALLBACK_BUFFER_MS + 20);
      });
      expect(screen.queryByRole("dialog")).toBeNull();
      expect(routerPush).toHaveBeenCalledWith("/admin", { scroll: false });
    } finally {
      vi.useRealTimers();
    }
  });
});

// ── §6.1 body ─────────────────────────────────────────────────────────────────

describe("PublishedReviewModal body (spec §6.1/§6.4)", () => {
  // REWRITTEN, not retired (modal-header-reconciliation §6.1/§6.2, Task 3).
  // "inside the panel" was satisfiable by the pre-change layout too — the strip
  // lived in the shell's <header>. The intent (the strip is mounted and carries
  // the toggle) survives; the location assertion is now specific enough to fail
  // for the reason this task exists.
  it("StatusStrip renders in the subHeader BAND — not in the header wrapper — with the toggle present", () => {
    renderModal();
    const panel = document.querySelector("[data-review-modal-panel]")! as HTMLElement;
    const strip = within(panel).getByTestId("show-status-strip");
    expect(within(strip).getByTestId("strip-publish-toggle")).toBeTruthy();

    const band = screen.getByTestId(`${TB}-subheader`);
    const header = screen.getByTestId(`${TB}-header`);
    // BOTH directions. The positive alone passes for a COPY of the strip left
    // behind in the header; the negative is what proves this was a MOVE.
    expect(band.contains(strip)).toBe(true);
    expect(header.contains(strip)).toBe(false);
  });

  // T-ARCHIVED-BAND: read-only mode must not degrade the band into an empty
  // bordered seam. `archived` removes the toggle, the copy-link and the live
  // badge (StatusStrip.tsx), so the band's content is at its thinnest here — if
  // the archived strip ever rendered nothing, the band would still paint its
  // border and the panel would grow a hairline for no reason.
  it("archived: the band still renders non-empty (archived badge), with no toggle, copy-link or live badge", () => {
    renderModal({ archived: true, published: false, isLive: true });
    const band = screen.getByTestId(`${TB}-subheader`);
    const strip = within(band).getByTestId("show-status-strip");
    expect(within(strip).getByTestId("strip-archived-badge").textContent).toMatch(/read-only/i);
    expect(band.textContent?.trim().length ?? 0).toBeGreaterThan(0);
    expect(within(band).queryByTestId("strip-publish-toggle")).toBeNull();
    expect(within(band).queryByTestId("strip-copy-link")).toBeNull();
    expect(within(band).queryByTestId("strip-live-badge")).toBeNull();
  });

  it("the strip carries no container chrome — no second seam, shadow, sticky pin or padding inside the band", () => {
    // The subHeader band already owns the surface, the bottom border and
    // px-tile-pad (ReviewModalShell.tsx); a strip-level border-b + shadow-tile
    // would stack a doubled seam right above it, and px-4/sm:px-6 a doubled
    // inset. Failure mode: page chrome is re-added to the strip's single
    // layout literal (modal-header-reconciliation §6.5).
    renderModal();
    const panel = document.querySelector("[data-review-modal-panel]")! as HTMLElement;
    const classes = within(panel).getByTestId("show-status-strip").className.split(/\s+/);
    for (const token of ["sticky", "top-0", "z-30", "border-b", "shadow-tile", "px-4", "sm:px-6"]) {
      expect(classes, `strip in the band must not carry \`${token}\``).not.toContain(token);
    }
  });

  it('passes layout="modal" + syncHash to ShowReviewSurface (source pin — the layout prop\'s only runtime effect is the hashSync default, so the DOM cannot discriminate it)', () => {
    const s = componentSrc();
    expect(s).toMatch(/layout="modal"/);
    expect(s).toMatch(/\bsyncHash\b/);
  });

  it("syncHash is ON behaviorally: clicking a rail item writes the fragment (Step3's modal default is OFF, so this proves the explicit opt-in)", () => {
    renderModal();
    fireEvent.click(screen.getByTestId(railTid("rail-item-changes")));
    expect(window.location.hash).toBe("#changes");
  });

  it("Overview is the FIRST rail item and Changes the LAST; both content sections render", () => {
    renderModal();
    const overviewItem = screen.getByTestId(railTid("rail-item-overview"));
    const changesItem = screen.getByTestId(railTid("rail-item-changes"));
    const registryItems = Array.from(
      document.querySelectorAll<HTMLElement>('[data-testid*="-review-rail-item-"]'),
    ).filter((el) => el !== overviewItem && el !== changesItem);
    expect(registryItems.length).toBeGreaterThan(0);
    const after = (a: Node, b: Node) =>
      Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
    for (const el of registryItems) {
      expect(after(overviewItem, el)).toBe(true);
      expect(after(el, changesItem)).toBe(true);
    }
    expect(screen.getByTestId("overview-section")).toBeTruthy();
    expect(screen.getByTestId("changes-section")).toBeTruthy();
  });

  it("alertCount > 0 renders the Overview rail badge with the fixture count", () => {
    const alertCount = 3;
    renderModal({ alertCount });
    const badge = screen.getByTestId("overview-rail-badge");
    expect(badge.textContent).toContain(String(alertCount));
    // Inside the Overview rail button, exactly as the page composed it.
    expect(screen.getByTestId(railTid("rail-item-overview")).contains(badge)).toBe(true);
  });

  it("rail badge separates count and sr-only unit with a VISIBLE space node (accName-safe)", () => {
    // Task 14 audit P3 (memory #470 class): a leading space INSIDE the sr-only
    // span is trimmed during accessible-name computation, so "3" + " open
    // alerts" announces as "3open alerts". The space must be its own visible
    // text node BETWEEN the count and the sr-only span, and the sr-only text
    // must not lean on internal leading whitespace. (Real-browser accName
    // trimming can't be observed in jsdom — this pins the DOM shape instead.)
    renderModal({ alertCount: 3 });
    const badge = screen.getByTestId("overview-rail-badge");
    const srOnly = badge.querySelector(".sr-only");
    expect(srOnly, "badge renders an sr-only unit span").not.toBeNull();
    expect(
      srOnly!.textContent!.startsWith(" "),
      "sr-only text must NOT start with a space (trimmed in accName)",
    ).toBe(false);
    const nodesBeforeSrOnly: string[] = [];
    for (const node of Array.from(badge.childNodes)) {
      if (node === srOnly) break;
      if (node.nodeType === Node.TEXT_NODE) nodesBeforeSrOnly.push(node.textContent ?? "");
    }
    expect(
      nodesBeforeSrOnly.some((t) => /\s$/.test(t)),
      "a visible text node ending in whitespace precedes the sr-only span",
    ).toBe(true);
  });

  it("wires the per-section warning extras (a crew warning renders the crew section's controls)", () => {
    renderModal({}, [crewWarning]);
    expect(screen.getByTestId("section-warning-controls-crew")).toBeTruthy();
  });

  it("no footer: the shell footer wrapper is absent", () => {
    renderModal();
    expect(screen.queryByTestId(`${TB}-footer`)).toBeNull();
  });
});

// ── §6.2 guards ───────────────────────────────────────────────────────────────

describe("PublishedReviewModal guards (spec §6.2)", () => {
  it("feed=null (SyncInfraError degrade) renders the Changes infra notice; the modal is otherwise healthy", () => {
    renderModal({ feed: null });
    expect(screen.getByTestId("change-feed-infra-error")).toBeTruthy();
    expect(screen.getByTestId("overview-section")).toBeTruthy();
  });

  it("not eligible (unpublished) renders the inactive-share notice instead of the share slot", () => {
    renderModal({ published: false, shareSlot: <div data-testid="share-slot-fixture" /> });
    expect(screen.getByTestId("admin-share-link-inactive")).toBeTruthy();
    expect(screen.queryByTestId("share-slot-fixture")).toBeNull();
  });

  it("alertSlot=null (no alerts) renders no alert content — Overview stays healthy", () => {
    renderModal({ alertSlot: null });
    const overview = screen.getByTestId("overview-section");
    expect(within(overview).queryByRole("list")).toBeNull();
  });
});

// ── §3 one-shot alert_id scroll ───────────────────────────────────────────────

describe("PublishedReviewModal alert_id scroll effect (spec §3 — one-shot)", () => {
  const highlightedSlot = (
    <ul>
      <li aria-current="true" data-testid="alert-li-fixture">
        Highlighted alert
      </li>
    </ul>
  );

  it('alertId + a rendered li[aria-current="true"] → scrollIntoView({ block: "center" }) on that li, exactly once', () => {
    renderModal({ alertId: ALERT_ID, alertSlot: highlightedSlot });
    expect(scrollIntoViewSpy).toHaveBeenCalledTimes(1);
    expect(scrollIntoViewSpy.mock.instances[0]).toBe(screen.getByTestId("alert-li-fixture"));
    expect(scrollIntoViewSpy.mock.calls[0]![0]).toEqual({ block: "center" });
  });

  it("one-shot: a rerender (even with changed props) never re-fires the scroll", () => {
    const { rerenderWith } = renderModal({ alertId: ALERT_ID, alertSlot: highlightedSlot });
    expect(scrollIntoViewSpy).toHaveBeenCalledTimes(1);
    rerenderWith({ alertCount: 5 });
    expect(scrollIntoViewSpy).toHaveBeenCalledTimes(1);
  });

  it("alertId with no matching row falls back to the #overview rail target", () => {
    renderModal({ alertId: ALERT_ID, alertSlot: null });
    expect(scrollIntoViewSpy).toHaveBeenCalledTimes(1);
    expect((scrollIntoViewSpy.mock.instances[0] as HTMLElement).id).toBe("overview");
  });

  it("alertId=null → no scroll at all", () => {
    renderModal({ alertId: null });
    expect(scrollIntoViewSpy).not.toHaveBeenCalled();
  });
});

describe("PublishedReviewModal entrance suppression (§6.5 skeleton→loaded in-place swap)", () => {
  // Failure mode: the loaded modal always streams in REPLACING the settled
  // Suspense skeleton (ShowReviewModalSkeleton), so a default shell entrance
  // replays the pop-in from opacity≈0 — the opaque modal visibly dims and
  // re-pops. §6.5:150: "in-place swap when Suspense resolves; instant".
  it('passes entrance="none" — scrim + panel carry the suppression attr', () => {
    renderModal();
    const scrim = document.querySelector<HTMLElement>("[data-review-modal-scrim]")!;
    const panel = document.querySelector<HTMLElement>("[data-review-modal-panel]")!;
    expect(scrim.getAttribute("data-review-modal-entrance")).toBe("none");
    expect(panel.getAttribute("data-review-modal-entrance")).toBe("none");
  });
});
