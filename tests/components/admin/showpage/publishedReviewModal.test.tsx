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
import { StrictMode } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

// One unified next/navigation mock: useShowModalNav (useRouter/useSearchParams),
// StatusStrip's copy-link + feed/warning controls (useRouter().refresh()).
const routerPush = vi.fn();
// Stable spy (NOT a fresh vi.fn() per useRouter() call): the revalidate-on-open
// contract asserts a CALL COUNT across renders — a per-call fn made that vacuous.
const routerRefresh = vi.fn();
const routerPrefetch = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: routerRefresh, push: routerPush, prefetch: routerPrefetch }),
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
import type { AttentionItem } from "@/lib/admin/attentionItems";

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

/** Pending MI-11 gate entry — the hold-kind attention source (spec §2). */
function pendingGateEntry(holdId = "hold-1"): FeedEntry {
  return {
    id: `entry-${holdId}`,
    occurredAt: "2026-07-16T10:30:00.000Z",
    status: "pending",
    summary: "Priya Shah's row changed while a rename was pending.",
    action: "approve_reject",
    entityRef: null,
    acceptable: false,
    acknowledgedAt: null,
    gate: {
      holdId,
      disposition: { disposition: "rename", name: "Priya Shah" } as never,
      baseModifiedTime: "2026-07-16T10:00:00.000Z",
    },
  };
}

/** Attention item fixtures (published-show-alerts §3.1). */
function alertItem(
  over: Partial<AttentionItem> = {},
  payload: Partial<NonNullable<AttentionItem["alert"]>> = {},
): AttentionItem {
  const alertId = (over.id ?? `alert:${ALERT_ID}`).replace(/^alert:/, "");
  // Drop kind/alert from the override so the discriminated `kind: "alert"` literal
  // wins (AttentionItem now REQUIRES a payload on alert-kind items).
  const { kind: _k, alert: _a, ...rest } = over;
  return {
    tone: "notice",
    sectionId: "overview",
    crewKey: null,
    actionable: true,
    menuTitle: "Role flags changed",
    menuSubtitle: "Crew · John Redcorn",
    ...rest,
    id: `alert:${alertId}`,
    kind: "alert",
    alert: {
      alertId,
      code: "TEST_FAKE_ATTENTION_CODE",
      template: null,
      params: {},
      action: null,
      helpHref: null,
      raisedAt: "2026-07-16T09:00:00.000Z",
      occurrenceCount: 1,
      autoClearNote: null,
      failedKeys: null,
      dataGaps: null,
      errorCode: null,
      ...payload,
    },
  };
}

function holdItem(holdId = "hold-1"): AttentionItem {
  return {
    id: `hold:${holdId}`,
    kind: "hold",
    tone: "critical",
    sectionId: "changes",
    crewKey: null,
    actionable: true,
    menuTitle: "Priya Shah's row changed while a rename was pending.",
    menuSubtitle: "Pick what happens in Changes",
  };
}

