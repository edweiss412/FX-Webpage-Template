/**
 * The messages between crew pages and the service worker (spec 4.3, 4.4,
 * 4.6, 4.7.3), the status-route request the worker sends, and how the worker
 * reads that route's answer.
 *
 * Pure and dependency-free: the worker bundle imports this file, the page-side
 * helpers import it, and Vitest imports the same source.
 */
import type { StatusOutcome } from "@/lib/offline/navigation";
import type { StoredCopy } from "@/lib/offline/store";

// --- Page to worker -------------------------------------------------------------
//
// Each message travels with a MessagePort in its transfer list, and the worker
// replies on that port.

/** `<SavedCopyMarker>`'s disposition, posted on mount (spec 4.3). */
export type MarkerMessage =
  | { type: "marker"; disposition: "purge"; showId: string | null; url: string }
  | { type: "marker"; disposition: "check"; url: string };

/** The registrar keeping S(U) current on a live page (spec 4.4 "The first visit", 4.7.3). */
export type EnsureSavedMessage = { type: "ensure-saved"; url: string; renderedAt: string };

/** The bar asking whether the network is back (spec 4.7.3). */
export type ProbeMessage = { type: "probe"; url: string };

/** AvatarMenu's "Not you?" bracket (spec 4.6). */
export type PurgeShowMessage = { type: "purge-show"; showId: string };

export type PageMessage = MarkerMessage | EnsureSavedMessage | ProbeMessage | PurgeShowMessage;

/** The outcome of a check, probe or ensure-saved, as the page reads it (spec 4.7.3). */
export type MessageOutcome = "saved" | "purged" | "ended" | "failed" | "skipped" | "kept";

/** Purges reply `ack` once the purge has completed; the other messages reply an outcome. */
export type WorkerReply = { outcome: "ack" | MessageOutcome };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isText(value: unknown): value is string {
  return typeof value === "string" && value !== "";
}

/**
 * Reads a page's message, or null for anything that is not one of the four.
 * Only same-origin pages can post to the worker, so this guards against a page
 * built from an older or newer protocol, not against an attacker.
 */
export function parsePageMessage(data: unknown): PageMessage | null {
  if (!isRecord(data)) return null;
  switch (data.type) {
    case "marker": {
      if (!isText(data.url)) return null;
      if (data.disposition === "check")
        return { type: "marker", disposition: "check", url: data.url };
      if (data.disposition !== "purge") return null;
      if (data.showId !== null && !isText(data.showId)) return null;
      return { type: "marker", disposition: "purge", showId: data.showId, url: data.url };
    }
    case "ensure-saved":
      return isText(data.url) && isText(data.renderedAt)
        ? { type: "ensure-saved", url: data.url, renderedAt: data.renderedAt }
        : null;
    case "probe":
      return isText(data.url) ? { type: "probe", url: data.url } : null;
    case "purge-show":
      return isText(data.showId) ? { type: "purge-show", showId: data.showId } : null;
    default:
      return null;
  }
}

// --- Worker to every open page ------------------------------------------------------

export type WorkerBroadcast =
  | { type: "fresh-ready"; url: string }
  | { type: "purged"; showId: string }
  | { type: "save-failed"; url: string; reason: "quota" };

// --- The outcome table (preflight ruling D4) ---------------------------------------

/**
 * What a run of the step 3 table without serving did (a probe, an ensure-saved,
 * a step 5 continuation, a marker check). `marked-ended` is a status route that
 * found S(U) ended, whether this run marked the copy or an earlier one had, so
 * every check of an ended show replies `ended`. `unchanged` is every other row
 * that leaves the store as it was: hold, keep, an opaque redirect, a status route
 * without a verdict, a copy replaced or purged while its check was out.
 */
export type SilentResult =
  | "committed"
  | "commit-failed"
  | "purged"
  | "marked-ended"
  | "unchanged"
  | "no-response"
  | "skipped";

export const OUTCOME_OF: Readonly<Record<SilentResult, MessageOutcome>> = Object.freeze({
  committed: "saved",
  // A save abandoned for completeness or quota, or voided by a purge or a newer save.
  "commit-failed": "failed",
  purged: "purged",
  "marked-ended": "ended",
  unchanged: "kept",
  // A network error, a body that failed mid-stream, or no complete response in time.
  "no-response": "failed",
  skipped: "skipped",
});

// --- The status route (spec 4.5) ----------------------------------------------------

export const SAVED_COPY_STATUS_PATH = "/api/saved-copy/status";

/** The root-relative status-route URL for a saved copy (preflight ruling D22). */
export function savedCopyStatusUrl(
  copy: Pick<StoredCopy, "showId" | "epoch" | "viewer" | "savedAt">,
): string {
  const query = new URLSearchParams({
    show: copy.showId,
    epoch: String(copy.epoch),
    viewer: copy.viewer,
    saved: copy.savedAt,
  });
  return `${SAVED_COPY_STATUS_PATH}?${query.toString()}`;
}

/**
 * How the worker reads an answer the status route gave. Only a 200 carrying
 * `{"state":"ended"}` or `{"state":"gone"}` is a verdict. Everything else that
 * arrived is the app answering without one (`no-verdict`): the route's own 500,
 * a platform 502 or 503, a 404 from a deployment without the route, a body that
 * is not the route's JSON. A `no-verdict` never wipes a copy and never lets the
 * worker serve one on its own judgement; only no answer at all (`no-answer`,
 * which the caller decides) does that (spec 4.4 step 1, 4.5).
 */
export function statusOutcomeOf(status: number, body: string): Exclude<StatusOutcome, "no-answer"> {
  if (status !== 200) return "no-verdict";
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return "no-verdict";
  }
  if (isRecord(parsed) && (parsed.state === "ended" || parsed.state === "gone"))
    return parsed.state;
  return "no-verdict";
}
