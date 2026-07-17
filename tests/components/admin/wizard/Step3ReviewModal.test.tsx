// @vitest-environment jsdom
/**
 * tests/components/admin/wizard/Step3ReviewModal.test.tsx (Task 4 — spec §5,
 * §9.1, §9.4, §15)
 *
 * Pins the NEW Step-3 review modal's shell, header, and footer. This suite
 * REPLACES tests/components/admin/wizard/Step3DetailsDialog.test.tsx (deleted
 * with the old dialog in Task 8) — every retired assertion has its named
 * replacement here:
 *
 *   - labelled modal dialog (label = show title)  → "dialog accessible name is
 *     the plain title" (linked + unlinked)
 *   - renders children in scrollable body         → Task 5 section-panel tests
 *     (`-review-main` is a stub div this task)
 *   - initial focus → close button                → same assertion
 *   - scrim pointer-only (tabIndex −1, no aria-hidden) → same, `-review-backdrop`
 *   - close button / scrim / Escape call onClose  → same three assertions
 *   - bottom-anchored mobile vs centered desktop  → shell class assertions
 *     (`items-end sm:items-center`) + Task 10 real-browser
 *   - CSS animation hooks on scrim/panel          → `data-step3-review-scrim`
 *     / `-panel` attribute assertions
 *   - body scroll lock + restore                  → same assertion
 *   - (new, §15) focus TRAP wrap cycle            → strict wrap test below
 *   - (new, §15) restore-to-trigger               → trigger-refocus test below
 *
 * Anti-tautology: the chip/note counts are COMPUTED via deriveSectionStatuses
 * from the fixture's own warnings (never restated literals); the sheet-link
 * href is derived from the REAL buildSheetDeepLink; the null-link case drives
 * the real function to null (falsy driveFileId) rather than mocking it.
 *
 * jsdom caveat (focus trap): useDialogFocus discovers focusables via
 * `offsetParent`, which jsdom leaves null — the trap test stubs it and
 * restores in afterEach. The REAL-browser wrap re-check is Task 11's Tab audit.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { useState } from "react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { act, cleanup, fireEvent, render, waitFor, within } from "@testing-library/react";
import type { ParseResult, ParseWarning } from "@/lib/parser/types";

// RescanSheetButton (mounted in the modal footer) calls useRouter().refresh().
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

import {
  activeSectionFor,
  DRAG_DISMISS_THRESHOLD_PX,
  DRAG_SLOP_PX,
  DURATION_FAST_FALLBACK_MS,
  DURATION_NORMAL_FALLBACK_MS,
  INDICATOR_INSET_PX,
  NAV_SCROLL_SETTLE_EPSILON_PX,
  NAV_SCROLL_SETTLE_TIMEOUT_MS,
  SCROLL_SPY_OFFSET_PX,
  Step3ReviewModal,
  WARNING_HIGHLIGHT_MS,
} from "@/components/admin/wizard/Step3ReviewModal";
import {
  __resetAgendaThrottleForTests,
  CALLOUT_MAX_ENTRIES,
  contactBlocks,
  dateSummarySegments,
  step3Sections,
  STEP3_SECTION_GROUPS,
} from "@/components/admin/wizard/step3ReviewSections";
import {
  buildStagedSectionData,
  type StagedSectionData,
} from "@/components/admin/review/sectionData";
import { deriveSectionStatuses, type SectionId } from "@/lib/admin/step3SectionStatus";
import { RESCAN_REVIEW_REQUIRED } from "@/lib/onboarding/rescanReviewCode";
import { buildSheetDeepLink } from "@/lib/sheet-links/buildSheetDeepLink";
import { buildParseResult, stagedRow } from "./_step3ReviewFixture";

const DFID = "drive-abc-123";
const WSID = "00000000-1111-4222-8333-444444444444";
const TITLE = "Asset Mgmt Summit"; // fixture show title (_step3ReviewFixture.ts)

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function warning(kind: string): ParseWarning {
  return { severity: "warn", code: "SOME_CODE", message: "", blockRef: { kind } };
}

// A judgment (ambiguity-class) warning routed to a section (spec 2026-07-07 §7.1).
// The optional field drives the FIELD_LABELS entry-text enrichment (§7.3).
function judgmentWarning(kind: string, field?: string): ParseWarning {
  return {
    severity: "warn",
    code: "ROOM_HEADER_SPLIT_AMBIGUOUS",
    message: "",
    blockRef: field ? { kind, field } : { kind },
  };
}

/** Assemble the modal's SectionData from the shared fixture builders. */
function sectionData(
  prOverrides: Partial<ParseResult> = {},
  dataOverrides: Partial<StagedSectionData> = {},
): StagedSectionData {
  const pr = buildParseResult(prOverrides);
  // Row/dfid may be overridden via dataOverrides (e.g. sourceAnchors injected on
  // the row); derive the row/dfid-dependent SectionCore fields from the FINAL
  // values so an overridden row propagates to title/sourceAnchors/driveFileId.
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
      ros: pr.runOfShow ?? {},
      warnings: pr.warnings,
      agendaBaseline: [],
      useRawDecisions: [],
    }),
    ...dataOverrides,
  };
}

/** SectionData with show-level overrides (client_label, dates, …). */
function sectionDataWithShow(
  showOverrides: Partial<ParseResult["show"]>,
  prOverrides: Partial<ParseResult> = {},
): StagedSectionData {
  const pr = buildParseResult(prOverrides);
  return sectionData({ ...prOverrides, show: { ...pr.show, ...showOverrides } });
}

function tid(name: string, dfid = DFID): string {
  return `wizard-step3-card-${dfid}-review-${name}`;
}

function renderModal(
  opts: {
    d?: StagedSectionData;
    checked?: boolean;
    isDirtyRescan?: boolean;
    onRequestSetChecked?: (next: boolean) => Promise<boolean>;
    onClose?: () => void;
  } = {},
) {
  const onClose = opts.onClose ?? vi.fn();
  const onRequestSetChecked = opts.onRequestSetChecked ?? vi.fn(async () => true);
  const d = opts.d ?? sectionData();
  const q = render(
    <Step3ReviewModal
      data={d}
      checked={opts.checked ?? false}
      isDirtyRescan={opts.isDirtyRescan ?? false}
      onRequestSetChecked={onRequestSetChecked}
      onClose={onClose}
    />,
  );
  return { q, d, onClose, onRequestSetChecked };
}

/** Deferred promise so pending-state assertions run while the request is
 *  genuinely unresolved (and can then settle either way, or reject). */
function deferred() {
  let resolve!: (v: boolean) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<boolean>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** Mirrors renderModal's exact prop set with STATEFUL checked — reproduces the
 *  live card contract (Step3SheetCard.tsx:289-295): `checked` flips
 *  OPTIMISTICALLY the moment the request starts, rolls back to the pre-click
 *  value on resolve-false AND on throw (rethrown so the modal's own catch at
 *  Step3ReviewModal.tsx:686-690 is exercised). Static-prop renders can't catch
 *  the §B1 bug — the wrong slot only renders once `checked` flips mid-flight. */
function OptimisticHarness(props: {
  initialChecked: boolean;
  request: (next: boolean) => Promise<boolean>;
  onClose?: () => void;
}) {
  const [checked, setChecked] = useState(props.initialChecked);
  return (
    <Step3ReviewModal
      data={sectionData()}
      isDirtyRescan={false}
      onClose={props.onClose ?? vi.fn()}
      checked={checked}
      onRequestSetChecked={async (next) => {
        const prev = checked;
        setChecked(next); // the card's optimistic flip (Step3SheetCard.tsx:289-292)
        let ok: boolean;
        try {
          ok = await props.request(next);
        } catch (e) {
          setChecked(prev); // the card's failure settlement/rollback
          throw e; // rethrow so the MODAL's own catch is exercised
        }
        if (!ok) setChecked(prev); // rollback on resolve-false too
        return ok;
      }}
    />
  );
}

/** flaggedCount the modal must display, computed the same way the spec derives
 *  it (deriveSectionStatuses over the data's warnings + rendered sections) —
 *  never a restated literal. */
function expectedFlagged(d: StagedSectionData): number {
  const rendered = new Set<SectionId>(step3Sections(d).map((s) => s.id));
  return deriveSectionStatuses(d.warnings, rendered).flaggedCount;
}

// ── Modal a11y contract (retired: "labelled modal dialog") ──────────────────

describe("Step3ReviewModal — a11y-safe title (spec §9.1/§15)", () => {
  test("dialog accessible name is the plain title (linked): aria-labelledby → h2 whose text is ONLY the title", () => {
    const { q } = renderModal();
    const dialog = document.querySelector('[role="dialog"]') as HTMLElement;
    expect(dialog).not.toBeNull();
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    const labelledBy = dialog.getAttribute("aria-labelledby");
    expect(labelledBy).toBeTruthy();
    // getElementById — a React useId() value contains chars invalid in a CSS selector.
    const heading = document.getElementById(labelledBy!)!;
    expect(heading).toBe(q.getByTestId(tid("title")));
    // The accessible name is the PLAIN title — exactly, so the deep-link's
    // action label ("Open the source sheet …") can never leak into it.
    expect(heading.textContent).toBe(TITLE);
    // The deep link EXISTS for this fixture (real buildSheetDeepLink URL) but
    // lives OUTSIDE the heading.
    const link = q.getByTestId(tid("sheetlink"));
    expect(heading.contains(link)).toBe(false);
  });

  test("dialog accessible name is the plain title (unlinked): falsy driveFileId → no sheetlink, name still the title", () => {
    // Real buildSheetDeepLink behavior: falsy driveFileId → null (no mock).
    expect(buildSheetDeepLink("")).toBeNull();
    const d = sectionData({}, { dfid: "" });
    const { q } = renderModal({ d });
    expect(q.queryByTestId(tid("sheetlink", ""))).toBeNull();
    const dialog = document.querySelector('[role="dialog"]') as HTMLElement;
    const heading = document.getElementById(dialog.getAttribute("aria-labelledby")!)!;
    expect(heading.textContent).toBe(TITLE);
  });

  test("the title element is an <h2> (heading contract §15)", () => {
    const { q } = renderModal();
    expect(q.getByTestId(tid("title")).tagName).toBe("H2");
  });

  test("sheet deep link: separate 44px icon anchor with the action aria-label and safe target/rel", () => {
    const { q } = renderModal();
    const link = q.getByTestId(tid("sheetlink")) as HTMLAnchorElement;
    expect(link.tagName).toBe("A");
    expect(link.getAttribute("href")).toBe(buildSheetDeepLink(DFID));
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");
    expect(link.getAttribute("aria-label")).toBe(`Open the source sheet for ${TITLE}`);
    expect(link.className).toMatch(/\bsize-tap-min\b/);
  });
});

// ── Header anatomy (spec §9.1) ───────────────────────────────────────────────

describe("Step3ReviewModal — header anatomy (spec §9.1)", () => {
  test("renders the eyebrow 'Review before publishing'", () => {
    const { q } = renderModal();
    expect(within(q.getByTestId(tid("header"))).getByText("Review before publishing")).toBeTruthy();
  });

  test("subline: client entry present when client_label set, omitted when empty (card's `|| null` rule)", () => {
    const { q } = renderModal();
    const header = q.getByTestId(tid("header"));
    expect(within(header).getByText("Acme Capital")).toBeTruthy();
    cleanup();
    // ShowRow.client_label is `string` (lib/parser/types.ts:98); "no client" is
    // the empty string, coerced to null by the same `|| null` rule the card uses.
    const { q: q2 } = renderModal({ d: sectionDataWithShow({ client_label: "" }) });
    expect(within(q2.getByTestId(tid("header"))).queryByText("Acme Capital")).toBeNull();
  });

  test("subline: dates entry ALWAYS renders — joined segments, or 'Dates not detected' on an empty dates fixture", () => {
    const { q, d } = renderModal();
    const segs = dateSummarySegments(d.pr.show.dates);
    expect(segs.length).toBeGreaterThan(0); // fixture sanity — the join branch is exercised
    expect(within(q.getByTestId(tid("header"))).getByText(segs.join(" · "))).toBeTruthy();
    cleanup();
    const empty = sectionDataWithShow({
      dates: { travelIn: null, set: null, showDays: [], travelOut: null },
    });
    const { q: q2 } = renderModal({ d: empty });
    expect(within(q2.getByTestId(tid("header"))).getByText("Dates not detected")).toBeTruthy();
  });
});

// ── Rooms & scope rail sub-nav ───────────────────────────────────────────────

describe("Step3ReviewModal — rooms rail sub-nav", () => {
  test("renders one indented child per room under Rooms & scope; clicking activates rooms + scrolls the pane to that card", () => {
    // jsdom has no Element#scrollTo — stub on the prototype so jumpToRoom's
    // guarded scroll runs.
    const original = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "scrollTo");
    const scrollTo = vi.fn();
    Object.defineProperty(HTMLElement.prototype, "scrollTo", {
      value: scrollTo,
      configurable: true,
      writable: true,
    });
    try {
      const d = sectionData(); // fixture: 4 rooms, "Ballroom 1".."Ballroom 4"
      const { q } = renderModal({ d });
      // One child per rendered room, labeled by room name, in order.
      d.rooms.forEach((r, i) => {
        expect(q.getByTestId(tid(`rail-room-${i}`)).textContent).toBe(r.name);
      });
      // The room card is the scroll target (queryable, no id — twin-nav rule).
      expect(document.querySelector('[data-room-nav="2"]')).not.toBeNull();
      // Clicking a child keeps the parent "Rooms & scope" item active + scrolls.
      fireEvent.click(q.getByTestId(tid("rail-room-2")));
      expect(q.getByTestId(tid("rail-item-rooms")).getAttribute("aria-current")).toBe("true");
      expect(scrollTo).toHaveBeenCalled();
    } finally {
      if (original) Object.defineProperty(HTMLElement.prototype, "scrollTo", original);
      else delete (HTMLElement.prototype as { scrollTo?: unknown }).scrollTo;
    }
  });
});

// ── Overall status chip (spec §7 header chip) ────────────────────────────────

describe("Step3ReviewModal — overall status chip (spec §7)", () => {
  test("N>1 flagged sections → '{N} need a look' with warning treatment + review dot", () => {
    const d = sectionData({ warnings: [warning("crew"), warning("rooms")] });
    const n = expectedFlagged(d);
    expect(n).toBeGreaterThan(1); // fixture sanity — plural branch exercised
    const { q } = renderModal({ d });
    const chip = q.getByTestId(tid("chip"));
    expect(chip.textContent).toBe(`${n} need a look`);
    expect(chip.className).toMatch(/\bbg-warning-bg\b/);
    expect(chip.className).toMatch(/\btext-warning-text\b/);
    expect(chip.querySelector(".bg-status-review")).not.toBeNull();
  });

  test("N=1 flagged section → singular '1 needs a look'", () => {
    const d = sectionData({ warnings: [warning("crew")] });
    expect(expectedFlagged(d)).toBe(1); // fixture sanity — singular branch
    const { q } = renderModal({ d });
    expect(q.getByTestId(tid("chip")).textContent).toBe("1 needs a look");
  });

  test("zero warnings → 'All clean' with sunken/positive treatment", () => {
    const d = sectionData();
    expect(expectedFlagged(d)).toBe(0);
    const { q } = renderModal({ d });
    const chip = q.getByTestId(tid("chip"));
    expect(chip.textContent).toBe("All clean");
    expect(chip.className).toMatch(/\bbg-surface-sunken\b/);
    expect(chip.className).toMatch(/\btext-status-positive-text\b/);
  });

  test("dirty rescan → chip reads 'Sheet changed' with review treatment, never 'All clean' (footer-note consistency)", () => {
    // Zero-warning fixture: without the dirty branch this would render "All
    // clean", contradicting the footer's review-required note.
    const d = sectionData();
    expect(expectedFlagged(d)).toBe(0);
    const { q } = renderModal({ d, isDirtyRescan: true });
    const chip = q.getByTestId(tid("chip"));
    expect(chip.textContent).toBe("Sheet changed");
    expect(chip.className).toMatch(/\bbg-warning-bg\b/);
    expect(chip.className).toMatch(/\btext-warning-text\b/);
    expect(chip.querySelector(".bg-status-review")).not.toBeNull();
    expect(q.queryByText("All clean")).toBeNull();
  });

  test("dirty rescan wins over flagged counts: chip never reads '{N} need a look' when the sheet changed", () => {
    const d = sectionData({ warnings: [warning("crew"), warning("rooms")] });
    expect(expectedFlagged(d)).toBeGreaterThan(0);
    const { q } = renderModal({ d, isDirtyRescan: true });
    expect(q.getByTestId(tid("chip")).textContent).toBe("Sheet changed");
    expect(q.queryByText(/need(s)? a look/)).toBeNull();
  });
});

