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

import { Step3ReviewModal } from "@/components/admin/wizard/Step3ReviewModal";
import {
  dateSummarySegments,
  step3Sections,
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
