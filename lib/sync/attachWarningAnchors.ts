import {
  attachSourceCellAnchors,
  extractShowDayTimeAnchors,
  hasCellAnchoredWarning,
} from "@/lib/drive/showDayTimeAnchors";
import { extractCrewRoleAnchors } from "@/lib/drive/crewRoleAnchors";
import { extractUnknownFieldAnchors } from "@/lib/drive/unknownFieldAnchors";
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
  let gids: Map<string, number>;
  try {
    gids = await resolveGids();
  } catch {
    return; // can't resolve gids → no anchors (link-less); never throws.
  }
  // Degrade PER anchor family — one extractor throwing on a workbook edge case
  // must NOT drop the OTHER families' valid anchors (whole-diff R1 [high]). A
  // bad crew-role scan should never remove a valid schedule-time or region link.
  const safe = <T>(fn: () => T, fallback: T): T => {
    try {
      return fn();
    } catch {
      return fallback;
    }
  };
  attachSourceCellAnchors(warnings, {
    showDay: safe(() => extractShowDayTimeAnchors(bytes, gids), []),
    crewRole: safe(() => extractCrewRoleAnchors(bytes, gids), []),
    unknownField: safe(() => extractUnknownFieldAnchors(bytes, gids), []),
    region: regionAnchors ?? safe(() => extractSourceAnchors(bytes, gids), {}),
  });
}
