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
 * TWO further entry points serve callers whose subject is whichever frame is up
 * (skeleton-tolerant sites spec,
 * docs/superpowers/specs/ci/2026-08-17-modal-wait-skeleton-tolerant-sites-design.md §4.1):
 *
 *   awaitReviewFrameOrRecover(page, opts?)    the three-way race (loaded |
 *                                             skeleton | boundary) plus the same
 *                                             single recovery, REPORTING which
 *                                             frame it resolved.
 *   openShowReviewFrameAt(page, url, opts?)   goto(url, gotoOptions) + the frame
 *                                             core.
 *
 * There is STILL deliberately NO readySelector option: the Suspense skeleton
 * renders through the same shell with the same testIdBase, so a caller-supplied
 * frame-only selector would let a modal-or-boundary race be won by the skeleton
 * SILENTLY and hide the fault (adoption spec §4.1, §2.5 limit 3b). The loaded
 * core waits on LOADED_REVIEW_MODAL and nothing else; a caller that genuinely
 * accepts either frame takes the frame core instead, which owns both module
 * selectors, NAMES the frame it returned, and arms the boundary watchdog on a
 * skeleton return so the fault is annotated rather than hidden.
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

/**
 * The Suspense skeleton twin: same shell, same testIdBase, distinguished only by
 * its loading body (ShowReviewModalSkeleton.tsx:171). Disjoint from
 * LOADED_REVIEW_MODAL by construction — the unit suite's twin-frame cardinality
 * case proves it against a real selector engine.
 */
export const SKELETON_REVIEW_MODAL =
  '[data-testid="published-show-review-modal"]:has([data-testid="published-show-review-loading"])';

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

/** Which frame the frame core resolved on. */
export type ReviewFrame = "skeleton" | "loaded";
export type AwaitFrameResult = { frame: ReviewFrame; locator: Locator };

/** Non-finite or non-positive callers fall back to the module default. */
function normalizeTimeoutMs(timeoutMs: number | undefined): number {
  return timeoutMs !== undefined && Number.isFinite(timeoutMs) && timeoutMs > 0
    ? timeoutMs
    : DEFAULT_TIMEOUT_MS;
}

function starveError(label: string, recoveryAttempted: boolean): Error {
  return new Error(
    `openShowReviewModal: neither the loaded modal nor the admin error boundary became visible ` +
      `(${label}, recovery ${recoveryAttempted ? "attempted" : "not attempted"}). ` +
      `Waited on ${LOADED_REVIEW_MODAL} and ${BOUNDARY_SELECTOR}. ` +
      `Grep the server log for ${SERVER_SIGNATURE}.`,
  );
}

function frameStarveError(label: string, recoveryAttempted: boolean): Error {
  return new Error(
    `openShowReviewFrame: neither the loaded modal, the loading skeleton, nor the admin ` +
      `error boundary became visible (${label}, recovery ${recoveryAttempted ? "attempted" : "not attempted"}). ` +
      `Waited on ${LOADED_REVIEW_MODAL}, ${SKELETON_REVIEW_MODAL} and ${BOUNDARY_SELECTOR}. ` +
      `Grep the server log for ${SERVER_SIGNATURE}.`,
  );
}

function boundaryPersistedError(label: string): Error {
  return new Error(
    `openShowReviewFrame: error boundary persisted after one retry (${label}). ` +
      `Waited on ${LOADED_REVIEW_MODAL}, ${SKELETON_REVIEW_MODAL} and ${BOUNDARY_SELECTOR}. ` +
      `Grep the server log for ${SERVER_SIGNATURE}.`,
  );
}

/**
 * Fire-and-forget: the boundary can still replace the skeleton AFTER the frame
 * wait returned, and the caller is already downstream by then. This never
 * recovers (the recovery bound is ONE, and the test is in flight) and never
 * throws — a rejection after page close must not surface as an unhandled
 * rejection, so BOTH arms are swallowed. The annotation reuses the
 * `infra-recovery` type, so the shipped collector
 * (scripts/lib/infraRecoveryAnnotations.mjs:30) carries it with zero plumbing.
 */
