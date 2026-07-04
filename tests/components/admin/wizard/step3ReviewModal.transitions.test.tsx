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
 * | T2 | open → closed (any path) | Instant unmount — deliberate, no exit animation. |
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
import { step3Sections, type SectionData } from "@/components/admin/wizard/step3ReviewSections";
import { buildParseResult, stagedRow } from "./_step3ReviewFixture";

const ROOT = join(__dirname, "..", "..", "..", "..");
const MODAL_SRC = readFileSync(join(ROOT, "components/admin/wizard/Step3ReviewModal.tsx"), "utf8");
const GLOBALS_CSS = readFileSync(join(ROOT, "app/globals.css"), "utf8");

const DFID = "drive-abc-123";
const WSID = "00000000-1111-4222-8333-444444444444";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function warning(kind: string): ParseWarning {
  return { severity: "warn", code: "SOME_CODE", message: "", blockRef: { kind } };
}

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

function tid(name: string): string {
  return `wizard-step3-card-${DFID}-review-${name}`;
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

describe("§11 T2: open → closed — instant unmount, no exit animation", () => {
  test("close button unmounts the dialog synchronously; the component declares no exit/leave animation", () => {
    const q = render(<ToggleHost />);
    expect(q.getByTestId(tid("modal"))).not.toBeNull();
    fireEvent.click(q.getByTestId(tid("close")));
    // No waitFor: unmount is synchronous — a lingering exit-animation delay
    // would leave the node present here.
    expect(q.queryByTestId(tid("modal"))).toBeNull();
    expect(MODAL_SRC).not.toMatch(/AnimatePresence|framer-motion/);
  });

  test("scrim tap-out also unmounts instantly (any close path — Esc/scrim/close/publish all converge on the same onClose)", () => {
    const q = render(<ToggleHost />);
    fireEvent.click(q.getByTestId(tid("backdrop")));
    expect(q.queryByTestId(tid("modal"))).toBeNull();
  });
});

// ── T3-T5: drag states (Task 7 full suite; re-assert §11 table values) ──────

describe("§11 T3-T5: drag states — re-asserted table values (Task 7 owns the full suite)", () => {
  const START_Y = 100;

  function grabWithCaptureStubs(q: ReturnType<typeof renderModal>["q"]) {
    const grab = q.getByTestId(tid("grab"));
    Object.assign(grab, { setPointerCapture: vi.fn(), releasePointerCapture: vi.fn() });
    const panel = q.container.querySelector<HTMLElement>("[data-step3-review-panel]");
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
    fireEvent.click(btn);
    await waitFor(() => expect(btn.getAttribute("aria-busy")).toBe("true"));
    expect(btn.textContent).toBe("Re-scanning…");
    expect(btn.className).not.toMatch(/\banimate-|transition-\[|duration-normal\b/);
    await act(async () => {
      resolveFetch(
        new Response(
          JSON.stringify({ ok: true, status: "updated", needsReview: false, changed: true }),
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
function suppressionSetup(opts: { d?: SectionData; checked?: boolean } = {}) {
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
            JSON.stringify({ ok: true, status: "updated", needsReview: false, changed: true }),
            { status: 200 },
          ),
      ),
    );
    const { q } = renderModal();
    fireEvent.click(q.getByTestId(`rescan-sheet-button-${DFID}`));
    await waitFor(() => expect(q.getByTestId(`rescan-sheet-result-${DFID}`)).toBeTruthy());
    const result = q.getByTestId(`rescan-sheet-result-${DFID}`);
    expect(result.hasAttribute("data-rescan-overlay-result")).toBe(true); // CSS hook wired
    // Live region is the INNER copy-only element (dual-gate P1) — the
    // positioned wrapper itself carries no role.
    expect(result.querySelector('[role="status"]')).not.toBeNull();
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
    const demoted: SectionData = {
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
    expect(placeholder.textContent).toContain("Preview unavailable");
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
      fireEvent.click(within(callout).getByRole("button", { name: /View details/ }));
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
      fireEvent.click(within(callout).getByRole("button", { name: /View details/ }));
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
      act(() => {
        vi.advanceTimersByTime(0);
      });
      const ambient = vi.getTimerCount();
      const callout = q.getByTestId(`wizard-step3-card-${DFID}-section-crew-flag-callout`);
      fireEvent.click(within(callout).getByRole("button", { name: /View details/ }));
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
            JSON.stringify({ ok: true, status: "updated", needsReview: false, changed: true }),
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
    // Open the overlay result first.
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
  test("exactly 10 conditional-render sites exist (curated list length) — a new one added later must be classified or this count fails", () => {
    const hits = findConditionalLines(MODAL_SRC);
    expect(hits.length).toBe(10);
  });

  test("every conditional-render site carries either the §11 instant marker or an animation/transition class on the line above it", () => {
    const lines = MODAL_SRC.split("\n");
    const hits = findConditionalLines(MODAL_SRC);
    const unclassified: string[] = [];
    for (const idx of hits) {
      const { classified } = isClassified(lines, idx);
      if (!classified) unclassified.push(`line ${idx + 1}: ${(lines[idx] ?? "").trim()}`);
    }
    expect(unclassified).toEqual([]);
  });

  test("exactly ONE site — the shared rail-indicator ternary — classifies as ANIMATED (T6′); the other 9 are INSTANT (§11 'deliberate instant' rows)", () => {
    const lines = MODAL_SRC.split("\n");
    const hits = findConditionalLines(MODAL_SRC);
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
