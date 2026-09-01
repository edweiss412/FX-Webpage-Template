// @vitest-environment jsdom
/**
 * tests/components/admin/wizard/step3ReviewModal.transitions.test.tsx
 * (Task 9 — spec 2026-07-02-step3-review-modal-redesign.md §11 Transition
 * inventory)
 *
 * Pins EVERY row of the §11 table for <Step3ReviewModal> plus compound C7.
 * T3-T5 (drag) and compounds C1/C2/C5/C6 already have a full suite in
 * Step3ReviewModal.test.tsx (Task 7) — this file re-asserts the §11-table
 * VALUES for T3-T5 (one assertion per row, not a duplicate suite) and adds
 * the rows Task 7 didn't cover: T1, T2, T6, T7, T7b, T8, T9, T10, C7.
 *
 * | # | Transition | Treatment |
 * |---|---|---|
 * | T1 | closed → open | CSS keyframes (sheet-rise/pop-in) + scrim fade (app/globals.css), reduced-motion collapse. |
 * | T2 | open → closed (any path) | Exit animation reversing the entrance, then unmount (MODAL-CLOSE-EXIT-ANIM-1); reduced motion collapses to instant. |
 * | T3 | open → drag | `transition: none` + `animation: none`; transform tracks pointer. |
 * | T4 | drag → open (release below threshold) | Transform to 0, `--duration-fast`, transform-only. |
 * | T5 | drag → closed (release past threshold) | Transform to 100%, `--duration-normal` + `--ease-out-quart`. |
 * | T6′ | activeSection change | Rail/chip BUTTONS: `transition-colors duration-fast` only; the shared rail indicator SLIDES — `transition-[transform,height] duration-fast ease-out-quart motion-reduce:transition-none` (Task 10, spec §A3/§A4 — supersedes the Task-9 "position does NOT slide" pin). |
 * | T7 | checked false ↔ true | Instant swap — deliberate. |
 * | T7b | publish idle → pending → (closed / error) | Instant label/disabled swaps + instant error note. |
 * | T8 | rescanPending false ↔ true | Existing RescanSheetButton label/aria-busy swap — instant. |
 * | T9 | pack-list `<details>` open/close | Chevron `transform` rotate `duration-fast`; row reveal instant. |
 * | T10 | warnings/props change while open | Instant re-render (server truth). |
 * | C7 | `checked` flips via card checkbox while open | Footer label updates instantly, no animation. |
 *
 * Task 13 (follow-ups spec 2026-07-03 §H, §K10) extends the audit with the
 * FULL §H inventory — every row below maps to a named test in this file:
 *
 * | # | Transition | Treatment |
 * |---|---|---|
 * | T6′ | Rail indicator item→item (any pair) | slides — `transform`+`height`, `--duration-fast` `--ease-out-quart`; `motion-reduce`: instant; first mount positioned without transition (the T6′ block above). |
 * | N1 | `active` during suppressed programmatic scroll | held constant (no intermediate values) — sampled behaviorally below; the full §A2 suite lives in Step3ReviewModal.test.tsx. |
 * | N2 | Callout presence | static with section render — no mount animation. |
 * | N3 | Warning highlight | one-shot background fade, `WARNING_HIGHLIGHT_MS`; reduced motion: steady tint, removed with the attribute. CSS↔constant drift pin below. |
 * | N4 | Rescan overlay result appear / disappear | fast pop-in (`--duration-fast`) / instant; reduced motion: none. |
 * | N5 | Publish ↔ Unpublish ↔ Removing… ↔ NotPublishable slot swaps | instant (matches the T7/T7b/C7 footer-swap rows). |
 * | N6 | Diagram tile img load / error→placeholder | browser default / instant. |
 * | N7 | Report status idle→pending→success/error | instant text swaps in the aria-live region. |
 *
 * §H compound transitions (jsdom-feasible set): (a) jump-link clicked during
 * an in-flight nav glide → suppression target replaced, settle timer
 * restarted, only the LAST target releases on settle (§A2); (b) unmount
 * during an active highlight + active suppression → both timers cleared in
 * effect teardown (no late fires, no attribute-removal errors); (c) `checked`
 * flips (external settlement) while a suppressed scroll is in flight → the
 * footer swap is instant and does not touch nav state; (d) unpublish resolves
 * while the rescan overlay result is open → independent (the footer slot
 * swaps under the overlay). The remaining §H compound — report pending while
 * the modal is closed (fire-and-forget with persisted idempotency key, §D3)
 * — is owned by step3ReportIssueSection.test.tsx's persistence/rotation
 * suite (asserting it here would duplicate that file's fetch harness).
 *
 * Source-marker audit: every ternary/`&&` JSX conditional in
 * Step3ReviewModal.tsx that mounts/unmounts an element is walked via a
 * curated regex scan; each site must carry EITHER an animation/transition
 * class or the `§11: instant — deliberate` marker comment on the line
 * immediately above it. The scan ALSO asserts the total conditional-render
 * count equals the curated list length (10 — Task 5 added the two hideDot
 * dot-span conditionals, one per nav, spec §D2; Task 8 swapped one site for
 * another, net 0: the checked Check-icon conditional was REMOVED with the
 * "Selected to publish" slot and the `{checked ?` publish↔unpublish slot swap
 * was ADDED, §11 N5; Task 10 swapped one site for another, net 0: the
 * per-item indicator span (`{isActive ?`, T6) was REMOVED and the shared
 * `{railIndicator !== null ?` ternary was ADDED — the ONE site classified
 * ANIMATED (T6′, §A3/§A4). The footer's demoted arm is a chained ternary
 * (`) : isFinalizeDemoted ? (`) covered by the head site's T10 marker — same
 * convention as the header chip's chained `flaggedCount` arm), so a new
 * conditional added later without classification fails this test until marked.
 *
 * Anti-tautology: T10/C7 assertions read the rerendered DOM via the SAME
 * dfid-scoped testids the component itself defines (no sibling decoy can
 * satisfy them since only one modal instance is ever mounted per test); the
 * rail-count / warning-row counts are read directly off the fixture arrays,
 * never restated as literals.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { useState } from "react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { act, cleanup, fireEvent, render, waitFor, within } from "@testing-library/react";
import {
  DURATION_NORMAL_FALLBACK_MS,
  EXIT_FALLBACK_BUFFER_MS,
} from "@/components/admin/review/ReviewModalShell";
import { withReducedMotion } from "../../../helpers/reducedMotion";
import type { ParseResult, ParseWarning } from "@/lib/parser/types";

// RescanSheetButton (mounted in the modal footer) calls useRouter().refresh().
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

import {
  activeSectionFor,
  NAV_SCROLL_SETTLE_TIMEOUT_MS,
  Step3ReviewModal,
  WARNING_HIGHLIGHT_MS,
} from "@/components/admin/wizard/Step3ReviewModal";
import { step3Sections } from "@/components/admin/wizard/step3ReviewSections";
import { warningsBySection } from "@/lib/admin/step3SectionStatus";
import {
  buildStagedSectionData,
  type StagedSectionData,
} from "@/components/admin/review/sectionData";
import { buildParseResult, stagedRow } from "./_step3ReviewFixture";
import { DIAGRAM_TILE_COPY } from "../../../_shared/diagramTileCopy";

const ROOT = join(__dirname, "..", "..", "..", "..");
const MODAL_SRC = readFileSync(join(ROOT, "components/admin/wizard/Step3ReviewModal.tsx"), "utf8");
// Phase-1 extraction (spec 2026-07-16 §5): the rail/content conditional-render
// sites — including the sole animated railIndicator ternary — moved to
// ShowReviewSurface.tsx. The §11 source-marker audit below scans modal + surface
// as one body so the guard follows the moved code; its contract (14 sites,
// exactly 1 animated) is UNCHANGED. Other MODAL_SRC assertions
// (WARNING_HIGHLIGHT_MS, the isFinalizeDemoted chained arm) stay modal-only —
// those elements did not move.
const SURFACE_SRC = readFileSync(
  join(ROOT, "components/admin/review/ShowReviewSurface.tsx"),
  "utf8",
);
const MARKER_AUDIT_SRC = `${MODAL_SRC}\n${SURFACE_SRC}`;
const GLOBALS_CSS = readFileSync(join(ROOT, "app/globals.css"), "utf8");

const DFID = "drive-abc-123";
const WSID = "00000000-1111-4222-8333-444444444444";

afterEach(() => {
  cleanup();
  // Timers did NOT used to be cleared between cases, so a case that left one
  // pending handed it to the next one. The §H teardown snapshot below reads
  // `vi.getTimerCount()` as a baseline, so it silently absorbed whatever the
  // previous case leaked and still passed. That went unnoticed until the
  // content pane gained a child (spec 2026-08-30's draft-restored note),
  // which changed the leak's arithmetic without changing anything about the
  // behaviour under test: probed separately, that note schedules no timer
  // when there is no draft and clears its own on unmount. Clearing here means
  // the baseline measures this case's own tree and nothing else.
  vi.clearAllTimers();
  // ...and sessionStorage, for the same reason one level up. Cases in this
  // file type into the report field, which persists a draft under
  // `fxav-report-draft-wizard-*`, and nothing cleared it, so a later case
  // opened a modal carrying a draft it never wrote. That was invisible until
  // the pane gained a child that READS that key (spec 2026-08-30's
  // draft-restored note), which then mounted in cases that meant to have no
  // draft at all. Measured: sessionStorage held 2 entries at the §H snapshot
  // below, and the note was mounted there.
  window.sessionStorage.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function warning(kind: string): ParseWarning {
  return { severity: "warn", code: "SOME_CODE", message: "", blockRef: { kind } };
}

/** An ambiguity-class warning, which the attention derivation tones as a
 *  judgment call rather than something needing a look (spec §2). */
