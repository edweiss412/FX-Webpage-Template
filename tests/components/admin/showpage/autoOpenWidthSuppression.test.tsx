// @vitest-environment jsdom
/**
 * tests/components/admin/showpage/autoOpenWidthSuppression.test.tsx
 * (spec 2026-08-29-attention-auto-open-phone-suppression §2, §2.1, §4, §6)
 *
 * The predicate's effect on `menuOpen`, and nothing about layout: jsdom
 * computes none. The geometry half lives in the real-browser spec.
 *
 * THE AMBIENT `matchMedia` STUB IS A HAZARD HERE, NOT A VEHICLE.
 * `tests/setup.ts:84` installs a global `window.matchMedia` for every
 * jsdom file that returns `matches: false` for EVERY query, ignoring the
 * argument. Two of this suite's obligations are vacuous against it:
 *
 *   - "desktop still auto-opens" passes with NO configuration, because
 *     "not phone" is the ambient default. It would also pass against a
 *     predicate that is never true, which is the exact mutant it is
 *     named as the anti-vacuity partner for.
 *   - "639 suppresses, 640 opens" cannot discriminate at all, because
 *     both widths ask the same query and get the same ignored answer.
 *     Reaching for a fixed true/false per case asserts the STUB instead
 *     of the predicate, and passes against `(max-width: 9999px)`.
 *
 * So this file installs a stub that PARSES the query and answers it
 * against a settable width, and records every query the component asked.
 * The desktop case asserts the component actually ASKED, or "desktop
 * opens" is satisfied by a component that never consults matchMedia.
 */
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, screen, waitFor } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/admin",
  useSearchParams: () => new URLSearchParams(),
}));

import {
  actionableAlertItem,
  installModalDomStubs,
  renderPublishedModal,
} from "./__fixtures__/publishedModalHarness";

const MENU = "published-show-review-attention-menu";
const PILL = "published-show-review-alert-pill";

/** The query the predicate must ask: `sm` is 640px (app/globals.css:318), so its
 *  positive-evidence complement is 639.98.
 *
 *  Reusing the shell's `(min-width: 640px)` and negating it was tried in-arc and
 *  measured wrong -- it inverts the fallback, so an absent or uninformative
 *  matchMedia reads SUPPRESSED and 23 existing assertions failed. See the
 *  comment at the predicate for the full account. */
const EXPECTED_QUERY = "(max-width: 639.98px)";

type MediaProbe = {
  /** Every query string the component passed, in call order. */
  asked: string[];
  /** Change the width the stub answers against, mid-test. */
  setWidth: (px: number) => void;
};

/**
 * A `matchMedia` that ANSWERS `(max-width: Npx)` against a settable width.
 *
 * Throws on a query it does not understand rather than returning false: a stub
 * that silently answers "no" to a question it cannot parse is the ambient
 * stub's defect one level down, and it would report a confident wrong result.
 */
function installQueryAwareMatchMedia(initialWidth: number): MediaProbe {
  let width = initialWidth;
  const asked: string[] = [];
  const listeners = new Set<() => void>();

  const answer = (query: string): boolean => {
    const max = /^\(max-width:\s*([\d.]+)px\)$/.exec(query);
    if (max) return width <= Number.parseFloat(max[1]!);
    const min = /^\(min-width:\s*([\d.]+)px\)$/.exec(query);
    if (min) return width >= Number.parseFloat(min[1]!);
    throw new Error(
      `this suite's matchMedia cannot answer ${query}; returning false would be a confident wrong answer`,
    );
  };

  window.matchMedia = ((query: string) => {
    asked.push(query);
    return {
      get matches() {
        return answer(query);
      },
      media: query,
      onchange: null,
      addEventListener: (_t: string, fn: () => void) => listeners.add(fn),
      removeEventListener: (_t: string, fn: () => void) => listeners.delete(fn),
      addListener: (fn: () => void) => listeners.add(fn),
      removeListener: (fn: () => void) => listeners.delete(fn),
      dispatchEvent: () => false,
    } as unknown as MediaQueryList;
  }) as typeof window.matchMedia;

  return {
    asked,
    setWidth: (px: number) => {
      width = px;
    },
  };
}