function clearingItem(id = "alert:clearing-1"): AttentionItem {
  return alertItem(
    { id, actionable: false, menuTitle: "Sheet unavailable" },
    { autoClearNote: "Clears automatically once the sheet is back or re-parses." },
  );
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
    attentionItems: [],
    alertsDegraded: false,
    openSheetHref: SHEET_HREF,
    archiveAction: vi.fn(async () => ({ ok: true }) as const),
    unarchiveAction: vi.fn(async () => {}),
    crewEmails: [],
    pickerCrew: [],
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

// ── Header attention pill (published-show-alerts §5.1) ──────────────────────
// Four states from ONE derived list: To-confirm (button + menu), Clearing
// (non-interactive), In-sync (teal), Degraded. The 99+ cap keeps four digits
// from squeezing the title at 375px; the sr-only exact count survives the cap.

describe("PublishedReviewModal header attention pill (spec §5.1)", () => {
  const pill = () => screen.getByTestId(`${TB}-alert-pill`);

  /** Visible MEANINGFUL text = the subtree minus sr-only nodes (invisible) and
   *  aria-hidden decorations (the chevron/dot glyphs carry no meaning). */
  const visibleText = (el: HTMLElement): string => {
    const clone = el.cloneNode(true) as HTMLElement;
    clone.querySelectorAll('.sr-only, [aria-hidden="true"]').forEach((n) => n.remove());
    return clone.textContent!.replace(/\s+/g, " ").trim();
  };

  const twoActionable = () => [alertItem({ id: "alert:p1" }), alertItem({ id: "alert:p2" })];

  /** Auto-open is rAF-deferred (react-hooks/set-state-in-effect contract) —
   *  await the menu instead of asserting synchronously. */
  const findMenu = () => screen.findByTestId(`${TB}-attention-menu`);

  it("To confirm: actionable items render a BUTTON pill '2 to confirm' with aria-expanded", async () => {
    renderModal({ attentionItems: twoActionable() });
    const el = pill();
    expect(el.tagName).toBe("BUTTON");
    expect(visibleText(el)).toBe("2 to confirm");
    await findMenu(); // auto-open on arrival (rAF-deferred)
    expect(el.getAttribute("aria-expanded")).toBe("true");
    expect(el.getAttribute("aria-controls")).toBeTruthy();
  });

  it("Needs-look: zero actionable + needs-look>0 renders the INTERACTIVE '1 to review' pill (attention split §3.2)", () => {
    // SUPERSEDED old contract: "N clearing" non-interactive. A non-actionable
    // item without clearingKind defaults FAIL-VISIBLE into needs-look, which is
    // interactive (menu carries its fix hint/link). Monitoring-only remains
    // non-interactive and is pinned by clearingPillLabel.test.tsx + the matrix.
    renderModal({ attentionItems: [clearingItem()] });
    const el = pill();
    expect(el.tagName).toBe("BUTTON");
    expect(visibleText(el)).toBe("1 to review");
  });

  it("In sync: zero items renders the teal ring pill, non-interactive", () => {
    renderModal({ attentionItems: [] });
    const el = pill();
    expect(el.tagName).not.toBe("BUTTON");
    expect(visibleText(el)).toBe("In sync");
    expect(el.querySelector(".border-status-positive")).toBeTruthy();
  });

  it("Degraded + zero items: 'Alerts unavailable' pill + Overview notice card", () => {
    renderModal({ attentionItems: [], alertsDegraded: true });
    expect(visibleText(pill())).toBe("Alerts unavailable");
    expect(screen.getByTestId("attention-degraded-notice")).toBeTruthy();
  });

  it("Degraded + one hold: the ACTIONABLE To-confirm pill wins, menu lists the hold, notice still renders (spec §5.1 degraded row)", async () => {
    renderModal({ attentionItems: [holdItem()], alertsDegraded: true });
    expect(visibleText(pill())).toBe("1 to confirm");
    await findMenu();
    expect(screen.getByTestId("attention-menu-row-hold:hold-1")).toBeTruthy();
    expect(screen.getByTestId("attention-degraded-notice")).toBeTruthy();
  });

  it("cap: 100 actionable → visible '99+ to confirm', sr-only exact count; 99 NOT capped", () => {
    const many = (n: number) =>
      Array.from({ length: n }, (_, i) => alertItem({ id: `alert:m${i}` }));
    renderModal({ attentionItems: many(100) });
    expect(visibleText(pill())).toBe("99+ to confirm");
    expect(pill().textContent).toContain("(100 to confirm)");
    cleanup();
    renderModal({ attentionItems: many(99) });
    expect(visibleText(pill())).toBe("99 to confirm");
  });

  // T-ALERT-NOT-IN-STRIP — pill lives ONLY in the header; the strip never
  // regrows an alert element.
  it("T-ALERT-NOT-IN-STRIP: the count renders ONCE — the strip carries no alert element", () => {
    renderModal({ attentionItems: twoActionable() });
    expect(screen.queryByTestId("strip-alert-badge")).toBeNull();
    const strip = screen.getByTestId("show-status-strip");
    expect(strip.querySelector('a[href="#overview"]')).toBeNull();
    expect(strip.textContent).not.toContain("to confirm");
  });

  it("T-DIVIDER-ALERT-ONLY: attention-only show renders NO strip control divider", () => {
    renderModal({
      attentionItems: twoActionable(),
      isLive: false,
      lastSyncedAt: null,
      lastCheckedAt: null,
    });
    expect(screen.getByTestId(`${TB}-alert-pill`)).toBeTruthy();
    expect(screen.queryByTestId("strip-control-divider")).toBeNull();
    expect(screen.queryByTestId("strip-live-badge")).toBeNull();
    expect(screen.queryByTestId("strip-sync-age")).toBeNull();
  });
});

// ── Auto-open + menu wiring + resolve lifecycle (spec §5.2/§6.3) ─────────────

describe("PublishedReviewModal attention menu behavior (spec §5.2/§6.2/§6.3)", () => {
  it("auto-open fires once on mount with actionable items; rerender keeps ONE menu", async () => {
    const { rerenderWith } = renderModal({ attentionItems: [alertItem({ id: "alert:p1" })] });
    await screen.findByTestId(`${TB}-attention-menu`);
    expect(screen.getAllByTestId(`${TB}-attention-menu`)).toHaveLength(1);
    rerenderWith({ attentionItems: [alertItem({ id: "alert:p1" })] });
    expect(screen.getAllByTestId(`${TB}-attention-menu`)).toHaveLength(1);
  });

  it("stale→fresh: mount with [] then items arriving via refresh reconcile → menu auto-opens", async () => {
    const { rerenderWith } = renderModal({ attentionItems: [] });
    expect(screen.queryByTestId(`${TB}-attention-menu`)).toBeNull();
    rerenderWith({ attentionItems: [alertItem({ id: "alert:late" })] });
    expect(await screen.findByTestId(`${TB}-attention-menu`)).toBeTruthy();
  });

  it("after the user closes the menu, MORE items arriving never re-open it", async () => {
    const { rerenderWith } = renderModal({ attentionItems: [alertItem({ id: "alert:p1" })] });
    await screen.findByTestId(`${TB}-attention-menu`);
    fireEvent.click(screen.getByTestId(`${TB}-alert-pill`)); // toggle closed
    expect(screen.queryByTestId(`${TB}-attention-menu`)).toBeNull();
    rerenderWith({
      attentionItems: [alertItem({ id: "alert:p1" }), alertItem({ id: "alert:p2" })],
    });
    // Flush a frame: a pending auto-open rAF would fire here if the guard leaked.
    await act(() => new Promise<void>((r) => requestAnimationFrame(() => r())));
    expect(screen.queryByTestId(`${TB}-attention-menu`)).toBeNull();
  });

  it("alertId present → auto-open suppressed, even when items arrive late", async () => {
    const { rerenderWith } = renderModal({ attentionItems: [], alertId: ALERT_ID });
    rerenderWith({ attentionItems: [alertItem({ id: "alert:late" })], alertId: ALERT_ID });
    await act(() => new Promise<void>((r) => requestAnimationFrame(() => r())));
    expect(screen.queryByTestId(`${TB}-attention-menu`)).toBeNull();
  });

  it("menu row click → menu closes, the item's banner anchor gets the one-shot flash", async () => {
    // Overview-routed item: its banner mounts in the Overview attention slot,
    // so the surface's jump finds a REAL anchor.
    renderModal({ attentionItems: [alertItem({ id: "alert:nav1" })] });
    fireEvent.click(await screen.findByTestId("attention-menu-row-alert:nav1"));
    expect(screen.queryByTestId(`${TB}-attention-menu`)).toBeNull();
    const anchor = document.querySelector('[data-attention-anchor="alert:nav1"]')!;
    expect(anchor).toBeTruthy();
    expect(anchor.hasAttribute("data-step3-warning-flash")).toBe(true);
  });

  it("resolve: banner button → pill decrements optimistically; last one → menu closes, pill flips to In sync", async () => {
    renderModal({ attentionItems: [alertItem({ id: "alert:r1" })] });
    // Menu auto-opened; the overview banner carries the resolve button.
    fireEvent.click(screen.getByTestId("per-show-alert-resolve-r1"));
    await waitFor(() =>
      expect(screen.getByTestId("attention-banner-confirmed-r1")).toBeInTheDocument(),
    );
    expect(screen.queryByTestId(`${TB}-attention-menu`)).toBeNull();
    const pillEl = screen.getByTestId(`${TB}-alert-pill`);
    expect(pillEl.textContent).toContain("In sync");
  });

  it("resolve race: two completions in the same render window still close the menu (stale-closure guard)", async () => {
    renderModal({
      attentionItems: [alertItem({ id: "alert:r1" }), alertItem({ id: "alert:r2" })],
    });
    await screen.findByTestId(`${TB}-attention-menu`); // auto-open committed
    // Rapid double-resolve: both fetches in flight together. Failure mode
    // caught: the double lifecycle leaving the menu open or the pill counting
    // wrong after the LAST resolve. (The same-microtask stale-closure variant
    // is not reproducible under jsdom's act flush semantics — the component
    // guards it structurally with the doneIdsRef mirror instead.)
    fireEvent.click(screen.getByTestId("per-show-alert-resolve-r1"));
    fireEvent.click(screen.getByTestId("per-show-alert-resolve-r2"));
    await waitFor(() =>
      expect(screen.getByTestId("attention-banner-confirmed-r2")).toBeInTheDocument(),
    );
    expect(screen.queryByTestId(`${TB}-attention-menu`)).toBeNull();
    expect(screen.getByTestId(`${TB}-alert-pill`).textContent).toContain("In sync");
  });

  it("archived pin (spec §7): hold gate forms still render on an archived show (no client-side gating exists)", async () => {
    renderModal({
      archived: true,
      attentionItems: [holdItem()],
      feed: { entries: [pendingGateEntry()], truncated: false },
    });
    expect(await screen.findByTestId("attention-menu-row-hold:hold-1")).toBeTruthy();
    const gateRow = document.querySelector('[data-attention-anchor="hold:hold-1"]')!;
    expect(gateRow).toBeTruthy();
    expect(gateRow.querySelector("form, button")).toBeTruthy();
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
    // Overview is conditional now (it drops out when it has nothing to say), so
    // the ordering fixture must give it something — an actionable alert.
    renderModal({ attentionItems: [alertItem({ id: "alert:ov1" })] });
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

  it("Overview rail badge = overview-routed ACTIONABLE count (crew-routed + clearing excluded); Changes badge = hold count", () => {
    renderModal({
      attentionItems: [
        alertItem({ id: "alert:ov1" }),
        alertItem({ id: "alert:ov2" }),
        alertItem({ id: "alert:crew1", sectionId: "crew" }),
        clearingItem(),
        holdItem(),
      ],
    });
    const badge = screen.getByTestId("overview-rail-badge");
    expect(badge.textContent).toContain("2");
    // Inside the Overview rail button, exactly as the page composed it.
    expect(screen.getByTestId(railTid("rail-item-overview")).contains(badge)).toBe(true);
    const changesBadge = screen.getByTestId("changes-rail-badge");
    expect(changesBadge.textContent).toContain("1");
    expect(screen.getByTestId(railTid("rail-item-changes")).contains(changesBadge)).toBe(true);
  });

  it("zero counts → no badges (conditional-spread pattern)", () => {
    renderModal({ attentionItems: [] });
    expect(screen.queryByTestId("overview-rail-badge")).toBeNull();
    expect(screen.queryByTestId("changes-rail-badge")).toBeNull();
  });

  it("rail badge separates count and sr-only unit with a VISIBLE space node (accName-safe)", () => {
    // Task 14 audit P3 (memory #470 class): a leading space INSIDE the sr-only
    // span is trimmed during accessible-name computation, so "3" + " open
    // alerts" announces as "3open alerts". The space must be its own visible
    // text node BETWEEN the count and the sr-only span, and the sr-only text
    // must not lean on internal leading whitespace. (Real-browser accName
    // trimming can't be observed in jsdom — this pins the DOM shape instead.)
    renderModal({
      attentionItems: [
        alertItem({ id: "alert:ov1" }),
        alertItem({ id: "alert:ov2" }),
        alertItem({ id: "alert:ov3" }),
      ],
    });
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
    renderModal({ feed: null, attentionItems: [alertItem({ id: "alert:ov1" })] });
    expect(screen.getByTestId("change-feed-infra-error")).toBeTruthy();
    // A degraded FEED does not degrade Overview — it still mounts for its own
    // (unrelated) attention content.
    expect(screen.getByTestId("overview-section")).toBeTruthy();
  });

  it("unpublished renders the hub's PAUSED arm — the retired Overview notice is gone", () => {
    // share-hub T4: the crew-link surface moved to the status band. Unpublished
    // no longer hides it (rotate/reset stay reachable, spec §1.1); it renders
    // the paused arm instead.
    renderModal({ published: false });
    expect(screen.getByTestId("share-hub-primary").textContent).toMatch(/paused/i);
    expect(screen.queryByTestId("admin-share-link-inactive")).toBeNull();
    expect(screen.queryByTestId("admin-current-share-link-panel")).toBeNull();
  });

  it("attentionItems=[] on a healthy live show drops Overview ENTIRELY — section and rail item", () => {
    // Three relocations (Re-sync → strip, share cluster + lifecycle → hub,
    // open-sheet → header) left Overview with attention banners plus one line
    // of sheet/sync guidance. A healthy live show has neither, so the section
    // would be an empty box behind a rail item promising content. Both drop
    // out together — a rail entry whose panel is blank is the worse half.
    renderModal({ attentionItems: [] });
    expect(screen.queryByTestId("overview-section")).toBeNull();
    expect(screen.queryByTestId(railTid("rail-item-overview"))).toBeNull();
    // Changes is unaffected — this is not "the rail collapsed".
    expect(screen.getByTestId(railTid("rail-item-changes"))).toBeTruthy();
  });

  it("Overview returns the moment it has something to say", () => {
    // The negative above is only meaningful next to its positive: the gate must
    // be about CONTENT, not a section that quietly stopped rendering.
    renderModal({ attentionItems: [alertItem({ id: "alert:ov1" })] });
    const overview = screen.getByTestId("overview-section");
    expect(overview.querySelector('[data-attention-anchor="alert:ov1"]')).toBeTruthy();
    expect(screen.getByTestId(railTid("rail-item-overview"))).toBeTruthy();
  });

  it("archived mounts Overview even with no alerts — the Re-sync-paused notice is content", () => {
    renderModal({ attentionItems: [], archived: true });
    expect(screen.getByTestId("overview-section")).toBeTruthy();
    expect(screen.getByTestId("admin-show-resync-archived")).toBeTruthy();
  });

  it("overview-routed banners render inside Overview; crew-routed inside the Crew section (matching row) or its top", () => {
    renderModal({
      attentionItems: [
        alertItem({ id: "alert:ov1" }),
        // crewKey matches the fixture roster row "Alice Anders"
        alertItem({ id: "alert:crew1", sectionId: "crew", crewKey: "alice anders" }),
        // no roster match → crew section top
        alertItem({ id: "alert:crew2", sectionId: "crew", crewKey: "nobody here" }),
      ],
    });
    const overview = screen.getByTestId("overview-section");
    expect(overview.querySelector('[data-attention-anchor="alert:ov1"]')).toBeTruthy();
    const crewSection = screen.getByTestId(railTid("section-crew"));
    const inRow = crewSection.querySelector('[data-attention-anchor="alert:crew1"]')!;
    expect(inRow.closest("li")).toBeTruthy();
    expect(inRow.closest("li")!.textContent).toContain("Alice Anders");
    const topBanner = crewSection.querySelector('[data-attention-anchor="alert:crew2"]')!;
    expect(topBanner).toBeTruthy();
    expect(topBanner.closest("li")).toBeNull(); // section-top, not inside a row
  });
});

// ── §6.4 one-shot alert_id deep link ─────────────────────────────────────────

describe("PublishedReviewModal alert_id deep link (spec §6.4 — one-shot)", () => {
  it("alertId matching an item → its banner flashes with aria-current; menu stays closed", () => {
    renderModal({
      alertId: ALERT_ID,
      attentionItems: [alertItem({ id: `alert:${ALERT_ID}` })],
    });
    const anchor = document.querySelector(`[data-attention-anchor="alert:${ALERT_ID}"]`)!;
    expect(anchor).toBeTruthy();
    expect(anchor.getAttribute("aria-current")).toBe("true");
    expect(anchor.hasAttribute("data-step3-warning-flash")).toBe(true);
    expect(screen.queryByTestId(`${TB}-attention-menu`)).toBeNull();
  });

  it("one-shot: a rerender (even with changed props) never re-fires the jump", () => {
    const { rerenderWith } = renderModal({
      alertId: ALERT_ID,
      attentionItems: [alertItem({ id: `alert:${ALERT_ID}` })],
    });
    const anchor = document.querySelector(`[data-attention-anchor="alert:${ALERT_ID}"]`)!;
    anchor.removeAttribute("data-step3-warning-flash");
    rerenderWith({
      attentionItems: [alertItem({ id: `alert:${ALERT_ID}` }), alertItem({ id: "alert:extra" })],
    });
    expect(anchor.hasAttribute("data-step3-warning-flash")).toBe(false);
  });

  it("alertId with no matching item falls back to the #overview scrollIntoView", () => {
    // Overview must EXIST for this fallback to be the #overview one; give the
    // modal an unrelated alert so the section mounts.
    renderModal({ alertId: ALERT_ID, attentionItems: [alertItem({ id: "alert:other" })] });
    expect(scrollIntoViewSpy).toHaveBeenCalledTimes(1);
    expect((scrollIntoViewSpy.mock.instances[0] as HTMLElement).id).toBe("overview");
  });

  it("no match AND no Overview (the stale-link case) scrolls the body to top instead of dead-ending", () => {
    // This is the state a stale alert deep link actually lands in — the alert
    // it names has since cleared, so there are no attention items and Overview
    // is gone. Without the top fallback the deep link would do nothing at all
    // precisely when it fires.
    // beforeEach installs its own HTMLElement.prototype.scrollTo, which shadows
    // anything set on Element.prototype — patch the same slot it uses.
    const scrollToSpy = vi.fn();
    (HTMLElement.prototype as unknown as { scrollTo: unknown }).scrollTo = scrollToSpy;
    renderModal({ alertId: ALERT_ID, attentionItems: [] });
    expect(screen.queryByTestId("overview-section")).toBeNull();
    expect(scrollIntoViewSpy).not.toHaveBeenCalled();
    expect(scrollToSpy).toHaveBeenCalledWith({ top: 0 });
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

describe("revalidate-on-open (spec 2026-07-19-show-modal-prefetch §3.2)", () => {
  it("fires router.refresh() exactly once per mount — rerenders and StrictMode double-effects do not multiply it", () => {
    routerRefresh.mockClear();
    // StrictMode reproduces the dev double-effect (setup→cleanup→setup): the
    // ref guard must dedupe it. Failure modes caught: dead revalidate (0 calls)
    // and per-render/per-effect refresh storm (>1). ShareTokenProvider wrapper
    // copied from renderModal — the tree consumes its context; StrictMode must
    // own the mount, so renderModal itself is not reused.
    const { rerender } = render(
      <StrictMode>
        <ShareTokenProvider initialToken="TOK" initialEpoch={5}>
          <PublishedReviewModal {...baseProps()} />
        </ShareTokenProvider>
      </StrictMode>,
    );
    expect(routerRefresh).toHaveBeenCalledTimes(1);
    rerender(
      <StrictMode>
        <ShareTokenProvider initialToken="TOK" initialEpoch={5}>
          <PublishedReviewModal {...baseProps()} />
        </ShareTokenProvider>
      </StrictMode>,
    );
    expect(routerRefresh).toHaveBeenCalledTimes(1);
  });

  it("prefetches the bare /admin close destination once per mount (warms the close paint)", () => {
    routerPrefetch.mockClear();
    render(
      <StrictMode>
        <ShareTokenProvider initialToken="TOK" initialEpoch={5}>
          <PublishedReviewModal {...baseProps()} />
        </ShareTokenProvider>
      </StrictMode>,
    );
    // Same ref-guarded effect as the refresh, so StrictMode's double-effect is
    // deduped to one call for exactly the close target.
    expect(routerPrefetch).toHaveBeenCalledTimes(1);
    expect(routerPrefetch).toHaveBeenCalledWith("/admin");
  });
});

describe("the warning-surface trim is live end to end from this modal", () => {
  // Whole-diff review B1/A1: every other suite for this feature injects
  // `routedWarnings` (and often `renderSectionExtras`) directly into
  // `ShowReviewSurface`. That proves the surface consumes them and NOTHING about
  // the component responsible for producing them. This modal could pass one prop
  // and not the other, pass constant counts, or never call
  // `deriveRoutedWarnings`, and every one of those suites would stay green while
  // the live modal rendered the untrimmed panel.
  //
  // Mounting the real modal is also what closes the partial-configuration gap:
  // the trim's two halves are supplied at ONE call site, so "extras without
  // counts" is unreachable by construction rather than by assertion.
  const CELL = { title: "INFO", gid: 0, a1: "B7" };

  // UNCATALOGED codes deliberately: a cataloged one renders its catalog TITLE
  // in both the panel row and the card, so every row of a given code is
  // textually identical and no assertion can tell one instance from another.
  // With no catalog entry the rendered title falls back to `.message`, which is
  // unique per fixture row.
  function infoWarning(n: number): ParseWarning {
    return {
      severity: "info",
      code: "TEST_ONLY_INFO_ROW",
      message: `normalized token ${n}`,
      rawSnippet: `Info | ${n}`,
    } as ParseWarning;
  }

  /** Unrouted, so it lands in the fallback `warnings` bucket and its card
   *  renders directly below the panel body — the trim's visible effect is that
   *  it is no longer ALSO a flat row inside the body. */
  function warnWarning(n: number): ParseWarning {
    return {
      severity: "warn",
      code: "TEST_ONLY_WARN_ROW",
      message: `unrecognized row ${n}`,
      rawSnippet: `Mystery | ${n}`,
      sourceCell: CELL,
    } as ParseWarning;
  }

  it("lists the info row in the panel while the warn row renders only as a card", () => {
    const info = infoWarning(1);
    const warn = warnWarning(1);
    renderModal({}, [info, warn]);

    const panel = screen.getByTestId(`wizard-step3-card-${DRIVE_FILE_ID}-breakdown-warnings`);
    const rows = within(panel).queryAllByTestId(
      new RegExp(`^wizard-step3-card-${DRIVE_FILE_ID}-warning-\\d+$`),
    );

    // Exactly the info row. Identified by its own message, so a build that
    // trimmed the wrong severity fails rather than counting to one by accident.
    expect(rows.length).toBe(1);
    expect(rows[0]!.textContent ?? "").toContain(info.message);

    // The warn row is gone from the body...
    expect(panel.textContent ?? "").not.toContain(warn.message);
    // ...and present as a card, so this is a MOVE and not a deletion. Scoped to
    // the extras block, which is a different subtree from the panel body.
    const extras = screen.getByTestId("section-warning-controls-warnings");
    expect(extras.textContent ?? "").toContain(warn.message);
  });

  it("passes counts that match the model, not a constant", () => {
    // Two unrouted warns and no info: the body has no rows to list, so the state
    // it selects is driven purely by the counts the modal derived. `here > 0`
    // selects Silent, which renders NEITHER empty-state line — a hardcoded
    // `{here: 0, elsewhere: 0}` would render the Clean line instead.
    renderModal({}, [warnWarning(1), warnWarning(2)]);

    expect(
      screen.queryByTestId(`wizard-step3-card-${DRIVE_FILE_ID}-warnings-clean`),
      "Silent, not Clean: the modal's own counts say two rows need a look",
    ).toBeNull();
    expect(
      screen.queryByTestId(`wizard-step3-card-${DRIVE_FILE_ID}-warnings-elsewhere`),
    ).toBeNull();
    // Both cards still render below.
    const extras = screen.getByTestId("section-warning-controls-warnings");
    expect(extras.textContent ?? "").toContain("unrecognized row 1");
    expect(extras.textContent ?? "").toContain("unrecognized row 2");
  });

  it("renders the Clean line when the model really is empty, so the state is not pinned", () => {
    // The complement of the case above. Without it, an implementation that never
    // renders an empty-state line at all passes.
    renderModal({}, []);
    expect(screen.getByTestId(`wizard-step3-card-${DRIVE_FILE_ID}-warnings-clean`)).toBeTruthy();
  });

  it("distinguishes here from elsewhere, so the counts cannot be a nonzero constant", () => {
    // Round 2 of the whole-diff review: the Silent and Clean cases above are
    // both satisfied by a modal that reports `{here: n>0, elsewhere: 0}` for
    // every nonempty set and zeroes for the empty one. This fixture has warnings
    // ONLY in a mapped section, so a correct derivation reports `here: 0,
    // elsewhere: 1` and the panel must say Elsewhere — the one state that
    // constant cannot produce.
    const crewWarn = {
      severity: "warn",
      code: "TEST_ONLY_MAPPED_ROW",
      message: "mapped crew row",
      rawSnippet: "Role | mapped",
      sourceCell: CELL,
      blockRef: { kind: "crew", name: "Alex Kim" },
    } as ParseWarning;

    renderModal({}, [crewWarn]);

    expect(
      screen.getByTestId(`wizard-step3-card-${DRIVE_FILE_ID}-warnings-elsewhere`),
      "Elsewhere: nothing in the fallback bucket, one warning in a mapped section",
    ).toBeTruthy();
    expect(screen.queryByTestId(`wizard-step3-card-${DRIVE_FILE_ID}-warnings-clean`)).toBeNull();
    // And the warning really did route to crew rather than the fallback, or the
    // state above would be reachable for the wrong reason.
    expect(screen.queryByTestId("section-warning-controls-crew")).not.toBeNull();
    expect(screen.queryByTestId("section-warning-controls-warnings")).toBeNull();
  });
});
