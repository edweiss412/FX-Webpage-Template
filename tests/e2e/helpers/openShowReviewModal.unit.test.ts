/**
 * tests/e2e/helpers/openShowReviewModal.unit.test.ts — the parts of the
 * review-modal wait helper that are provable without a browser.
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

import { LOADED_REVIEW_MODAL, openShowReviewModal } from "./openShowReviewModal";

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
