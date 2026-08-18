// @vitest-environment jsdom
/**
 * tests/e2e/helpers/openShowReviewFrame.unit.test.ts — the frame-reporting half
 * of the review-modal wait helper, proved without a browser.
 *
 * Sibling file to openShowReviewModal.unit.test.ts on purpose: the loaded-only
 * suite stays loadable and green through this arc's red span (plan Task 1).
 *
 * Spec: docs/superpowers/specs/ci/2026-08-17-modal-wait-skeleton-tolerant-sites-design.md §4.1-§4.5
 * Entry: BL-MODAL-WAIT-SKELETON-TOLERANT-SITES
 *
 * The jsdom environment is for ONE case: twin-frame cardinality needs a real
 * `:has()` selector engine to prove SKELETON_REVIEW_MODAL and
 * LOADED_REVIEW_MODAL are disjoint — the property that makes `frame` truthful.
 * A FakePage version of that case would be tautological: the fake mints a fresh
 * locator per call and owns no selector engine, so it passes for ANY two
 * strings (plan review R1 finding 4).
 *
 * The watchdog's FIRE path and the boundary recovery stay outside unit reach
 * (dynamic @playwright/test import — spec §7 limit 4). Its ARM is observable:
 * a recorded waitFor whose selector EQUALS the bare boundary selector.
 */
import { describe, expect, test } from "vitest";
import type { Page } from "@playwright/test";

import {
  LOADED_REVIEW_MODAL,
  SKELETON_REVIEW_MODAL,
  awaitReviewFrameOrRecover,
  openShowReviewFrameAt,
} from "./openShowReviewModal";

const BOUNDARY_SELECTOR = '[data-testid="admin-route-error-boundary"]';

/**
 * The loaded-only suite's FakePage, copied rather than imported: the harness is
 * module-local there (waitForRowHydration's suite sets the same precedent).
 */
type FakeLocator = {
  selector: string;
  scoped: boolean;
  or: (other: FakeLocator) => FakeLocator;
  first: () => FakeLocator;
  waitFor: (opts?: unknown) => Promise<void>;
  isVisible: () => Promise<boolean>;
  click: () => Promise<void>;
};

type Call = { selector: string; scoped: boolean; opts?: unknown };

function makeFakePage(cfg: {
  onWaitFor?: (selector: string) => void;
  visible?: (selector: string) => boolean;
}) {
  const gotoCalls: Array<{ url: string; options: unknown }> = [];
  const waitForCalls: Call[] = [];
  const isVisibleCalls: Call[] = [];
  const clicks: Call[] = [];

  const make = (selector: string, scoped: boolean): FakeLocator => ({
    selector,
    scoped,
    or: (other) => make(`${selector} >>OR>> ${other.selector}`, scoped),
    first: () => make(selector, true),
    waitFor: async (opts) => {
      waitForCalls.push({ selector, scoped, opts });
      cfg.onWaitFor?.(selector);
    },
    isVisible: async () => {
      isVisibleCalls.push({ selector, scoped });
      return cfg.visible ? cfg.visible(selector) : true;
    },
    click: async () => {
      clicks.push({ selector, scoped });
    },
  });

  const page = {
    goto: async (url: string, options?: unknown) => {
      gotoCalls.push({ url, options });
    },
    locator: (selector: string) => make(selector, false),
  };

  return { page: page as unknown as Page, gotoCalls, waitForCalls, isVisibleCalls, clicks };
}

const STARVE = (selector: string): never => {
  throw new Error(`fake timeout on ${selector}`);
};

/**
 * EXACT equality, never `.includes(…)`: the initial race's `.or` chain ALSO
 * contains the boundary selector as a substring, so an includes-filter is
 * satisfied by a build with no watchdog at all (plan review R2 finding 1).
 * Only the watchdog's own page.locator(BOUNDARY).waitFor records the bare
 * string.
 */
const watchdogArms = (calls: Call[]): Call[] =>
  calls.filter((c) => c.selector === BOUNDARY_SELECTOR);