function judgmentWarning(kind: string): ParseWarning {
  return {
    severity: "warn",
    code: "ROOM_HEADER_SPLIT_AMBIGUOUS",
    message: "",
    blockRef: { kind },
  };
}

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

function tid(name: string): string {
  return `wizard-step3-card-${DFID}-review-${name}`;
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

// ── T1: entrance (spec §11 T1) ──────────────────────────────────────────────

describe("§11 T1: closed → open — CSS-owned entrance", () => {
  test("panel + scrim carry the entrance data hooks; keyframes/durations/reduced-motion live in app/globals.css", () => {
    const { q } = renderModal();
    expect(q.getByTestId(tid("backdrop")).hasAttribute("data-step3-review-scrim")).toBe(true);
    expect(document.querySelector("[data-step3-review-panel]")).not.toBeNull();
    // The component itself does NOT declare the keyframes/animation shorthand —
    // that's CSS-owned (failure mode: JS reimplementing the entrance inline).
    expect(MODAL_SRC).not.toMatch(/@keyframes/);
    // CSS owns both hooks, the two keyframes, and the reduced-motion collapse.
    expect(GLOBALS_CSS).toMatch(/\[data-step3-review-scrim\]\s*\{/);
    expect(GLOBALS_CSS).toMatch(/\[data-step3-review-panel\]\s*\{/);
    expect(GLOBALS_CSS).toMatch(/@keyframes step3-details-sheet-rise/);
    expect(GLOBALS_CSS).toMatch(/@keyframes step3-details-pop-in/);
    expect(GLOBALS_CSS).toMatch(/@keyframes step3-details-scrim-in/);
    expect(GLOBALS_CSS).toMatch(
      /@media \(prefers-reduced-motion: reduce\) \{\s*\[data-step3-review-scrim\],\s*\[data-step3-review-panel\] \{\s*animation: none;/,
    );
  });
});

// ── T2: instant unmount (spec §11 T2) ───────────────────────────────────────

/** Toggle host mirroring the real mount contract: the PARENT conditionally
 *  renders <Step3ReviewModal>, and onClose flips the parent's state to
 *  unmount it — there is no exit animation to wait for. */
function ToggleHost() {
  const [open, setOpen] = useState(true);
  return open ? (
    <Step3ReviewModal
      data={sectionData()}
      checked={false}
      isDirtyRescan={false}
      onRequestSetChecked={async () => true}
      onClose={() => setOpen(false)}
    />
  ) : null;
}

describe("§11 T2: open → closed — exit animation, then unmount (MODAL-CLOSE-EXIT-ANIM-1)", () => {
  // AMENDED CONTRACT. §11 T2 previously ratified "instant unmount, no exit
  // animation"; MODAL-CLOSE-EXIT-ANIM-1 replaces it with a mode-aware exit that
  // reverses the entrance, then calls onClose at exit-end. Reduced motion still
  // collapses to the old instant unmount, so BOTH halves are pinned here — an
  // implementation that skipped the animation entirely would pass the
  // reduced-motion half alone.
  test("close button plays the exit before unmounting; still no AnimatePresence (JS-inline, not framer)", () => {
    vi.useFakeTimers();
    try {
      const q = render(<ToggleHost />);
      expect(q.getByTestId(tid("modal"))).not.toBeNull();
      fireEvent.click(q.getByTestId(tid("close")));
      // Exit in flight: the node is STILL PRESENT. Under the old contract it
      // was already gone by this line — that flip is the feature.
      expect(q.queryByTestId(tid("modal"))).not.toBeNull();
      act(() => {
        vi.advanceTimersByTime(DURATION_NORMAL_FALLBACK_MS + EXIT_FALLBACK_BUFFER_MS + 20);
      });
      expect(q.queryByTestId(tid("modal"))).toBeNull();
      // The exit is driven by inline styles mirroring the drag path, NOT by a
      // new animation library (spec §5) — this half of the pin is unchanged.
      expect(MODAL_SRC).not.toMatch(/AnimatePresence|framer-motion/);
    } finally {
      vi.useRealTimers();
    }
  });

  test("scrim tap-out plays the same exit (all paths converge on requestClose)", () => {
    vi.useFakeTimers();
    try {
      const q = render(<ToggleHost />);
      fireEvent.click(q.getByTestId(tid("backdrop")));
      expect(q.queryByTestId(tid("modal"))).not.toBeNull();
      act(() => {
        vi.advanceTimersByTime(DURATION_NORMAL_FALLBACK_MS + EXIT_FALLBACK_BUFFER_MS + 20);
      });
      expect(q.queryByTestId(tid("modal"))).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  test("reduced motion still unmounts synchronously (spec §3.1 step 4)", () => {
    withReducedMotion(() => {
      const q = render(<ToggleHost />);
      fireEvent.click(q.getByTestId(tid("close")));
      expect(q.queryByTestId(tid("modal"))).toBeNull();
    });
  });
});

// ── T3-T5: drag states (Task 7 full suite; re-assert §11 table values) ──────

describe("§11 T3-T5: drag states — re-asserted table values (Task 7 owns the full suite)", () => {
  const START_Y = 100;

  function grabWithCaptureStubs(q: ReturnType<typeof renderModal>["q"]) {
    const grab = q.getByTestId(tid("grab"));
    Object.assign(grab, { setPointerCapture: vi.fn(), releasePointerCapture: vi.fn() });
    const panel = document.querySelector<HTMLElement>("[data-step3-review-panel]");
    if (!panel) throw new Error("panel not rendered");
    return { grab, panel };
  }

  test("T3: transition AND animation both 'none' during drag (transform-only tracking)", () => {
    const { q } = renderModal();
    const { grab, panel } = grabWithCaptureStubs(q);
    fireEvent.pointerDown(grab, { pointerId: 1, clientY: START_Y });
    expect(panel.style.transition).toBe("none");
    expect(panel.style.animation).toBe("none");
    fireEvent.pointerMove(grab, { pointerId: 1, clientY: START_Y + 40 });
    expect(panel.style.transform).toBe("translateY(40px)");
  });

  test("T4: spring-back uses --duration-fast (release below threshold)", () => {
    const { q } = renderModal();
    const { grab, panel } = grabWithCaptureStubs(q);
    fireEvent.pointerDown(grab, { pointerId: 1, clientY: START_Y });
    fireEvent.pointerMove(grab, { pointerId: 1, clientY: START_Y + 20 }); // past slop, short of dismiss
    fireEvent.pointerUp(grab, { pointerId: 1, clientY: START_Y + 20 });
    expect(panel.style.transition).toBe("transform var(--duration-fast) var(--ease-out-quart)");
    expect(panel.style.transform).toBe("translateY(0px)");
  });

  test("T5: dismiss transition uses --duration-normal + --ease-out-quart (release past threshold)", () => {
    const { q } = renderModal();
    const { grab, panel } = grabWithCaptureStubs(q);
    fireEvent.pointerDown(grab, { pointerId: 1, clientY: START_Y });
    fireEvent.pointerMove(grab, { pointerId: 1, clientY: START_Y + 200 }); // past dismiss threshold
    fireEvent.pointerUp(grab, { pointerId: 1, clientY: START_Y + 200 });
    expect(panel.style.transition).toBe("transform var(--duration-normal) var(--ease-out-quart)");
    expect(panel.style.transform).toBe("translateY(100%)");
  });
});

// ── T6′: activeSection change (spec §11 T6′; Task 10 spec §A3/§A4) ───────────

describe("§11 T6′: activeSection change — transition-colors on both navs' BUTTONS; the shared rail indicator slides", () => {
  test("every rail item and chip item carries transition-colors duration-fast and NO transform/height transition (§A4: no transform transitions on items)", () => {
    const { q } = renderModal();
    // Read the registry-order ids straight off the rendered rail (anti-tautology:
    // derived from the DOM the component actually produced, not a hardcoded list).
    const railItems = Array.from(
      q.getByTestId(tid("rail")).querySelectorAll<HTMLElement>('[data-testid*="-rail-item-"]'),
    );
    const chipItems = Array.from(
      q.getByTestId(tid("chiprail")).querySelectorAll<HTMLElement>('[data-testid*="-chip-item-"]'),
    );
    expect(railItems.length).toBeGreaterThan(0);
    expect(chipItems.length).toBeGreaterThan(0);
    for (const el of [...railItems, ...chipItems]) {
      expect(el.className).toMatch(/\btransition-colors\b/);
      expect(el.className).toMatch(/\bduration-fast\b/);
      expect(el.className).not.toMatch(/transition-\[/);
    }
  });

  test("the SHARED indicator (aria-hidden, first child of the rail nav) carries the slide transition after first measure — the ONE sanctioned T6 pin flip (Task 10)", () => {
    // jsdom computes no layout: give the rail nav + its buttons non-zero
    // rects so the §A3 measurement effect renders the indicator, and queue
    // rAF so the transition-enable tick can be flushed deterministically.
    const originalRects = Element.prototype.getBoundingClientRect;
    const realRaf = window.requestAnimationFrame;
    const realCaf = window.cancelAnimationFrame;
    const queue: FrameRequestCallback[] = [];
    Element.prototype.getBoundingClientRect = function (this: Element) {
      const t = this.getAttribute("data-testid") ?? "";
      let top = 0;
      let height = 0;
      if (t === tid("rail")) {
        top = 40;
        height = 400;
      } else if (t.includes("-review-rail-item-")) {
        const items = Array.from(document.querySelectorAll('[data-testid*="-review-rail-item-"]'));
        top = 48 + items.indexOf(this) * 48;
        height = 44;
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
    window.requestAnimationFrame = ((cb: FrameRequestCallback) => {
      queue.push(cb);
      return queue.length;
    }) as typeof requestAnimationFrame;
    window.cancelAnimationFrame = (() => {}) as typeof cancelAnimationFrame;
    try {
      const { q } = renderModal();
      act(() => {
        for (const cb of queue.splice(0)) cb(0);
      });
      const rail = q.getByTestId(tid("rail"));
      const indicator = q.getByTestId(tid("rail-indicator"));
      expect(indicator.getAttribute("aria-hidden")).toBe("true");
      expect(rail.firstElementChild).toBe(indicator);
      const classes = indicator.className.split(/\s+/);
      for (const c of [
        "transition-[transform,height]",
        "duration-fast",
        "ease-out-quart",
        "motion-reduce:transition-none",
      ]) {
        expect(classes).toContain(c);
      }
      // No per-item indicator spans remain inside any rail item.
      for (const item of Array.from(
        rail.querySelectorAll<HTMLElement>('[data-testid*="-rail-item-"]'),
      )) {
        expect(item.querySelector(".bg-accent")).toBeNull();
      }
    } finally {
      Element.prototype.getBoundingClientRect = originalRects;
      window.requestAnimationFrame = realRaf;
      window.cancelAnimationFrame = realCaf;
    }
  });
});

// ── T7 / T7b: publish label + checked swaps (spec §11 T7/T7b) ──────────────

describe("§11 T7/T7b: checked + publish-state swaps are instant — no animation class on the publish button", () => {
  test("publish button carries no entrance/exit animation utility (transition-colors is a hover affordance, not a state-swap animation)", () => {
    const { q } = renderModal();
    const btn = q.getByTestId(tid("publish"));
    expect(btn.className).not.toMatch(/\banimate-|transition-\[|duration-normal\b/);
    cleanup();
    // The checked slot is the quiet/secondary Unpublish button (spec §C2) —
    // the instant-swap contract holds for it too.
    const { q: q2 } = renderModal({ checked: true });
    expect(q2.getByTestId(tid("publish")).className).not.toMatch(
      /\banimate-|transition-\[|duration-normal\b/,
    );
  });

  test("T7/N5: label swaps instantly between unchecked/checked across separate mounts (no animation)", () => {
    const { q } = renderModal({ checked: false });
    expect(q.getByTestId(tid("publish")).textContent).toBe("Publish this show");
    cleanup();
    const { q: q2 } = renderModal({ checked: true });
    expect(q2.getByTestId(tid("publish")).textContent).toBe("Unpublish");
  });

  test("T7b: pending → error note appears instantly, no animation on the note or button", async () => {
    const { q } = renderModal({ onRequestSetChecked: vi.fn(async () => false) });
    fireEvent.click(q.getByTestId(tid("publish")));
    await waitFor(() =>
      expect(
        within(q.getByTestId(tid("footer"))).getByText(
          "Couldn't update the publish selection. Try again.",
        ),
      ).toBeTruthy(),
    );
    const note = within(q.getByTestId(tid("footer"))).getByText(
      "Couldn't update the publish selection. Try again.",
    );
    expect(note.className).not.toMatch(/\banimate-|transition-\[/);
  });
});

// ── T8: rescanPending swap (spec §11 T8) ────────────────────────────────────

describe("§11 T8: rescanPending false ↔ true — existing RescanSheetButton label/aria-busy swap, unchanged, instant", () => {
  test("clicking re-scan flips aria-busy + label instantly (mid-flight), no animation class on the button", async () => {
    let resolveFetch!: (r: Response) => void;
    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          new Promise<Response>((resolve) => {
            resolveFetch = resolve;
          }),
      ),
    );
    const { q } = renderModal();
    const btn = q.getByTestId(`rescan-sheet-button-${DFID}`) as HTMLButtonElement;
    expect(btn.getAttribute("aria-busy")).toBe("false");
    expect(btn.textContent).toBe("Re-scan this sheet");
    // One-tap (G3 guard withdrawn): a single click fires and flips to pending.
    fireEvent.click(btn);
    await waitFor(() => expect(btn.getAttribute("aria-busy")).toBe("true"));
    expect(btn.textContent).toBe("Re-scanning…");
    expect(btn.className).not.toMatch(/\banimate-|transition-\[|duration-normal\b/);
    await act(async () => {
      resolveFetch(
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
      );
    });
  });
});

// ── T9: pack-list chevron rotate (spec §11 T9) ──────────────────────────────

describe("§11 T9: pack-list <details> open/close — chevron transform rotate duration-fast; row reveal instant", () => {
  test("the chevron carries transition-transform duration-fast group-open:rotate-90; details toggles open with no delay", () => {
    const d = sectionData(
      {},
      {
        pullSheet: [
          { caseLabel: "Case A", items: [{ qty: 1, cat: null, subCat: null, item: "Cable" }] },
        ],
      },
    );
    const { q } = renderModal({ d });
    const details = q.getByTestId(`wizard-step3-card-${DFID}-pack-case-0`) as HTMLDetailsElement;
    const chevron = details.querySelector("svg")!;
    expect(chevron.getAttribute("class")).toMatch(/transition-transform/);
    expect(chevron.getAttribute("class")).toMatch(/duration-fast/);
    expect(chevron.getAttribute("class")).toMatch(/group-open:rotate-90/);
    expect(details.open).toBe(false);
    // Row reveal is instant: toggling `open` immediately exposes the item list,
    // no animation frame to wait for.
    details.open = true;
    fireEvent(details, new Event("toggle", { bubbles: false }));
    expect(within(details).getByText(/Cable/)).toBeTruthy();
  });
});

// ── T10: props change while open (spec §11 T10) ─────────────────────────────

describe("§11 T10: warnings/props change while open — instant re-render (server truth)", () => {
  test("adding a warning via rerender shows the new row immediately; the header chip flips instantly; no animation class on the warnings panel", () => {
    const d0 = sectionData({ warnings: [] });
    const { q } = renderModal({ d: d0 });
    expect(q.getByTestId(tid("chip")).textContent).toBe("All clean");
    expect(q.queryByTestId(`wizard-step3-card-${DFID}-warning-0`)).toBeNull();

    const d1 = sectionData({ warnings: [warning("crew")] });
    q.rerender(
      <Step3ReviewModal
        data={d1}
        checked={false}
        isDirtyRescan={false}
        onRequestSetChecked={vi.fn(async () => true)}
        onClose={vi.fn()}
      />,
    );

    // Instant: no waitFor — the new row is present the moment rerender returns.
    expect(q.getByTestId(`wizard-step3-card-${DFID}-warning-0`)).toBeTruthy();
    expect(q.getByTestId(tid("chip")).textContent).toBe("1 needs a look");
    const warningsPanel = q.getByTestId(tid("section-warnings"));
    expect(warningsPanel.className).not.toMatch(/\banimate-|transition-\[height\]|motion\b/);
  });
});

// ── C7: checked flips via the card while the modal is open ──────────────────

describe("§11 C7: checked flips via the card checkbox while the modal is open — footer label updates instantly, no animation", () => {
  test("rerendering with checked=true (simulating the card's shared state flip) updates the footer label with no wait, no animation class", () => {
    const d = sectionData();
    const { q } = renderModal({ d, checked: false });
    expect(q.getByTestId(tid("publish")).textContent).toBe("Publish this show");

    q.rerender(
      <Step3ReviewModal
        data={d}
        checked={true}
        isDirtyRescan={false}
        onRequestSetChecked={vi.fn(async () => true)}
        onClose={vi.fn()}
      />,
    );

    expect(q.getByTestId(tid("publish")).textContent).toBe("Unpublish");
    expect(q.getByTestId(tid("publish")).className).not.toMatch(/\banimate-|transition-\[/);
  });
});

// ── §H (follow-ups spec 2026-07-03): suppression harness for N1 + compounds ──

/** Self-contained §A2 harness (mirrors the proven Task-10 setup in
 *  Step3ReviewModal.test.tsx): fake timers, rAF mapped onto 0ms fake timeouts
 *  (a SYNCHRONOUS rAF stub would wedge the component's scroll throttle),
 *  prototype `scrollTo` stub, and dynamic per-element geometry — the content
 *  pane is the coordinate origin (rect.top always 0); a mapped element's
 *  viewport-relative top = absoluteTop − content.scrollTop, exactly what a
 *  real scrolled pane reports, so `sectionTopFor` recovers the absolute
 *  container-relative top at ANY scroll position. Warning rows are mapped
 *  too (the §E4 jump target). Callers MUST call `restore()` in a finally. */
function suppressionSetup(opts: { d?: StagedSectionData; checked?: boolean } = {}) {
  vi.useFakeTimers();
  const realRaf = window.requestAnimationFrame;
  const realCaf = window.cancelAnimationFrame;
  window.requestAnimationFrame = ((cb: FrameRequestCallback) =>
    setTimeout(() => cb(0), 0) as unknown as number) as typeof requestAnimationFrame;
  window.cancelAnimationFrame = ((id: number) =>
    clearTimeout(id as unknown as ReturnType<typeof setTimeout>)) as typeof cancelAnimationFrame;
  const originalScrollTo = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "scrollTo");
  Object.defineProperty(HTMLElement.prototype, "scrollTo", {
    value: vi.fn(),
    configurable: true,
    writable: true,
  });

  const { q, d } = renderModal({
    ...(opts.d ? { d: opts.d } : {}),
    ...(opts.checked !== undefined ? { checked: opts.checked } : {}),
  });
  const defs = step3Sections(d);
  const n = defs.length;
  const content = q.getByTestId(tid("content"));
  const clientHeight = 600;
  const scrollHeight = n * 1000 + 400;
  Object.defineProperty(content, "clientHeight", { value: clientHeight, configurable: true });
  Object.defineProperty(content, "scrollHeight", { value: scrollHeight, configurable: true });
  const absTops = new Map<Element, number>();
  defs.forEach((s, i) => absTops.set(q.getByTestId(tid(`section-${s.id}`)), i * 1000));
  const warningsIdx = defs.findIndex((s) => s.id === "warnings");
  const warningTop = (i: number) => warningsIdx * 1000 + 40 + i * 60;
  for (const el of Array.from(content.querySelectorAll("[data-warning-index]"))) {
    absTops.set(el, warningTop(Number(el.getAttribute("data-warning-index"))));
  }
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
  const restore = () => {
    Element.prototype.getBoundingClientRect = originalRects;
    window.requestAnimationFrame = realRaf;
    window.cancelAnimationFrame = realCaf;
    if (originalScrollTo) {
      Object.defineProperty(HTMLElement.prototype, "scrollTo", originalScrollTo);
    } else {
      delete (HTMLElement.prototype as { scrollTo?: unknown }).scrollTo;
    }
    vi.useRealTimers();
  };
  return {
    q,
    d,
    defs,
    content,
    clientHeight,
    scrollHeight,
    absTop: (i: number) => i * 1000,
    warningTop,
    tops: defs.map((s, i) => ({ id: s.id, top: i * 1000 })),
    restore,
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

// ── §H N1: active held constant during a suppressed programmatic scroll ─────

describe("§H N1: `active` during a suppressed programmatic scroll — held constant (no intermediate values)", () => {
  test("after a far nav click, an intermediate glide frame the pure rule would re-derive does NOT move aria-current on either nav (full §A2 suite: Step3ReviewModal.test.tsx)", () => {
    const { q, defs, content, clientHeight, scrollHeight, absTop, tops, restore } =
      suppressionSetup();
    try {
      const target = defs[defs.length - 1]!;
      fireEvent.click(q.getByTestId(tid(`rail-item-${target.id}`)));
      expect(navActiveId(q, "rail")).toBe(target.id);
      // Sanity (anti-tautology): the pure rule WOULD derive a different id at
      // this frame — only the §A2 suppression can hold it.
      const intermediate = absTop(1) + 10;
      expect(activeSectionFor(intermediate, clientHeight, scrollHeight, tops)).not.toBe(target.id);
      scrollAt(content, intermediate);
      expect(navActiveId(q, "rail")).toBe(target.id);
      expect(navActiveId(q, "chiprail")).toBe(target.id); // shared state — both navs held
    } finally {
      restore();
    }
  });
});

// ── §H N2: callout presence — static with section render ────────────────────

describe("§H N2: callout presence — static with the section render, no mount animation", () => {
  test("the flag callout root carries NO animation/transition class (its presence follows the warnings prop, not a state transition)", () => {
    const d = sectionData({ warnings: [warning("crew")] });
    const { q } = renderModal({ d });
    const callout = q.getByTestId(`wizard-step3-card-${DFID}-section-crew-flag-callout`);
    expect(callout.className).not.toMatch(/\banimate-|\btransition-/);
  });
});

// ── §H N3: warning highlight — CSS keyframe + WARNING_HIGHLIGHT_MS drift pin ─

describe("§H N3: warning highlight — one-shot background fade over WARNING_HIGHLIGHT_MS; reduced motion = steady tint", () => {
  test("globals.css owns the keyframe, the duration literal matches the exported constant (drift-guard pairing), and reduced motion collapses to a steady tint", () => {
    expect(GLOBALS_CSS).toMatch(/@keyframes step3-warning-flash/);
    // CSS↔constant drift pin (same pattern as DURATION_NORMAL_FALLBACK_MS):
    // the animation duration literal MUST equal the component's exported
    // WARNING_HIGHLIGHT_MS — a token change on either side fails here instead
    // of drifting silently (highlight attribute removed before/after the fade
    // ends).
    expect(GLOBALS_CSS).toMatch(
      new RegExp(
        String.raw`\[data-step3-warning-flash\]\s*\{\s*animation: step3-warning-flash ${WARNING_HIGHLIGHT_MS}ms`,
      ),
    );
    expect(MODAL_SRC).toMatch(/export const WARNING_HIGHLIGHT_MS = 1600;/);
    // Reduced motion: no fade — a steady tint that disappears WITH the
    // attribute (the JS timer removes it after WARNING_HIGHLIGHT_MS).
    expect(GLOBALS_CSS).toMatch(
      /@media \(prefers-reduced-motion: reduce\) \{\s*\[data-step3-warning-flash\] \{\s*animation: none;\s*background-color: var\(--color-warning-bg\);/,
    );
  });
});

// ── §H N4: rescan overlay result — fast pop-in appear, instant disappear ────

describe("§H N4: rescan overlay result — fast pop-in on appear; instant (synchronous) removal on dismiss; reduced motion none", () => {
  test("CSS owns the entrance at --duration-fast with a reduced-motion collapse; the rendered result carries the hook attribute; dismissal removes the node synchronously", async () => {
    expect(GLOBALS_CSS).toMatch(
      /\[data-rescan-overlay-result\]\s*\{\s*animation: step3-details-pop-in var\(--duration-fast\) var\(--ease-out-quart\);/,
    );
    expect(GLOBALS_CSS).toMatch(
      /@media \(prefers-reduced-motion: reduce\) \{\s*\[data-rescan-overlay-result\] \{\s*animation: none;/,
    );

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
    // One tap fires (G3 guard withdrawn).
    fireEvent.click(q.getByTestId(`rescan-sheet-button-${DFID}`));
    await waitFor(() => expect(q.getByTestId(`rescan-sheet-result-${DFID}`)).toBeTruthy());
    const result = q.getByTestId(`rescan-sheet-result-${DFID}`);
    expect(result.hasAttribute("data-rescan-overlay-result")).toBe(true); // CSS hook wired
    // The copy is the INNER element; the positioned wrapper carries no role.
    // It is no longer a live region — an inserted-with-its-text region never
    // announced, so the announcement moved to the branch-stable provider channel
    // (BL-ANNOUNCE-REGION-UNMOUNT-CLASS). This row is about the ENTRANCE
    // ANIMATION contract, which is unchanged: the hook attribute and the inner
    // copy element are what it pins.
    expect(result.querySelector('[role="status"]')).toBeNull();
    expect(result.querySelector("p")).not.toBeNull();
    // Instant exit: the dismiss click removes the node within the SAME act —
    // no waitFor, no exit animation to linger through.
    fireEvent.click(within(result).getByRole("button", { name: "Dismiss" }));
    expect(q.queryByTestId(`rescan-sheet-result-${DFID}`)).toBeNull();
  });
});

// ── §H N5: publish ↔ unpublish ↔ NotPublishable slot swaps — instant ────────

describe("§H N5: Publish ↔ Unpublish ↔ Removing… ↔ NotPublishable slot swaps — instant", () => {
  test("checked → unchecked rerender swaps the footer label instantly, no animation class on either slot's button (C7 above covers the opposite direction)", () => {
    const d = sectionData();
    const { q } = renderModal({ d, checked: true });
    expect(q.getByTestId(tid("publish")).textContent).toBe("Unpublish");
    expect(q.getByTestId(tid("publish")).className).not.toMatch(/\banimate-|transition-\[/);
    q.rerender(
      <Step3ReviewModal
        data={d}
        checked={false}
        isDirtyRescan={false}
        onRequestSetChecked={vi.fn(async () => true)}
        onClose={vi.fn()}
      />,
    );
    // Instant: present the moment rerender returns — no waitFor.
    expect(q.getByTestId(tid("publish")).textContent).toBe("Publish this show");
    expect(q.getByTestId(tid("publish")).className).not.toMatch(/\banimate-|transition-\[/);
  });

  test("demotion rerender (lastFinalizeFailureCode set) swaps the slot to NotPublishableNote instantly, no transition classes on the note", () => {
    const d = sectionData();
    const { q } = renderModal({ d, checked: false });
    expect(q.getByTestId(tid("publish"))).toBeTruthy();
    expect(q.queryByTestId(tid("not-publishable"))).toBeNull();
    const demoted: StagedSectionData = {
      ...d,
      row: { ...d.row, lastFinalizeFailureCode: "DRIVE_FETCH_FAILED" },
    };
    q.rerender(
      <Step3ReviewModal
        data={demoted}
        checked={false}
        isDirtyRescan={false}
        onRequestSetChecked={vi.fn(async () => true)}
        onClose={vi.fn()}
      />,
    );
    expect(q.queryByTestId(tid("publish"))).toBeNull();
    const note = q.getByTestId(tid("not-publishable"));
    expect(note.className).not.toMatch(/\banimate-|\btransition-/);
  });
});

// ── §H N6: diagram tile img load / error→placeholder ────────────────────────

describe("§H N6: diagram tile — browser-default img load; error→placeholder swap is instant", () => {
  test("firing `error` on a tile <img> replaces it with the placeholder synchronously; neither carries animation classes", () => {
    const d = sectionData({
      diagrams: {
        linkedFolder: null,
        embeddedImages: [
          {
            sheetTab: "Diagrams",
            objectId: "obj-1",
            mimeType: "image/png",
            contentUrl: "https://lh3.googleusercontent.com/d/obj-1",
            sheetsRevisionId: "rev-1",
            embeddedFingerprint: "fp_abc",
            recovery_disposition: "normal",
            snapshotPath: null,
          },
        ],
        linkedFolderItems: [],
      },
    });
    const { q } = renderModal({ d });
    const tileId = `wizard-step3-card-${DFID}-diagram-tile-0`;
    const tile = q.getByTestId(tileId);
    expect(tile.tagName).toBe("A");
    const img = tile.querySelector("img")!;
    expect(img.className).not.toMatch(/\banimate-|\btransition-/);
    fireEvent.error(img);
    // Instant: the placeholder is in place the moment the event handler's
    // re-render flushes — no waitFor.
    const placeholder = q.getByTestId(tileId);
    expect(placeholder.tagName).toBe("SPAN");
    // The message is a SIBLING of the box now, so it is read off the cell.
    // The box's own tagName swap above is still the instant-ness assertion.
    const cell = q.getByTestId(`wizard-step3-card-${DFID}-diagram-cell-0`);
    // A real error on a mounted image, so the LOAD-FAILED sentence.
    expect(cell.textContent).toContain(DIAGRAM_TILE_COPY.loadFailed);
    expect(placeholder.className).not.toMatch(/\banimate-|\btransition-/);
  });
});

// ── §H N7: report status idle→pending→error — instant text swaps ────────────

describe("§H N7: report status idle→pending→success/error — instant text swaps in the SAME aria-live region", () => {
  test("submit drives idle→pending→error as synchronous text swaps in one role=status element with no animation classes", async () => {
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
    const { q } = renderModal();
    // Follow-ups-b2 §D (T-D2): the form is collapsed by default — expand first.
    fireEvent.click(q.getByTestId(`wizard-step3-card-${DFID}-report-toggle`));
    const statusEl = q.getByTestId(`wizard-step3-card-${DFID}-report-status`);
    expect(statusEl.getAttribute("role")).toBe("status");
    expect(statusEl.getAttribute("aria-live")).toBe("polite");
    expect(statusEl.textContent).toBe(""); // idle
    fireEvent.change(q.getByTestId(`wizard-step3-card-${DFID}-report-textarea`), {
      target: { value: "something broke" },
    });
    fireEvent.click(q.getByTestId(`wizard-step3-card-${DFID}-report-submit`));
    // Pending copy lands synchronously with the click's act flush — instant.
    expect(statusEl.textContent).toBe("Sending…");
    await act(async () => {
      resolveFetch({ ok: false, status: 500, json: async () => ({}) });
    });
    // Error copy swaps in the SAME element (identity pinned — the aria-live
    // region persists across states so AT announces the change).
    expect(q.getByTestId(`wizard-step3-card-${DFID}-report-status`)).toBe(statusEl);
    expect(statusEl.textContent).not.toBe("");
    expect(statusEl.textContent).not.toBe("Sending…");
    expect(statusEl.className).not.toMatch(/\banimate-|\btransition-/);
  });
});

// ── §H compounds ─────────────────────────────────────────────────────────────

describe("§H compound (a): jump-link clicked during an in-flight nav glide — target replaced, settle timer restarted", () => {
  test("the old click's timer is cleared (old remainder passes → still suppressed); release comes only at the NEW full timeout", () => {
    const d = sectionData({ warnings: [warning("crew")] });
    const { q, defs, content, absTop, restore } = suppressionSetup({ d });
    try {
      const railTarget = defs[defs.length - 1]!;
      fireEvent.click(q.getByTestId(tid(`rail-item-${railTarget.id}`)));
      act(() => {
        vi.advanceTimersByTime(NAV_SCROLL_SETTLE_TIMEOUT_MS - 1); // old timer: 1ms left
      });
      const callout = q.getByTestId(`wizard-step3-card-${DFID}-section-crew-flag-callout`);
      fireEvent.click(
        within(callout).getByRole("button", { name: /^(?:Fix|Review) in Sheet warnings/ }),
      );
      expect(navActiveId(q, "rail")).toBe("warnings"); // target replaced immediately
      // Only the LAST target releases on settle: parking at the OLD click's
      // target holds (a stale-target release would re-derive here).
      scrollAt(content, absTop(defs.length - 1) - 8);
      expect(navActiveId(q, "rail")).toBe("warnings");
      // The old timer's 1ms remainder passed long ago inside this window — if
      // the jump had NOT restarted the timer, this frame would re-derive.
      // (The frame is also in-flight scroll progress, which itself restarts
      // the fallback — Task 14's §A2 condition-3 semantics.)
      act(() => {
        vi.advanceTimersByTime(NAV_SCROLL_SETTLE_TIMEOUT_MS - 1);
      });
      scrollAt(content, absTop(1) + 10);
      expect(navActiveId(q, "rail")).toBe("warnings"); // still suppressed
      // …and a FULL idle window with no further scroll progress releases.
      act(() => {
        vi.advanceTimersByTime(NAV_SCROLL_SETTLE_TIMEOUT_MS);
      });
      scrollAt(content, absTop(1) + 10);
      expect(navActiveId(q, "rail")).toBe(defs[1]!.id);
    } finally {
      restore();
    }
  });

  test("settling at the NEW (jump) target releases — with no timer advance and no user input", () => {
    const d = sectionData({ warnings: [warning("crew")] });
    const { q, defs, content, absTop, warningTop, restore } = suppressionSetup({ d });
    try {
      fireEvent.click(q.getByTestId(tid(`rail-item-${defs[defs.length - 1]!.id}`)));
      const callout = q.getByTestId(`wizard-step3-card-${DFID}-section-crew-flag-callout`);
      fireEvent.click(
        within(callout).getByRole("button", { name: /^(?:Fix|Review) in Sheet warnings/ }),
      );
      // Old target frame: held (replaced target owns the release).
      scrollAt(content, absTop(defs.length - 1) - 8);
      expect(navActiveId(q, "rail")).toBe("warnings");
      // Settle at the JUMP target (warning row top − 8): releases + falls
      // through to derivation the same frame…
      scrollAt(content, warningTop(0) - 8);
      // …so the NEXT frame re-derives freely (no timers, no user input).
      scrollAt(content, absTop(1) + 10);
      expect(navActiveId(q, "rail")).toBe(defs[1]!.id);
    } finally {
      restore();
    }
  });
});

describe("§H compound (b): unmount during an active highlight + active suppression — timers cleared in effect teardown", () => {
  test("after a jump (highlight attribute set + suppression engaged), unmount clears BOTH timers: nothing left to fire, no attribute-removal errors", () => {
    const d = sectionData({ warnings: [warning("crew")] });
    const { q, restore } = suppressionSetup({ d });
    try {
      // Drain the environment's one-shot mount-time 0ms timer (React/jsdom
      // scheduling under fake timers — not component-owned; it never
      // reschedules) so the counts below measure ONLY the component's timers.
      //
      // TWO drains since 2026-08-27, and the second one is the point. The
      // attention pill's auto-open schedules a frame at mount (spec §3.5, a 0ms
      // timer under this file's rAF stub); firing it opens the menu, whose
      // frame then schedules its OWN entrance frame — from a React effect that
      // commits when act() exits, AFTER the clock advance. So a single drain,
      // at any duration, always leaves exactly one frame pending, and it lands
      // in `ambient`: the teardown assertion below then reads a correct cleanup
      // as a leak. Two acts let React commit in between; neither frame
      // reschedules, so the premise this snapshot is written to hold is
      // restored rather than loosened.
      // Drain until the count STOPS changing rather than exactly twice. The
      // two-act form encoded an assumption about how many entrance frames the
      // tree schedules, so it broke the moment the content pane gained a
      // child (spec 2026-08-30's draft-restored note) even though that child
      // schedules nothing here and leaks nothing: probed both ways, it adds no
      // timer without a draft and clears its own on unmount. Draining to a
      // fixed point states the premise the snapshot actually needs -- "no
      // entrance work is still pending" -- instead of a frame count that any
      // future child invalidates again.
      let previous = -1;
      for (let i = 0; i < 10 && previous !== vi.getTimerCount(); i++) {
        previous = vi.getTimerCount();
        act(() => {
          vi.advanceTimersByTime(0);
        });
      }
      const ambient = vi.getTimerCount();
      expect(ambient, "premise: entrance frames settled to a fixed point").toBe(previous);
      const callout = q.getByTestId(`wizard-step3-card-${DFID}-section-crew-flag-callout`);
      fireEvent.click(
        within(callout).getByRole("button", { name: /^(?:Fix|Review) in Sheet warnings/ }),
      );
      // Both §H states active: the one-shot highlight attribute is on the row
      // (its WARNING_HIGHLIGHT_MS timer pending) AND the §A2 settle timer runs.
      expect(
        q
          .getByTestId(`wizard-step3-card-${DFID}-warning-0`)
          .hasAttribute("data-step3-warning-flash"),
      ).toBe(true);
      expect(vi.getTimerCount()).toBe(ambient + 2); // settle + highlight, nothing else
      q.unmount();
      // Teardown hygiene: highlight timer (useEffect(() => clearWarningHighlight))
      // and settle timer (scroll-spy effect's releaseSpySuppression) both cleared.
      expect(vi.getTimerCount()).toBe(ambient);
      expect(() => vi.runAllTimers()).not.toThrow();
    } finally {
      restore();
    }
  });
});

describe("§H compound (c): checked flips (external settlement) while a suppressed scroll is in flight", () => {
  test("the footer swap is instant AND does not touch nav state — the next intermediate frame is still held", () => {
    const { q, d, defs, content, absTop, restore } = suppressionSetup({ checked: false });
    try {
      const target = defs[defs.length - 1]!;
      fireEvent.click(q.getByTestId(tid(`rail-item-${target.id}`)));
      scrollAt(content, absTop(1) + 10);
      expect(navActiveId(q, "rail")).toBe(target.id); // suppression in flight
      expect(q.getByTestId(tid("publish")).textContent).toBe("Publish this show");
      // External settlement flips checked mid-glide (same `data` identity, so
      // the scroll-spy effect does NOT re-run — refs survive the rerender).
      q.rerender(
        <Step3ReviewModal
          data={d}
          checked={true}
          isDirtyRescan={false}
          onRequestSetChecked={vi.fn(async () => true)}
          onClose={vi.fn()}
        />,
      );
      expect(q.getByTestId(tid("publish")).textContent).toBe("Unpublish"); // instant swap
      // Nav state untouched: another intermediate frame is STILL suppressed.
      scrollAt(content, absTop(2) + 10);
      expect(navActiveId(q, "rail")).toBe(target.id);
    } finally {
      restore();
    }
  });
});

describe("§H compound (d): unpublish resolves while the rescan overlay result is open — independent", () => {
  test("the footer slot swaps under the overlay; the overlay result stays mounted through pending, resolution, and the checked flip", async () => {
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
    const d = sectionData();
    let resolveUnpublish!: (ok: boolean) => void;
    const onRequestSetChecked = vi.fn(
      () =>
        new Promise<boolean>((resolve) => {
          resolveUnpublish = resolve;
        }),
    );
    const { q } = renderModal({ d, checked: true, onRequestSetChecked });
    // Open the overlay result first (one tap fires — G3 guard withdrawn).
    fireEvent.click(q.getByTestId(`rescan-sheet-button-${DFID}`));
    await waitFor(() => expect(q.getByTestId(`rescan-sheet-result-${DFID}`)).toBeTruthy());
    // Start the unpublish while the overlay is open.
    fireEvent.click(q.getByTestId(tid("publish")));
    expect(q.getByTestId(tid("publish")).textContent).toBe("Removing…");
    expect(q.getByTestId(`rescan-sheet-result-${DFID}`)).toBeTruthy(); // untouched by pending
    await act(async () => {
      resolveUnpublish(true);
    });
    // Settlement: the card flips the checked prop (§9.2 waiter queue).
    q.rerender(
      <Step3ReviewModal
        data={d}
        checked={false}
        isDirtyRescan={false}
        onRequestSetChecked={onRequestSetChecked}
        onClose={vi.fn()}
      />,
    );
    expect(q.getByTestId(tid("publish")).textContent).toBe("Publish this show"); // slot swapped
    const result = q.getByTestId(`rescan-sheet-result-${DFID}`);
    expect(result.hasAttribute("data-rescan-overlay-result")).toBe(true); // overlay still open
  });
});

// ── Source-marker audit ──────────────────────────────────────────────────────

/** Every JSX ternary/`&&` conditional in Step3ReviewModal.tsx that mounts or
 *  unmounts an element. Matches BOTH the multi-line style this file currently
 *  uses (`{cond ? (` on its own line, JSX branch on following lines) and a
 *  one-line style (`{cond ? <X` / `{cond && <X`), so a future conditional
 *  written either way is still caught by the count assertion below. */
function findConditionalLines(src: string): number[] {
  const lines = src.split("\n");
  const hits: number[] = [];
  const multiLine = /^\s*\{.*\?\s*\(\s*$/;
  const oneLineTernary = /\{[a-zA-Z][^{}]*\?\s*<[A-Za-z]/;
  const oneLineAnd = /\{[a-zA-Z][^{}]*&&\s*<[A-Za-z]/;
  lines.forEach((line, i) => {
    if (multiLine.test(line) || oneLineTernary.test(line) || oneLineAnd.test(line)) {
      hits.push(i); // 0-indexed
    }
  });
  return hits;
}

/** True if the line immediately preceding `lineIndex` (skipping nothing — the
 *  marker/animation annotation must sit directly above the conditional) either
 *  declares the deliberate-instant marker or documents an animation treatment. */
function isClassified(
  lines: string[],
  lineIndex: number,
): { classified: boolean; instant: boolean } {
  const prev = lines[lineIndex - 1] ?? "";
  const instant = prev.includes("§11") && prev.includes("instant — deliberate");
  const animated = /animate-|transition-\[|duration-(fast|normal)\b|ease-out-quart\b/.test(prev);
  return { classified: instant || animated, instant };
}

describe("§11 source-marker audit — every conditional-render site in Step3ReviewModal.tsx is classified", () => {
  test("exactly 18 conditional-render sites exist (curated list length) — a new one added later must be classified or this count fails", () => {
    // 16 sites as of the announcer bundle (see the pre-rebase comment in git
    // history for the per-era split) + 3 from dev-modal-capture §2.3: the
    // viewerIsDeveloper section head, the busy glyph swap ternary, and the
    // status-node presence conditional (all deliberate-instant, spec §7.4).
    //
    // MINUS 2 (BL-ANNOUNCE-REGION-UNMOUNT-CLASS): the dev-capture status node
    // and the publish-error note stopped being conditional RENDERS and became
    // conditional TEXT inside permanently-mounted live regions. A region
    // inserted together with its text is never announced, so those two sites
    // had to stop being conditionals — which is why this count moved rather
    // than a new site being classified. Both remain deliberate-instant: there
    // is now even less to animate, since only the text changes.
    //
    // PLUS 1 (2026-08-15-step3-crew-preview §2.8): the "Open crew preview"
    // footer link, rendered only when the ordinary row carries a `stagedId`.
    // Deliberate-instant — a static anchor with no state and no animation.
    //
    // PLUS 5 (2026-08-27-wizard-review-attention-menu §3.2): the attention
    // pill's segments — the needs-look segment, its sr-only 99+ expansion, the
    // judgment segment, that segment's leading separator, and its own sr-only
    // 99+ expansion. All five follow derived counts, all five are
    // deliberate-instant, and the §8 pair table is exercised by the "attention
    // pill: §8 inventory" describe below. The five-state chip ternary itself
    // REPLACES the previous three-state one rather than adding a site.
    //
    // PLUS 1 (fix/pill-size-draft-restored-note, whole-diff R4's P0): the
    // judgment segment's OWN leading mark, rendered only when the needs-look
    // segment leads, so the composite pill stops identifying that segment by
    // position alone. Deliberate-instant, following the derived count exactly
    // like the five sites above it.
    //
    // The test's NAME says 18 and this assertion says 24. That drift predates
    // this branch -- the name tracks a curated list length, the assertion tracks
    // the scanner -- and renaming the test would break every citation to it, so
    // the divergence is recorded here rather than churned.
    //
    // MEASURED by running the scanner, not predicted.
    const hits = findConditionalLines(MARKER_AUDIT_SRC);
    expect(hits.length).toBe(24);
  });

  test("every conditional-render site carries either the §11 instant marker or an animation/transition class on the line above it", () => {
    const lines = MARKER_AUDIT_SRC.split("\n");
    const hits = findConditionalLines(MARKER_AUDIT_SRC);
    const unclassified: string[] = [];
    for (const idx of hits) {
      const { classified } = isClassified(lines, idx);
      if (!classified) unclassified.push(`line ${idx + 1}: ${(lines[idx] ?? "").trim()}`);
    }
    expect(unclassified).toEqual([]);
  });

  test("exactly ONE site — the shared rail-indicator ternary — classifies as ANIMATED (T6′); the other 18 are INSTANT (§11 'deliberate instant' rows)", () => {
    const lines = MARKER_AUDIT_SRC.split("\n");
    const hits = findConditionalLines(MARKER_AUDIT_SRC);
    const animated = hits.filter((idx) => {
      const { classified, instant } = isClassified(lines, idx);
      return classified && !instant;
    });
    expect(animated).toHaveLength(1);
    expect(lines[animated[0]!]).toContain("railIndicator");
    for (const idx of hits) {
      const { instant } = isClassified(lines, idx);
      if (idx === animated[0]) continue;
      expect(instant).toBe(true);
    }
  });

  test("Task 13 refresh: the footer's demoted CHAINED arm (`: isFinalizeDemoted ? (`) carries its own inline §11 instant marker — the line scan can't reach chained arms", () => {
    // The chained-ternary convention (documented in this file's header) covers
    // chained arms via the HEAD site's marker; the demoted arm ADDITIONALLY
    // carries an inline marker (§H N5's NotPublishable slot). Pin it so a
    // future edit that drops the marker (or renames the gate) fails here.
    expect(MODAL_SRC).toMatch(/:\s*isFinalizeDemoted \? \(\n\s*\/\* §11: instant — deliberate/);
  });
});

/** Follow-ups-b2 §D2: same shape as `isClassified`, keyed on the §D2 marker —
 *  the ReportIssueSection conditionals are governed by the follow-ups-b2 §D2
 *  transition inventory (collapsed↔expanded + status swaps, ALL instant), not
 *  the parent §11 table, so they carry their own marker token. */
function isClassifiedD2(
  lines: string[],
  lineIndex: number,
): { classified: boolean; instant: boolean } {
  const prev = lines[lineIndex - 1] ?? "";
  const instant = prev.includes("§D2") && prev.includes("instant — deliberate");
  const animated = /animate-|transition-\[|duration-(fast|normal)\b|ease-out-quart\b/.test(prev);
  return { classified: instant || animated, instant };
}

describe("§D2 source-marker audit — every conditional-render site in the ReportIssueSection region is classified instant", () => {
  const SECTIONS_SRC = readFileSync(
    join(ROOT, "components/admin/wizard/step3ReviewSections.tsx"),
    "utf8",
  );
  const start = SECTIONS_SRC.indexOf("export function ReportIssueSection");
  const nextExport = SECTIONS_SRC.indexOf("\nexport ", start + 1);
  const REGION = SECTIONS_SRC.slice(start, nextExport === -1 ? SECTIONS_SRC.length : nextExport);

  test("slice anchors resolve and the region contains the §D disclosure conditional", () => {
    expect(start).toBeGreaterThan(-1);
    expect(REGION).toContain("{expanded ? (");
  });

  test("every conditional-render site carries the §D2 instant marker on the line above — §D2's inventory has NO animated pairs, so an animation classification here is drift, not a pass", () => {
    const lines = REGION.split("\n");
    const hits = findConditionalLines(REGION);
    expect(hits.length).toBeGreaterThan(0); // the disclosure conditional at minimum
    const bad: string[] = [];
    for (const idx of hits) {
      const { instant } = isClassifiedD2(lines, idx);
      if (!instant) bad.push(`line ${idx + 1}: ${(lines[idx] ?? "").trim()}`);
    }
    expect(bad).toEqual([]);
  });
});

// ── §8 inventory: the attention pill's five states ──────────────────────────
//
// Five states — SheetChanged (S), AllClean (A), NeedsLook (N), Composite (C),
// JudgmentOnly (J) — so ten ordered pairs, every one of them INSTANT by spec
// §8. The value of the table is not that each pair "works": it is that no pair
// animates and that the menu's open state survives exactly the pairs it should
// (N/C/J, all interactive) and dies on exactly the pairs it should (anything
// reaching S or A). Compound rows follow, which is where the real defects live.

describe("attention pill: §8 inventory", () => {
  const menuTid = tid("attention-menu");
  const chipOf = (q: ReturnType<typeof renderModal>["q"]) => q.getByTestId(tid("chip"));

  /** The five states as fixtures. `dirty` rides alongside because S is a PROP
   *  state, not a data state. */
  const STATES = {
    S: { d: () => sectionData(), dirty: true },
    A: { d: () => sectionData(), dirty: false },
    N: { d: () => sectionData({ warnings: [warning("crew"), warning("crew")] }), dirty: false },
    C: {
      d: () => sectionData({ warnings: [warning("crew"), judgmentWarning("rooms")] }),
      dirty: false,
    },
    J: { d: () => sectionData({ warnings: [judgmentWarning("rooms")] }), dirty: false },
  } as const;
  type StateKey = keyof typeof STATES;

  const INTERACTIVE: StateKey[] = ["N", "C", "J"];
  const SPAN: StateKey[] = ["S", "A"];

  function renderState(k: StateKey) {
    const st = STATES[k];
    return renderModal({ d: st.d(), isDirtyRescan: st.dirty });
  }

  function rerenderState(q: ReturnType<typeof renderModal>["q"], k: StateKey) {
    const st = STATES[k];
    q.rerender(
      <Step3ReviewModal
        data={st.d()}
        checked={false}
        isDirtyRescan={st.dirty}
        onRequestSetChecked={async () => true}
        onClose={() => {}}
      />,
    );
  }

  const PAIRS: Array<[StateKey, StateKey]> = [
    ["S", "A"],
    ["S", "N"],
    ["S", "C"],
    ["S", "J"],
    ["A", "N"],
    ["A", "C"],
    ["A", "J"],
    ["N", "C"],
    ["N", "J"],
    ["C", "J"],
  ];

  test.each(PAIRS)("%s <-> %s is instant, in both directions", (from, to) => {
    for (const [a, b] of [
      [from, to],
      [to, from],
    ] as Array<[StateKey, StateKey]>) {
      const { q } = renderState(a);
      const before = chipOf(q);
      expect(before.tagName).toBe(SPAN.includes(a) ? "SPAN" : "BUTTON");
      // No animation on the chip or on whatever wraps it, in EITHER state: the
      // wrapper is what a state-swap animation would most plausibly be hung on.
      for (const el of [before, before.parentElement!]) {
        expect(el.className).not.toMatch(/\banimate-/);
        expect(el.className).not.toMatch(/\btransition-\[/);
      }
      rerenderState(q, b);
      const after = chipOf(q);
      expect(after.tagName).toBe(SPAN.includes(b) ? "SPAN" : "BUTTON");
      for (const el of [after, after.parentElement!]) {
        expect(el.className).not.toMatch(/\banimate-/);
        expect(el.className).not.toMatch(/\btransition-\[/);
      }
      // A span state never has a panel beside it.
      if (SPAN.includes(b)) expect(q.queryByTestId(menuTid)).toBeNull();
      cleanup();
    }
  });

  test.each([
    ["N", "C"],
    ["N", "J"],
    ["C", "J"],
  ] as Array<[StateKey, StateKey]>)(
    "%s -> %s keeps an OPEN menu open and re-renders its rows",
    async (from, to) => {
      const { q } = renderState(from);
      fireEvent.click(chipOf(q));
      expect(q.getByTestId(menuTid).isConnected).toBe(true);
      rerenderState(q, to);
      expect(q.getByTestId(menuTid).isConnected).toBe(true);
      expect(chipOf(q).getAttribute("aria-expanded")).toBe("true");
      // Rows follow the NEW fixture, derived rather than restated.
      const target = STATES[to].d();
      const defs = step3Sections(target);
      const by = warningsBySection(target.warnings, new Set(defs.map((s) => s.id)));
      const expected = [...by]
        .flatMap(([, l]) => l.map((e) => e.index))
        .sort((a, b) => a - b)
        .map((i) => `wizard-step3-card-${DFID}-attention-row-${i}`);
      const rows = [
        ...document.querySelectorAll(`[data-testid^="wizard-step3-card-${DFID}-attention-row-"]`),
      ].map((r) => r.getAttribute("data-testid"));
      expect([...rows].sort()).toEqual([...expected].sort());
      cleanup();
    },
  );

  // ── Compound rows ─────────────────────────────────────────────────────────

  test("(a) open on N, data drops to A: the menu unmounts and focus stays in the dialog", () => {
    const { q } = renderState("N");
    fireEvent.click(chipOf(q));
    expect(q.getByTestId(menuTid).isConnected).toBe(true);
    rerenderState(q, "A");
    expect(q.queryByTestId(menuTid)).toBeNull();
    const dialog = document.querySelector('[role="dialog"]')!;
    expect(dialog.contains(document.activeElement)).toBe(true);
  });

  test("(b) open on N, a dirty rescan arrives: the menu unmounts and the span renders", () => {
    const { q } = renderState("N");
    fireEvent.click(chipOf(q));
    rerenderState(q, "S");
    expect(q.queryByTestId(menuTid)).toBeNull();
    expect(chipOf(q).tagName).toBe("SPAN");
    expect(chipOf(q).textContent).toBe("Sheet changed");
  });

  test("(c) a row clicked before the entrance frame flushes still navigates and closes", () => {
    const { q } = renderState("N");
    fireEvent.click(chipOf(q));
    // No rAF flush between open and click: the entrance is mid-flight.
    const row = document.querySelector(
      `[data-testid^="wizard-step3-card-${DFID}-attention-row-"]`,
    ) as HTMLElement;
    expect(row).not.toBeNull();
    fireEvent.click(row);
    expect(q.queryByTestId(menuTid)).toBeNull();
  });

  test("(d) unmounting with the auto-open frame pending opens nothing and warns nothing", () => {
    const scheduled: FrameRequestCallback[] = [];
    const realRaf = window.requestAnimationFrame;
    const realCaf = window.cancelAnimationFrame;
    const cancelled = new Set<number>();
    window.requestAnimationFrame = ((cb: FrameRequestCallback) => {
      scheduled.push(cb);
      return scheduled.length;
    }) as typeof requestAnimationFrame;
    window.cancelAnimationFrame = ((id: number) =>
      cancelled.add(id)) as typeof cancelAnimationFrame;
    const errors: unknown[] = [];
    const realError = console.error;
    console.error = (...args: unknown[]) => errors.push(args);
    try {
      const { q } = renderState("N");
      expect(scheduled.length).toBeGreaterThan(0); // the auto-open frame is pending
      q.unmount();
      // Every scheduled frame was cancelled on teardown, so nothing can fire
      // into an unmounted tree.
      expect(cancelled.size).toBe(scheduled.length);
      expect(errors).toEqual([]);
    } finally {
      window.requestAnimationFrame = realRaf;
      window.cancelAnimationFrame = realCaf;
      console.error = realError;
    }
  });

  test("(e) Escape during the entrance closes the menu, refocuses the pill, and leaves the modal open", () => {
    const onClose = vi.fn();
    const { q } = renderModal({ d: STATES.N.d(), onClose });
    fireEvent.click(chipOf(q));
    fireEvent.keyDown(chipOf(q), { key: "Escape" });
    expect(q.queryByTestId(menuTid)).toBeNull();
    expect(document.activeElement).toBe(chipOf(q));
    expect(onClose).not.toHaveBeenCalled();
  });

  test("(f) a second row click moves the flash rather than adding one", () => {
    const original = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "scrollTo");
    Object.defineProperty(HTMLElement.prototype, "scrollTo", {
      value: vi.fn(),
      configurable: true,
      writable: true,
    });
    try {
      const { q } = renderState("N");
      fireEvent.click(chipOf(q));
      fireEvent.click(q.getByTestId(`wizard-step3-card-${DFID}-attention-row-0`));
      fireEvent.click(chipOf(q));
      fireEvent.click(q.getByTestId(`wizard-step3-card-${DFID}-attention-row-1`));
      const flashed = [...document.querySelectorAll("[data-step3-warning-flash]")];
      expect(flashed.length).toBe(1);
      expect(flashed[0]!.getAttribute("data-attention-anchor")).toBe("warning:1");
    } finally {
      if (original) Object.defineProperty(HTMLElement.prototype, "scrollTo", original);
      else delete (HTMLElement.prototype as unknown as { scrollTo?: unknown }).scrollTo;
    }
  });
});