/**
 * Flush the reveal's animation frame, and PROVE the flush was long enough.
 *
 * The predicate is read inside `requestAnimationFrame` (§2.1), so a test that
 * does not run the frame observes the pre-reveal state -- in which the menu has
 * not mounted YET, for reasons that have nothing to do with suppression. The
 * first draft of this file used a bare `setTimeout(0)` and four cases went green
 * against a tree with no predicate in it at all. A negative assertion whose
 * setup has not reached the moment of decision is the purest form of the
 * tautology this arc keeps finding.
 *
 * So the flush runs real animation frames, and every suppressed case is paired
 * with `assertRevealWindowElapsed`, which renders the SAME fixture at a desktop
 * width and requires the menu to have appeared. If the control does not open,
 * the flush is too short and the negative case proves nothing -- and the suite
 * says so instead of passing.
 */
async function flushReveal() {
  for (let i = 0; i < 5; i += 1) {
    await act(async () => {
      await new Promise((r) => requestAnimationFrame(() => r(undefined)));
    });
  }
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}

/** The positive control for every negative case: same fixture, same flush, a
 *  width where the menu MUST open. Its failure means the flush is the problem,
 *  not the predicate. */
async function assertRevealWindowElapsed() {
  installQueryAwareMatchMedia(1280);
  renderPublishedModal([], { attentionItems: ITEMS });
  await flushReveal();
  expect(
    screen.queryByTestId(MENU),
    "control did not open at 1280, so the flush is too short and the negative cases above prove nothing",
  ).not.toBeNull();
  cleanup();
}

const ITEMS = [actionableAlertItem("a1"), actionableAlertItem("a2")];

describe("auto-open width suppression (spec §2)", () => {
  beforeEach(() => {
    installModalDomStubs();
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("AC-SUPPRESS-PHONE: a phone-width arrival with actionable items never mounts the menu", async () => {
    installQueryAwareMatchMedia(375);
    renderPublishedModal([], { attentionItems: ITEMS });
    await flushReveal();
    expect(screen.queryByTestId(MENU)).toBeNull();
    cleanup();
    await assertRevealWindowElapsed();
  });

  it("AC-OPEN-DESKTOP: a desktop arrival opens it, and the predicate is proven to have ASKED", async () => {
    const probe = installQueryAwareMatchMedia(1280);
    renderPublishedModal([], { attentionItems: ITEMS });
    await waitFor(() => expect(screen.getByTestId(MENU)).toBeInTheDocument());

    // What this assertion DOES prove: the tree asks the shared breakpoint
    // question, so the stub above is answering a real query rather than sitting
    // unused while something else decides.
    //
    // What it does NOT prove: that the query came from the AUTO-OPEN effect
    // rather than from somewhere else in the tree. Nothing else asks this exact
    // spelling today, but that is a fact about the current tree, not a property
    // the assertion enforces.
    //
    // The real anti-vacuity partner is AC-SUPPRESS-PHONE, and the pair is
    // genuinely discriminating -- a predicate that ALWAYS suppresses fails this
    // case, one that NEVER suppresses fails that one. Measured against the
    // pre-change tree: 3 of these 5 cases fail, and this is not one of them,
    // which is exactly what a partner assertion should look like.
    expect(probe.asked).toContain(EXPECTED_QUERY);
  });

  it("AC-BOUNDARY-640: 639 suppresses and 640 opens, against the same query-aware stub", async () => {
    installQueryAwareMatchMedia(639);
    renderPublishedModal([], { attentionItems: ITEMS });
    await flushReveal();
    expect(screen.queryByTestId(MENU), "639 should suppress").toBeNull();
    cleanup();
    await assertRevealWindowElapsed();

    installQueryAwareMatchMedia(640);
    renderPublishedModal([], { attentionItems: ITEMS });
    await waitFor(() => expect(screen.getByTestId(MENU), "640 should open").toBeInTheDocument());
  });

  it("AC-ARIA-EXPANDED: a suppressed arrival reports aria-expanded=false on the pill", async () => {
    installQueryAwareMatchMedia(375);
    renderPublishedModal([], { attentionItems: ITEMS });
    await flushReveal();
    expect(screen.getByTestId(PILL)).toHaveAttribute("aria-expanded", "false");
  });

  it("AC-PILL-COUNT: the pill's ACCESSIBLE NAME carries the count while suppressed", async () => {
    installQueryAwareMatchMedia(375);
    renderPublishedModal([], { attentionItems: ITEMS });
    await flushReveal();
    // The accessible name, not a container that also renders menu rows. Under
    // suppression no rows exist, so the scoping matters most at desktop -- it is
    // asserted the same way here so one habit covers both.
    expect(screen.getByTestId(PILL)).toHaveAccessibleName(/2\s+issues/);
  });
});