// ── Focus management (retired: initial focus; new: trap wrap + restore) ─────

describe("Step3ReviewModal — focus management (spec §15)", () => {
  test("initial focus lands on the close button", () => {
    const { q } = renderModal();
    expect(document.activeElement).toBe(q.getByTestId(tid("close")));
  });

  test("Tab from the last focusable wraps to the first; Shift+Tab on the first wraps to the last (strict wrap)", () => {
    // jsdom leaves offsetParent null, so useDialogFocus's visibility filter
    // would see zero focusables — stub it for this test only.
    const original = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetParent");
    Object.defineProperty(HTMLElement.prototype, "offsetParent", {
      get() {
        return (this as HTMLElement).parentElement;
      },
      configurable: true,
    });
    try {
      renderModal();
      const panel = document.querySelector("[data-step3-review-panel]") as HTMLElement;
      const focusables = Array.from(
        panel.querySelectorAll<HTMLElement>(
          'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])',
        ),
      );
      expect(focusables.length).toBeGreaterThan(1);
      const first = focusables[0]!;
      const last = focusables[focusables.length - 1]!;
      last.focus();
      fireEvent.keyDown(last, { key: "Tab" });
      expect(document.activeElement).toBe(first);
      first.focus();
      fireEvent.keyDown(first, { key: "Tab", shiftKey: true });
      expect(document.activeElement).toBe(last);
    } finally {
      if (original) Object.defineProperty(HTMLElement.prototype, "offsetParent", original);
    }
  });

  test("restore-to-trigger: focus returns to the trigger on unmount", () => {
    const trigger = document.createElement("button");
    trigger.textContent = "open review";
    document.body.appendChild(trigger);
    try {
      trigger.focus();
      const { q } = renderModal();
      expect(document.activeElement).not.toBe(trigger); // modal grabbed focus
      q.unmount();
      expect(document.activeElement).toBe(trigger);
    } finally {
      trigger.remove();
    }
  });
});

// ── Close paths (retired: close button / scrim / Escape) ────────────────────

