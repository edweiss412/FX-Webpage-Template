// @vitest-environment jsdom
/**
 * tests/components/admin/showpage/publishedEscapeClaim.test.tsx
 * (spec docs/superpowers/specs/2026-08-28-published-escape-consumed-claim.md §6)
 *
 * `ReviewModalShell` closes the review dialog from a document BUBBLE listener that
 * fires on any Escape with no test of whether anything consumed the key
 * (ReviewModalShell.tsx:248-262). So every window in which the attention panel is
 * down while the modal is up spends the operator's Escape on the modal. The repair
 * holds a claim in `PublishedReviewModal` that outlives the panel and CLASSIFIES a
 * transient unmount apart from an intentional dismissal.
 *
 * Case numbering and each case's expected outcome come from spec §6.2, which also
 * tags every case RED BEFORE REPAIR or PASSES AT AUTHORING. This file does not
 * restate those tags: the spec is the single source, and restating it is the drift
 * class that produced ten findings across the plan's review rounds.
 *
 * TWO MECHANISMS MAKE OR BREAK EVERY ASSERTION HERE, both found by review.
 *
 * 1. A close is DEFERRED, so a naive negative assertion passes mid-close. The shell
 *    reads `matchMedia("(prefers-reduced-motion: reduce)")` (ReviewModalShell.tsx:374);
 *    jsdom ships no `matchMedia` at all and `tests/setup.ts:84` installs a global stub
 *    answering `matches: false`, so the ANIMATED path is taken and the close rides a
 *    `transitionend` fallback timer. `beginDismiss` is one-shot via an idempotence
 *    guard (ReviewModalShell.tsx:86) and mid-dismiss "the panel is already committed
 *    to closing (the fallback timer still fires)" (:565). Without the per-file
 *    reduced-motion override below, case 10 would start a close on the first key, pass
 *    its survival assertion, have the second key swallowed by that guard, and then have
 *    the FIRST key's deferred navigation satisfy its final close assertion. Right
 *    answer, wrong reason, every case.
 *
 *    The override is PER FILE by design. `tests/setup.ts` sanctions exactly that in its
 *    own comment, and changing the default there would flip the motion path for every
 *    jsdom suite in the repo.
 *
 * 2. Observation is the CLOSE PATH, not a container. `handleClose` calls
 *    `useShowModalNav().close`, which is `router.push("/admin", { scroll: false })`
 *    (useShowModalNav.ts:30-36). The assertions read that ARGUMENT PAIR: a bare
 *    `toHaveBeenCalled` would also pass on any other navigation the component performs.
 */
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { cloneElement } from "react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { premiseHolds } from "@/tests/_shared/premise";
import { applyEscapeDecision, consumesKey, decideEscape } from "@/lib/admin/escapeClaim";

const routerPush = vi.fn();
const routerRefresh = vi.fn();
const routerPrefetch = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: routerRefresh, push: routerPush, prefetch: routerPrefetch }),
  usePathname: () => "/admin",
  useSearchParams: () => new URLSearchParams(),
}));

import { ShowReviewModalSkeleton } from "@/components/admin/showpage/ShowReviewModalSkeleton";
import {
  publishedModalElement,
  actionableAlertItem,
  installModalDomStubs,
} from "@/tests/components/admin/showpage/__fixtures__/publishedModalHarness";

const MENU = '[data-testid="published-show-review-attention-menu"]';
const PILL_BUTTON = 'button[data-testid="published-show-review-alert-pill"]';
const ALERT_ID = "11111111-1111-4111-8111-111111111111";
const ONE = [actionableAlertItem(ALERT_ID)];
const WARN_ROW = [{ block: "crew", key: "Grup", value: "one" }];

/** A close is exactly this navigation (useShowModalNav.ts:30-36). */
const CLOSED_WITH = ["/admin", { scroll: false }] as const;

