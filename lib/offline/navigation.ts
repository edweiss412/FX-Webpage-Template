/**
 * What the service worker serves for a crew-page navigation, and what it does
 * with the saved copy afterwards (spec 4.4, steps 1 to 5).
 *
 * Pure and dependency-free: the worker glue does the fetching, the timing and
 * the storing, and asks these tables what each outcome means. Vitest imports
 * the same source.
 *
 * Serving and purging use different keys. A copy is served only at the URL it
 * was saved under, so serving reads S(U), the copy stored at the request path.
 * A purge names show X and removes C(X), the show's one copy wherever it was
 * saved, so it reaches a copy under an older link too. Only when the response
 * names no show does a purge fall back to the copy at U.
 */
import type { MarkerRead } from "@/lib/offline/marker";
import type { PurgeScope, StoredCopy } from "@/lib/offline/store";

export const NAV_BUDGET_MS = 8_000;
export const CONTINUATION_MS = 60_000;
export const STATUS_TIMEOUT_MS = 5_000;

export type ServeMode = "offline" | "slow" | "server-error" | "ended";

export type CompleteResponse =
  | { kind: "opaque-redirect" }
  | { kind: "body"; status: number; marker: MarkerRead };

/** S(U) is the copy saved at the request path; C(X) is show X's one copy wherever it lives. */
export type SavedView = {
  atUrl: StoredCopy | null;
  byShow: ReadonlyMap<string, StoredCopy>;
};

export type Step3 =
  | { serve: "network"; then: "commit" | "none" }
  | { serve: "network"; then: "purge"; scope: PurgeScope }
  | { serve: "saved"; mode: "server-error" }
  | { serve: "ask-status" };

/** "no-verdict" is a 500 from the status route; "no-answer" is a network error or timeout. */
export type StatusOutcome = "ended" | "gone" | "no-verdict" | "no-answer";

/** The `check` row's outcome once the status route has answered about S(U). */
export type CheckDecision =
  | { serve: "saved"; mode: "ended"; then: "mark-ended" }
  | { serve: "network"; then: "purge"; scope: PurgeScope }
  | { serve: "network"; then: "none" };

/**
 * Step 1 for an S(U) marked ended. "step-2" purges, then runs steps 2 to 5 as for
 * any navigation; "fetch-keep" fetches under the step 2 budget, keeps S(U), and
 * hands the result to `decideEndedFetch`. After a "step-2" purge the caller reads
 * the SavedView again before `decideStep3` or `decideNoResponse`: the view read for
 * step 1 still holds the copy the purge removed.
 */
export type EndedStep1 =
  | { next: "serve-saved"; mode: "ended" }
  | { next: "step-2"; purge: PurgeScope }
  | { next: "fetch-keep" };

export type NoResponseReason = "network-error" | "timeout";

/** How a page fetch under the step 2 budget ended. */
export type FetchResult =
  | { kind: "complete"; response: CompleteResponse }
  | { kind: "no-response"; reason: NoResponseReason };

export type EndedFetch = { serve: "network"; then: "none" } | { serve: "saved"; mode: "ended" };

/** "not-saved" is the built-in page (spec 4.7.5); "wait" means no worker timeout at all. */
export type NoResponseDecision =
  | { serve: "saved"; mode: "offline" }
  | { serve: "not-saved" }
  | { serve: "saved"; mode: "slow"; continueForMs: number }
  | { serve: "wait" };

// Shared by several rows, so frozen: a caller writing to one would change every later answer.
const NETWORK_NONE: Step3 = Object.freeze({ serve: "network", then: "none" });
const SAVED_SERVER_ERROR: Step3 = Object.freeze({ serve: "saved", mode: "server-error" });

/** Step 3: the marker of a response that completed in time decides, against S(U) and C(X). */
export function decideStep3(url: string, response: CompleteResponse, saved: SavedView): Step3 {
  if (response.kind === "opaque-redirect") return NETWORK_NONE;

  const reading = response.marker;
  if (reading.kind === "absent") {
    // A platform error before the app ran says nothing about the viewer.
    if (response.status >= 500) return saved.atUrl !== null ? SAVED_SERVER_ERROR : NETWORK_NONE;
    return purge(null, url);
  }
  if (reading.kind === "invalid") return purge(reading.showId, url);

  const marker = reading.marker;
  switch (marker.disposition) {
    case "save":
      return { serve: "network", then: "commit" };
    case "keep": {
      const atUrl = saved.atUrl;
      if (atUrl !== null && atUrl.showId === marker.showId && atUrl.viewer === marker.viewer) {
        return SAVED_SERVER_ERROR;
      }
      const ofShow = saved.byShow.get(marker.showId);
      if (ofShow !== undefined && ofShow.viewer !== marker.viewer) {
        return purge(marker.showId, url);
      }
      return NETWORK_NONE;
    }
    case "hold":
      return NETWORK_NONE;
    case "check":
      return saved.atUrl !== null ? { serve: "ask-status" } : NETWORK_NONE;
    case "purge":
      return purge(marker.showId, url);
  }
}

/** The `check` row once the status route has answered about S(U), `copy`. */
export function decideCheckOutcome(outcome: StatusOutcome, copy: StoredCopy): CheckDecision {
  switch (outcome) {
    case "ended":
      return { serve: "saved", mode: "ended", then: "mark-ended" };
    case "gone":
      return { serve: "network", then: "purge", scope: { by: "show", showId: copy.showId } };
    case "no-verdict":
    case "no-answer":
      return { serve: "network", then: "none" };
  }
}

/**
 * Step 1, for an S(U), `copy`, already marked ended: the link is dead by
 * construction, so the status route is asked instead of fetching the page.
 */
export function decideEndedStep1(outcome: StatusOutcome, copy: StoredCopy): EndedStep1 {
  switch (outcome) {
    case "ended":
    case "no-answer":
      return { next: "serve-saved", mode: "ended" };
    case "gone":
      return { next: "step-2", purge: { by: "show", showId: copy.showId } };
    case "no-verdict":
      return { next: "fetch-keep" };
  }
}

/**
 * Step 1's server-error branch: the app answered without a verdict, so the page
 * is fetched under the step 2 budget and S(U) is kept. A complete response is
 * served as is, without the step 3 table; no response at all serves S(U) ended.
 */
export function decideEndedFetch(result: FetchResult): EndedFetch {
  return result.kind === "complete"
    ? { serve: "network", then: "none" }
    : { serve: "saved", mode: "ended" };
}

/** Step 4 (a network error) and step 5 (the budget ran out) for a navigation to U. */
export function decideNoResponse(reason: NoResponseReason, saved: SavedView): NoResponseDecision {
  if (reason === "network-error") {
    return saved.atUrl !== null ? { serve: "saved", mode: "offline" } : { serve: "not-saved" };
  }
  return saved.atUrl !== null
    ? { serve: "saved", mode: "slow", continueForMs: CONTINUATION_MS }
    : { serve: "wait" };
}

/** Purge C(show) when the response names a show; otherwise the copy at U. */
function purge(showId: string | null, url: string): Step3 {
  return {
    serve: "network",
    then: "purge",
    scope: showId !== null ? { by: "show", showId } : { by: "url", url },
  };
}
