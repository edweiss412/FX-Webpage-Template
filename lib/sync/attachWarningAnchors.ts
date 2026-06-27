import {
  attachSourceCellAnchors,
  extractShowDayTimeAnchors,
  hasCellAnchoredWarning,
} from "@/lib/drive/showDayTimeAnchors";
import { extractCrewRoleAnchors } from "@/lib/drive/crewRoleAnchors";
import { extractSourceAnchors } from "@/lib/drive/sourceAnchors";
import type { ParseWarning } from "@/lib/parser/types";
import type { SourceAnchor } from "@/lib/sheet-links/buildSheetDeepLink";

/**
 * Populate `warnings[*].sourceCell` from the raw workbook, for BOTH ingestion
 * paths (onboarding scan + cron sync). PURE raw-workbook read — NO DB access, NO
 * pg_advisory* call (invariant 2). Best-effort: any failure leaves the warnings
 * link-less and never throws.
 *
 * The cost gate (hasCellAnchoredWarning) runs BEFORE resolveGids, so a
 * warning-free sheet pays no Drive round-trip on either path. `resolveGids` is a
 * lazy thunk: onboarding passes a fetch; cron passes its already-computed
 * titleToGid wrapped in a resolved promise (no extra fetch). Region anchors are
 * self-computed unless the caller supplies them (cron reuses its map).
 */
export async function attachWarningAnchors(
  warnings: ParseWarning[] | undefined,
  bytes: ArrayBuffer | undefined,
  resolveGids: () => Promise<Map<string, number>>,
  regionAnchors?: Record<string, SourceAnchor>,
): Promise<void> {
  if (!bytes || !warnings || !hasCellAnchoredWarning(warnings)) return;
  try {
    const gids = await resolveGids();
    attachSourceCellAnchors(warnings, {
      showDay: extractShowDayTimeAnchors(bytes, gids),
      crewRole: extractCrewRoleAnchors(bytes, gids),
      region: regionAnchors ?? extractSourceAnchors(bytes, gids),
    });
  } catch {
    // deep-link anchors are optional; never break the scan/sync.
  }
}
