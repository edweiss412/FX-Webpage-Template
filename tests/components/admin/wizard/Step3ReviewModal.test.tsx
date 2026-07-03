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
  SCROLL_SPY_OFFSET_PX,
  Step3ReviewModal,
} from "@/components/admin/wizard/Step3ReviewModal";
import {
  __resetAgendaThrottleForTests,
  contactBlocks,
  dateSummarySegments,
  step3Sections,
  STEP3_SECTION_GROUPS,
  type SectionData,
} from "@/components/admin/wizard/step3ReviewSections";
import { deriveSectionStatuses, type SectionId } from "@/lib/admin/step3SectionStatus";
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

/** Assemble the modal's SectionData from the shared fixture builders. */
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

/** SectionData with show-level overrides (client_label, dates, …). */
function sectionDataWithShow(
  showOverrides: Partial<ParseResult["show"]>,
  prOverrides: Partial<ParseResult> = {},
): SectionData {
  const pr = buildParseResult(prOverrides);
  return sectionData({ ...prOverrides, show: { ...pr.show, ...showOverrides } });
}

function tid(name: string, dfid = DFID): string {
  return `wizard-step3-card-${dfid}-review-${name}`;
}

function renderModal(
  opts: {
    d?: SectionData;
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

/** flaggedCount the modal must display, computed the same way the spec derives
 *  it (deriveSectionStatuses over the data's warnings + rendered sections) —
 *  never a restated literal. */
function expectedFlagged(d: SectionData): number {
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

  test("publish button label: 'Publish this show' unchecked, 'Selected to publish' checked", () => {
    const { q } = renderModal({ checked: false });
    expect(q.getByTestId(tid("publish")).textContent).toBe("Publish this show");
    cleanup();
    const { q: q2 } = renderModal({ checked: true });
    expect(q2.getByTestId(tid("publish")).textContent).toBe("Selected to publish");
  });

  test("dirty-rescan: NO publish button, NO rescan button; review-required note + reapply link (RescanReviewBanner copy/target)", () => {
    const { q } = renderModal({ isDirtyRescan: true });
    const footer = q.getByTestId(tid("footer"));
    expect(q.queryByTestId(tid("publish"))).toBeNull();
    expect(within(footer).queryByText("Re-scan this sheet")).toBeNull();
    expect(
      within(footer).getByText(
        "This sheet changed since you reviewed it. Review it before publishing.",
      ),
    ).toBeTruthy();
    const link = within(footer).getByText("Review this sheet").closest("a") as HTMLAnchorElement;
    expect(link).not.toBeNull();
    expect(link.getAttribute("href")).toBe(`/admin/onboarding/staged/${WSID}/${DFID}`);
  });
});

// ── Publish click semantics (spec §9.1 idempotent approve) ──────────────────

describe("Step3ReviewModal — publish click (spec §9.1)", () => {
  test("click calls onRequestSetChecked with EXACTLY true in BOTH states (never a toggle)", async () => {
    const onRequestSetChecked = vi.fn(async () => true);
    const { q, onClose } = renderModal({ checked: false, onRequestSetChecked });
    fireEvent.click(q.getByTestId(tid("publish")));
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(onRequestSetChecked).toHaveBeenCalledWith(true);
    cleanup();
    const onRequestSetChecked2 = vi.fn(async () => true);
    const { q: q2, onClose: onClose2 } = renderModal({
      checked: true,
      onRequestSetChecked: onRequestSetChecked2,
    });
    fireEvent.click(q2.getByTestId(tid("publish")));
    await waitFor(() => expect(onClose2).toHaveBeenCalledTimes(1));
    // CHECKED state still requests true — idempotent approve, not a toggle.
    expect(onRequestSetChecked2).toHaveBeenCalledWith(true);
    expect(onRequestSetChecked2).not.toHaveBeenCalledWith(false);
  });

  test("resolved true → onClose called exactly once", async () => {
    const { q, onClose } = renderModal({ onRequestSetChecked: vi.fn(async () => true) });
    fireEvent.click(q.getByTestId(tid("publish")));
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  test("resolved false → modal stays open, inline error note, prior label kept", async () => {
    const { q, onClose } = renderModal({
      checked: false,
      onRequestSetChecked: vi.fn(async () => false),
    });
    fireEvent.click(q.getByTestId(tid("publish")));
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
    // Prior (state-derived) label restored — not stuck on "Selecting…".
    expect(q.getByTestId(tid("publish")).textContent).toBe("Publish this show");
  });

  test("while pending → disabled + aria-busy + 'Selecting…' (deferred promise)", async () => {
    let resolveReq!: (v: boolean) => void;
    const onRequestSetChecked = vi.fn(
      () =>
        new Promise<boolean>((resolve) => {
          resolveReq = resolve;
        }),
    );
    const { q, onClose } = renderModal({ onRequestSetChecked });
    fireEvent.click(q.getByTestId(tid("publish")));
    const btn = q.getByTestId(tid("publish")) as HTMLButtonElement;
    await waitFor(() => expect(btn.textContent).toBe("Selecting…"));
    expect(btn.disabled).toBe(true);
    expect(btn.getAttribute("aria-busy")).toBe("true");
    expect(onClose).not.toHaveBeenCalled();
    await act(async () => {
      resolveReq(true);
    });
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });
});

// ── Task 5: rails + chip rail + section panels (spec §6.2–§6.4, §9.4, §15) ───

/** An info-severity warning: counts in the warnings list, never flags (§3.3). */
function infoWarning(kind: string): ParseWarning {
  return { severity: "info", code: "SOME_CODE", message: "", blockRef: { kind } };
}

/** flagged SET computed via the mapping lib over the registry's rendered ids
 *  (anti-tautology: expectations derive from the data path, not the render). */
function flaggedSetFor(d: SectionData): ReadonlySet<SectionId> {
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
    const expected: Partial<Record<SectionId, number>> = {
      crew: d.crewMembers.length,
      contacts: contactBlocks(d.pr.show.client_contact, d.pr.contacts ?? []).length,
      schedule: Object.keys(d.ros).length,
      hotels: d.hotels.length,
      rooms: d.rooms.length,
      packlist: d.pullSheet.length,
      warnings: d.warnings.length,
    };
    expect(d.crewMembers.length).toBeGreaterThan(0); // fixture sanity: a nonzero count is exercised
    for (const s of step3Sections(d)) {
      const ct = q.getByTestId(tid(`rail-item-${s.id}`)).querySelector(".tabular-nums");
      if (s.id in expected) {
        // Catches a count wired to the wrong data source (fixture-derived value).
        expect(ct?.textContent).toBe(String(expected[s.id]));
      } else {
        // venue/event/transport/billing (and agenda) never show a rail count.
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
      const dot = item.querySelector(".bg-status-review, .bg-status-positive");
      expect(dot).not.toBeNull();
      const expectRed = s.id === "warnings" ? true : flagged.has(s.id);
      expect(dot!.className).toMatch(expectRed ? /\bbg-status-review\b/ : /\bbg-status-positive\b/);
      expect(dot!.className).toMatch(/\bsize-2\b/);
      expect(dot!.className).toMatch(/\brounded-pill\b/);
    }
  });

  test("active rail item: bg-surface-sunken + w-1 rounded-r-pill bg-accent indicator; inactive has neither", () => {
    const { q, d } = renderModal();
    const first = step3Sections(d)[0]!;
    const activeItem = q.getByTestId(tid(`rail-item-${first.id}`));
    expect(activeItem.className).toMatch(/\bbg-surface-sunken\b/);
    const indicator = activeItem.querySelector(".bg-accent");
    expect(indicator).not.toBeNull();
    expect(indicator!.className).toMatch(/\bw-1\b/);
    expect(indicator!.className).toMatch(/\brounded-r-pill\b/);
    const idle = q.getByTestId(tid("rail-item-warnings"));
    expect(idle.querySelector(".bg-accent")).toBeNull();
  });

  test("warnings dot is ROW-LOCAL: info-only warnings → positive dot while the count still shows", () => {
    const d = sectionData({ warnings: [infoWarning("crew")] });
    expect(flaggedSetFor(d).size).toBe(0); // info never flags (§3.3)
    const { q } = renderModal({ d });
    const item = q.getByTestId(tid("rail-item-warnings"));
    expect(item.querySelector(".tabular-nums")?.textContent).toBe("1");
    const dot = item.querySelector(".bg-status-review, .bg-status-positive");
    expect(dot!.className).toMatch(/\bbg-status-positive\b/);
    // Same rule on the chip twin.
    const chipDot = q
      .getByTestId(tid("chip-item-warnings"))
      .querySelector(".bg-status-review, .bg-status-positive");
    expect(chipDot!.className).toMatch(/\bbg-status-positive\b/);
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
      expect(chip.querySelector(".bg-status-review, .bg-status-positive")).not.toBeNull();
      // Label ONLY — a stray count/extra text would change textContent.
      expect(chip.textContent).toBe(s.label);
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
    // Counts stay the body's own (§6.1 preamble): fixture-derived, incl. a zero.
    const crewHead = q.getByTestId(tid("section-crew")).querySelector("h3")!.parentElement!;
    expect(crewHead.textContent).toContain(`(${d.crewMembers.length})`);
    const venueHead = q.getByTestId(tid("section-venue")).querySelector("h3")!.parentElement!;
    expect(venueHead.textContent).toContain("(0)"); // fixture venue is null → 0 rows
    const warnHead = q.getByTestId(tid("section-warnings")).querySelector("h3")!.parentElement!;
    expect(warnHead.textContent).toContain(`(${d.warnings.length})`);
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
      const target = defs[defs.length - 1]!; // warnings — far from the initial active
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

// ── Sheet drag-to-dismiss (Task 7, spec §10; §11 T3–T5, C1, C2, C5, C6) ──────

describe("Step3ReviewModal — sheet drag-to-dismiss (Task 7, spec §10)", () => {
  /** Token-matched transitionend fallback: `--duration-normal` = 220ms
   *  (app/globals.css). The spec's dismiss timeout mirrors the token; if the
   *  token changes, this literal AND the component's fallback change together. */
  const DURATION_NORMAL_MS = 220;

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
    const panel = q.container.querySelector<HTMLElement>("[data-step3-review-panel]");
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

    vi.advanceTimersByTime(DURATION_NORMAL_MS - 1);
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

    vi.advanceTimersByTime(DURATION_NORMAL_MS + 50);
    expect(onClose).not.toHaveBeenCalled();
  });
});