describe("awaitReviewFrameOrRecover (spec §4.1)", () => {
  test("races all three selectors on one .first()-scoped wait, honoring timeoutMs", async () => {
    // Catches a two-way race that silently drops the skeleton or boundary arm.
    const explicit = makeFakePage({});
    await awaitReviewFrameOrRecover(explicit.page, { timeoutMs: 1_234 });

    const race = explicit.waitForCalls[0];
    expect(race?.selector).toContain(LOADED_REVIEW_MODAL);
    expect(race?.selector).toContain(SKELETON_REVIEW_MODAL);
    expect(race?.selector).toContain(BOUNDARY_SELECTOR);
    expect(race?.scoped).toBe(true);
    expect(race?.opts).toEqual({ state: "visible", timeout: 1_234 });

    const bogus = makeFakePage({});
    await awaitReviewFrameOrRecover(bogus.page, { timeoutMs: Number.NaN });
    expect(bogus.waitForCalls[0]?.opts).toEqual({ state: "visible", timeout: 30_000 });

    const nonPositive = makeFakePage({});
    await awaitReviewFrameOrRecover(nonPositive.page, { timeoutMs: 0 });
    expect(nonPositive.waitForCalls[0]?.opts).toEqual({ state: "visible", timeout: 30_000 });

    // The BOUNDARY of "non-positive", from the passing side: 1 is a legal
    // timeout and must reach the wait unchanged. Without this the guard could
    // be `> 1` (or any small bound) and every other case here still passes —
    // a live mutant the enrolment probe surfaced at
    // `integer-literal:89:79:0>1` and this case repays.
    const smallest = makeFakePage({});
    await awaitReviewFrameOrRecover(smallest.page, { timeoutMs: 1 });
    expect(smallest.waitForCalls[0]?.opts).toEqual({ state: "visible", timeout: 1 });

    const negative = makeFakePage({});
    await awaitReviewFrameOrRecover(negative.page, { timeoutMs: -5 });
    expect(negative.waitForCalls[0]?.opts).toEqual({ state: "visible", timeout: 30_000 });
  });

  test("loaded visible returns the loaded frame on an UNSCOPED locator, watchdog NOT armed", async () => {
    // Catches .first() leaking into the return (parent §4.1 strictness contract)
    // and a watchdog armed unconditionally — AC-1 claims skeleton-ONLY arming.
    const { page, waitForCalls } = makeFakePage({
      visible: (selector) => selector === LOADED_REVIEW_MODAL,
    });

    const result = await awaitReviewFrameOrRecover(page, { label: "case:loaded" });
    const locator = result.locator as unknown as FakeLocator;

    expect(result.frame).toBe("loaded");
    expect(locator.selector).toBe(LOADED_REVIEW_MODAL);
    expect(locator.scoped).toBe(false);
    expect(watchdogArms(waitForCalls)).toHaveLength(0);
  });

  test("skeleton visible and loaded absent returns the skeleton frame and arms the watchdog", async () => {
    // Catches a watchdog that never arms — the whole point of returning early
    // on a frame the downstream test can still lose to the boundary.
    const { page, waitForCalls } = makeFakePage({
      visible: (selector) => selector === SKELETON_REVIEW_MODAL,
    });

    const result = await awaitReviewFrameOrRecover(page, { label: "case:skeleton" });
    const locator = result.locator as unknown as FakeLocator;

    expect(result.frame).toBe("skeleton");
    expect(locator.selector).toBe(SKELETON_REVIEW_MODAL);
    expect(locator.scoped).toBe(false);
    expect(watchdogArms(waitForCalls)).toHaveLength(1);
    expect(watchdogArms(waitForCalls)[0]?.opts).toEqual({ state: "visible", timeout: 30_000 });
  });

  test("both frames visible resolves LOADED and leaves the watchdog unarmed", async () => {
    // The streaming-swap overlap window: a skeleton-first check would lie here.
    const { page, waitForCalls } = makeFakePage({ visible: () => true });

    const result = await awaitReviewFrameOrRecover(page, { label: "case:both" });

    expect(result.frame).toBe("loaded");
    expect((result.locator as unknown as FakeLocator).selector).toBe(LOADED_REVIEW_MODAL);
    expect(watchdogArms(waitForCalls)).toHaveLength(0);
  });

  test("a loaded frame arriving DURING the overlap wins, not the skeleton that was up first", async () => {
    // The time-of-check/time-of-use case (diff review R1 finding 1). Each
    // isVisible() is a live DOM query, so the streaming swap can land BETWEEN
    // two samples. Here the skeleton is up throughout and the loaded frame
    // becomes visible after the first sample: sampling loaded FIRST reports
    // "skeleton" and arms a watchdog for a modal that is already loaded, which
    // is precisely the tie-break AC-1 forbids.
    let samples = 0;
    const { page, waitForCalls } = makeFakePage({
      visible: (selector) => {
        samples += 1;
        if (selector === SKELETON_REVIEW_MODAL) return true;
        if (selector === LOADED_REVIEW_MODAL) return samples > 1;
        return false;
      },
    });

    const result = await awaitReviewFrameOrRecover(page, { label: "case:overlap-late-loaded" });

    expect(result.frame).toBe("loaded");
    expect((result.locator as unknown as FakeLocator).selector).toBe(LOADED_REVIEW_MODAL);
    expect(watchdogArms(waitForCalls)).toHaveLength(0);
  });

  test("a frame that vanishes between the race and the samples re-races, then NAMES the starve", async () => {
    // The second half of the same finding: with nothing visible, a classifier
    // that treats "not loaded, not skeleton" as "must be the boundary" clicks a
    // Retry that is not on the page and dies on a generic Playwright error
    // naming neither selector nor the server signature. Totality is the fix —
    // and the retry click is the assertion that proves the path was not taken.
    const { page, clicks, waitForCalls } = makeFakePage({ visible: () => false });

    const message = await awaitReviewFrameOrRecover(page, { label: "case:vanished" }).then(
      () => "RESOLVED — nothing was visible, so this must not resolve",
      (err: unknown) => (err instanceof Error ? err.message : String(err)),
    );

    expect(message).toContain("case:vanished");
    expect(message).toContain(LOADED_REVIEW_MODAL);
    expect(message).toContain(SKELETON_REVIEW_MODAL);
    expect(message).toContain(BOUNDARY_SELECTOR);
    expect(message).toContain("show_review_snapshot_failed");
    expect(message).toContain("recovery not attempted");
    // No Retry click, and no watchdog: neither path was ever entered.
    expect(clicks).toEqual([]);
    expect(watchdogArms(waitForCalls)).toHaveLength(0);
    // The re-race happened: TWO composed waits, not one.
    expect(waitForCalls).toHaveLength(2);
  });

  test("a frame that REAPPEARS on the re-race is returned, not starved", async () => {
    // The other half of totality: "nothing visible right now" must cost one
    // bounded re-race, not the whole wait. Without the re-classify after that
    // race the helper throws a starve while the modal is on screen — a mutant
    // the enrolment probe surfaced at `statement-removal: observed = await
    // classify()`, which the vanished-frame case above cannot catch because it
    // expects a starve either way.
    let samples = 0;
    const { page, waitForCalls } = makeFakePage({
      visible: (selector) => {
        samples += 1;
        // The first classify pass samples skeleton, loaded, boundary and finds
        // nothing; the frame paints before the second pass.
        return samples > 3 && selector === LOADED_REVIEW_MODAL;
      },
    });

    const result = await awaitReviewFrameOrRecover(page, { label: "case:reappears" });

    expect(result.frame).toBe("loaded");
    expect(waitForCalls).toHaveLength(2);
  });

  test("starve names all three selectors and the server signature, VERBATIM", async () => {
    // Verbatim, not containment: an appended-suffix mutant survives substring
    // assertions (the loaded suite probed exactly that).
    const { page } = makeFakePage({ onWaitFor: STARVE });
    const message = await awaitReviewFrameOrRecover(page).then(
      () => "RESOLVED — the fake page should have starved",
      (err: unknown) => (err instanceof Error ? err.message : String(err)),
    );

    expect(message).toBe(
      "openShowReviewFrame: neither the loaded modal, the loading skeleton, nor the admin " +
        "error boundary became visible (label=unspecified, recovery not attempted). " +
        'Waited on [data-testid="published-show-review-modal"]:has([data-testid="published-show-review-title"]), ' +
        '[data-testid="published-show-review-modal"]:has([data-testid="published-show-review-loading"]) ' +
        'and [data-testid="admin-route-error-boundary"]. ' +
        "Grep the server log for show_review_snapshot_failed.",
    );
  });

  test("a supplied label renders verbatim and displaces the fallback", async () => {
    const { page } = makeFakePage({ onWaitFor: STARVE });
    const message = await awaitReviewFrameOrRecover(page, {
      label: "deeplink-esc:any-frame",
    }).then(
      () => "RESOLVED — the fake page should have starved",
      (err: unknown) => (err instanceof Error ? err.message : String(err)),
    );

    expect(message).toContain("deeplink-esc:any-frame");
    expect(message).not.toContain("label=unspecified");
  });

  test("twin-frame cardinality: the two frame selectors resolve to one DISTINCT node each", () => {
    // jsdom, not FakePage: only a real selector engine can prove disjointness.
    document.body.innerHTML = `
      <div data-testid="published-show-review-modal">
        <div data-testid="published-show-review-loading"></div>
      </div>
      <div data-testid="published-show-review-modal">
        <h2 data-testid="published-show-review-title">VB01</h2>
      </div>`;

    // The fixture must actually express the twin, or "exactly one" proves nothing.
    expect(document.querySelectorAll('[data-testid="published-show-review-modal"]')).toHaveLength(
      2,
    );

    const skeletons = document.querySelectorAll(SKELETON_REVIEW_MODAL);
    const loaded = document.querySelectorAll(LOADED_REVIEW_MODAL);
    expect(skeletons).toHaveLength(1);
    expect(loaded).toHaveLength(1);
    expect(skeletons[0]).not.toBe(loaded[0]);
  });
});

describe("openShowReviewFrameAt (spec §4.1)", () => {
  test("gotoOptions reach page.goto unchanged", async () => {
    const { page, gotoCalls } = makeFakePage({});
    const gotoOptions = { waitUntil: "domcontentloaded" } as const;

    await openShowReviewFrameAt(page, "/admin?show=vb01&alert_id=1", { gotoOptions });

    expect(gotoCalls).toHaveLength(1);
    expect(gotoCalls[0]?.url).toBe("/admin?show=vb01&alert_id=1");
    // Identity, not equality: the caller's own object must arrive untouched.
    expect(gotoCalls[0]?.options).toBe(gotoOptions);
  });

  test("absent gotoOptions passes nothing to page.goto", async () => {
    const { page, gotoCalls } = makeFakePage({});
    await openShowReviewFrameAt(page, "/admin?show=vb01");
    expect(gotoCalls[0]?.options).toBeUndefined();
  });

  test("the label defaults to url=<url>", async () => {
    const { page } = makeFakePage({ onWaitFor: STARVE });
    await expect(openShowReviewFrameAt(page, "/admin?show=q&alert_id=7")).rejects.toThrow(
      /url=\/admin\?show=q&alert_id=7/,
    );
  });
});
