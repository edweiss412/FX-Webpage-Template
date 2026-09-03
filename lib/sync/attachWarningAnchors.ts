import {
  attachSourceCellAnchors,
  extractShowDayTimeAnchors,
  hasCellAnchoredWarning,
} from "@/lib/drive/showDayTimeAnchors";
import { extractCrewRoleAnchors } from "@/lib/drive/crewRoleAnchors";
import { extractUnknownFieldAnchors } from "@/lib/drive/unknownFieldAnchors";
import { extractSourceAnchors } from "@/lib/drive/sourceAnchors";
import {
  extractWaveCodeSites,
  hiddenTabRefSuppressions,
  pairAllWaveCodes,
  type SynthOpts,
  type WaveCodeSite,
} from "@/lib/drive/waveCodeAnchors";
import { log } from "@/lib/log";
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
 *
 * The `wave` family is a REPLAY rather than a scan: it re-runs the three wave-code
 * detectors over the exporter's own blocks and pairs the i-th warning of a code with the
 * i-th hit (spec 2026-08-29 §2). It must therefore walk the block list the parsed markdown
 * came from, which is why `synthOpts` is forwarded: both production callers pass the
 * `includePullSheetFromTab` they parsed with. A missing forward changes the hit count and
 * REFUSES (a link-less row), never mis-pairs.
 *
 * ONE REMOVAL, after the anchors are placed: a `REF_ERROR_LITERAL` that the replay names as
 * the artifact of a DEAD lookup tab, hidden and holding nothing but `#REF!`
 * (`hiddenTabRefSuppressions`), is spliced out of the caller's array in place, so both
 * ingestion paths persist without it. The order matters:
 * the pairing is positional over the whole warnings array, so removing first would shift
 * every later `#REF!` off its hit and refuse the code. Visibility comes from the bytes, so a
 * failed or empty gid map still suppresses; only a refused replay (count mismatch) keeps
 * every warning, which is the same failure direction the anchors take.
 */
export async function attachWarningAnchors(
  warnings: ParseWarning[] | undefined,
  bytes: ArrayBuffer | undefined,
  resolveGids: () => Promise<Map<string, number>>,
  regionAnchors?: Record<string, SourceAnchor>,
  synthOpts?: SynthOpts,
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
  const waveSites = safe(() => extractWaveCodeSites(bytes, gids, synthOpts), [] as WaveCodeSite[]);
  attachSourceCellAnchors(warnings, {
    showDay: safe(() => extractShowDayTimeAnchors(bytes, gids), []),
    crewRole: safe(() => extractCrewRoleAnchors(bytes, gids), []),
    unknownField: safe(() => extractUnknownFieldAnchors(bytes, gids), []),
    wave: safe(() => pairAllWaveCodes(warnings, waveSites), {}),
    region: regionAnchors ?? safe(() => extractSourceAnchors(bytes, gids), {}),
  });
  const drop = safe(() => hiddenTabRefSuppressions(warnings, waveSites), [] as boolean[]);
  let suppressed = 0;
  for (let i = drop.length - 1; i >= 0; i--) {
    if (!drop[i]) continue;
    warnings.splice(i, 1);
    suppressed += 1;
  }
  if (suppressed > 0) {
    void log.info("hidden-tab #REF! warnings suppressed", {
      source: "attachWarningAnchors",
      suppressed,
    });
  }
}