describe("Step3ReviewModal — close paths", () => {
  test("the close button calls onClose", () => {
    const { q, onClose } = renderModal();
    fireEvent.click(q.getByTestId(tid("close")));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test("the scrim is pointer-only (tabIndex −1, NOT aria-hidden) and clicking it calls onClose", () => {
    const { q, onClose } = renderModal();
    const scrim = q.getByTestId(tid("backdrop"));
    expect(scrim.getAttribute("tabindex")).toBe("-1");
    expect(scrim.getAttribute("aria-hidden")).toBeNull();
    fireEvent.click(scrim);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test("pressing Escape calls onClose", () => {
    const { onClose } = renderModal();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test("a plain tap on the grab strip calls onClose", () => {
    const { q, onClose } = renderModal();
    fireEvent.click(q.getByTestId(tid("grab")));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

// ── Shell classes + animation hooks (retired: responsive shell + hooks) ─────

describe("Step3ReviewModal — shell (spec §5)", () => {
  test("overlay is bottom-anchored on mobile and centered on desktop", () => {
    renderModal();
    const dialog = document.querySelector('[role="dialog"]') as HTMLElement;
    expect(dialog.className).toMatch(/\bfixed\b/);
    expect(dialog.className).toMatch(/\bitems-end\b/);
    expect(dialog.className).toMatch(/\bsm:items-center\b/);
  });

  test("overlay gutter: ≥sm gets sm:p-6 breathing room; sheet mode stays full-bleed (no unprefixed padding)", () => {
    renderModal();
    const dialog = document.querySelector('[role="dialog"]') as HTMLElement;
    expect(dialog.className).toMatch(/\bsm:p-6\b/);
    // Full-bleed below sm: no base (unprefixed) padding utility on the overlay.
    expect(dialog.className).not.toMatch(/(^|\s)p[xytrbl]?-/);
  });

  test("dialog root (role=dialog) has data-testid = wizard-step3-card-<dfid>-review-modal", () => {
    const { q } = renderModal();
    const dialog = q.getByTestId(tid("modal"));
    expect(dialog.getAttribute("role")).toBe("dialog");
  });

  test("panel carries the §5 sizing classes and the CSS animation hook", () => {
    renderModal();
    const panel = document.querySelector("[data-step3-review-panel]") as HTMLElement;
    expect(panel).not.toBeNull();
    // Exact class tokens (\b can't delimit `[`/`]` in arbitrary-value classes).
    const classes = panel.className.split(/\s+/);
    expect(classes).toContain("max-h-[85vh]");
    expect(classes).toContain("sm:max-h-[80vh]");
    expect(classes).toContain("sm:max-w-5xl");
    expect(classes).toContain("items-stretch");
  });

  test("scrim carries bg-overlay-scrim and the CSS animation hook", () => {
    const { q } = renderModal();
    const scrim = q.getByTestId(tid("backdrop"));
    expect(scrim.hasAttribute("data-step3-review-scrim")).toBe(true);
    expect(scrim.className).toMatch(/\bbg-overlay-scrim\b/);
  });

  test("grab strip: 44px hit area, labeled, sheet-mode only (sm:hidden)", () => {
    const { q } = renderModal();
    const grab = q.getByTestId(tid("grab"));
    expect(grab.getAttribute("aria-label")).toBe("Drag down or tap to close");
    expect(grab.className).toMatch(/\bmin-h-tap-min\b/);
    expect(grab.className).toMatch(/\bsm:hidden\b/);
  });

  test("body stub region exists (Tasks 5-7 fill it)", () => {
    const { q } = renderModal();
    expect(q.getByTestId(tid("main"))).toBeTruthy();
  });
});

// ── Body scroll lock (retired: same assertion) ──────────────────────────────

describe("Step3ReviewModal — body scroll lock", () => {
  test("locks body scroll while open and restores the prior value on unmount", () => {
    document.body.style.overflow = "scroll";
    const { q } = renderModal();
    expect(document.body.style.overflow).toBe("hidden");
    q.unmount();
    expect(document.body.style.overflow).toBe("scroll");
  });
});

// ── Footer (spec §9.1) ───────────────────────────────────────────────────────

describe("Step3ReviewModal — footer note + buttons (spec §9.1)", () => {
  test("clean fixture → note 'All clear to publish', hidden in sheet mode (hidden sm:flex)", () => {
    const { q } = renderModal();
    const note = q.getByTestId(tid("note"));
    expect(note.textContent).toBe("All clear to publish");
    expect(note.className).toMatch(/\bhidden\b/);
    expect(note.className).toMatch(/\bsm:flex\b/);
  });

  test("flagged fixture → note '{N} to review · publishing isn't blocked' (N computed, not restated)", () => {
    const d = sectionData({ warnings: [warning("crew"), warning("rooms")] });
    const n = expectedFlagged(d);
    const { q } = renderModal({ d });
    expect(q.getByTestId(tid("note")).textContent).toBe(
      `${n} to review · publishing isn't blocked`,
    );
  });

  test("RescanSheetButton is mounted in the footer", () => {
    const { q } = renderModal();
    expect(within(q.getByTestId(tid("footer"))).getByText("Re-scan this sheet")).toBeTruthy();
  });

  test("footer rescan result is an overlay (resultPlacement='overlay'): result carries data-rescan-overlay-result, out of flow (spec §G — catches: footer call site left stacked)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              ok: true,
              status: "updated",
              needsReview: false,
              changed: true,
              demoted: false,
            }),
            { status: 200 },
          ),
      ),
    );
    const { q } = renderModal();
    const footer = q.getByTestId(tid("footer"));
    // One tap fires (G3 guard withdrawn).
    await act(async () => {
      fireEvent.click(within(footer).getByTestId(`rescan-sheet-button-${DFID}`));
    });
    const result = await within(footer).findByTestId(`rescan-sheet-result-${DFID}`);
    expect(result.hasAttribute("data-rescan-overlay-result")).toBe(true);
    // Structural out-of-flow pin (pixel constancy is Task 14's Playwright): the
    // overlay result is absolutely positioned above the button, not stacked in flow.
    const resultClasses = result.className.split(/\s+/);
    expect(resultClasses).toContain("absolute");
    expect(resultClasses).toContain("bottom-full");
    // Mobile-safe anchor contract (impeccable audit P1): below sm the overlay
    // is LEFT-anchored against the FOOTER (the footer carries `relative`; the
    // button wrapper is only `sm:relative`), so a 312px coded result can never
    // extend past the left viewport edge at 390px; ≥sm restores the
    // wrapper-anchored right-0. Real-pixel proof is the §K14 390px Playwright
    // assertion (tests/e2e/step3-review-modal.interactions.spec.ts).
    expect(resultClasses).toContain("left-0");
    expect(resultClasses).toContain("sm:left-auto");
    expect(resultClasses).toContain("sm:right-0");
    expect(footer.className.split(/\s+/)).toContain("relative");
  });

  test("primary-slot label: 'Publish this show' unchecked, 'Unpublish' checked (spec §C2 — supersedes the 'Selected to publish' pin)", () => {
    const { q } = renderModal({ checked: false });
    expect(q.getByTestId(tid("publish")).textContent).toBe("Publish this show");
    cleanup();
    const { q: q2 } = renderModal({ checked: true });
    expect(within(q2.getByTestId(tid("footer"))).getByTestId(tid("publish")).textContent).toBe(
      "Unpublish",
    );
  });

  test("primary-slot styling: unchecked keeps the accent CTA; checked renders the quiet/secondary Unpublish (border/surface, never accent) with NO Check icon (spec §C2)", () => {
    const { q } = renderModal({ checked: false });
    const unchecked = q.getByTestId(tid("publish"));
    expect(unchecked.className).toMatch(/\bbg-accent\b/);
    expect(unchecked.className).toMatch(/\btext-accent-text\b/);
    cleanup();
    const { q: q2 } = renderModal({ checked: true });
    const unpublish = within(q2.getByTestId(tid("footer"))).getByTestId(tid("publish"));
    expect(unpublish.className).toMatch(/\bborder\b/);
    expect(unpublish.className).toMatch(/\bborder-border-strong\b/);
    expect(unpublish.className).toMatch(/\bbg-surface\b/);
    expect(unpublish.className).not.toMatch(/\bbg-accent\b/);
    expect(unpublish.className).toMatch(/\bmin-h-tap-min\b/);
    // No Check icon inside the Unpublish button (the checked slot is no longer
    // the idempotent-approve CTA) — no svg at all.
    expect(unpublish.querySelector("svg")).toBeNull();
  });

  test("Unpublish pending: label 'Removing…', quiet treatment kept (never flips to accent while pending)", async () => {
    let settle!: (v: boolean) => void;
    const onRequestSetChecked = vi.fn(() => new Promise<boolean>((resolve) => (settle = resolve)));
    const { q } = renderModal({ checked: true, onRequestSetChecked });
    fireEvent.click(q.getByTestId(tid("publish")));
    await waitFor(() => expect(q.getByTestId(tid("publish")).textContent).toBe("Removing…"));
    const pending = q.getByTestId(tid("publish"));
    expect(pending.className).toMatch(/\bborder-border-strong\b/);
    expect(pending.className).not.toMatch(/\bbg-accent\b/);
    await act(async () => settle(true));
  });

  test("dirty-rescan: NO publish button, NO rescan button; context-only review note with NO link-out (staged page retired, spec §4.6)", () => {
    const { q } = renderModal({ isDirtyRescan: true });
    const footer = q.getByTestId(tid("footer"));
    expect(q.queryByTestId(tid("publish"))).toBeNull();
    expect(within(footer).queryByText("Re-scan this sheet")).toBeNull();
    // The standalone reapply page was folded into this modal — the dirty-rescan
    // footer is now a context-only note (the resolution footer is the real path).
    const note = within(footer).getByTestId(`wizard-step3-card-${DFID}-review-reapply`);
    expect(note.textContent).toContain("This sheet changed since you reviewed it.");
    expect(note.closest("a")).toBeNull();
    expect(footer.querySelector('a[href*="/admin/onboarding/staged/"]')).toBeNull();
  });
});

// ── Publish click semantics (spec §9.1 idempotent approve) ──────────────────

describe("Step3ReviewModal — publish click (spec §9.1)", () => {
  test("click requests EXACTLY the state-appropriate value: unchecked → true (closes), checked → false (stays open) — spec §C2 supersedes the idempotent-approve pin", async () => {
    const onRequestSetChecked = vi.fn(async () => true);
    const { q, onClose } = renderModal({ checked: false, onRequestSetChecked });
    fireEvent.click(q.getByTestId(tid("publish")));
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(onRequestSetChecked).toHaveBeenCalledWith(true);
    expect(onRequestSetChecked).not.toHaveBeenCalledWith(false);
    cleanup();
    // CHECKED state (§C2): the slot is a real Unpublish — requests EXACTLY
    // false (catches: unpublish wired to true) and never closes on success.
    const onRequestSetChecked2 = vi.fn(async () => true);
    const { q: q2, onClose: onClose2 } = renderModal({
      checked: true,
      onRequestSetChecked: onRequestSetChecked2,
    });
    fireEvent.click(q2.getByTestId(tid("publish")));
    await waitFor(() => expect(onRequestSetChecked2).toHaveBeenCalledTimes(1));
    expect(onRequestSetChecked2).toHaveBeenCalledWith(false);
    expect(onRequestSetChecked2).not.toHaveBeenCalledWith(true);
    // Success stays open — settlement flips the checked prop instead.
    await waitFor(() => expect(q2.getByTestId(tid("publish")).textContent).toBe("Unpublish"));
    expect(onClose2).not.toHaveBeenCalled();
  });

  test("resolved true → onClose called exactly once", async () => {
    const { q, onClose } = renderModal({ onRequestSetChecked: vi.fn(async () => true) });
    fireEvent.click(q.getByTestId(tid("publish")));
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  test("resolved false → modal stays open, inline error note, prior label kept (optimistic flip rolled back — spec T-B2)", async () => {
    const onClose = vi.fn();
    const d = deferred();
    const q = render(
      <OptimisticHarness initialChecked={false} request={() => d.promise} onClose={onClose} />,
    );
    fireEvent.click(q.getByTestId(tid("publish")));
    await act(async () => d.resolve(false));
    await waitFor(() =>
      expect(
        within(q.getByTestId(tid("footer"))).getByText(
          "Couldn't update the publish selection. Try again.",
        ),
      ).toBeTruthy(),
    );
    expect(onClose).not.toHaveBeenCalled();
    // The error note carries the warning text token.
    const errorNote = within(q.getByTestId(tid("footer"))).getByText(
      "Couldn't update the publish selection. Try again.",
    );
    expect(errorNote.className).toMatch(/\btext-warning-text\b/);
    // Inside the aria-modal dialog, the failure must be announced by AT —
    // role="status" makes the inline note a live region (impeccable audit P2).
    expect(errorNote.getAttribute("role")).toBe("status");
    // Prior (state-derived) label restored — not stuck on "Selecting…" — and
    // the button re-enabled for a retry (no pendingOp leak, spec §B2).
    const btn = q.getByTestId(tid("publish")) as HTMLButtonElement;
    expect(btn.textContent).toBe("Publish this show");
    expect(btn.disabled).toBe(false);
  });

  test("REJECTED (thrown) → same settlement as resolve-false: error note, label restored, re-enabled (spec T-B2; §B2 pendingOp clears on caught throw)", async () => {
    const onClose = vi.fn();
    const d = deferred();
    const q = render(
      <OptimisticHarness initialChecked={false} request={() => d.promise} onClose={onClose} />,
    );
    fireEvent.click(q.getByTestId(tid("publish")));
    await act(async () => d.reject(new Error("network down")));
    await waitFor(() =>
      expect(
        within(q.getByTestId(tid("footer"))).getByText(
          "Couldn't update the publish selection. Try again.",
        ),
      ).toBeTruthy(),
    );
    expect(onClose).not.toHaveBeenCalled();
    const btn = q.getByTestId(tid("publish")) as HTMLButtonElement;
    expect(btn.textContent).toBe("Publish this show");
    expect(btn.disabled).toBe(false);
  });

  test("[BUG §B1] while publish is pending the slot follows the OPERATION, not the optimistically-flipped checked prop: accent CTA + 'Selecting…' (broken code renders the checked branch: quiet 'Removing…')", async () => {
    const d = deferred();
    const onClose = vi.fn();
    const q = render(
      <OptimisticHarness initialChecked={false} request={() => d.promise} onClose={onClose} />,
    );
    fireEvent.click(q.getByTestId(tid("publish")));
    await waitFor(() => expect(q.getByTestId(tid("publish")).textContent).toBe("Selecting…"));
    const btn = q.getByTestId(tid("publish")) as HTMLButtonElement;
    // Accent (primary CTA) treatment persists through the flight — the flipped
    // checked prop must NOT swap in the quiet unpublish recipe mid-publish.
    expect(btn.className).toMatch(/\bbg-accent\b/);
    expect(btn.className).not.toMatch(/\bborder-border-strong\b/);
    expect(btn.disabled).toBe(true);
    expect(btn.getAttribute("aria-busy")).toBe("true");
    expect(onClose).not.toHaveBeenCalled();
    await act(async () => d.resolve(true));
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });
});

// ── Task 8: footer Unpublish + finalize-demoted gate (spec §C2/§C3) ─────────

describe("Step3ReviewModal — footer Unpublish + demoted gate (spec §C2/§C3)", () => {
  /** SectionData whose row is finalize-demoted by `code` (dirty rescan is the
   *  RESCAN_REVIEW_REQUIRED subtype — spec §C3). */
  function demotedData(code: string): StagedSectionData {
    const pr = buildParseResult();
    return sectionData({}, { row: stagedRow(pr, { lastFinalizeFailureCode: code }) });
  }

  test("unpublish success stays open: promise resolves true → onClose NOT called, button back to idle; checked=false rerender swaps the slot instantly", async () => {
    let settle!: (v: boolean) => void;
    const onRequestSetChecked = vi.fn(() => new Promise<boolean>((resolve) => (settle = resolve)));
    const onClose = vi.fn();
    const d = sectionData();
    const q = render(
      <Step3ReviewModal
        data={d}
        checked={true}
        isDirtyRescan={false}
        onRequestSetChecked={onRequestSetChecked}
        onClose={onClose}
      />,
    );
    const footer = q.getByTestId(tid("footer"));
    const btn = within(footer).getByTestId(tid("publish")) as HTMLButtonElement;
    expect(btn.textContent).toBe("Unpublish");
    fireEvent.click(btn);
    await waitFor(() => expect(btn.textContent).toBe("Removing…"));
    await act(async () => settle(true));
    // Modal STAYS OPEN; publishState back to idle (button re-enabled).
    expect(onClose).not.toHaveBeenCalled();
    await waitFor(() => expect(btn.textContent).toBe("Unpublish"));
    expect(btn.disabled).toBe(false);
    // The card's settlement flips the checked prop — the slot swaps to the
    // publish CTA instantly (§H N5: no animation utility on the slot).
    q.rerender(
      <Step3ReviewModal
        data={d}
        checked={false}
        isDirtyRescan={false}
        onRequestSetChecked={onRequestSetChecked}
        onClose={onClose}
      />,
    );
    const swapped = within(q.getByTestId(tid("footer"))).getByTestId(tid("publish"));
    expect(swapped.textContent).toBe("Publish this show");
    expect(swapped.className).not.toMatch(/\banimate-|transition-\[/);
    expect(onClose).not.toHaveBeenCalled();
  });

  test("unpublish failure: resolves false → the EXISTING publish-error affordance (role=status note in the footer), modal open, label restored", async () => {
    const { q, onClose } = renderModal({
      checked: true,
      onRequestSetChecked: vi.fn(async () => false),
    });
    const footer = q.getByTestId(tid("footer"));
    fireEvent.click(within(footer).getByTestId(tid("publish")));
    await waitFor(() =>
      expect(
        within(footer).getByText("Couldn't update the publish selection. Try again."),
      ).toBeTruthy(),
    );
    const errorNote = within(footer).getByText("Couldn't update the publish selection. Try again.");
    expect(errorNote.getAttribute("role")).toBe("status");
    expect(errorNote.className).toMatch(/\btext-warning-text\b/);
    expect(onClose).not.toHaveBeenCalled();
    // Not stuck on "Removing…" — the state-derived label is restored.
    expect(within(footer).getByTestId(tid("publish")).textContent).toBe("Unpublish");
  });

  test("[BUG §B1] while unpublish is pending the slot follows the OPERATION: quiet 'Removing…' even though checked already flipped false (broken code renders the accent 'Selecting…'); rapid second click fires NO second request; success settles to the publish CTA", async () => {
    const d = deferred();
    const request = vi.fn(() => d.promise);
    const onClose = vi.fn();
    const q = render(
      <OptimisticHarness initialChecked={true} request={request} onClose={onClose} />,
    );
    const footer = q.getByTestId(tid("footer"));
    fireEvent.click(within(footer).getByTestId(tid("publish")));
    await waitFor(() =>
      expect(within(footer).getByTestId(tid("publish")).textContent).toBe("Removing…"),
    );
    const btn = within(footer).getByTestId(tid("publish")) as HTMLButtonElement;
    // Quiet/secondary treatment persists through the flight — the flipped
    // checked prop must NOT swap in the accent publish CTA mid-unpublish.
    expect(btn.className).toMatch(/\bborder-border-strong\b/);
    expect(btn.className).not.toMatch(/\bbg-accent\b/);
    expect(btn.disabled).toBe(true);
    expect(btn.getAttribute("aria-busy")).toBe("true");
    // Rapid double-click guard: the disabled button fires no second request.
    fireEvent.click(btn);
    expect(request).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
    await act(async () => d.resolve(true));
    // Success stays open; checked settled false → the slot renders the accent
    // publish CTA (§B2: post-resolution behavior unchanged).
    await waitFor(() =>
      expect(within(footer).getByTestId(tid("publish")).textContent).toBe("Publish this show"),
    );
    expect(onClose).not.toHaveBeenCalled();
  });

  test("demoted gate (§C3): non-rescan finalize failure → NO publish/unpublish button; NotPublishableNote copy + Re-scan still render in the footer (even when checked)", () => {
    const d = demotedData("DRIVE_FETCH_FAILED");
    // checked=true is the stronger fixture: the gate must win over checked.
    const { q } = renderModal({ d, checked: true, isDirtyRescan: false });
    const footer = q.getByTestId(tid("footer"));
    expect(within(footer).queryByTestId(tid("publish"))).toBeNull();
    expect(q.queryByTestId(tid("publish"))).toBeNull();
    // The shared NotPublishableNote copy, verbatim from the card (spec §C2),
    // with the modal-scoped testid.
    const note = within(footer).getByTestId(tid("not-publishable"));
    expect(
      within(note).getByText("This sheet needs attention before it can be published."),
    ).toBeTruthy();
    // RescanSheetButton still renders (recovery flows through the next scan).
    expect(within(footer).getByText("Re-scan this sheet")).toBeTruthy();
  });

  test("branch order (§C3): dirty rescan wins over demoted — RESCAN_REVIEW_REQUIRED + isDirtyRescan renders the dirty branch, not NotPublishableNote", () => {
    const d = demotedData(RESCAN_REVIEW_REQUIRED);
    const { q } = renderModal({ d, checked: false, isDirtyRescan: true });
    const footer = q.getByTestId(tid("footer"));
    // The dirty branch (context-only note, staged page retired — spec §4.6).
    const note = within(footer).getByTestId(`wizard-step3-card-${DFID}-review-reapply`);
    expect(note.textContent).toContain("This sheet changed since you reviewed it.");
    // NOT the demoted branch: no NotPublishableNote, no publish, no re-scan.
    expect(within(footer).queryByTestId(tid("not-publishable"))).toBeNull();
    expect(
      within(footer).queryByText("This sheet needs attention before it can be published."),
    ).toBeNull();
    expect(within(footer).queryByTestId(tid("publish"))).toBeNull();
    expect(within(footer).queryByText("Re-scan this sheet")).toBeNull();
  });

  test("unchecked publish path unchanged: 'Publish this show' → onRequestSetChecked(true) → onClose exactly once on success", async () => {
    const onRequestSetChecked = vi.fn(async () => true);
    const { q, onClose } = renderModal({ checked: false, onRequestSetChecked });
    const footer = q.getByTestId(tid("footer"));
    const btn = within(footer).getByTestId(tid("publish"));
    expect(btn.textContent).toBe("Publish this show");
    fireEvent.click(btn);
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(onRequestSetChecked).toHaveBeenCalledWith(true);
    expect(onRequestSetChecked).not.toHaveBeenCalledWith(false);
  });
});

// ── Task 5: rails + chip rail + section panels (spec §6.2–§6.4, §9.4, §15) ───

/** An info-severity warning: counts in the warnings list, never flags (§3.3). */
function infoWarning(kind: string): ParseWarning {
  return { severity: "info", code: "SOME_CODE", message: "", blockRef: { kind } };
}

/** flagged SET computed via the mapping lib over the registry's rendered ids
 *  (anti-tautology: expectations derive from the data path, not the render). */
function flaggedSetFor(d: StagedSectionData): ReadonlySet<SectionId> {
  const rendered = new Set<SectionId>(step3Sections(d).map((s) => s.id));
  return deriveSectionStatuses(d.warnings, rendered).flagged;
}

describe("Step3ReviewModal — duplicate navigation (spec §9.4)", () => {
  test("body wrapper hosts BOTH navs with the exact §9.4 mode classes", () => {
    const { q } = renderModal();
    const main = q.getByTestId(tid("main"));
    const mainClasses = main.className.split(/\s+/);
    for (const c of ["flex", "min-h-0", "flex-1", "flex-col", "items-stretch", "lg:flex-row"]) {
      expect(mainClasses).toContain(c);
    }

    // Side rail: hidden below lg (catches the twin-nav double-render bug —
    // both navs visible at once in popup mode).
    const rail = q.getByTestId(tid("rail"));
    expect(rail.tagName).toBe("NAV");
    expect(rail.getAttribute("aria-label")).toBe("Review sections");
    expect(main.contains(rail)).toBe(true);
    const railClasses = rail.className.split(/\s+/);
    for (const c of ["hidden", "lg:flex", "w-60", "shrink-0", "overflow-y-auto"]) {
      expect(railClasses).toContain(c);
    }

    // Chip rail: the exact inverse visibility pair.
    const chiprail = q.getByTestId(tid("chiprail"));
    expect(chiprail.tagName).toBe("NAV");
    expect(chiprail.getAttribute("aria-label")).toBe("Review sections");
    expect(main.contains(chiprail)).toBe(true);
    const chipClasses = chiprail.className.split(/\s+/);
    for (const c of ["flex", "lg:hidden", "overflow-x-auto", "shrink-0"]) {
      expect(chipClasses).toContain(c);
    }
  });

  test("content pane is the scrollable flex column with the motion-safe smooth-scroll opt-in", () => {
    const { q } = renderModal();
    const content = q.getByTestId(tid("content"));
    const classes = content.className.split(/\s+/);
    for (const c of [
      "min-w-0",
      "flex-1",
      "overflow-y-auto",
      "flex",
      "flex-col",
      "gap-6",
      "p-tile-pad",
      // Canonical Tailwind form of `motion-safe [scroll-behavior:smooth]`
      // (better-tailwindcss/enforce-canonical-classes) — same CSS output.
      "motion-safe:scroll-smooth",
    ]) {
      expect(classes).toContain(c);
    }
  });

  test("aria-current='true' on the SAME active item in BOTH navs (initially the first registry section)", () => {
    const { q, d } = renderModal();
    const first = step3Sections(d)[0]!;
    const rail = q.getByTestId(tid("rail"));
    const chiprail = q.getByTestId(tid("chiprail"));
    const railCurrent = rail.querySelectorAll('[aria-current="true"]');
    expect(railCurrent).toHaveLength(1);
    expect(railCurrent[0]).toBe(q.getByTestId(tid(`rail-item-${first.id}`)));
    const chipCurrent = chiprail.querySelectorAll('[aria-current="true"]');
    expect(chipCurrent).toHaveLength(1);
    expect(chipCurrent[0]).toBe(q.getByTestId(tid(`chip-item-${first.id}`)));
  });

  test("no id attributes inside either nav; every [id] in the modal is unique (twin-nav §9.4 rule)", () => {
    const { q } = renderModal();
    expect(q.getByTestId(tid("rail")).querySelectorAll("[id]")).toHaveLength(0);
    expect(q.getByTestId(tid("chiprail")).querySelectorAll("[id]")).toHaveLength(0);
    const ids = Array.from(q.getByTestId(tid("modal")).querySelectorAll("[id]")).map((el) => el.id);
    expect(ids.length).toBeGreaterThan(0); // the h2 title id exists
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("Step3ReviewModal — side rail anatomy (spec §6.2)", () => {
  test("one rail item per registry entry, in registry order, under group eyebrows in STEP3_SECTION_GROUPS order", () => {
    const { q, d } = renderModal();
    const defs = step3Sections(d);
    const rail = q.getByTestId(tid("rail"));
    const itemIds = Array.from(rail.querySelectorAll("[data-testid]"))
      .map((el) => el.getAttribute("data-testid")!)
      .filter((t) => t.includes("-review-rail-item-"));
    expect(itemIds).toEqual(defs.map((s) => tid(`rail-item-${s.id}`)));
    // Group eyebrow labels, in spec order (all 7 groups non-empty here).
    const groups = Array.from(rail.querySelectorAll("[data-rail-group]"));
    expect(groups.map((el) => el.textContent)).toEqual([...STEP3_SECTION_GROUPS]);
    // Every item is a ≥44px button (§15).
    for (const s of defs) {
      const item = q.getByTestId(tid(`rail-item-${s.id}`));
      expect(item.tagName).toBe("BUTTON");
      expect(item.className).toMatch(/\bmin-h-tap-min\b/);
    }
  });

  test("rail counts render exactly for the §6.1 counted subset, values derived from the fixture", () => {
    const { q, d } = renderModal();
    // Owner decision (2026-07-05): only Crew, Contacts, Rooms, Parse warnings.
    const expected: Partial<Record<SectionId, number>> = {
      crew: d.crewMembers.length,
      contacts: contactBlocks(d.pr.show.client_contact, d.pr.contacts ?? []).length,
      rooms: d.rooms.length,
      warnings: d.warnings.length,
    };
    expect(d.crewMembers.length).toBeGreaterThan(0); // fixture sanity: a nonzero count is exercised
    for (const s of step3Sections(d)) {
      const ct = q.getByTestId(tid(`rail-item-${s.id}`)).querySelector(".tabular-nums");
      if (s.id in expected) {
        // Catches a count wired to the wrong data source (fixture-derived value).
        expect(ct?.textContent).toBe(String(expected[s.id]));
      } else {
        // venue/event/schedule/hotels/transport/packlist/billing (and agenda)
        // never show a rail count.
        expect(ct).toBeNull();
      }
    }
  });

  test("status dots follow the mapping lib; the warnings dot is red for a MAPPED warn (row-local rule)", () => {
    const d = sectionData({ warnings: [warning("crew")] });
    const flagged = flaggedSetFor(d);
    expect(flagged.has("crew")).toBe(true); // fixture sanity
    // The mapped warn does NOT flag the checks row — but the row-local dot IS red.
    expect(flagged.has("warnings")).toBe(false);
    const { q } = renderModal({ d });
    for (const s of step3Sections(d)) {
      const item = q.getByTestId(tid(`rail-item-${s.id}`));
      const dot = item.querySelector(".bg-status-review, .border-status-positive");
      if (s.hideDot) {
        // §D2: report is the only def with hideDot — its rail item has NO dot.
        expect(dot).toBeNull();
        continue;
      }
      expect(dot).not.toBeNull();
      const expectRed = s.id === "warnings" ? true : flagged.has(s.id);
      expect(dot!.className).toMatch(
        expectRed ? /\bbg-status-review\b/ : /\bborder-status-positive\b/,
      );
      expect(dot!.className).toMatch(/\bsize-2\b/);
      expect(dot!.className).toMatch(/\brounded-pill\b/);
    }
  });

  test("active rail item: bg-surface-sunken; NO per-item accent span in ANY item (Task 10 — the shared nav-level indicator replaced them, spec §A3)", () => {
    const { q, d } = renderModal();
    const defs = step3Sections(d);
    const first = defs[0]!;
    const activeItem = q.getByTestId(tid(`rail-item-${first.id}`));
    expect(activeItem.className).toMatch(/\bbg-surface-sunken\b/);
    // The retired per-item conditional span (inset-y-3 accent bar) is GONE —
    // from the active item AND every other item (the indicator is the single
    // nav-level element pinned by the Task-10 sliding-indicator suite below).
    for (const s of defs) {
      const item = q.getByTestId(tid(`rail-item-${s.id}`));
      expect(item.querySelector(".bg-accent")).toBeNull();
      expect(item.querySelector(".inset-y-3")).toBeNull();
    }
  });

  test("warnings dot is ROW-LOCAL: info-only warnings → positive dot while the count still shows", () => {
    const d = sectionData({ warnings: [infoWarning("crew")] });
    expect(flaggedSetFor(d).size).toBe(0); // info never flags (§3.3)
    const { q } = renderModal({ d });
    const item = q.getByTestId(tid("rail-item-warnings"));
    expect(item.querySelector(".tabular-nums")?.textContent).toBe("1");
    const dot = item.querySelector(".bg-status-review, .border-status-positive");
    expect(dot!.className).toMatch(/\bborder-status-positive\b/);
    // Same rule on the chip twin.
    const chipDot = q
      .getByTestId(tid("chip-item-warnings"))
      .querySelector(".bg-status-review, .border-status-positive");
    expect(chipDot!.className).toMatch(/\bborder-status-positive\b/);
  });
});

describe("Step3ReviewModal — chip rail (spec §6.3)", () => {
  test("one chip per registry entry: pill classes, 44px hit height, icon+label+dot, NO counts", () => {
    const { q, d } = renderModal();
    const defs = step3Sections(d);
    const chiprail = q.getByTestId(tid("chiprail"));
    const chipIds = Array.from(chiprail.querySelectorAll("[data-testid]"))
      .map((el) => el.getAttribute("data-testid")!)
      .filter((t) => t.includes("-review-chip-item-"));
    expect(chipIds).toEqual(defs.map((s) => tid(`chip-item-${s.id}`)));
    for (const s of defs) {
      const chip = q.getByTestId(tid(`chip-item-${s.id}`));
      expect(chip.tagName).toBe("BUTTON");
      const classes = chip.className.split(/\s+/);
      for (const c of ["shrink-0", "whitespace-nowrap", "min-h-tap-min", "rounded-pill"]) {
        expect(classes).toContain(c);
      }
      expect(chip.querySelector(".tabular-nums")).toBeNull(); // chips never show counts
      if (s.hideDot) {
        // §D2: report is the only def with hideDot — its chip has NO dot.
        expect(chip.querySelector(".bg-status-review, .border-status-positive")).toBeNull();
      } else {
        expect(chip.querySelector(".bg-status-review, .border-status-positive")).not.toBeNull();
      }
      // Visible label ONLY (no counts) + the §S3C-1 sr-only status suffix on
      // dotted sections. Strip the sr-only status and assert the remainder is
      // exactly the label — a stray count/extra text would still break this.
      if (s.hideDot) {
        expect(chip.textContent).toBe(s.label);
      } else {
        expect(chip.textContent).toMatch(/ — (needs review|no issues)$/);
        expect(chip.textContent?.replace(/ — (needs review|no issues)$/, "")).toBe(s.label);
      }
    }
  });

  test("active chip: bg-surface-sunken + border-transparent; inactive: border-border bg-surface", () => {
    const { q, d } = renderModal();
    const defs = step3Sections(d);
    const activeChip = q.getByTestId(tid(`chip-item-${defs[0]!.id}`));
    expect(activeChip.className).toMatch(/\bbg-surface-sunken\b/);
    expect(activeChip.className).toMatch(/\bborder-transparent\b/);
    const idle = q.getByTestId(tid(`chip-item-${defs[1]!.id}`));
    expect(idle.className).toMatch(/\bborder-border\b/);
    expect(idle.className).toMatch(/\bbg-surface\b/);
  });
});

describe("Step3ReviewModal — section panels (spec §6.4/§5.2/§15)", () => {
  test("one -review-section-<id> per registry entry, in registry order, inside the content pane", () => {
    const { q, d } = renderModal();
    const defs = step3Sections(d);
    const content = q.getByTestId(tid("content"));
    const secIds = Array.from(content.querySelectorAll("[data-testid]"))
      .map((el) => el.getAttribute("data-testid")!)
      .filter((t) => t.includes("-review-section-"));
    expect(secIds).toEqual(defs.map((s) => tid(`section-${s.id}`)));
  });

  test("heading row: registry label as the section's first <h3>, with the body's existing count", () => {
    const { q, d } = renderModal();
    for (const s of step3Sections(d)) {
      const sec = q.getByTestId(tid(`section-${s.id}`));
      const headings = Array.from(sec.querySelectorAll("h1,h2,h3,h4,h5,h6"));
      expect(headings.length).toBeGreaterThan(0);
      expect(headings[0]!.tagName).toBe("H3");
      expect(headings[0]!.textContent).toBe(s.label);
      for (const c of ["text-base", "font-semibold", "text-text-strong"]) {
        expect(headings[0]!.className.split(/\s+/)).toContain(c);
      }
    }
    // Owner decision (2026-07-05): only Crew, Contacts, Rooms, and Parse
    // warnings show a heading count (fixture-derived, incl. a zero). Every other
    // section drops the parenthetical.
    const countRe = /\(\d+\)/;
    const crewHead = q.getByTestId(tid("section-crew")).querySelector("h3")!.parentElement!;
    expect(crewHead.textContent).toContain(`(${d.crewMembers.length})`);
    const roomsHead = q.getByTestId(tid("section-rooms")).querySelector("h3")!.parentElement!;
    expect(roomsHead.textContent).toContain(`(${d.rooms.length})`);
    const warnHead = q.getByTestId(tid("section-warnings")).querySelector("h3")!.parentElement!;
    expect(warnHead.textContent).toContain(`(${d.warnings.length})`);
    // Excluded sections carry NO count parenthetical (venue was `(0)` before).
    const venueHead = q.getByTestId(tid("section-venue")).querySelector("h3")!.parentElement!;
    expect(venueHead.textContent).not.toMatch(countRe);
    const hotelsHead = q.getByTestId(tid("section-hotels")).querySelector("h3")!.parentElement!;
    expect(hotelsHead.textContent).not.toMatch(countRe);
  });

  test("every sheet-backed section heading carries an 'In sheet' deep link (href/target/rel/aria); report excluded", () => {
    const { q, d } = renderModal();
    const sheetHref = buildSheetDeepLink(DFID);
    expect(sheetHref).not.toBeNull(); // fixture sanity — a real deep-link URL
    for (const s of step3Sections(d)) {
      // Not routed through tid(): the per-section link testid omits the "review-"
      // segment (it's a body-chrome anchor, not a modal-shell control).
      const linkId = `wizard-step3-card-${DFID}-section-${s.id}-sheetlink`;
      if (s.id === "report") {
        // "Report an issue" is not a parsed sheet region — no deep link.
        expect(q.queryByTestId(linkId)).toBeNull();
        continue;
      }
      const link = q.getByTestId(linkId) as HTMLAnchorElement;
      expect(link.tagName).toBe("A");
      expect(link.getAttribute("href")).toBe(sheetHref);
      expect(link.getAttribute("target")).toBe("_blank");
      expect(link.getAttribute("rel")).toContain("noopener");
      // Accessible name names the section, so it never collides with the header link.
      expect(link.getAttribute("aria-label")).toBe(`Open the source sheet for ${s.label}`);
    }
  });

  test("falsy driveFileId → NO per-section sheet links (mirrors the header link's null-gate)", () => {
    const d = sectionData({}, { dfid: "" });
    const { q } = renderModal({ d });
    for (const s of step3Sections(d)) {
      expect(q.queryByTestId(`wizard-step3-card--section-${s.id}-sheetlink`)).toBeNull();
    }
  });

  test("every heading inside the body region is an H3; the modal's only H2 is the title (§15)", () => {
    const { q } = renderModal();
    const main = q.getByTestId(tid("main"));
    const headings = Array.from(main.querySelectorAll("h1,h2,h3,h4,h5,h6"));
    expect(headings.length).toBeGreaterThan(0);
    for (const h of headings) expect(h.tagName).toBe("H3"); // catches a leftover BreakdownSection <h4>
    const h2s = Array.from(q.getByTestId(tid("modal")).querySelectorAll("h2"));
    expect(h2s).toEqual([q.getByTestId(tid("title"))]);
  });

  test("flagged section: warning icon chip + 'Needs a look' chip + border-border-strong panel; clean stays neutral", () => {
    const d = sectionData({ warnings: [warning("crew")] });
    const flagged = flaggedSetFor(d);
    expect(flagged.has("crew")).toBe(true);
    const { q } = renderModal({ d });

    const crewSec = q.getByTestId(tid("section-crew"));
    const needsChip = within(crewSec).getByText("Needs a look");
    expect(needsChip.className).toMatch(/\bbg-warning-bg\b/);
    expect(needsChip.className).toMatch(/\btext-warning-text\b/);
    expect(needsChip.className).toMatch(/\brounded-pill\b/);
    expect(needsChip.className).toMatch(/\bborder-border-strong\b/);
    expect(crewSec.querySelector(".border-border-strong.rounded-md")).not.toBeNull();
    const crewIconChip = crewSec.querySelector(".size-7")!;
    expect(crewIconChip.className).toMatch(/\bbg-warning-bg\b/);
    expect(crewIconChip.className).toMatch(/\btext-warning-text\b/);

    // Clean section: no chip, neutral border, sunken icon chip.
    const hotelsSec = q.getByTestId(tid("section-hotels"));
    expect(within(hotelsSec).queryByText("Needs a look")).toBeNull();
    expect(hotelsSec.querySelector(".border-border-strong")).toBeNull();
    expect(hotelsSec.querySelector(".border-border.rounded-md")).not.toBeNull();
    const hotelsIconChip = hotelsSec.querySelector(".size-7")!;
    expect(hotelsIconChip.className).toMatch(/\bbg-surface-sunken\b/);

    // The warnings section is NOT flagged here (the warn is mapped to crew).
    const warnSec = q.getByTestId(tid("section-warnings"));
    expect(within(warnSec).queryByText("Needs a look")).toBeNull();
  });

  test("UNMAPPED warn → the warnings section itself is flagged (chip + strong border)", () => {
    const d = sectionData({ warnings: [warning("unknown_section")] });
    expect(flaggedSetFor(d).has("warnings")).toBe(true); // §7 degradation rule
    const { q } = renderModal({ d });
    const warnSec = q.getByTestId(tid("section-warnings"));
    expect(within(warnSec).getByText("Needs a look")).toBeTruthy();
    expect(warnSec.querySelector(".border-border-strong.rounded-md")).not.toBeNull();
  });

  // spec 2026-07-07 §7.1/§7.3 — a section whose only warns are ambiguity-class is
  // JUDGMENT, not flagged: calm info-tone chrome, a "Parsed with judgment" pill (NOT
  // "Needs a look"), the judgment callout with its lead line + FIELD_LABELS entry text.
  test("judgment section: info-tone chip + 'Parsed with judgment' pill + judgment callout (never amber)", () => {
    const d = sectionData({ warnings: [judgmentWarning("rooms", "dims")] });
    const { q } = renderModal({ d });

    const roomsSec = q.getByTestId(tid("section-rooms"));
    // Judgment pill, not the amber "Needs a look".
    expect(within(roomsSec).getByText("Parsed with judgment")).toBeTruthy();
    expect(within(roomsSec).queryByText("Needs a look")).toBeNull();
    // Icon chip uses the info tone, never the amber warn tone.
    const iconChip = roomsSec.querySelector(".size-7")!;
    expect(iconChip.className).toMatch(/\bbg-info-bg\b/);
    expect(iconChip.className).not.toMatch(/\bbg-warning-bg\b/);
    // The callout renders in the judgment variant with its lead line + field label.
    const callout = q.getByTestId(`wizard-step3-card-${DFID}-section-rooms-flag-callout`);
    expect(callout.getAttribute("data-variant")).toBe("judgment");
    expect(callout.className).toMatch(/\bbg-info-bg\b/);
    expect(callout.className).not.toMatch(/\bbg-warning-bg\b/);
    expect(callout.textContent).toContain("We made a judgment call reading this. Worth a glance.");
    expect(callout.textContent).toContain("(dimensions)"); // FIELD_LABELS: dims → dimensions
  });
});

describe("Step3ReviewModal — conditional agenda + always-on warnings (spec §6.1)", () => {
  test("agendaBaseline empty → NO agenda rail item, chip, or section", () => {
    const { q } = renderModal();
    expect(q.queryByTestId(tid("rail-item-agenda"))).toBeNull();
    expect(q.queryByTestId(tid("chip-item-agenda"))).toBeNull();
    expect(q.queryByTestId(tid("section-agenda"))).toBeNull();
  });

  test("agendaBaseline non-empty → agenda appears in rail, chips, and sections (single 'Agenda' label, no count)", () => {
    __resetAgendaThrottleForTests();
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise<never>(() => {})), // pending forever — loading state
    );
    const d = sectionData(
      {},
      { agendaBaseline: [{ label: "Agenda PDF", badge: null, href: null, block: null }] },
    );
    const { q } = renderModal({ d });
    expect(q.getByTestId(tid("rail-item-agenda"))).toBeTruthy();
    expect(q.getByTestId(tid("chip-item-agenda"))).toBeTruthy();
    const sec = q.getByTestId(tid("section-agenda"));
    const h = sec.querySelector("h3")!;
    expect(h.textContent).toBe("Agenda");
    expect(h.parentElement!.textContent).not.toMatch(/\(\d+\)/); // agenda has no count
    // The body's card-context "Agenda" eyebrow must NOT double-render under the h3.
    expect(within(sec).getAllByText("Agenda")).toHaveLength(1);
    // No duplicate ids with the conditional section mounted either.
    const ids = Array.from(q.getByTestId(tid("modal")).querySelectorAll("[id]")).map((el) => el.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test("warnings section always renders — zero warnings → rail count 0 + affirmative empty state", () => {
    const { q, d } = renderModal();
    expect(d.warnings).toHaveLength(0);
    expect(
      q.getByTestId(tid("rail-item-warnings")).querySelector(".tabular-nums")?.textContent,
    ).toBe("0");
    const sec = q.getByTestId(tid("section-warnings"));
    expect(within(sec).getByText("No parse warnings for this sheet.")).toBeTruthy();
  });
});

describe("Step3ReviewModal — rail/chip click navigation (Task 5; shares Task 6's coordinate contract)", () => {
  /** jsdom has no Element scroll methods — stub scrollTo on the prototype. */
  function withScrollToStub(run: (scrollTo: ReturnType<typeof vi.fn>) => void) {
    const original = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "scrollTo");
    const scrollTo = vi.fn();
    Object.defineProperty(HTMLElement.prototype, "scrollTo", {
      value: scrollTo,
      configurable: true,
      writable: true,
    });
    try {
      run(scrollTo);
    } finally {
      if (original) Object.defineProperty(HTMLElement.prototype, "scrollTo", original);
      else delete (HTMLElement.prototype as { scrollTo?: unknown }).scrollTo;
    }
  }

  test("clicking a rail item moves aria-current in BOTH navs and scrolls the content pane", () => {
    withScrollToStub((scrollTo) => {
      const { q, d } = renderModal();
      const defs = step3Sections(d);
      const target = defs[defs.length - 1]!; // report (§D2 last) — far from the initial active
      fireEvent.click(q.getByTestId(tid(`rail-item-${target.id}`)));
      const rail = q.getByTestId(tid("rail"));
      const chiprail = q.getByTestId(tid("chiprail"));
      expect(rail.querySelectorAll('[aria-current="true"]')).toHaveLength(1);
      expect(rail.querySelector('[aria-current="true"]')).toBe(
        q.getByTestId(tid(`rail-item-${target.id}`)),
      );
      expect(chiprail.querySelectorAll('[aria-current="true"]')).toHaveLength(1);
      expect(chiprail.querySelector('[aria-current="true"]')).toBe(
        q.getByTestId(tid(`chip-item-${target.id}`)),
      );
      expect(scrollTo).toHaveBeenCalledTimes(1);
    });
  });

  test("clicking a chip moves aria-current in BOTH navs and scrolls", () => {
    withScrollToStub((scrollTo) => {
      const { q, d } = renderModal();
      const target = step3Sections(d).find((s) => s.id === "crew")!;
      fireEvent.click(q.getByTestId(tid(`chip-item-${target.id}`)));
      expect(q.getByTestId(tid("rail")).querySelector('[aria-current="true"]')).toBe(
        q.getByTestId(tid(`rail-item-${target.id}`)),
      );
      expect(q.getByTestId(tid("chiprail")).querySelector('[aria-current="true"]')).toBe(
        q.getByTestId(tid(`chip-item-${target.id}`)),
      );
      expect(scrollTo).toHaveBeenCalled();
    });
  });
});

describe("Step3ReviewModal — activeSectionFor pure rule (Task 6, spec §6.3a)", () => {
  // Fixture per the task-6 brief: tops strictly increasing in registry order.
  // Every expectation below is derived from THIS array (by index/property),
  // never a hardcoded id — anti-tautology.
  const CLIENT_HEIGHT = 600;
  const SCROLL_HEIGHT = 1800;
  const sectionTops: ReadonlyArray<{ id: SectionId; top: number }> = [
    { id: "venue", top: 0 },
    { id: "crew", top: 400 },
    { id: "warnings", top: 1200 },
  ];

  test("exactly at an offset line: scrollTop = nextTop − SCROLL_SPY_OFFSET_PX activates that section", () => {
    const boundary = sectionTops[1]!;
    const scrollTop = boundary.top - SCROLL_SPY_OFFSET_PX;
    expect(activeSectionFor(scrollTop, CLIENT_HEIGHT, SCROLL_HEIGHT, sectionTops)).toBe(
      boundary.id,
    );
  });

  test("between two section tops: the earlier one stays active until the next crosses the offset line", () => {
    const scrollTop = sectionTops[1]!.top + 100;
    // Sanity-check the fixture actually exercises "between" (not yet past the
    // next section's own offset line).
    expect(scrollTop + SCROLL_SPY_OFFSET_PX).toBeLessThan(sectionTops[2]!.top);
    expect(activeSectionFor(scrollTop, CLIENT_HEIGHT, SCROLL_HEIGHT, sectionTops)).toBe(
      sectionTops[1]!.id,
    );
  });

  test("tall-section span: deep inside a tall section, short of the next section's offset line, keeps it active", () => {
    const scrollTop = sectionTops[0]!.top + 300; // 300px into the first section's 400px span
    expect(scrollTop + SCROLL_SPY_OFFSET_PX).toBeLessThan(sectionTops[1]!.top);
    expect(activeSectionFor(scrollTop, CLIENT_HEIGHT, SCROLL_HEIGHT, sectionTops)).toBe(
      sectionTops[0]!.id,
    );
  });

  test("above the first section's offset line: no top qualifies, so the first rendered section wins", () => {
    // A dedicated fixture whose FIRST top itself sits beyond scrollTop+offset
    // — this exercises the "none qualifies" fallback branch distinctly from
    // a coincidental match on the first entry.
    const aboveFirstTops: ReadonlyArray<{ id: SectionId; top: number }> = [
      { id: "venue", top: 150 },
      { id: "crew", top: 500 },
      { id: "warnings", top: 1300 },
    ];
    const scrollTop = 0;
    expect(scrollTop + SCROLL_SPY_OFFSET_PX).toBeLessThan(aboveFirstTops[0]!.top);
    expect(activeSectionFor(scrollTop, CLIENT_HEIGHT, SCROLL_HEIGHT, aboveFirstTops)).toBe(
      aboveFirstTops[0]!.id,
    );
  });

  test("bottom clamp: scrolled to the bottom activates the last section even though its top is still beyond the offset line", () => {
    // Dedicated fixture where the last top is deliberately far enough that,
    // WITHOUT the clamp, the ordinary rule would pick an earlier section —
    // proving the clamp (not a coincidental match) drives the result.
    const bottomClampTops: ReadonlyArray<{ id: SectionId; top: number }> = [
      { id: "venue", top: 0 },
      { id: "crew", top: 400 },
      { id: "warnings", top: 1400 },
    ];
    const scrollTop = SCROLL_HEIGHT - CLIENT_HEIGHT; // 1200 — exactly at the bottom
    expect(scrollTop + CLIENT_HEIGHT).toBeGreaterThanOrEqual(SCROLL_HEIGHT - 1);
    expect(scrollTop + SCROLL_SPY_OFFSET_PX).toBeLessThan(bottomClampTops[2]!.top);
    expect(activeSectionFor(scrollTop, CLIENT_HEIGHT, SCROLL_HEIGHT, bottomClampTops)).toBe(
      bottomClampTops[bottomClampTops.length - 1]!.id,
    );
  });
});

describe("Step3ReviewModal — scroll-spy wiring (Task 6, spec §6.3a)", () => {
  /** jsdom computes no real layout: every `getBoundingClientRect()` returns
   *  zeros and `clientHeight`/`scrollHeight` read 0 unless stubbed. Stub
   *  `getBoundingClientRect` per-element (keyed by identity) so the
   *  component's container-relative math (`sectionTop = section.rect.top −
   *  scroller.rect.top + scroller.scrollTop`) sees the geometry this test
   *  wants. */
  function stubGetBoundingClientRect(rectsByEl: Map<Element, number>) {
    const original = Element.prototype.getBoundingClientRect;
    Element.prototype.getBoundingClientRect = function (this: Element) {
      const top = rectsByEl.get(this) ?? 0;
      return {
        top,
        bottom: top,
        left: 0,
        right: 0,
        width: 0,
        height: 0,
        x: 0,
        y: top,
        toJSON() {
          return {};
        },
      } as DOMRect;
    };
    return () => {
      Element.prototype.getBoundingClientRect = original;
    };
  }

  test("scrolling the content pane recomputes active via the container-relative rule (rAF-throttled)", () => {
    // Run requestAnimationFrame synchronously so the rAF-throttled scroll
    // handler resolves within this tick.
    vi.stubGlobal("requestAnimationFrame", ((cb: FrameRequestCallback) => {
      cb(0);
      return 0;
    }) as typeof requestAnimationFrame);
    vi.stubGlobal("cancelAnimationFrame", (() => {}) as typeof cancelAnimationFrame);

    const { q, d } = renderModal();
    const defs = step3Sections(d);
    const targetIndex = Math.floor(defs.length / 2); // interior — distinct from first AND last
    const target = defs[targetIndex]!;
    expect(target.id).not.toBe(defs[0]!.id);
    expect(target.id).not.toBe(defs[defs.length - 1]!.id);

    const content = q.getByTestId(tid("content"));
    const targetTop = targetIndex * 1000; // absolute (container-relative) top
    const scrollTop = targetTop + 10; // past target's own line, short of the next section's

    // `getBoundingClientRect().top` is VIEWPORT-relative — it shrinks as the
    // pane scrolls down — while the component's formula
    // (`sectionTop = rect.top − scroller.rect.top + scroller.scrollTop`)
    // recovers the absolute container-relative top. So each stub here is the
    // absolute top MINUS the scroll position, matching what a real scrolled
    // pane would report (can be negative for sections already scrolled past).
    const rects = new Map<Element, number>();
    rects.set(content, 0); // scroller's own rect.top — the coordinate origin
    defs.forEach((s, i) => {
      rects.set(q.getByTestId(tid(`section-${s.id}`)), i * 1000 - scrollTop);
    });
    const restoreRects = stubGetBoundingClientRect(rects);
    try {
      const scrollHeight = defs.length * 1000 + 400;
      Object.defineProperty(content, "clientHeight", { value: 600, configurable: true });
      Object.defineProperty(content, "scrollHeight", {
        value: scrollHeight,
        configurable: true,
      });
      // Sanity-check this scroll position doesn't accidentally trip the
      // bottom clamp — the assertion below is exercising the ordinary rule.
      expect(scrollTop + 600).toBeLessThan(scrollHeight - 1);
      content.scrollTop = scrollTop;

      fireEvent.scroll(content);

      expect(q.getByTestId(tid("rail")).querySelector('[aria-current="true"]')).toBe(
        q.getByTestId(tid(`rail-item-${target.id}`)),
      );
      expect(q.getByTestId(tid("chiprail")).querySelector('[aria-current="true"]')).toBe(
        q.getByTestId(tid(`chip-item-${target.id}`)),
      );
    } finally {
      restoreRects();
    }
  });
});

// ── Nav-click scroll-spy suppression (Task 10, spec §A2; §H N1) ──────────────

describe("Step3ReviewModal — nav-click scroll-spy suppression (Task 10, spec §A2)", () => {
  let restoreRects: (() => void) | null = null;
  let restoreRaf: (() => void) | null = null;
  let originalScrollTo: PropertyDescriptor | undefined;
  let hadScrollTo = false;

  afterEach(() => {
    restoreRects?.();
    restoreRects = null;
    restoreRaf?.();
    restoreRaf = null;
    if (hadScrollTo) {
      if (originalScrollTo) {
        Object.defineProperty(HTMLElement.prototype, "scrollTo", originalScrollTo);
      } else {
        delete (HTMLElement.prototype as { scrollTo?: unknown }).scrollTo;
      }
      hadScrollTo = false;
      originalScrollTo = undefined;
    }
    vi.useRealTimers();
  });

  /** Harness per the task-10 brief: fake timers, rAF mapped onto 0ms fake
   *  timeouts (a SYNCHRONOUS rAF stub would break the component's throttle —
   *  `rafId = requestAnimationFrame(evaluate)` assigns AFTER the callback
   *  already reset rafId to null, permanently wedging the gate; manual
   *  assignment, NOT vi.stubGlobal, for deterministic restore order vs
   *  useFakeTimers), prototype `scrollTo` stub, and DYNAMIC per-element
   *  geometry: the content pane is the coordinate origin (rect.top always 0);
   *  each section's viewport-relative top = absoluteTop − content.scrollTop —
   *  exactly what a real scrolled pane reports — so `sectionTopFor` recovers
   *  the absolute container-relative top at ANY scroll position. */
  function setup(
    opts: {
      d?: StagedSectionData;
      clientHeight?: number;
      /** scrollHeight as a function of the section count n. */
      scrollHeight?: (n: number) => number;
      /** Absolute container-relative top of section i (of n). */
      absTop?: (i: number, n: number) => number;
    } = {},
  ) {
    vi.useFakeTimers();
    const realRaf = window.requestAnimationFrame;
    const realCaf = window.cancelAnimationFrame;
    window.requestAnimationFrame = ((cb: FrameRequestCallback) =>
      setTimeout(() => cb(0), 0) as unknown as number) as typeof requestAnimationFrame;
    window.cancelAnimationFrame = ((id: number) =>
      clearTimeout(id as unknown as ReturnType<typeof setTimeout>)) as typeof cancelAnimationFrame;
    restoreRaf = () => {
      window.requestAnimationFrame = realRaf;
      window.cancelAnimationFrame = realCaf;
    };
    originalScrollTo = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "scrollTo");
    hadScrollTo = true;
    const scrollTo = vi.fn();
    Object.defineProperty(HTMLElement.prototype, "scrollTo", {
      value: scrollTo,
      configurable: true,
      writable: true,
    });

    const { q, d } = renderModal(opts.d ? { d: opts.d } : {});
    const defs = step3Sections(d);
    const n = defs.length;
    const content = q.getByTestId(tid("content"));
    const clientHeight = opts.clientHeight ?? 600;
    const scrollHeight = (opts.scrollHeight ?? ((k: number) => k * 1000 + 400))(n);
    Object.defineProperty(content, "clientHeight", { value: clientHeight, configurable: true });
    Object.defineProperty(content, "scrollHeight", { value: scrollHeight, configurable: true });
    const absTopOf = opts.absTop ?? ((i: number) => i * 1000);
    const absTops = new Map<Element, number>();
    defs.forEach((s, i) => absTops.set(q.getByTestId(tid(`section-${s.id}`)), absTopOf(i, n)));
    const originalRects = Element.prototype.getBoundingClientRect;
    Element.prototype.getBoundingClientRect = function (this: Element) {
      const abs = absTops.get(this);
      const top = this === content || abs === undefined ? 0 : abs - content.scrollTop;
      return {
        top,
        bottom: top,
        left: 0,
        right: 0,
        width: 0,
        height: 0,
        x: 0,
        y: top,
        toJSON() {
          return {};
        },
      } as DOMRect;
    };
    restoreRects = () => {
      Element.prototype.getBoundingClientRect = originalRects;
    };
    return {
      q,
      d,
      defs,
      content,
      scrollTo,
      clientHeight,
      scrollHeight,
      maxTop: scrollHeight - clientHeight,
      absTop: (i: number) => absTopOf(i, n),
      tops: defs.map((s, i) => ({ id: s.id, top: absTopOf(i, n) })),
    };
  }

  /** aria-current holder's section id, read off the given nav. */
  function navActiveId(q: ReturnType<typeof renderModal>["q"], nav: "rail" | "chiprail"): string {
    const item = nav === "rail" ? "rail-item-" : "chip-item-";
    const current = q.getByTestId(tid(nav)).querySelector('[aria-current="true"]');
    expect(current).not.toBeNull();
    return current!.getAttribute("data-testid")!.replace(tid(item), "");
  }

  /** One scroll "frame": set the position, dispatch, and run the 0ms
   *  rAF-timeout so the throttled evaluate() executes for THIS event. */
  function scrollAt(content: HTMLElement, top: number) {
    content.scrollTop = top;
    fireEvent.scroll(content);
    act(() => {
      vi.advanceTimersByTime(0);
    });
  }

  test("§H N1: after a far rail click, aria-current NEVER visits any id other than {pre-click, clicked} across intermediate glide frames — on BOTH navs", () => {
    const { q, defs, content, scrollTo, clientHeight, scrollHeight, absTop, tops } = setup();
    expect(navActiveId(q, "rail")).toBe(defs[0]!.id); // pre-click
    const target = defs[defs.length - 1]!;
    fireEvent.click(q.getByTestId(tid(`rail-item-${target.id}`)));
    // Clicked id is active immediately, before any scroll event fires.
    expect(navActiveId(q, "rail")).toBe(target.id);
    expect(navActiveId(q, "chiprail")).toBe(target.id);
    expect(scrollTo).toHaveBeenCalledTimes(1);
    // Simulate the smooth glide's intermediate frames. Sanity per frame: the
    // pure rule WOULD derive a different id — only suppression holds it.
    const intermediates = [1, Math.floor(defs.length / 2), defs.length - 2].map(
      (i) => absTop(i) + 10,
    );
    for (const top of intermediates) {
      expect(activeSectionFor(top, clientHeight, scrollHeight, tops)).not.toBe(target.id);
      scrollAt(content, top);
      expect(navActiveId(q, "rail")).toBe(target.id);
      expect(navActiveId(q, "chiprail")).toBe(target.id); // shared state — chip rail benefits too
    }
  });

  test("settled release falls through to derivation on the SAME frame (|scrollTop − target| ≤ ε)", () => {
    // Custom geometry: the LAST section sits only 50px below the second-to-last
    // (inside SCROLL_SPY_OFFSET_PX), so the settled position derives a
    // DIFFERENT id than the clicked one — proving the release fell through to
    // derivation within the SAME scroll dispatch (not a later frame).
    const { q, defs, content, absTop } = setup({
      absTop: (i, n) => (i === n - 1 ? (n - 2) * 1000 + 50 : i * 1000),
    });
    const clicked = defs[defs.length - 2]!;
    const slidesTo = defs[defs.length - 1]!;
    fireEvent.click(q.getByTestId(tid(`rail-item-${clicked.id}`)));
    const targetTop = absTop(defs.length - 2) - 8; // sectionTopFor − 8 (unclamped here)
    // Mid-glide frame far from the target: held.
    scrollAt(content, absTop(1) + 10);
    expect(navActiveId(q, "rail")).toBe(clicked.id);
    // Within epsilon of the target: released + derived on this SAME dispatch.
    scrollAt(content, targetTop + NAV_SCROLL_SETTLE_EPSILON_PX);
    expect(navActiveId(q, "rail")).toBe(slidesTo.id);
  });

  test("bottom-clamp release: a target that IS the bottom releases when the pane hits the bottom, even outside ε", () => {
    // scrollHeight small enough that the last section's target exceeds maxTop
    // → beginSuppressedScroll clamps it to the bottom.
    const { q, defs, content, scrollHeight, maxTop, absTop } = setup({
      scrollHeight: (n) => (n - 1) * 1000 + 400,
    });
    const target = defs[defs.length - 1]!;
    expect(absTop(defs.length - 1) - 8).toBeGreaterThan(maxTop); // fixture sanity: clamped
    fireEvent.click(q.getByTestId(tid(`rail-item-${target.id}`)));
    // The pane resizes mid-glide (e.g. viewport change): the glide stops at the
    // NEW bottom, 50px short of the clamped target — outside ε, so only the
    // bottom-clamp condition can release.
    Object.defineProperty(content, "clientHeight", { value: 650, configurable: true });
    const newBottom = scrollHeight - 650;
    expect(Math.abs(newBottom - maxTop)).toBeGreaterThan(NAV_SCROLL_SETTLE_EPSILON_PX);
    scrollAt(content, newBottom);
    // Released (derivation at the bottom picks the last section = clicked id);
    // the NEXT frame re-derives freely — no timers advanced, no user input.
    scrollAt(content, absTop(1) + 10);
    expect(navActiveId(q, "rail")).toBe(defs[1]!.id);
  });

  test("upward-from-bottom HOLD: parked at the bottom, clicking a target well above max scroll does NOT release on a still-at-bottom frame", () => {
    const { q, defs, content, maxTop } = setup();
    // Park at the bottom — derivation puts the LAST section active.
    scrollAt(content, maxTop);
    expect(navActiveId(q, "rail")).toBe(defs[defs.length - 1]!.id);
    // Click the FIRST section (target clamps to 0 — nowhere near the bottom).
    fireEvent.click(q.getByTestId(tid(`rail-item-${defs[0]!.id}`)));
    expect(navActiveId(q, "rail")).toBe(defs[0]!.id);
    // Glide barely started: a scroll frame still AT the bottom satisfies the
    // naive bottom-clamp check — but the target is not the bottom, so the
    // suppression must HOLD (a release here would re-derive the bottom
    // section: the reported flicker's edge case).
    scrollAt(content, maxTop);
    expect(navActiveId(q, "rail")).toBe(defs[0]!.id);
  });

  test("timeout release (zero-event glide): idle for NAV_SCROLL_SETTLE_TIMEOUT_MS with no scroll progress → released; in-flight progress RESTARTS the fallback (Task 14)", () => {
    const { q, defs, content, absTop } = setup();
    const target = defs[defs.length - 1]!;
    fireEvent.click(q.getByTestId(tid(`rail-item-${target.id}`)));
    const unrelated = absTop(1) + 10;
    // In-flight progress restarts the fallback (Task 14 real-browser finding:
    // healthy glides can exceed the window — a mid-glide scroll frame is
    // neither zero-event nor interrupted, so it pushes the timeout out).
    act(() => {
      vi.advanceTimersByTime(NAV_SCROLL_SETTLE_TIMEOUT_MS - 1);
    });
    scrollAt(content, unrelated); // progress at T−1 → held AND restarted
    expect(navActiveId(q, "rail")).toBe(target.id);
    act(() => {
      vi.advanceTimersByTime(NAV_SCROLL_SETTLE_TIMEOUT_MS - 1);
    });
    scrollAt(content, unrelated); // pre-restart remainder never fires → held
    expect(navActiveId(q, "rail")).toBe(target.id);
    // Zero-event/interrupted core: a FULL idle window with no scroll progress
    // releases; the next scroll frame re-derives from position.
    act(() => {
      vi.advanceTimersByTime(NAV_SCROLL_SETTLE_TIMEOUT_MS);
    });
    scrollAt(content, unrelated);
    expect(navActiveId(q, "rail")).toBe(defs[1]!.id); // released — spy re-derives
  });

  test.each(["wheel", "touchstart", "pointerdown"] as const)(
    "user-input release: %s on the scroller cancels the override — the next scroll re-derives instantly",
    (eventType) => {
      const { q, defs, content, absTop } = setup();
      const target = defs[defs.length - 1]!;
      fireEvent.click(q.getByTestId(tid(`rail-item-${target.id}`)));
      const unrelated = absTop(1) + 10;
      scrollAt(content, unrelated);
      expect(navActiveId(q, "rail")).toBe(target.id); // suppressed before the input
      if (eventType === "wheel") fireEvent.wheel(content);
      else if (eventType === "touchstart") fireEvent.touchStart(content);
      else fireEvent.pointerDown(content);
      scrollAt(content, unrelated);
      expect(navActiveId(q, "rail")).toBe(defs[1]!.id);
    },
  );

  test("pre-scroll immediate release: already within ε of the target → suppression never engages (no scroll event will fire)", () => {
    const { q, defs, content, scrollTo, absTop } = setup();
    const k = Math.floor(defs.length / 2);
    // Park exactly at section k's click target.
    scrollAt(content, absTop(k) - 8);
    expect(navActiveId(q, "rail")).toBe(defs[k]!.id);
    fireEvent.click(q.getByTestId(tid(`rail-item-${defs[k]!.id}`)));
    expect(scrollTo).toHaveBeenLastCalledWith({ top: absTop(k) - 8 });
    // A subsequent scroll re-derives IMMEDIATELY — no timer advance, no user
    // input — proving no suppression window was opened.
    scrollAt(content, absTop(1) + 10);
    expect(navActiveId(q, "rail")).toBe(defs[1]!.id);
  });

  test("replace-not-queue: a second nav click mid-suppression replaces the target and restarts the timeout", () => {
    const { q, defs, content, absTop } = setup();
    const first = defs[defs.length - 1]!;
    const second = defs[defs.length - 3]!;
    fireEvent.click(q.getByTestId(tid(`rail-item-${first.id}`)));
    act(() => {
      vi.advanceTimersByTime(NAV_SCROLL_SETTLE_TIMEOUT_MS - 1);
    });
    fireEvent.click(q.getByTestId(tid(`rail-item-${second.id}`)));
    expect(navActiveId(q, "rail")).toBe(second.id);
    // The FIRST click's target no longer releases: settling at it holds.
    scrollAt(content, absTop(defs.length - 1) - 8);
    expect(navActiveId(q, "rail")).toBe(second.id);
    // The FIRST click's timeout (1ms away when replaced) was cleared: at
    // NEW-timeout−1 the suppression still holds (this scroll frame is also
    // in-flight progress, which restarts the fallback — Task 14)…
    act(() => {
      vi.advanceTimersByTime(NAV_SCROLL_SETTLE_TIMEOUT_MS - 1);
    });
    scrollAt(content, absTop(1) + 10);
    expect(navActiveId(q, "rail")).toBe(second.id);
    // …and releases after a FULL idle window with no further scroll progress.
    act(() => {
      vi.advanceTimersByTime(NAV_SCROLL_SETTLE_TIMEOUT_MS);
    });
    scrollAt(content, absTop(1) + 10);
    expect(navActiveId(q, "rail")).toBe(defs[1]!.id);
  });

  test("unmount mid-suppression: no timer leaks; scroll + wheel/touchstart/pointerdown listeners all removed", () => {
    const { q, defs, content } = setup();
    fireEvent.click(q.getByTestId(tid(`rail-item-${defs[defs.length - 1]!.id}`)));
    const removeSpy = vi.spyOn(content, "removeEventListener");
    q.unmount();
    expect(() => vi.runAllTimers()).not.toThrow();
    const removed = removeSpy.mock.calls.map((c) => c[0]);
    for (const type of ["scroll", "wheel", "touchstart", "pointerdown"]) {
      expect(removed).toContain(type);
    }
  });

  test("§E4 jump threads the SAME suppression: after a warning jump, intermediate frames hold 'warnings'; timeout still releases", () => {
    const d = sectionData({ warnings: [warning("crew")] });
    const { q, defs, content, absTop } = setup({ d });
    // Park mid-pane so the jump target (container-relative li top − 8) differs
    // from the current position by more than ε.
    scrollAt(content, absTop(1) + 10);
    expect(navActiveId(q, "rail")).toBe(defs[1]!.id);
    const callout = q.getByTestId(`wizard-step3-card-${DFID}-section-crew-flag-callout`);
    fireEvent.click(within(callout).getByRole("button", { name: /View details/ }));
    expect(navActiveId(q, "rail")).toBe("warnings");
    // Mid-glide frame at an unrelated position: held on 'warnings'.
    scrollAt(content, absTop(2) + 10);
    expect(navActiveId(q, "rail")).toBe("warnings");
    // Timeout releases the jump's suppression exactly like a rail click's.
    act(() => {
      vi.advanceTimersByTime(NAV_SCROLL_SETTLE_TIMEOUT_MS);
    });
    scrollAt(content, absTop(2) + 10);
    expect(navActiveId(q, "rail")).toBe(defs[2]!.id);
  });
});

// ── Sliding rail indicator (Task 10, spec §A3) ───────────────────────────────

describe("Step3ReviewModal — sliding rail indicator (Task 10, spec §A3)", () => {
  // Stubbed rail geometry (jsdom computes no layout). Values are arbitrary but
  // non-zero; every expectation below is DERIVED from these constants + the
  // exported INDICATOR_INSET_PX — never restated literals.
  const NAV_TOP = 40;
  const NAV_HEIGHT = 400;
  const FIRST_ITEM_OFFSET = 8; // first button's top below the nav's top
  const ITEM_STRIDE = 48;
  const ITEM_HEIGHT = 44;

  let restoreRects: (() => void) | null = null;
  let restoreRaf: (() => void) | null = null;

  afterEach(() => {
    restoreRects?.();
    restoreRects = null;
    restoreRaf?.();
    restoreRaf = null;
  });

  /** Per-element rects keyed by data-testid: the rail nav and its item
   *  buttons get real-looking geometry; everything else stays 0 (so the
   *  scroll-spy's zero-pane guard keeps it inert). Installed BEFORE render —
   *  the measurement useLayoutEffect runs on mount. */
  function stubRailGeometry() {
    const original = Element.prototype.getBoundingClientRect;
    Element.prototype.getBoundingClientRect = function (this: Element) {
      const t = this.getAttribute("data-testid") ?? "";
      let top = 0;
      let height = 0;
      if (t === tid("rail")) {
        top = NAV_TOP;
        height = NAV_HEIGHT;
      } else if (t.includes("-review-rail-item-")) {
        const items = Array.from(document.querySelectorAll('[data-testid*="-review-rail-item-"]'));
        top = NAV_TOP + FIRST_ITEM_OFFSET + items.indexOf(this) * ITEM_STRIDE;
        height = ITEM_HEIGHT;
      }
      return {
        top,
        bottom: top + height,
        left: 0,
        right: 0,
        width: 0,
        height,
        x: 0,
        y: top,
        toJSON() {
          return {};
        },
      } as DOMRect;
    };
    restoreRects = () => {
      Element.prototype.getBoundingClientRect = original;
    };
  }

  /** Queue-based rAF: callbacks run only when flush() is called, so the test
   *  can observe the FIRST paint (before the transition-enable tick). */
  function stubRafQueue() {
    const queue: FrameRequestCallback[] = [];
    const realRaf = window.requestAnimationFrame;
    const realCaf = window.cancelAnimationFrame;
    window.requestAnimationFrame = ((cb: FrameRequestCallback) => {
      queue.push(cb);
      return queue.length;
    }) as typeof requestAnimationFrame;
    window.cancelAnimationFrame = (() => {}) as typeof cancelAnimationFrame;
    restoreRaf = () => {
      window.requestAnimationFrame = realRaf;
      window.cancelAnimationFrame = realCaf;
    };
    return {
      flush: () =>
        act(() => {
          for (const cb of queue.splice(0)) cb(0);
        }),
    };
  }

  function expectedY(itemIndex: number, navScrollTop = 0): number {
    // y = btnRect.top − navRect.top + nav.scrollTop + INDICATOR_INSET_PX (§A3)
    return FIRST_ITEM_OFFSET + itemIndex * ITEM_STRIDE + navScrollTop + INDICATOR_INSET_PX;
  }
  const EXPECTED_H = ITEM_HEIGHT - 2 * INDICATOR_INSET_PX;

  test("exactly ONE indicator: aria-hidden, FIRST child of the rail nav (nav is `relative`); per-item spans gone; transform/height derived from the active button's rect", () => {
    stubRailGeometry();
    const { flush } = stubRafQueue();
    const { q } = renderModal();
    flush();
    const rail = q.getByTestId(tid("rail"));
    expect(rail.className).toMatch(/\brelative\b/);
    const indicator = q.getByTestId(tid("rail-indicator"));
    expect(indicator.getAttribute("aria-hidden")).toBe("true");
    expect(rail.firstElementChild).toBe(indicator);
    // ONE indicator element in the whole modal; ZERO per-item accent spans.
    expect(
      q.getByTestId(tid("modal")).querySelectorAll(`[data-testid="${tid("rail-indicator")}"]`),
    ).toHaveLength(1);
    expect(rail.querySelectorAll(".inset-y-3")).toHaveLength(0);
    const accentEls = rail.querySelectorAll(".bg-accent");
    expect(accentEls).toHaveLength(1);
    expect(accentEls[0]).toBe(indicator);
    for (const c of ["absolute", "left-0", "w-1", "rounded-r-pill", "bg-accent"]) {
      expect(indicator.className.split(/\s+/)).toContain(c);
    }
    // Active = first registry section (index 0): position from ITS stubbed rect.
    expect(indicator.style.transform).toBe(`translateY(${expectedY(0)}px)`);
    expect(indicator.style.height).toBe(`${EXPECTED_H}px`);
  });

  test("first mount applies position WITHOUT transition classes; the enable tick adds them (no slide-in from 0; motion-reduce collapse included)", () => {
    stubRailGeometry();
    const { flush } = stubRafQueue();
    const { q } = renderModal();
    const indicator = q.getByTestId(tid("rail-indicator"));
    // BEFORE the enable tick: measured position, NO transition classes — the
    // first paint must not animate from translateY(0) (and reduced-motion
    // first-mount cannot animate either: there is nothing to transition).
    expect(indicator.style.transform).toBe(`translateY(${expectedY(0)}px)`);
    expect(indicator.className).not.toMatch(/transition-\[/);
    flush();
    const classes = q.getByTestId(tid("rail-indicator")).className.split(/\s+/);
    for (const c of [
      "transition-[transform,height]",
      "duration-fast",
      "ease-out-quart",
      "motion-reduce:transition-none",
    ]) {
      expect(classes).toContain(c);
    }
  });

  test("clicking another rail item slides the indicator: transform re-measured from that button's rect + nav.scrollTop; transition classes retained", () => {
    stubRailGeometry();
    const { flush } = stubRafQueue();
    const { q, d } = renderModal();
    flush();
    const defs = step3Sections(d);
    const k = 3;
    const rail = q.getByTestId(tid("rail"));
    rail.scrollTop = 60; // pins the `+ nav.scrollTop` term of the §A3 formula
    fireEvent.click(q.getByTestId(tid(`rail-item-${defs[k]!.id}`)));
    const indicator = q.getByTestId(tid("rail-indicator"));
    expect(indicator.style.transform).toBe(`translateY(${expectedY(k, 60)}px)`);
    expect(indicator.style.height).toBe(`${EXPECTED_H}px`);
    expect(indicator.className).toMatch(/transition-\[transform,height\]/);
  });

  test("unmeasurable geometry (jsdom zeros — no stub) → indicator hidden (null render); rail items render normally", () => {
    const { q } = renderModal();
    expect(q.queryByTestId(tid("rail-indicator"))).toBeNull();
    expect(
      q.getByTestId(tid("rail")).querySelectorAll('[data-testid*="-review-rail-item-"]').length,
    ).toBeGreaterThan(0);
  });
});

// ── Sheet drag-to-dismiss (Task 7, spec §10; §11 T3–T5, C1, C2, C5, C6) ──────

describe("Step3ReviewModal — sheet drag-to-dismiss (Task 7, spec §10)", () => {
  // Derived pointer travels (anti-tautology: computed from the module
  // constants, never restated literals).
  const DISMISS_DY = DRAG_DISMISS_THRESHOLD_PX + 30; // past the dismiss line
  const SPRING_DY = Math.floor((DRAG_SLOP_PX + DRAG_DISMISS_THRESHOLD_PX) / 2); // between slop and dismiss
  const START_Y = 100;

  afterEach(() => {
    vi.useRealTimers();
  });

  /** jsdom implements neither pointer capture nor matchMedia — stub capture on
   *  the grab button (per the task brief) so the component's capture calls are
   *  observable. */
  function grabWithCaptureStubs(q: ReturnType<typeof renderModal>["q"]) {
    const grab = q.getByTestId(tid("grab"));
    const setPointerCapture = vi.fn();
    const releasePointerCapture = vi.fn();
    Object.assign(grab, { setPointerCapture, releasePointerCapture });
    const panel = document.querySelector<HTMLElement>("[data-step3-review-panel]");
    if (!panel) throw new Error("panel not rendered");
    return { grab, panel, setPointerCapture, releasePointerCapture };
  }

  /** matchMedia mock with capturable listeners (jsdom has none natively). */
  function stubMatchMedia() {
    const listeners: Array<(ev: { matches: boolean }) => void> = [];
    const removed: unknown[] = [];
    const queries: string[] = [];
    vi.stubGlobal(
      "matchMedia",
      vi.fn((query: string) => {
        queries.push(query);
        return {
          matches: false,
          media: query,
          addEventListener: (_type: string, cb: (ev: { matches: boolean }) => void) => {
            listeners.push(cb);
          },
          removeEventListener: (_type: string, cb: unknown) => {
            removed.push(cb);
            const i = listeners.indexOf(cb as (ev: { matches: boolean }) => void);
            if (i >= 0) listeners.splice(i, 1);
          },
        };
      }),
    );
    return {
      queries,
      listeners,
      removed,
      fire(matches: boolean) {
        for (const cb of [...listeners]) cb({ matches });
      },
    };
  }

  test("sanity: the derived travels actually straddle the constants' boundaries", () => {
    expect(DRAG_SLOP_PX).toBeGreaterThan(0);
    expect(DRAG_SLOP_PX + 1).toBeLessThan(DRAG_DISMISS_THRESHOLD_PX);
    expect(SPRING_DY).toBeGreaterThan(DRAG_SLOP_PX);
    expect(SPRING_DY).toBeLessThanOrEqual(DRAG_DISMISS_THRESHOLD_PX);
    expect(DISMISS_DY).toBeGreaterThan(DRAG_DISMISS_THRESHOLD_PX);
  });

  test("grab strip declares touch-action none (C5 — no scroll/drag contention)", () => {
    const { q } = renderModal();
    expect(q.getByTestId(tid("grab")).className).toMatch(/\btouch-none\b/);
  });

  test("during drag (T3/C1): pointer captured, transition AND animation none, transform tracks max(0, dy)", () => {
    const { q } = renderModal();
    const { grab, panel, setPointerCapture } = grabWithCaptureStubs(q);

    fireEvent.pointerDown(grab, { pointerId: 7, clientY: START_Y });
    expect(setPointerCapture).toHaveBeenCalledWith(7);
    // C1: the entrance is a CSS *animation* — both must be neutralized so the
    // inline transform takes over mid-entrance.
    expect(panel.style.transition).toBe("none");
    expect(panel.style.animation).toBe("none");

    fireEvent.pointerMove(grab, { pointerId: 7, clientY: START_Y + SPRING_DY });
    expect(panel.style.transform).toBe(`translateY(${SPRING_DY}px)`);

    // Upward travel clamps at 0 — the sheet never rises above its resting spot.
    fireEvent.pointerMove(grab, { pointerId: 7, clientY: START_Y - 40 });
    expect(panel.style.transform).toBe("translateY(0px)");
  });

  test("release past DRAG_DISMISS_THRESHOLD_PX (T5): token transition to translateY(100%), close on transitionend", () => {
    const { q, onClose } = renderModal();
    const { grab, panel } = grabWithCaptureStubs(q);

    fireEvent.pointerDown(grab, { pointerId: 1, clientY: START_Y });
    fireEvent.pointerMove(grab, { pointerId: 1, clientY: START_Y + DISMISS_DY });
    fireEvent.pointerUp(grab, { pointerId: 1, clientY: START_Y + DISMISS_DY });

    expect(panel.style.transform).toBe("translateY(100%)");
    expect(panel.style.transition).toBe("transform var(--duration-normal) var(--ease-out-quart)");
    expect(onClose).not.toHaveBeenCalled(); // waits for the transition

    fireEvent.transitionEnd(panel, { propertyName: "transform" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test("dismiss fallback (T5): onClose fires after the 220ms token-matched timeout when transitionend never arrives", () => {
    vi.useFakeTimers();
    const { q, onClose } = renderModal();
    const { grab, panel } = grabWithCaptureStubs(q);

    fireEvent.pointerDown(grab, { pointerId: 1, clientY: START_Y });
    fireEvent.pointerMove(grab, { pointerId: 1, clientY: START_Y + DISMISS_DY });
    fireEvent.pointerUp(grab, { pointerId: 1, clientY: START_Y + DISMISS_DY });

    vi.advanceTimersByTime(DURATION_NORMAL_FALLBACK_MS - 1);
    expect(onClose).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onClose).toHaveBeenCalledTimes(1);

    // A late transitionend after the fallback fired must NOT double-close.
    fireEvent.transitionEnd(panel, { propertyName: "transform" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test("release below the threshold (T4): springs back at --duration-fast, suppresses the synthesized click, and settles to stylesheet control", () => {
    vi.useFakeTimers();
    const { q, onClose } = renderModal();
    const { grab, panel } = grabWithCaptureStubs(q);

    fireEvent.pointerDown(grab, { pointerId: 1, clientY: START_Y });
    fireEvent.pointerMove(grab, { pointerId: 1, clientY: START_Y + SPRING_DY });
    fireEvent.pointerUp(grab, { pointerId: 1, clientY: START_Y + SPRING_DY });

    expect(panel.style.transform).toBe("translateY(0px)");
    expect(panel.style.transition).toMatch(/var\(--duration-fast\)/);
    expect(onClose).not.toHaveBeenCalled();

    // Browsers synthesize a click after pointerup — the drag consumed it.
    fireEvent.click(grab);
    expect(onClose).not.toHaveBeenCalled();

    // Spring-back settles: inline styles cleared so the stylesheet governs again.
    fireEvent.transitionEnd(panel, { propertyName: "transform" });
    expect(panel.style.transform).toBe("");
    expect(panel.style.transition).toBe("");
    expect(panel.style.animation).toBe("");

    // The suppression is one-shot (cleared on the next tick): a LATER plain
    // tap closes normally.
    vi.advanceTimersByTime(0);
    fireEvent.click(grab);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test("slop boundary: dy = DRAG_SLOP_PX is a tap (click closes); dy = DRAG_SLOP_PX + 1 is a drag (click suppressed)", () => {
    // Tap side of the boundary.
    {
      const { q, onClose } = renderModal();
      const { grab, panel } = grabWithCaptureStubs(q);
      fireEvent.pointerDown(grab, { pointerId: 1, clientY: START_Y });
      fireEvent.pointerMove(grab, { pointerId: 1, clientY: START_Y + DRAG_SLOP_PX });
      fireEvent.pointerUp(grab, { pointerId: 1, clientY: START_Y + DRAG_SLOP_PX });
      expect(onClose).not.toHaveBeenCalled(); // the CLICK closes, not pointerup
      expect(panel.style.transform).toBe(""); // tap leaves no inline residue
      fireEvent.click(grab);
      expect(onClose).toHaveBeenCalledTimes(1);
      cleanup();
    }
    // Drag side of the boundary.
    {
      const { q, onClose } = renderModal();
      const { grab } = grabWithCaptureStubs(q);
      fireEvent.pointerDown(grab, { pointerId: 1, clientY: START_Y });
      fireEvent.pointerMove(grab, { pointerId: 1, clientY: START_Y + DRAG_SLOP_PX + 1 });
      fireEvent.pointerUp(grab, { pointerId: 1, clientY: START_Y + DRAG_SLOP_PX + 1 });
      fireEvent.click(grab);
      expect(onClose).not.toHaveBeenCalled();
    }
  });

  test("max-dy regression: an overshoot past slop that RETURNS near origin before release is still a drag (§10 — a `maxDy` regression to `Math.abs(finalDy)` would pass this as a tap)", () => {
    vi.useFakeTimers();
    const { q, onClose } = renderModal();
    const { grab, panel } = grabWithCaptureStubs(q);

    // Overshoot well past the slop boundary (but short of the dismiss
    // threshold, so a correct implementation springs back rather than
    // dismisses) — this is what sets `drag.maxDy`.
    const RETURN_DY = Math.floor(DRAG_SLOP_PX / 2); // final position: back inside slop

    fireEvent.pointerDown(grab, { pointerId: 1, clientY: START_Y });
    fireEvent.pointerMove(grab, { pointerId: 1, clientY: START_Y + SPRING_DY });
    expect(panel.style.transform).toBe(`translateY(${SPRING_DY}px)`);

    // Return near the origin — a naive `Math.abs(finalDy)` check would see
    // this as within the slop and treat the release as a tap.
    fireEvent.pointerMove(grab, { pointerId: 1, clientY: START_Y + RETURN_DY });
    expect(panel.style.transform).toBe(`translateY(${RETURN_DY}px)`);
    fireEvent.pointerUp(grab, { pointerId: 1, clientY: START_Y + RETURN_DY });

    // Correct: still a DRAG — springs back to translateY(0) at the fast
    // token, and the synthesized click that follows must NOT close the modal.
    expect(panel.style.transform).toBe("translateY(0px)");
    expect(panel.style.transition).toMatch(/var\(--duration-fast\)/);
    fireEvent.click(grab);
    expect(onClose).not.toHaveBeenCalled();

    // The spring-back settles normally afterward (stylesheet regains control).
    fireEvent.transitionEnd(panel, { propertyName: "transform" });
    expect(panel.style.transform).toBe("");
    expect(panel.style.transition).toBe("");
    expect(panel.style.animation).toBe("");
  });

  test("mode-boundary cleanup (C6): entering ≥sm mid-drag releases capture, clears inline styles, resets the drag ref", () => {
    const mm = stubMatchMedia();
    const { q, onClose } = renderModal();
    const { grab, panel, releasePointerCapture } = grabWithCaptureStubs(q);

    // Exactly ONE listener on exactly the sm-token query.
    expect(mm.queries).toEqual(["(min-width: 640px)"]);
    expect(mm.listeners).toHaveLength(1);

    fireEvent.pointerDown(grab, { pointerId: 3, clientY: START_Y });
    fireEvent.pointerMove(grab, { pointerId: 3, clientY: START_Y + SPRING_DY });
    expect(panel.style.transform).toBe(`translateY(${SPRING_DY}px)`);

    // Leaving ≥sm (matches:false) is NOT the cleanup edge — drag continues.
    mm.fire(false);
    expect(panel.style.transform).toBe(`translateY(${SPRING_DY}px)`);

    // Entering ≥sm cancels the drag.
    mm.fire(true);
    expect(releasePointerCapture).toHaveBeenCalledWith(3);
    expect(panel.style.transform).toBe("");
    expect(panel.style.transition).toBe("");
    expect(panel.style.animation).toBe("");

    // Drag ref reset: subsequent move/up on the dead sequence are no-ops.
    fireEvent.pointerMove(grab, { pointerId: 3, clientY: START_Y + DISMISS_DY });
    expect(panel.style.transform).toBe("");
    fireEvent.pointerUp(grab, { pointerId: 3, clientY: START_Y + DISMISS_DY });
    expect(panel.style.transform).toBe("");
    expect(onClose).not.toHaveBeenCalled();
  });

  test("unmount mid-drag (C2 hygiene): matchMedia listener removed and pointer capture released", () => {
    const mm = stubMatchMedia();
    const { q } = renderModal();
    const { grab, releasePointerCapture } = grabWithCaptureStubs(q);

    fireEvent.pointerDown(grab, { pointerId: 9, clientY: START_Y });
    q.unmount();

    expect(mm.listeners).toHaveLength(0);
    expect(mm.removed).toHaveLength(1);
    expect(releasePointerCapture).toHaveBeenCalledWith(9);
  });

  test("unmount during the dismiss transition clears the fallback timer (no late onClose)", () => {
    vi.useFakeTimers();
    const { q, onClose } = renderModal();
    const { grab } = grabWithCaptureStubs(q);

    fireEvent.pointerDown(grab, { pointerId: 1, clientY: START_Y });
    fireEvent.pointerMove(grab, { pointerId: 1, clientY: START_Y + DISMISS_DY });
    fireEvent.pointerUp(grab, { pointerId: 1, clientY: START_Y + DISMISS_DY });
    q.unmount();

    vi.advanceTimersByTime(DURATION_NORMAL_FALLBACK_MS + 50);
    expect(onClose).not.toHaveBeenCalled();
  });

  test("token-drift guard: the exported fallback-timer constants match --duration-normal/--duration-fast in app/globals.css", () => {
    const css = readFileSync(join(process.cwd(), "app/globals.css"), "utf8");
    const normalMatch = css.match(/--duration-normal:\s*(\d+)ms/);
    const fastMatch = css.match(/--duration-fast:\s*(\d+)ms/);
    if (!normalMatch || !fastMatch) {
      throw new Error("app/globals.css must declare --duration-normal and --duration-fast tokens");
    }
    // A token change here (without updating the component's exported
    // constants) fails this test instead of drifting silently — see
    // Step3ReviewModal.tsx's DURATION_NORMAL_FALLBACK_MS/DURATION_FAST_FALLBACK_MS.
    expect(DURATION_NORMAL_FALLBACK_MS).toBe(Number(normalMatch[1]));
    expect(DURATION_FAST_FALLBACK_MS).toBe(Number(fastMatch[1]));
  });
});

// ── Task 9: flag callouts + warning jump-links + one-shot highlight ──────────
// (follow-ups spec §E3/§E4, §H N2/N3, §K9)

describe("Step3ReviewModal — section flag callouts (Task 9, spec §E3)", () => {
  /** N warn-severity crew-kind warnings (N derived from the cap, never a
   *  hardcoded row count — anti-tautology). */
  function crewWarnings(n: number): ParseWarning[] {
    return Array.from({ length: n }, () => warning("crew"));
  }

  function calloutTid(sectionId: string): string {
    return `wizard-step3-card-${DFID}-section-${sectionId}-flag-callout`;
  }

  test("callout renders as the FIRST child inside the flagged section's panel card, capped at CALLOUT_MAX_ENTRIES rows + overflow line", () => {
    // Failure mode caught: an unbounded callout (every warning gets a row) or
    // a callout mounted outside/after the panel-card body.
    const d = sectionData({ warnings: crewWarnings(CALLOUT_MAX_ENTRIES + 2) });
    const { q } = renderModal({ d });

    const callout = q.getByTestId(calloutTid("crew"));
    // First child INSIDE the §5.2 panel card (the card div carries bg-surface;
    // the heading row sits before the card, not inside it).
    const card = callout.parentElement!;
    expect(card.className).toContain("bg-surface");
    expect(card.firstElementChild).toBe(callout);
    // The crew section panel contains the callout (container-scoped).
    expect(q.getByTestId(tid("section-crew")).contains(callout)).toBe(true);

    // Exactly CALLOUT_MAX_ENTRIES title rows, each with a jump button.
    const jumpButtons = within(callout).getAllByRole("button", { name: /View details/ });
    expect(jumpButtons).toHaveLength(CALLOUT_MAX_ENTRIES);

    // Overflow line derived from the fixture length, itself a button.
    const total = d.warnings.filter((w) => w.severity === "warn").length;
    expect(total).toBeGreaterThan(CALLOUT_MAX_ENTRIES);
    const more = within(callout).getByRole("button", {
      name: `+${total - CALLOUT_MAX_ENTRIES} more in Parse warnings`,
    });
    expect(more).toBeTruthy();
  });

  test("at or under the cap: no overflow line", () => {
    const d = sectionData({ warnings: crewWarnings(CALLOUT_MAX_ENTRIES) });
    const { q } = renderModal({ d });
    const callout = q.getByTestId(calloutTid("crew"));
    expect(within(callout).getAllByRole("button", { name: /View details/ })).toHaveLength(
      CALLOUT_MAX_ENTRIES,
    );
    expect(within(callout).queryByText(/more in Parse warnings/)).toBeNull();
  });

  test("the warnings section itself NEVER gets a callout (circular-callout guard)", () => {
    // An unmapped warn flags the `warnings` bucket (§E2) — flagged, but its
    // body IS the warning list, so no callout may render there.
    const unmapped: ParseWarning = { severity: "warn", code: "SOME_CODE", message: "" };
    const d = sectionData({ warnings: [unmapped] });
    const { q } = renderModal({ d });
    // The warnings section is flagged (sanity: the chip shows 1)…
    expect(q.getByTestId(tid("chip")).textContent).toBe("1 needs a look");
    // …but carries no callout, and no other section does either.
    expect(q.queryByTestId(calloutTid("warnings"))).toBeNull();
    expect(document.querySelector('[data-testid$="-flag-callout"]')).toBeNull();
  });

  test("unflagged sections render no callout", () => {
    const d = sectionData({ warnings: crewWarnings(1) });
    const { q } = renderModal({ d });
    expect(q.getByTestId(calloutTid("crew"))).toBeTruthy();
    expect(q.queryByTestId(calloutTid("schedule"))).toBeNull();
    expect(q.queryByTestId(calloutTid("contacts"))).toBeNull();
  });

  test("titles are hardened: a token-shaped message renders the generic fallback, never the raw token (§E3 → reviewWarningTitle transitivity)", () => {
    // Failure mode caught: the callout bypassing reviewWarningTitle and
    // echoing w.message (raw-code leak, invariant 5).
    const tokenWarning: ParseWarning = {
      severity: "warn",
      code: "SOME_CODE",
      message: "OPENING_REEL_UNREADABLE",
      blockRef: { kind: "crew" },
    };
    const d = sectionData({ warnings: [tokenWarning] });
    const { q } = renderModal({ d });
    const callout = q.getByTestId(calloutTid("crew"));
    expect(within(callout).getByText("A parse issue was recorded for this sheet.")).toBeTruthy();
    expect(callout.textContent).not.toContain("OPENING_REEL_UNREADABLE");
  });
});

describe("Step3ReviewModal — warning jump-links + one-shot highlight (Task 9, spec §E4)", () => {
  /** jsdom has no Element#scrollTo — stub it on the prototype for the jump
   *  path's `typeof scroller.scrollTo === "function"` guard. */
  let scrollToStub: ReturnType<typeof vi.fn>;
  let originalScrollTo: PropertyDescriptor | undefined;

  function stubScrollTo() {
    originalScrollTo = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "scrollTo");
    scrollToStub = vi.fn();
    Object.defineProperty(HTMLElement.prototype, "scrollTo", {
      value: scrollToStub,
      configurable: true,
      writable: true,
    });
  }

  afterEach(() => {
    if (originalScrollTo) {
      Object.defineProperty(HTMLElement.prototype, "scrollTo", originalScrollTo);
    } else {
      delete (HTMLElement.prototype as { scrollTo?: unknown }).scrollTo;
    }
    originalScrollTo = undefined;
    vi.useRealTimers();
  });

  function calloutTid(sectionId: string): string {
    return `wizard-step3-card-${DFID}-section-${sectionId}-flag-callout`;
  }

  /** One info warning FIRST so warn indices exercise the FULL-array index
   *  contract (§E2: index = position in the full warnings array, info rows
   *  included in the numbering). */
  function warningsWithInfoPrefix(warnCount: number): ParseWarning[] {
    const info: ParseWarning = {
      severity: "info",
      code: "SOME_CODE",
      message: "",
      blockRef: { kind: "crew" },
    };
    return [info, ...Array.from({ length: warnCount }, () => warning("crew"))];
  }

  test("jump: click 'View details' → aria-current moves to the warnings rail item; the li located via data-warning-index gets the flash attribute; cleared after WARNING_HIGHLIGHT_MS; no id attributes anywhere", () => {
    stubScrollTo();
    vi.useFakeTimers();
    const d = sectionData({ warnings: warningsWithInfoPrefix(1) });
    const { q } = renderModal({ d });

    // Index derived from the fixture (full-array position of the warn row).
    const warnIndex = d.warnings.findIndex((w) => w.severity === "warn");
    expect(warnIndex).toBeGreaterThan(0); // the info prefix shifts it — full-array contract

    const callout = q.getByTestId(calloutTid("crew"));
    fireEvent.click(within(callout).getByRole("button", { name: /View details/ }));

    // aria-current moved to the warnings item on the rail (container-scoped).
    const rail = q.getByTestId(tid("rail"));
    expect(within(rail).getByTestId(tid("rail-item-warnings")).getAttribute("aria-current")).toBe(
      "true",
    );
    expect(rail.querySelectorAll('[aria-current="true"]')).toHaveLength(1);

    // The target li — located EXACTLY the way the component must locate it:
    // container-scoped data-warning-index query, NO id attributes.
    const content = q.getByTestId(tid("content"));
    const li = content.querySelector<HTMLElement>(`[data-warning-index="${warnIndex}"]`);
    expect(li).not.toBeNull();
    expect(li).toBe(q.getByTestId(`wizard-step3-card-${DFID}-warning-${warnIndex}`));
    expect(li!.hasAttribute("data-step3-warning-flash")).toBe(true);
    expect(scrollToStub).toHaveBeenCalled();

    // Twin-nav id ban (§9.4): the jump added no id anywhere in either nav or
    // on the li.
    expect(rail.querySelectorAll("[id]")).toHaveLength(0);
    expect(q.getByTestId(tid("chiprail")).querySelectorAll("[id]")).toHaveLength(0);
    expect(li!.hasAttribute("id")).toBe(false);

    // One-shot: attribute removed after WARNING_HIGHLIGHT_MS (timer hygiene).
    act(() => {
      vi.advanceTimersByTime(WARNING_HIGHLIGHT_MS);
    });
    expect(li!.hasAttribute("data-step3-warning-flash")).toBe(false);
  });

  test("one highlight at a time: a second jump moves the attribute; unmount mid-highlight clears timers", () => {
    stubScrollTo();
    vi.useFakeTimers();
    const d = sectionData({ warnings: warningsWithInfoPrefix(2) });
    const { q } = renderModal({ d });

    const warnIndices = d.warnings
      .map((w, i) => (w.severity === "warn" ? i : -1))
      .filter((i) => i >= 0);
    expect(warnIndices).toHaveLength(2);

    const callout = q.getByTestId(calloutTid("crew"));
    const buttons = within(callout).getAllByRole("button", { name: /View details/ });
    const content = q.getByTestId(tid("content"));
    const liA = content.querySelector<HTMLElement>(`[data-warning-index="${warnIndices[0]}"]`)!;
    const liB = content.querySelector<HTMLElement>(`[data-warning-index="${warnIndices[1]}"]`)!;

    fireEvent.click(buttons[0]!);
    expect(liA.hasAttribute("data-step3-warning-flash")).toBe(true);

    // Immediately jump to B: A's attribute removed, ONLY B carries it.
    fireEvent.click(buttons[1]!);
    expect(liA.hasAttribute("data-step3-warning-flash")).toBe(false);
    expect(liB.hasAttribute("data-step3-warning-flash")).toBe(true);
    expect(document.querySelectorAll("[data-step3-warning-flash]")).toHaveLength(1);

    // Unmount mid-highlight: teardown clears the timer — no late errors.
    q.unmount();
    expect(() => vi.runAllTimers()).not.toThrow();
  });

  test("'+N more' targets the warnings section top: plain nav-click semantics, NO highlight anywhere", () => {
    stubScrollTo();
    vi.useFakeTimers();
    const d = sectionData({ warnings: warningsWithInfoPrefix(CALLOUT_MAX_ENTRIES + 2) });
    const { q } = renderModal({ d });

    const total = d.warnings.filter((w) => w.severity === "warn").length;
    const callout = q.getByTestId(calloutTid("crew"));
    fireEvent.click(
      within(callout).getByRole("button", {
        name: `+${total - CALLOUT_MAX_ENTRIES} more in Parse warnings`,
      }),
    );

    const rail = q.getByTestId(tid("rail"));
    expect(within(rail).getByTestId(tid("rail-item-warnings")).getAttribute("aria-current")).toBe(
      "true",
    );
    // §A2 nav-click semantics only — no row highlight.
    expect(document.querySelectorAll("[data-step3-warning-flash]")).toHaveLength(0);
    expect(scrollToStub).toHaveBeenCalled();
  });
});

describe("Step3ReviewModal — per-section deep link anchors (bug #316 item 3)", () => {
  const CREW_ANCHOR = { title: "INFO", gid: 0, a1: "A25:E25" };
  const TRANSPORT_ANCHOR = { title: "INFO", gid: 0, a1: "A49:D61" };
  // sourceAnchors keyed by RegionId. `crew` + `transportation` present; `hotels` absent.
  // NOTE: `transportation` (not `transport`) is deliberate — it is the RegionId, while
  // `transport` is the SectionId. This pair PROVES SECTION_REGION_MAP is consulted: a
  // buggy `sourceAnchors[chrome.sectionId]` would look up `sourceAnchors["transport"]`
  // (undefined) and fall back to #gid=0, failing the transport assertion below.
  const ANCHORS = { crew: CREW_ANCHOR, transportation: TRANSPORT_ANCHOR };

  function withAnchors() {
    const pr = buildParseResult();
    return sectionData({}, { row: stagedRow(pr, { sourceAnchors: ANCHORS }) });
  }

  test("crew section link targets the crew region's range (derived from the fixture anchor)", () => {
    const d = withAnchors();
    const { q } = renderModal({ d });
    const link = q.getByTestId(
      `wizard-step3-card-${DFID}-section-crew-sheetlink`,
    ) as HTMLAnchorElement;
    // Expected href DERIVED from the fixture anchor via the real builder — not hardcoded.
    expect(link.getAttribute("href")).toBe(buildSheetDeepLink(DFID, CREW_ANCHOR));
    // Concrete failure mode: the wizard passing NO anchor → href would be `${base}#gid=0`
    // with no range. Pin the range from the fixture so that bug fails this assertion.
    expect(link.getAttribute("href")).toContain("range=A25%3AE25");
    expect(link.getAttribute("href")).not.toBe(buildSheetDeepLink(DFID));
  });

  test("transport section (non-identity SectionId→RegionId) uses SECTION_REGION_MAP", () => {
    // transport → transportation: proves the map is consulted (not sourceAnchors[sectionId]).
    const d = withAnchors();
    const { q } = renderModal({ d });
    const link = q.getByTestId(
      `wizard-step3-card-${DFID}-section-transport-sheetlink`,
    ) as HTMLAnchorElement;
    expect(link.getAttribute("href")).toBe(buildSheetDeepLink(DFID, TRANSPORT_ANCHOR));
    expect(link.getAttribute("href")).toContain("range=A49%3AD61");
    // A `sourceAnchors[chrome.sectionId]` bug → sourceAnchors["transport"] undefined → #gid=0.
    expect(link.getAttribute("href")).not.toBe(buildSheetDeepLink(DFID));
  });

  test("a section whose region has no anchor falls back to #gid=0", () => {
    const d = withAnchors(); // `hotels` region absent from ANCHORS
    const { q } = renderModal({ d });
    const link = q.getByTestId(
      `wizard-step3-card-${DFID}-section-hotels-sheetlink`,
    ) as HTMLAnchorElement;
    expect(link.getAttribute("href")).toBe(buildSheetDeepLink(DFID)); // #gid=0 fallback
  });

  test("regression: the modal HEADER link stays whole-sheet (#gid=0) even with anchors present", () => {
    const d = withAnchors();
    const { q } = renderModal({ d });
    // tid() = `wizard-step3-card-${DFID}-review-sheetlink` (the header link, out of scope)
    const header = q.getByTestId(tid("sheetlink")) as HTMLAnchorElement;
    expect(header.getAttribute("href")).toBe(buildSheetDeepLink(DFID));
  });
});

describe("Step3ReviewModal — §S3C-2 portal to document.body", () => {
  test("the dialog mounts under document.body, not inside the RTL mount container", () => {
    const { q } = renderModal();
    // Pre-change the dialog was a descendant of the RTL container; once portaled
    // it lives directly under document.body, so the container no longer holds it.
    expect(q.container.querySelector("[role='dialog']")).toBeNull();
    // Document-bound query still finds it (RTL queries default to document.body).
    expect(document.body.contains(q.getByRole("dialog"))).toBe(true);
  });
});

describe("Step3ReviewModal — §S3C-2 background inert", () => {
  test("inerts every [data-inert-root] while open; restores prior state on unmount", () => {
    const shell = document.createElement("div");
    shell.setAttribute("data-inert-root", "");
    document.body.appendChild(shell);
    try {
      const { q } = renderModal();
      // While the modal is mounted (== open) the background shell is inert + hidden from AT.
      expect(shell.hasAttribute("inert")).toBe(true);
      expect(shell.getAttribute("aria-hidden")).toBe("true");
      // The portaled dialog itself is a body sibling of the shell, never inerted.
      expect(q.getByRole("dialog").closest("[data-inert-root]")).toBeNull();
      q.unmount();
      // Closing (unmount) restores the shell's prior state — no stuck inert/aria-hidden.
      expect(shell.hasAttribute("inert")).toBe(false);
      expect(shell.hasAttribute("aria-hidden")).toBe(false);
    } finally {
      shell.remove();
    }
  });

  test("preserves a pre-existing aria-hidden on the shell across open/close", () => {
    const shell = document.createElement("div");
    shell.setAttribute("data-inert-root", "");
    shell.setAttribute("aria-hidden", "false");
    document.body.appendChild(shell);
    try {
      const { q } = renderModal();
      expect(shell.getAttribute("aria-hidden")).toBe("true"); // overridden while open
      q.unmount();
      expect(shell.getAttribute("aria-hidden")).toBe("false"); // restored, not removed
      expect(shell.hasAttribute("inert")).toBe(false);
    } finally {
      shell.remove();
    }
  });
});
