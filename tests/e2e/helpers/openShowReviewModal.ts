/**
 * tests/e2e/helpers/openShowReviewModal.ts
 *
 * Opens /admin?show=<slug> and waits for the LOADED review modal, recovering
 * EXACTLY ONCE from the admin route error boundary via the product's own
 * Retry (app/admin/error.tsx reset()). Rationale + measured root cause:
 * docs/superpowers/specs/ci/2026-08-15-changes-feed-modal-batch-flake-design.md §2.
 *
 * ONE core, THREE entry points (adoption sweep,
 * docs/superpowers/specs/ci/2026-08-16-modal-wait-boundary-helper-adoption-design.md §4.1):
 *
 *   awaitReviewModalOrRecover(page, opts?)   the wait + the single recovery.
 *                                            For callers that own their own
 *                                            navigation — row clicks, keyboard
 *                                            activation, legacy 307 redirects,
 *                                            reloads.
 *   openShowReviewModalAt(page, url, opts?)  goto(url, gotoOptions) + the core.
 *                                            For callers that own their URL or
 *                                            need a non-default waitUntil.
 *   openShowReviewModal(page, slug, opts?)   unchanged public contract; a thin
 *                                            delegation through both.
 *
 * There is deliberately NO readySelector option: the Suspense skeleton renders
 * through the same shell with the same testIdBase, so a modal-or-boundary race
 * on the frame-only selector is won by the skeleton and would hide the fault
 * instead of surfacing it (adoption spec §4.1, §2.5 limit 3b). The core waits
 * on LOADED_REVIEW_MODAL and nothing else.
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

/** Caller-supplied context for annotations and error text; absent → `label=unspecified`. */
const UNSPECIFIED_LABEL = "label=unspecified";

/** Playwright's own goto options, passed through untouched. */
type GotoOptions = NonNullable<Parameters<Page["goto"]>[1]>;

export type AwaitModalOptions = { timeoutMs?: number; label?: string };
export type OpenAtOptions = AwaitModalOptions & { gotoOptions?: GotoOptions };

function starveError(label: string, recoveryAttempted: boolean): Error {
  return new Error(
    `openShowReviewModal: neither the loaded modal nor the admin error boundary became visible ` +
      `(${label}, recovery ${recoveryAttempted ? "attempted" : "not attempted"}). ` +
      `Waited on ${LOADED_REVIEW_MODAL} and ${BOUNDARY_SELECTOR}. ` +
      `Grep the server log for ${SERVER_SIGNATURE}.`,
  );
}

/**
 * The wait-plus-recovery core: steps 3-7 of the parent contract, with no
 * navigation of its own. Callers that opened the route some other way (row
 * click, Enter on a focused Link, a legacy 307, `page.reload()`) route their
 * post-open content wait through here.
 *
 * The RETURN value is a deliberately UNSCOPED page.locator(LOADED_REVIEW_MODAL)
 * so a caller counting or scoping off it sees exactly what it sees today; only
 * the internal waits are `.first()`-narrowed (spec §4.1 strictness contract).
 */
export async function awaitReviewModalOrRecover(
  page: Page,
  opts?: AwaitModalOptions,
): Promise<Locator> {
  const label = opts?.label ?? UNSPECIFIED_LABEL;
  const timeoutMs =
    opts?.timeoutMs !== undefined && Number.isFinite(opts.timeoutMs) && opts.timeoutMs > 0
      ? opts.timeoutMs
      : DEFAULT_TIMEOUT_MS;

  const modal = page.locator(LOADED_REVIEW_MODAL);
  const ready = modal.first();
  const boundary = page.locator(BOUNDARY_SELECTOR);

  try {
    await ready.or(boundary).first().waitFor({ state: "visible", timeout: timeoutMs });
  } catch {
    throw starveError(label, false);
  }
  if (await ready.isVisible()) return modal;

  // Error boundary path: recover once via the product's own Retry.
  const { test } = await import("@playwright/test");
  test.info().annotations.push({
    type: "infra-recovery",
    description: `${label}: admin error boundary on first wait; clicking retry`,
  });
  await page.locator(RETRY_SELECTOR).click();
  try {
    await ready.waitFor({ state: "visible", timeout: timeoutMs });
  } catch {
    if (await boundary.isVisible()) {
      throw new Error(
        `openShowReviewModal: error boundary persisted after one retry (${label}). ` +
          `Waited on ${LOADED_REVIEW_MODAL} and ${BOUNDARY_SELECTOR}. ` +
          `Grep the server log for ${SERVER_SIGNATURE}.`,
      );
    }
    throw starveError(label, true);
  }
  return modal;
}

/**
 * URL entry point: the caller owns the URL (extra query params, encoded alert
 * ids) and/or the navigation semantics (`waitUntil`), and the core owns the
 * wait and the recovery.
 */
export async function openShowReviewModalAt(
  page: Page,
  url: string,
  opts?: OpenAtOptions,
): Promise<Locator> {
  await page.goto(url, opts?.gotoOptions);
  return awaitReviewModalOrRecover(page, {
    ...(opts?.timeoutMs !== undefined ? { timeoutMs: opts.timeoutMs } : {}),
    label: opts?.label ?? `url=${url}`,
  });
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
  return openShowReviewModalAt(page, `/admin?show=${slug}`, {
    ...(opts?.timeoutMs !== undefined ? { timeoutMs: opts.timeoutMs } : {}),
    label: `slug=${slug}`,
  });
}
