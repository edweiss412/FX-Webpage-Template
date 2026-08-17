// @vitest-environment jsdom
/**
 * tests/e2e/helpers/openShowReviewModal.unit.test.ts — the parts of the
 * review-modal wait helper that are provable without a browser.
 *
 * The jsdom environment above is for ONE case: the twin-frame cardinality pin
 * needs a real `:has()` selector engine to prove LOADED_REVIEW_MODAL matches
 * exactly one node while two `…-modal` frames are mounted. Everything else runs
 * against a fake Page and would be equally happy under `node`. Declaring the
 * environment here rather than importing jsdom directly keeps the dependency
 * set unchanged (jsdom ships no types of its own).
 *
 * Spec: docs/superpowers/specs/ci/2026-08-15-changes-feed-modal-batch-flake-design.md §4.1
 * Entry: BL-CHANGES-FEED-MODAL-BATCH-FLAKE
 *
 * Two surfaces are unit-reachable: the empty-slug guard (step 1 of the contract,
 * which must fire BEFORE any page API is touched — navigating to `/admin?show=`
 * renders the bare dashboard and starves confusingly) and the loaded-modal
 * selector constant, whose `:has()` clause is what keeps the streaming skeleton
 * twin out of strict-mode matches.
 *
 * The boundary-recovery branch is NOT reachable here — it needs a real 502 and is
 * spec §7 limit 2 with its accepted survivor. The neither-locator starve (step 7)
 * is pinned by the dead-slug diagnostic case in
 * tests/e2e/admin-changes-feed-layout.spec.ts, under playwright.
 *
 * This file runs under VITEST, which is why the helper value-imports nothing from
 * @playwright/test at module top level.
 */
import { describe, expect, test } from "vitest";
import type { Page } from "@playwright/test";

import {
  LOADED_REVIEW_MODAL,
  awaitReviewModalOrRecover,
  openShowReviewModal,
  openShowReviewModalAt,
} from "./openShowReviewModal";