/** Capture-phase keydown registrations, so a case can PROVE the frame's own
 *  listener is live AT DELIVERY, which counting registrations alone did not prove:
 *  a listener registered and later removed still left the old count positive. Whole-diff
 *  review round 3 caught that. The frame registers with capture:true
 *  (AttentionMenu.tsx, the listener effect); the shell registers on bubble. */
let liveCaptureKeydown = 0;
let realRemove: typeof document.removeEventListener;
let realAdd: typeof document.addEventListener;
let realMatchMedia: typeof window.matchMedia | undefined;

beforeEach(() => {
  installModalDomStubs();
  routerPush.mockClear();
  liveCaptureKeydown = 0;

  realAdd = document.addEventListener.bind(document);
  document.addEventListener = ((type: string, fn: EventListener, opts?: unknown) => {
    const capture =
      opts === true ||
      (typeof opts === "object" &&
        opts !== null &&
        (opts as AddEventListenerOptions).capture === true);
    if (type === "keydown" && capture) liveCaptureKeydown += 1;
    return realAdd(type as keyof DocumentEventMap, fn, opts as AddEventListenerOptions);
  }) as typeof document.addEventListener;
  realRemove = document.removeEventListener.bind(document);
  document.removeEventListener = ((type: string, fn: EventListener, opts?: unknown) => {
    const capture =
      opts === true ||
      (typeof opts === "object" &&
        opts !== null &&
        (opts as AddEventListenerOptions).capture === true);
    if (type === "keydown" && capture) liveCaptureKeydown -= 1;
    return realRemove(type as keyof DocumentEventMap, fn, opts as EventListenerOptions);
  }) as typeof document.removeEventListener;

  realMatchMedia = window.matchMedia;
  window.matchMedia = ((query: string) =>
    ({
      matches: query.includes("prefers-reduced-motion"),
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList) as typeof window.matchMedia;
});

afterEach(() => {
  document.addEventListener = realAdd;
  document.removeEventListener = realRemove;
  if (realMatchMedia) window.matchMedia = realMatchMedia;
  cleanup();
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
});

/** Let the auto-open rAF, the effects and any deferred close settle. Every
 *  NEGATIVE assertion runs after this, or it could hold mid-close. */
async function settle() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 80));
  });
}

function escape() {
  act(() => {
    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }),
    );
  });
}

const menuUp = () => document.querySelector(MENU) !== null;
const closed = () =>
  routerPush.mock.calls.some(
    (c) => c[0] === CLOSED_WITH[0] && (c[1] as { scroll?: boolean } | undefined)?.scroll === false,
  );