function armBoundaryWatchdog(page: Page, label: string, timeoutMs: number): void {
  void page
    .locator(BOUNDARY_SELECTOR)
    .waitFor({ state: "visible", timeout: timeoutMs })
    .then(async () => {
      const { test } = await import("@playwright/test");
      test.info().annotations.push({
        type: "infra-recovery",
        description:
          `${label}: admin error boundary replaced the skeleton AFTER the frame wait returned; ` +
          `no recovery attempted (test already in flight). Downstream failures in this test are ` +
          `the boundary fault; grep the server log for ${SERVER_SIGNATURE}.`,
      });
    })
    .catch(() => {});
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
  const timeoutMs = normalizeTimeoutMs(opts?.timeoutMs);

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
 * The frame-REPORTING core: for the callers whose subject is whichever frame is
 * up (an Esc during load, a reopen whose retained tree may already be loaded).
 * It races loaded | skeleton | boundary, recovers ONCE from the boundary
 * exactly as the loaded core does, and NAMES the frame it resolved so the
 * caller never has to re-derive it from a selector.
 *
 * Loaded is checked BEFORE skeleton: during the streaming swap both shapes are
 * momentarily mounted, and reporting "skeleton" there would be a lie.
 *
 * Returned locators are UNSCOPED (the parent §4.1 contract); only the internal
 * waits are `.first()`-narrowed.
 */
export async function awaitReviewFrameOrRecover(
  page: Page,
  opts?: AwaitModalOptions,
): Promise<AwaitFrameResult> {
  const label = opts?.label ?? UNSPECIFIED_LABEL;
  const timeoutMs = normalizeTimeoutMs(opts?.timeoutMs);

  const loaded = page.locator(LOADED_REVIEW_MODAL);
  const skeleton = page.locator(SKELETON_REVIEW_MODAL);
  const loadedReady = loaded.first();
  const skeletonReady = skeleton.first();
  const boundary = page.locator(BOUNDARY_SELECTOR);

  const raceOnce = async (arms: Locator[]): Promise<boolean> => {
    const chain = arms.slice(1).reduce((acc, arm) => acc.or(arm), arms[0]!);
    try {
      await chain.first().waitFor({ state: "visible", timeout: timeoutMs });
      return true;
    } catch {
      return false;
    }
  };

  const classify = async (): Promise<ReviewFrame | "boundary" | null> => {
    // SKELETON is sampled first and LOADED second, so the later sample decides:
    // any overlap in which the loaded frame is up at its own sample point
    // resolves "loaded", which is the tie-break this contract promises. Each
    // call is a live DOM query and the streaming swap is milliseconds wide, so
    // the ORDER is the only part of the race we own (diff review R1 finding 1).
    const skeletonVisible = await skeletonReady.isVisible();
    if (await loadedReady.isVisible()) return "loaded";
    if (skeletonVisible) return "skeleton";
    if (await boundary.isVisible()) return "boundary";
    // Nothing is up any more: the state moved between the race and these
    // samples. The caller gets a named error or a re-race, NEVER a silent fall
    // into the recovery path with no boundary present.
    return null;
  };

  const settle = (frame: ReviewFrame): AwaitFrameResult => {
    if (frame === "skeleton") armBoundaryWatchdog(page, label, timeoutMs);
    return { frame, locator: frame === "loaded" ? loaded : skeleton };
  };

  if (!(await raceOnce([loadedReady, skeletonReady, boundary]))) {
    throw frameStarveError(label, false);
  }

  let observed = await classify();
  if (observed === null) {
    // ONE bounded re-race, then classify again. A frame that vanished under the
    // first sample is the documented overlap, not a fault; a frame that never
    // comes back is a starve and is named as one.
    if (!(await raceOnce([loadedReady, skeletonReady, boundary]))) {
      throw frameStarveError(label, false);
    }
    observed = await classify();
  }
  if (observed === null) throw frameStarveError(label, false);
  if (observed !== "boundary") return settle(observed);

  // Error boundary path: recover once via the product's own Retry.
  const { test } = await import("@playwright/test");
  test.info().annotations.push({
    type: "infra-recovery",
    description: `${label}: admin error boundary on first frame wait; clicking retry`,
  });
  await page.locator(RETRY_SELECTOR).click();
  if (!(await raceOnce([loadedReady, skeletonReady]))) {
    if (await boundary.isVisible()) throw boundaryPersistedError(label);
    throw frameStarveError(label, true);
  }

  // Post-recovery classification is TOTAL for the same reason: reporting
  // "skeleton" because "loaded" was absent would report a frame nobody
  // observed, and a SECOND boundary would be returned as a stale skeleton.
  const after = await classify();
  if (after === "boundary") throw boundaryPersistedError(label);
  if (after === null) throw frameStarveError(label, true);
  return settle(after);
}

/**
 * URL entry point over the FRAME core: the exact `openShowReviewModalAt`
 * composition, so a caller that owns its URL gets the three-way race, the
 * single recovery, and the watchdog for free.
 */
export async function openShowReviewFrameAt(
  page: Page,
  url: string,
  opts?: OpenAtOptions,
): Promise<AwaitFrameResult> {
  await page.goto(url, opts?.gotoOptions);
  return awaitReviewFrameOrRecover(page, {
    ...(opts?.timeoutMs !== undefined ? { timeoutMs: opts.timeoutMs } : {}),
    label: opts?.label ?? `url=${url}`,
  });
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