/**
 * A fake Page that records what the helper does to it. Everything the core
 * touches on the happy path is synchronous bookkeeping, so the whole
 * navigate-and-wait surface is unit-reachable without a browser. The recovery
 * BRANCH still is not (it dynamic-imports @playwright/test for test.info()) —
 * spec §7 limit 2.
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

  return {
    page: page as unknown as Page,
    gotoCalls,
    waitForCalls,
    isVisibleCalls,
    clicks,
  };
}

const STARVE = (selector: string): never => {
  throw new Error(`fake timeout on ${selector}`);
};

describe("openShowReviewModal (unit-testable surface)", () => {
  test("empty slug rejects before any page API is touched", async () => {
    // A bare object would explode on .goto; rejection proves the guard fires first.
    await expect(openShowReviewModal({} as Page, "")).rejects.toThrow(/db:seed/);
  });

  test("whitespace-only slug rejects the same way", async () => {
    await expect(openShowReviewModal({} as Page, "   ")).rejects.toThrow(/db:seed/);
  });

  test("LOADED_REVIEW_MODAL pins the skeleton-twin-scoped selector", () => {
    expect(LOADED_REVIEW_MODAL).toBe(
      '[data-testid="published-show-review-modal"]:has([data-testid="published-show-review-title"])',
    );
  });
});

describe("openShowReviewModalAt / awaitReviewModalOrRecover (spec §4.1)", () => {
  test("gotoOptions reach page.goto unchanged", async () => {
    // Catches a wrapper that drops or rebuilds waitUntil, which would silently
    // change picker-flow's ("networkidle") and admin-layout-dimensions'
    // ("domcontentloaded") navigation semantics.
    const { page, gotoCalls } = makeFakePage({});
    const gotoOptions = { waitUntil: "networkidle" } as const;

    await openShowReviewModalAt(page, "/admin?bucket=archived&show=x&alert_id=1", {
      gotoOptions,
    });

    expect(gotoCalls).toHaveLength(1);
    expect(gotoCalls[0]?.url).toBe("/admin?bucket=archived&show=x&alert_id=1");
    // Identity, not equality: the caller's own object must arrive untouched.
    expect(gotoCalls[0]?.options).toBe(gotoOptions);
  });

  test("absent gotoOptions passes nothing to page.goto", async () => {
    const { page, gotoCalls } = makeFakePage({});
    await openShowReviewModalAt(page, "/admin?show=x");
    expect(gotoCalls[0]?.options).toBeUndefined();
  });

  test("absent label renders label=unspecified in the starve error", async () => {
    // Catches `undefined` leaking into operator-facing strings.
    const { page } = makeFakePage({ onWaitFor: STARVE });
    await expect(awaitReviewModalOrRecover(page)).rejects.toThrow(/label=unspecified/);
  });

  test("a supplied label renders verbatim and displaces the fallback", async () => {
    const { page } = makeFakePage({ onWaitFor: STARVE });
    const message = await awaitReviewModalOrRecover(page, {
      label: "click:shows-table-row-vb01",
    }).then(
      () => "RESOLVED — the fake page should have starved",
      (err: unknown) => (err instanceof Error ? err.message : String(err)),
    );
    expect(message).toContain("click:shows-table-row-vb01");
    expect(message).not.toContain("label=unspecified");
  });

  test("openShowReviewModalAt defaults its label to url=<url>", async () => {
    const { page } = makeFakePage({ onWaitFor: STARVE });
    await expect(openShowReviewModalAt(page, "/admin?show=q&alert_id=7")).rejects.toThrow(
      /url=\/admin\?show=q&alert_id=7/,
    );
  });

  test("the starve error message is pinned VERBATIM, not by containment", async () => {
    // Containment lets an appended-suffix mutant survive (probed: both
    // SERVER_SIGNATURE and the label fallback did, against the substring
    // assertions below). This is the verbatim half that kills them.
    const { page } = makeFakePage({ onWaitFor: STARVE });
    const message = await awaitReviewModalOrRecover(page).then(
      () => "RESOLVED — the fake page should have starved",
      (err: unknown) => (err instanceof Error ? err.message : String(err)),
    );
    expect(message).toBe(
      "openShowReviewModal: neither the loaded modal nor the admin error boundary became visible " +
        "(label=unspecified, recovery not attempted). " +
        'Waited on [data-testid="published-show-review-modal"]:has([data-testid="published-show-review-title"]) ' +
        'and [data-testid="admin-route-error-boundary"]. ' +
        "Grep the server log for show_review_snapshot_failed.",
    );
  });

  test("the starve error keeps the parent arc's three diagnostic substrings", async () => {
    // Same regex the dead-slug playwright diagnostic asserts
    // (tests/e2e/admin-changes-feed-layout.spec.ts:185) — pinned here so a
    // refactor cannot break it without a unit failure first.
    const { page } = makeFakePage({ onWaitFor: STARVE });
    await expect(awaitReviewModalOrRecover(page)).rejects.toThrow(
      /published-show-review-modal[\s\S]*admin-route-error-boundary[\s\S]*show_review_snapshot_failed/,
    );
  });

  test("timeoutMs reaches the ready wait, and non-finite values fall back to 30s", async () => {
    const explicit = makeFakePage({});
    await awaitReviewModalOrRecover(explicit.page, { timeoutMs: 1_234 });
    expect(explicit.waitForCalls[0]?.opts).toEqual({ state: "visible", timeout: 1_234 });

    const bogus = makeFakePage({});
    await awaitReviewModalOrRecover(bogus.page, { timeoutMs: Number.NaN });
    expect(bogus.waitForCalls[0]?.opts).toEqual({ state: "visible", timeout: 30_000 });
  });

  test("every ready-locator operation runs on a .first()-scoped locator", async () => {
    // Spec §4.1 strictness contract: defense in depth against a future selector
    // change re-introducing the strict-mode exit, which would throw a generic
    // Playwright error naming neither the boundary nor the server signature.
    const { page, waitForCalls, isVisibleCalls } = makeFakePage({});
    await openShowReviewModal(page, "vb01");
    expect(waitForCalls.length).toBeGreaterThan(0);
    expect(waitForCalls.map((c) => c.scoped)).not.toContain(false);
    expect(isVisibleCalls.length).toBeGreaterThan(0);
    expect(isVisibleCalls.map((c) => c.scoped)).not.toContain(false);
  });

  test("the returned locator stays UNSCOPED, so callers count what they count today", async () => {
    const { page } = makeFakePage({});
    const returned = (await openShowReviewModal(page, "vb01")) as unknown as FakeLocator;
    expect(returned.selector).toBe(LOADED_REVIEW_MODAL);
    expect(returned.scoped).toBe(false);
  });

  test("openShowReviewModal delegates through the URL entry point with slug=<slug>", async () => {
    const { page, gotoCalls } = makeFakePage({ onWaitFor: STARVE });
    await expect(openShowReviewModal(page, "my-slug")).rejects.toThrow(/slug=my-slug/);
    expect(gotoCalls).toEqual([{ url: "/admin?show=my-slug", options: undefined }]);
  });

  test("twin-frame cardinality: LOADED_REVIEW_MODAL resolves to exactly one node", () => {
    // The Suspense skeleton renders through the SAME shell with the same
    // testIdBase (ShowReviewModalSkeleton.tsx:51 -> ReviewModalShell.tsx:584),
    // so during the documented twin interval two `…-modal` nodes exist. Only
    // the loaded frame carries a title node. The property under test is the
    // locator's CARDINALITY — the first wait and the post-recovery re-wait use
    // this same locator, so one node covers both call sites by construction.
    document.body.innerHTML = `
      <div data-testid="published-show-review-modal">
        <div data-testid="published-show-review-skeleton-band"></div>
      </div>
      <div data-testid="published-show-review-modal">
        <h2 data-testid="published-show-review-title">VB01</h2>
      </div>`;

    // The fixture must actually express the twin, or "exactly one" proves nothing.
    expect(document.querySelectorAll('[data-testid="published-show-review-modal"]')).toHaveLength(
      2,
    );
    expect(document.querySelectorAll(LOADED_REVIEW_MODAL)).toHaveLength(1);
  });
});
