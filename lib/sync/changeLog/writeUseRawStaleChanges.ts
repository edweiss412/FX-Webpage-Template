import type { HoldPort } from "@/lib/sync/holds/holdPort";
import { messageFor, plainCatalogText } from "@/lib/messages/lookup";
import type { UseRawDecision } from "@/lib/sync/useRawOverlay";

/**
 * Task 6 — write one `show_change_log` row per INVALIDATED "use the sheet's raw value"
 * decision (spec 2026-07-10-structural-transform-use-raw §7).
 *
 * A decision is invalidated when its pinned raw cell changed on a later sync, so the
 * `(code, contentHash)` match found no current warning: the admin's "use raw" choice no
 * longer applies and the transform is read fresh again. We record a notification-only feed
 * row so Doug sees WHY the value reverted.
 *
 * `summary` is plain descriptive English derived from the §12.4 catalog — it contains NO
 * raw error/invariant code (invariant 5). The literal "USE_RAW_DECISION_STALE" appears here
 * ONLY as the catalog lookup key (the required producer literal for the internal-code-enums
 * scanner) — never in any persisted user-visible field.
 *
 * Runs inside the locked sync txn via the service-role hold port (no nested lock; invariant
 * 2). `occurred_at` uses SQL `now()` — no clock is threaded. `source='auto_apply'`,
 * `change_kind='use_raw_stale'`, `status='applied'`, `created_by='system'`.
 */

/** Human phrase for a decision's target — used for BOTH the summary param and `entity_ref`. */
export function useRawTargetLabel(d: UseRawDecision): string {
  if (d.target.kind === "rooms") {
    return d.target.name ? `the room "${d.target.name}"` : "a room header";
  }
  if (d.target.kind === "hotels") {
    return `hotel reservation ${(d.target.index ?? 0) + 1}`;
  }
  if (d.target.kind === "dates") {
    return "the show dates";
  }
  return "a sheet value";
}

export async function writeUseRawStaleChanges(args: {
  port: HoldPort;
  showId: string;
  driveFileId: string;
  invalidated: UseRawDecision[];
}): Promise<void> {
  for (const decision of args.invalidated) {
    const label = useRawTargetLabel(decision);
    const summary = plainCatalogText(messageFor("USE_RAW_DECISION_STALE").dougFacing ?? "", {
      target: label,
    });
    // not-subject-to-meta: service-role SQL inside the JS-held show lock (no {data,error} client).
    await args.port.unsafe(
      `
        insert into public.show_change_log
          (show_id, drive_file_id, occurred_at, source, change_kind, entity_ref, summary,
           before_image, after_image, status, created_by)
        values ($1, $2, now(), 'auto_apply', 'use_raw_stale', $3, $4, null, null, 'applied', 'system')
      `,
      [args.showId, args.driveFileId, label, summary],
    );
  }
}
