/**
 * lib/admin/syncRequest.ts — the manual re-sync request + decision contract,
 * extracted from components/admin/ReSyncButton.tsx (admin-dashboard-row-actions
 * Task 4).
 *
 * Two surfaces now fire the same request — the show review modal's Re-sync CTA
 * and the dashboard row's ⋮ menu — and they must agree on every branch,
 * especially the one that is easy to get wrong: `shrink_held` arrives as
 * `ok: true` and is NOT a success. Treating it as one closes the surface while
 * the reduced version is silently discarded, which is precisely the
 * silent-outcome class the design spec's consequence bound forbids. Deciding
 * that once, here, is why this module exists.
 *
 * EXTRACTION, not redesign: every branch below is the behavior
 * `ReSyncButton.post` already shipped, and `tests/components/ReSyncButton.test.tsx`
 * passes unmodified across the move (the plan's extraction fence). The React
 * state, focus and announcement choices stay in each component — they differ
 * between an overlay panel and a menu region.
 */

/** The route's decision, normalized for a caller that renders it. */
export type SyncOutcome =
  /** `ok:true` + a shrink hold: last-good is retained pending an explicit accept. */
  | { kind: "held"; detail: string; heldModifiedTime: string }
  | { kind: "success"; summary: string }
  /** An UPPERCASE §12.4 catalog code — never rendered raw (invariant 5). */
  | { kind: "error"; code: string };

/**
 * Friendly summary of `runManualSyncForShow`'s ProcessOneFileResult shapes
 * (handoff §0 Pin-stop 2 contract). Plain language so Doug never reads the raw
 * enum on success.
 */
export function summarizeSyncResult(result: unknown): string {
  if (!result || typeof result !== "object") return "Sync complete.";
  const outcome = (result as { outcome?: unknown }).outcome;
  switch (outcome) {
    case "applied":
      return "Synced. Changes applied.";
    case "stage":
      return "Synced. A change is waiting for your review on this page.";
    case "skipped":
      return "Synced. Nothing new from Drive.";
    case "asset_recovery":
      return "Synced. Fetching linked files in the background.";
    case "hard_fail":
      return "Synced, but the latest edit couldn't be applied automatically. Review it on this page.";
    case "stale":
      return "Synced. A newer sync already finished; nothing changed.";
    case "revision_race":
      return "Synced, but the sheet changed mid-sync. We'll retry on the next sync.";
    case "source_gone":
      return "Sheet is no longer available in Drive.";
    case "parse_error":
      return "Synced, but part of the sheet couldn't be applied. Review the details on this page.";
    default:
      return "Sync complete.";
  }
}

/**
 * POST `/api/admin/sync/[slug]` and classify the answer.
 *
 * `accept` is set ONLY by the "Apply reduced version" confirm: its presence
 * adds the VERSION-BOUND acceptShrink body, so a stale confirm (the sheet
 * changed since the hold) re-holds instead of clobbering last-good.
 *
 * Never throws: a transport fault is an error outcome carrying
 * `SYNC_INFRA_ERROR`, the same code the route returns for its own infra faults,
 * so every reachable failure has catalog copy.
 */
export async function requestShowSync(
  slug: string,
  accept?: { expectedModifiedTime: string },
): Promise<SyncOutcome> {
  try {
    const res = await fetch(`/api/admin/sync/${encodeURIComponent(slug)}`, {
      method: "POST",
      ...(accept
        ? {
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              acceptShrink: true,
              expectedModifiedTime: accept.expectedModifiedTime,
            }),
          }
        : {}),
    });
    const json = (await res.json()) as { ok: boolean; error?: string; result?: unknown };
    if (json.ok) {
      const result = json.result as
        | { outcome?: string; detail?: string; heldModifiedTime?: string }
        | undefined;
      if (result?.outcome === "shrink_held" && result.detail && result.heldModifiedTime) {
        return {
          kind: "held",
          detail: result.detail,
          heldModifiedTime: result.heldModifiedTime,
        };
      }
      return { kind: "success", summary: summarizeSyncResult(json.result) };
    }
    return {
      kind: "error",
      code: typeof json.error === "string" ? json.error : "SYNC_INFRA_ERROR",
    };
  } catch {
    return { kind: "error", code: "SYNC_INFRA_ERROR" };
  }
}