describe("published modal: an Escape claim that outlives the panel", () => {
  it("case 1: the frame claims Escape; a second key then closes the modal", async () => {
    render(publishedModalElement(WARN_ROW, { attentionItems: ONE }));
    await settle();
    premiseHolds("the auto-open put the panel up on this case's inputs", menuUp());
    premiseHolds(
      "a capture listener is LIVE at delivery, registrations MINUS removals: state M and state P produce the same visible outcome, so only this separates them",
      liveCaptureKeydown > 0,
    );

    escape();
    await settle();
    expect(closed(), "the frame claimed the key, so the shell never saw it").toBe(false);
    expect(menuUp(), "the panel is dismissed").toBe(false);

    escape();
    await settle();
    expect(closed(), "the frame's dismissal cleared the claim, so the next key closes").toBe(true);
  });

  it("case 2: a whole-data blip takes the panel down; the next Escape is deferred", async () => {
    const { rerender } = render(publishedModalElement(WARN_ROW, { attentionItems: ONE }));
    await settle();
    premiseHolds("the panel was up before the blip", menuUp());

    rerender(publishedModalElement([], { attentionItems: [] }));
    await settle();
    premiseHolds("THIS case's own data change removed the panel", !menuUp());

    escape();
    await settle();
    expect(closed(), "the claim outlived the panel, so the shell defers").toBe(false);
  });

  it("arm D: an actionable-only blip does NOT take the panel down, so no claim is spent", async () => {
    // spec §6.2 case D. The classifier reads needsYou || k || selfHeal, not the
    // actionable count, so a seeded parse warning pins the panel up across a
    // 1-0-1 change. This is the arm that RETIRED the backlog row's second
    // candidate, and it belongs in the permanent suite for that reason.
    const { rerender } = render(publishedModalElement(WARN_ROW, { attentionItems: ONE }));
    await settle();
    premiseHolds("the panel was up before the blip", menuUp());
    premiseHolds(
      "this fixture seeds a sheet warning, which is what pins the panel up",
      document.querySelector('[data-testid^="attention-menu-row-warning:"]') !== null,
    );

    rerender(publishedModalElement(WARN_ROW, { attentionItems: [] }));
    await settle();
    expect(menuUp(), "an actionable-only change must NOT take the panel down").toBe(true);

    rerender(publishedModalElement(WARN_ROW, { attentionItems: ONE }));
    await settle();
    premiseHolds("the panel stayed mounted across the whole change", menuUp());

    escape();
    await settle();
    expect(closed(), "the panel never went down, so the frame claims the key as usual").toBe(false);
  });

  it("arm G: a remount before the auto-open leaves no claim, and the modal closes", async () => {
    // spec §8's second documented limit, executable: a claim held inside the
    // component cannot survive the component being remounted. The arm records
    // that outcome rather than asserting a survival the repair cannot deliver.
    const { rerender } = render(publishedModalElement(WARN_ROW, { attentionItems: ONE }));
    await settle();
    premiseHolds("the panel was up before the remount", menuUp());

    // A fresh instance: key changes force React to unmount and remount rather
    // than update, which is what a remount means for the claim.
    rerender(
      cloneElement(publishedModalElement(WARN_ROW, { attentionItems: ONE }), { key: "remounted" }),
    );
    premiseHolds(
      "the remount happened and the auto-open has NOT yet reopened the panel",
      !menuUp(),
    );

    escape();
    await settle();
    expect(closed(), "the claim died with the instance: spec §8's remount limit").toBe(true);
  });

  it("case 3: a skeleton swap is a documented limit, and the modal closes", async () => {
    const { rerender } = render(publishedModalElement(WARN_ROW, { attentionItems: ONE }));
    await settle();
    premiseHolds("the panel was up before the swap", menuUp());

    rerender(<ShowReviewModalSkeleton />);
    await settle();
    premiseHolds(
      "the frame is the title-less skeleton, not some other unmount",
      document.querySelector('[data-testid="published-show-review-modal"]') !== null &&
        document.querySelector('[data-testid="published-show-review-title"]') === null,
    );

    escape();
    await settle();
    expect(closed(), "spec §8: a modal-held claim cannot survive this window").toBe(true);
  });

  /**
   * Cases 1b and 11, BEHAVIOURAL at last.
   *
   * These pin the state-P branch, which is reachable only when the panel is mounted
   * and its own capture listener is not yet installed. jsdom cannot stage that, so
   * earlier versions asserted the branch's SOURCE TEXT, and whole-diff review round
   * 2 showed exactly what a textual guard is worth: inserting `if (pillRef.current)
   * return true;` above the branch body swallows state P's Escape while every
   * asserted string is still present, and all sixteen cases stayed green.
   *
   * The decision is now a pure function, so it is tested over its WHOLE input space
   * rather than through a state the environment cannot produce. Four inputs, and
   * every one of them is a behaviour a user would notice.
   */
  describe("the consumed-key decision (lib/admin/escapeClaim)", () => {
    it("state P, panel up: dismisses the PANEL and keeps the dialog", () => {
      const d = decideEscape({ panelOpen: true, claimPending: false });
      expect(d.kind, "a mounted panel is what the key was aimed at").toBe("dismiss-panel");
      expect(consumesKey(d), "the shell must not also close the dialog").toBe(true);
    });

    it("state P holds even with a claim pending: the panel still wins", () => {
      const d = decideEscape({ panelOpen: true, claimPending: true });
      expect(d.kind, "a visible panel outranks a stale claim").toBe("dismiss-panel");
    });

    it("state N, panel gone with a claim: consumes the claim, dialog stays", () => {
      const d = decideEscape({ panelOpen: false, claimPending: true });
      expect(d.kind).toBe("consume-claim");
      expect(consumesKey(d), "this is the one deliberate defer").toBe(true);
    });

    it("dismiss-panel applies ALL THREE effects, and says the key was consumed", () => {
      // The DECISION being right is not the same as the effects being applied.
      // Whole-diff review round 3 found the switch exercised by nothing, so
      // dropping any effect stayed invisible: dropping the dismissal swallows the
      // key with nothing dismissed, dropping the clear costs a third Escape.
      const calls: string[] = [];
      const consumed = applyEscapeDecision(
        { kind: "dismiss-panel" },
        {
          dismissPanel: () => calls.push("dismissPanel"),
          clearClaim: () => calls.push("clearClaim"),
          focusPill: () => calls.push("focusPill"),
        },
      );
      expect(calls).toEqual(["dismissPanel", "clearClaim", "focusPill"]);
      expect(consumed, "the shell must not also close the dialog").toBe(true);
    });

    it("consume-claim spends the claim and touches NOTHING else", () => {
      const calls: string[] = [];
      const consumed = applyEscapeDecision(
        { kind: "consume-claim" },
        {
          dismissPanel: () => calls.push("dismissPanel"),
          clearClaim: () => calls.push("clearClaim"),
          focusPill: () => calls.push("focusPill"),
        },
      );
      expect(calls, "no panel to dismiss and no focus to move: that key changed nothing").toEqual([
        "clearClaim",
      ]);
      expect(consumed).toBe(true);
    });

    it("let-dialog-close applies nothing and lets the shell close", () => {
      const calls: string[] = [];
      const consumed = applyEscapeDecision(
        { kind: "let-dialog-close" },
        {
          dismissPanel: () => calls.push("dismissPanel"),
          clearClaim: () => calls.push("clearClaim"),
          focusPill: () => calls.push("focusPill"),
        },
      );
      expect(calls).toEqual([]);
      expect(consumed, "nothing claimed the key, so the shell must close").toBe(false);
    });

    it("state O, nothing pending: the dialog closes", () => {
      const d = decideEscape({ panelOpen: false, claimPending: false });
      expect(d.kind).toBe("let-dialog-close");
      expect(consumesKey(d), "nothing claimed the key, so the shell must close").toBe(false);
    });
  });

  it("case 9: with no panel at any point, Escape closes the modal", async () => {
    render(publishedModalElement([], { attentionItems: [] }));
    await settle();
    premiseHolds("no panel ever rendered, so no claim can exist", !menuUp());

    escape();
    await settle();
    expect(closed(), "nothing claimed the key, so the shell must close").toBe(true);
  });

  it("case 10: the claim is consumed exactly once", async () => {
    const { rerender } = render(publishedModalElement(WARN_ROW, { attentionItems: ONE }));
    await settle();
    premiseHolds("the panel was up before the transient change", menuUp());

    rerender(publishedModalElement([], { attentionItems: [] }));
    await settle();
    premiseHolds("this case starts in state N: the panel is DOWN before the first key", !menuUp());

    escape();
    await settle();
    expect(closed(), "the first key is the one deliberate defer").toBe(false);

    escape();
    await settle();
    expect(closed(), "the claim was spent by the first key, so the second closes").toBe(true);
  });

  it("case 4: click-outside dismisses the panel; the next Escape closes the modal", async () => {
    render(publishedModalElement(WARN_ROW, { attentionItems: ONE }));
    await settle();
    premiseHolds("the panel was up before the click", menuUp());

    const title = document.querySelector('[data-testid="published-show-review-title"]');
    premiseHolds("there is an outside target to click", title !== null);
    act(() => {
      fireEvent.pointerDown(title as Element);
    });
    await settle();
    premiseHolds("the click-outside actually dismissed the panel", !menuUp());

    escape();
    await settle();
    expect(closed(), "an intentional dismissal clears the claim").toBe(true);
  });

  it("case 7: the pill toggle dismisses the panel; the next Escape closes the modal", async () => {
    render(publishedModalElement(WARN_ROW, { attentionItems: ONE }));
    await settle();
    premiseHolds("the panel was up before the toggle", menuUp());

    const pill = document.querySelector(PILL_BUTTON) as HTMLButtonElement | null;
    premiseHolds("the INTERACTIVE pill is present, not one of the two spans", pill !== null);
    act(() => {
      fireEvent.click(pill as HTMLButtonElement);
    });
    await settle();
    premiseHolds("the toggle actually dismissed the panel", !menuUp());

    escape();
    await settle();
    expect(closed(), "W3 clears the claim, and no W4 case covers it").toBe(true);
  });

  it("case 5a: focus moving outside dismisses the panel; the next Escape closes the modal", async () => {
    render(publishedModalElement(WARN_ROW, { attentionItems: ONE }));
    await settle();
    premiseHolds("the panel was up before focus moved", menuUp());

    const outside = document.querySelector('[data-testid="published-show-review-close"]');
    premiseHolds("there is an outside focus target", outside !== null);
    act(() => {
      fireEvent.focusIn(outside as Element);
    });
    await settle();
    premiseHolds("focus-out actually dismissed the panel", !menuUp());

    escape();
    await settle();
    expect(closed(), "focus-out is an intentional dismissal and clears the claim").toBe(true);
  });

  it("case 5b: selecting an ALERT row dismisses the panel; the next Escape closes the modal", async () => {
    render(publishedModalElement(WARN_ROW, { attentionItems: ONE }));
    await settle();
    premiseHolds("the panel was up before the row click", menuUp());

    const row = document.querySelector(`[data-testid="attention-menu-row-alert:${ALERT_ID}"]`);
    premiseHolds("this case's own alert row is present to select", row !== null);
    act(() => {
      fireEvent.click(row as Element);
    });
    await settle();
    premiseHolds("the row selection actually dismissed the panel", !menuUp());

    escape();
    await settle();
    expect(closed(), "row selection is the W4 source an enumeration by handler misses").toBe(true);
  });

  it("case 5c: selecting a SHEET WARNING row dismisses the panel; the next Escape closes the modal", async () => {
    render(publishedModalElement(WARN_ROW, { attentionItems: ONE }));
    await settle();
    premiseHolds("the panel was up before the row click", menuUp());

    const rows = Array.from(
      document.querySelectorAll('[data-testid^="attention-menu-row-warning:"]'),
    );
    premiseHolds("this case's fixture produced a sheet-warning row to select", rows.length > 0);
    act(() => {
      fireEvent.click(rows[0] as Element);
    });
    await settle();
    premiseHolds("the warning-row selection actually dismissed the panel", !menuUp());

    escape();
    await settle();
    expect(closed(), "the second row source clears the claim just as the first does").toBe(true);
  });

  it("case 6: resolving the last actionable item dismisses the panel; the next Escape closes", async () => {
    render(publishedModalElement(WARN_ROW, { attentionItems: ONE }));
    await settle();
    premiseHolds("the panel was up before the resolve", menuUp());

    const resolve = document.querySelector(
      `[data-testid="per-show-alert-resolve-${ALERT_ID}"]`,
    ) as HTMLButtonElement | null;
    premiseHolds("this case's own resolve control is present", resolve !== null);
    await act(async () => {
      fireEvent.click(resolve as HTMLButtonElement);
      await new Promise((r) => setTimeout(r, 80));
    });
    await settle();
    premiseHolds("resolving the LAST actionable item dismissed the panel", !menuUp());

    escape();
    await settle();
    expect(closed(), "W2 clears the claim, and no W4 case covers it").toBe(true);
  });

  it("case 8: the claim is acquired on the PILL path, not only on auto-open", async () => {
    const { rerender } = render(publishedModalElement(WARN_ROW, { attentionItems: ONE }));
    await settle();

    // Close the auto-opened panel, then reopen it BY THE PILL, so the claim under
    // test was acquired on the pill path.
    const pill = document.querySelector(PILL_BUTTON) as HTMLButtonElement | null;
    premiseHolds("the INTERACTIVE pill is present, not one of the two spans", pill !== null);
    act(() => {
      fireEvent.click(pill as HTMLButtonElement);
    });
    await settle();
    premiseHolds("the panel is closed before the pill reopens it", !menuUp());
    act(() => {
      fireEvent.click(pill as HTMLButtonElement);
    });
    await settle();
    premiseHolds("the PILL reopened the panel on this case's own inputs", menuUp());

    routerPush.mockClear();
    rerender(publishedModalElement([], { attentionItems: [] }));
    await settle();
    premiseHolds("a transient change then took the panel down", !menuUp());

    escape();
    await settle();
    expect(closed(), "the pill-acquired claim defers the key just as an auto-open one does").toBe(
      false,
    );
  });

  /**
   * Case 11 REPLACED, by orchestrator ruling 2026-08-28, and the reason is worth
   * keeping: state P is unobservable from test code in jsdom, by construction
   * rather than by accident. Three staging routes were probed and each was refuted
   * by this case's own premise rather than by argument:
   *
   *   flushSync mount    both effect phases run before it returns (React 19.2.4)
   *   discrete click     commits on the sync lane and flushes passives before returning
   *   timer-lane click   has not committed at the microtask boundary, so no panel yet
   *
   * One mechanism explains all three: whenever the DOM shows the panel, its passive
   * listener is already live. Holding for a fourth route buys nothing the mechanism
   * forbids, so the window stays a documented limit (spec §8) carrying that probe,
   * and what guards it becomes executable HERE instead.
   *
   * The assertion is an ORDER assertion. What closes state P is not the test's
   * ability to stage it, but the claim being acquired in the LAYOUT phase: layout
   * runs before paint, so a painted panel always has a claim behind it even in the
   * window where its own listener does not yet exist. A passive acquisition would
   * reopen exactly that window. This pins the mechanism, and it fails the moment
   * someone converts the acquisition to `useEffect`, which is the change that would
   * silently restore the defect.
   */
  it("case 11 (order): the claim is acquired in the LAYOUT phase, before any passive registration", () => {
    const src = readFileSync(
      join(__dirname, "..", "..", "..", "..", "components/admin/showpage/PublishedReviewModal.tsx"),
      "utf8",
    );
    premiseHolds(
      "the claim ref this assertion is about still exists in the component",
      src.includes("escapeClaimRef"),
    );

    const acquisition =
      /useLayoutEffect\(\(\) => \{\s*if \(menuEffectivelyOpen\) escapeClaimRef\.current = true;/;
    expect(
      acquisition.test(src),
      "acquisition must be a LAYOUT effect: a passive one leaves a painted panel with neither a claim nor the frame's own passive listener, which is state P reopened",
    ).toBe(true);

    // And it must not ALSO be acquired passively, which would make the layout
    // acquisition true but not the whole story.
    const passiveAcquisition =
      /useEffect\(\(\) => \{\s*if \(menuEffectivelyOpen\) escapeClaimRef\.current = true;/;
    expect(passiveAcquisition.test(src), "no passive twin of the acquisition").toBe(false);
  });
});
