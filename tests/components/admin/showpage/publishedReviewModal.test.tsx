// @vitest-environment jsdom
/**
 * tests/components/admin/showpage/publishedReviewModal.test.tsx
 * (admin-show-modal spec §6 — Task 6)
 *
 * Unit contract for `PublishedReviewModal`: the published review surface
 * composed inside the extracted `ReviewModalShell` chrome. Pins the §6.1
 * header composition (heading-safe h2 accessible name, title→slug fallback,
 * conditional sheet icon, close-button initial focus, NO h1 in the panel),
 * the §6.1 body composition (StatusStrip renderTitle={false} with the publish
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
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

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
import { ShareTokenProvider } from "@/app/admin/show/[slug]/ShareTokenContext";
import { buildPublishedSectionData } from "@/components/admin/review/publishedAdapter";
import { buildSectionWarningModel } from "@/lib/admin/sectionWarningModel";
import { step3Sections } from "@/components/admin/wizard/step3ReviewSections";
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
    // renderTitle={false}: the strip's internal h1 title and its divider are gone.
    expect(screen.queryByTestId("strip-title")).toBeNull();
    expect(screen.queryByTestId("strip-title-divider")).toBeNull();
  });

  it("the close button carries the modal's initial focus (useDialogFocus via initialFocusRef)", async () => {
    renderModal();
    const close = screen.getByTestId(`${TB}-close`);
    await waitFor(() => expect(document.activeElement).toBe(close));
  });
});

// ── §6.1 body ─────────────────────────────────────────────────────────────────

describe("PublishedReviewModal body (spec §6.1/§6.4)", () => {
  it("StatusStrip renders inside the panel with the publish toggle present", () => {
    renderModal();
    const panel = document.querySelector("[data-review-modal-panel]")! as HTMLElement;
    const strip = within(panel).getByTestId("show-status-strip");
    expect(within(strip).getByTestId("strip-publish-toggle")).toBeTruthy();
  });

  it("MODAL-STRIP-CHROME-1: the strip wears modal-header chrome — no second seam, shadow, sticky pin or padding inside the shell header", () => {
    // The shell's <header> already owns the surface, the bottom border and
    // px-tile-pad; the page strip's own border-b + shadow-tile would stack a
    // doubled seam right above it, and px-4/sm:px-6 a doubled inset. Failure
    // mode: the modal drops the `chrome` prop and silently regains page chrome.
    renderModal();
    const panel = document.querySelector("[data-review-modal-panel]")! as HTMLElement;
    const classes = within(panel).getByTestId("show-status-strip").className.split(/\s+/);
    for (const token of ["sticky", "top-0", "z-30", "border-b", "shadow-tile", "px-4", "sm:px-6"]) {
      expect(classes, `strip in the modal header must not carry \`${token}\``).not.toContain(token);
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
