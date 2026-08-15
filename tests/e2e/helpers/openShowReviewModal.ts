/**
 * tests/e2e/helpers/openShowReviewModal.ts
 *
 * Opens /admin?show=<slug> and waits for the LOADED review modal, recovering
 * EXACTLY ONCE from the admin route error boundary via the product's own
 * Retry (app/admin/error.tsx reset()). Rationale + measured root cause:
 * docs/superpowers/specs/ci/2026-08-15-changes-feed-modal-batch-flake-design.md §2.
 *
 * Every recovery is surfaced as a test annotation {type: "infra-recovery"};
 * scripts/check-app-e2e-executed.mjs prints them into the job log (green CI
 * runs upload no artifact, and the list reporter prints no annotations).
 *
 * The recovery bound is ONE by design: a transient gateway blip clears on one
 * reset, and anything that survives a reset is a real defect that must fail the
 * test. Do not widen it.
 *
 * Import discipline: NO top-level value import from @playwright/test; the
 * unit test runs this module under vitest. test.info() arrives via a lazy
 * dynamic import inside the boundary branch.
 */
import type { Locator, Page } from "@playwright/test";

export const LOADED_REVIEW_MODAL =
  '[data-testid="published-show-review-modal"]:has([data-testid="published-show-review-title"])';

const BOUNDARY_SELECTOR = '[data-testid="admin-route-error-boundary"]';
const RETRY_SELECTOR = '[data-testid="admin-route-error-retry"]';
const SERVER_SIGNATURE = "show_review_snapshot_failed";
const DEFAULT_TIMEOUT_MS = 30_000;

function starveError(slug: string, recoveryAttempted: boolean): Error {
  return new Error(
    `openShowReviewModal: neither the loaded modal nor the admin error boundary became visible ` +
      `(slug=${slug}, recovery ${recoveryAttempted ? "attempted" : "not attempted"}). ` +
      `Waited on ${LOADED_REVIEW_MODAL} and ${BOUNDARY_SELECTOR}. ` +
      `Grep the server log for ${SERVER_SIGNATURE}.`,
  );
}

export async function openShowReviewModal(
  page: Page,
  slug: string,
  opts?: { timeoutMs?: number },
): Promise<Locator> {
  // Guard FIRST: /admin?show= with an empty value renders the bare dashboard
  // (the firstParam guard in app/admin/page.tsx), so navigating would starve on
  // a confusing surface instead of naming the caller's seeding.
  if (typeof slug !== "string" || slug.trim() === "") {
    throw new Error(
      "openShowReviewModal: empty slug. The caller's show resolution produced nothing; " +
        "run `pnpm db:seed` and check the spec's beforeAll seeding.",
    );
  }
  const timeoutMs =
    opts?.timeoutMs !== undefined && Number.isFinite(opts.timeoutMs) && opts.timeoutMs > 0
      ? opts.timeoutMs
      : DEFAULT_TIMEOUT_MS;

  await page.goto(`/admin?show=${slug}`);
  const modal = page.locator(LOADED_REVIEW_MODAL);
  const boundary = page.locator(BOUNDARY_SELECTOR);

  try {
    await modal.or(boundary).first().waitFor({ state: "visible", timeout: timeoutMs });
  } catch {
    throw starveError(slug, false);
  }
  if (await modal.isVisible()) return modal;

  // Error boundary path: recover once via the product's own Retry.
  const { test } = await import("@playwright/test");
  test.info().annotations.push({
    type: "infra-recovery",
    description: `slug=${slug}: admin error boundary on first wait; clicking retry`,
  });
  await page.locator(RETRY_SELECTOR).click();
  try {
    await modal.waitFor({ state: "visible", timeout: timeoutMs });
  } catch {
    if (await boundary.isVisible()) {
      throw new Error(
        `openShowReviewModal: error boundary persisted after one retry (slug=${slug}). ` +
          `Waited on ${LOADED_REVIEW_MODAL} and ${BOUNDARY_SELECTOR}. ` +
          `Grep the server log for ${SERVER_SIGNATURE}.`,
      );
    }
    throw starveError(slug, true);
  }
  return modal;
}
