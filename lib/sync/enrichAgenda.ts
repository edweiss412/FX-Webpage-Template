/**
 * lib/sync/enrichAgenda.ts (agenda Phase B, Task 10 → Task 6 verdict layer)
 *
 * Best-effort sync step that surfaces each show's agenda PDF schedule. Runs inside
 * the shared `enrichWithDrivePins` so all four sync paths inherit it (spec §4.5.4).
 * It NEVER throws out of the scan — the whole body is wrapped in try/catch; a Drive
 * fault leaves the links as-is and retries next sync (mirrors PR #134's anchor
 * attach).
 *
 * Flow (spec §4.5.1–§4.5.4 + Task-6 verdict layer):
 *  1. fileId recovery — capped at AGENDA_MAX_PDFS_PER_SHEET: per-ordinal label-matched
 *     correlation between the first N agenda links and the INFO-tab chip rows. A
 *     mismatch at ordinal i silently skips that ordinal (no wrong bind, no warning).
 *     `getAgendaChips` is called at most ONCE (sheet-level); rows.length > N is allowed.
 *     An `infra_error` from it leaves the links unenriched and retries next sync.
 *  2. metadata gate + cache — `getFile(fileId)` supplies the PDF-type gate and the
 *     `headRevisionId` cache key. CACHE HIT: stored sourceRevision === currentRev AND
 *     stored extractorVersion === EXTRACTOR_VERSION → "fresh" with the stored extraction
 *     (no download). A missing/empty revision is NOT cacheable.
 *  3. download + extract + re-getFile stability fence — after extraction, `getFile` is
 *     called again for rev_after. "fresh" iff rev_before === rev_after (stable).
 *  4. per-link verdict — discriminated PerLinkVerdict riding the EnrichAgendaReport:
 *       "fresh"       — extraction payload valid and stable; emitted for cache hits too.
 *       "known_stale" — rev readable but extraction not fresh (version/revision mismatch,
 *                       download failure, or revision changed during extract).
 *       "unknown"     — getFile threw (infra_error); leave-existing safe.
 *  5. data-quality codes — emitted ONLY for fresh (stable) extractions.
 *
 * Additive only: existing scan/cron callers ignore the return value; link.extracted is
 * still mutated on "fresh" for backward compat. Cap and per-ordinal recovery replace
 * the old strict-alignment check without breaking url-form link behaviour.
 *
 * Invariant 9: every Drive/Sheets outcome is a discriminated union; an infra fault
 * is never collapsed into "no agenda".
 */
import type { ParseResult, ParseWarning } from "@/lib/parser/types";
import type { DriveClient } from "@/lib/sync/enrichWithDrivePins";
import type { AgendaExtraction } from "@/lib/agenda/types";
import { extractAgendaSchedule } from "@/lib/agenda/extractAgendaSchedule";
import { EXTRACTOR_VERSION, AGENDA_MAX_PDFS_PER_SHEET } from "@/lib/agenda/constants";

function warn(code: string, message: string): ParseWarning {
  return { severity: "warn", code, message };
}

/** Tolerant per-position label sanity check (trim + case-insensitive) — catches a
 *  genuine reorder/extra/missing row without false-flagging whitespace/case noise. */
function labelsAlign(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase(); // canonicalize-exempt: AGENDA LINK label match, not an email (invariant 3 N/A)
}

/**
 * Per-link freshness verdict after the before/after revision stability fence.
 * The `extraction` payload rides ONLY on "fresh" (spec §5.2 / §5.7).
 * A later endpoint persists ONLY from `verdict:"fresh"` entries — never from the
 * mutated `link.extracted` (which is the tx#1b read snapshot, preserved on refresh
 * failure for backward compat with existing cron/scan callers).
 */
export type PerLinkVerdict =
  | { ordinal: number; recoveredFileId?: string; verdict: "fresh"; extraction: AgendaExtraction }
  | { ordinal: number; recoveredFileId?: string; verdict: "known_stale" }
  | { ordinal: number; recoveredFileId?: string; verdict: "unknown" };

/** Report returned by enrichAgenda. Existing callers (cron/scan) safely ignore it. */
export type EnrichAgendaReport = { perLink: PerLinkVerdict[] };

export async function enrichAgenda(
  result: ParseResult,
  driveClient: DriveClient,
  spreadsheetId: string,
  opts?: { signal?: AbortSignal },
): Promise<EnrichAgendaReport> {
  // Methods are optional on the interface so existing impls compile; required-
  // ness is enforced at runtime (mirrors the listSpreadsheetSheets guard) and by
  // the Task-11 DriveClient-impl meta-test. `downloadFileBytes` is REQUIRED —
  // without bytes there is nothing to extract. `getAgendaChips` is needed ONLY to
  // recover a missing chip fileId (Codex whole-diff R1 #3).
  const downloadFileBytes = driveClient.downloadFileBytes;
  if (!downloadFileBytes) return { perLink: [] };
  const getAgendaChips = driveClient.getAgendaChips;

  const signal = opts?.signal;
  if (signal?.aborted) return { perLink: [] };

  const warnings = result.warnings;
  const links = result.show.agenda_links;
  const perLink: PerLinkVerdict[] = [];

  // cap: process at most AGENDA_MAX_PDFS_PER_SHEET links (spec §5.5).
  // Links at ordinal >= cap are skipped: no download, no fileId recovery.
  const cap = Math.min(links.length, AGENDA_MAX_PDFS_PER_SHEET);

  // Track fileIds recovered via chip correlation (for the recoveredFileId verdict field).
  const recoveredFileIds = new Map<number, string>();

  try {
    // ── 1. fileId recovery via capped ordinal + label chip correlation ─────────
    // rows.length > cap is explicitly allowed (spec §5.5): don't require strict count
    // alignment — that would break when an N+1-link sheet is capped at N.
    const needsChips = links.slice(0, cap).some((link) => !link.fileId);
    if (needsChips && getAgendaChips) {
      const chips = await getAgendaChips(
        spreadsheetId,
        signal !== undefined ? { signal } : undefined,
      );
      if (chips.kind === "infra_error") {
        // Couldn't read the sheet — leave links unenriched and retry next sync.
        // NOT a count-mismatch, NOT AGENDA_PDF_UNREADABLE (invariant 9).
        return { perLink: [] };
      }
      const rows = chips.rows;
      for (let i = 0; i < cap; i++) {
        const link = links[i]!;
        const row = rows[i];
        // Per-ordinal label-matched recovery: mismatch at i → silently skip
        // (never a wrong bind, no warning — this is safe by construction).
        if (!link.fileId && row && row.chipFileId && labelsAlign(link.label, row.label)) {
          link.fileId = row.chipFileId;
          recoveredFileIds.set(i, row.chipFileId);
        }
      }
    }

    // ── 2–4. per-link: getFile gate, cache, download+extract, stability fence ──
    for (let i = 0; i < cap; i++) {
      if (signal?.aborted) break;

      const link = links[i]!;
      if (!link.fileId) continue;

      const recoveredFileId = recoveredFileIds.get(i);

      // getFile for current rev — an infra fault (throw) means the revision is
      // not readable: leave-existing is safe → "unknown".
      let fileMeta: Awaited<ReturnType<typeof driveClient.getFile>>;
      try {
        fileMeta = await driveClient.getFile(link.fileId);
      } catch {
        perLink.push({
          ordinal: i,
          ...(recoveredFileId !== undefined ? { recoveredFileId } : {}),
          verdict: "unknown",
        });
        continue;
      }

      const trashed = (fileMeta as { trashed?: boolean }).trashed === true;
      if (fileMeta.mimeType !== "application/pdf" || trashed) {
        warnings.push(
          warn(
            "AGENDA_PDF_UNREADABLE",
            `Agenda link "${link.label}" doesn't point at a readable PDF, so crew see the embed only.`,
          ),
        );
        // Rev was readable but content is non-extractable → "known_stale".
        perLink.push({
          ordinal: i,
          ...(recoveredFileId !== undefined ? { recoveredFileId } : {}),
          verdict: "known_stale",
        });
        continue;
      }

      const currentRev = fileMeta.headRevisionId;

      // CACHE HIT: stored extraction is current on BOTH axes (revision AND version).
      // A missing/empty revision is NOT cacheable (Codex whole-diff R1 #1): otherwise
      // an undefined revision would match a stored-undefined sourceRevision and a
      // changed PDF would never re-extract. Missing revision → re-extract (deterministic).
      const cached =
        typeof currentRev === "string" &&
        currentRev.length > 0 &&
        link.extracted?.sourceRevision === currentRev &&
        link.extracted?.extractorVersion === EXTRACTOR_VERSION;
      if (cached) {
        // Emit "fresh" with the STORED extraction — no download, no getAgendaChips.
        perLink.push({
          ordinal: i,
          ...(recoveredFileId !== undefined ? { recoveredFileId } : {}),
          verdict: "fresh",
          extraction: link.extracted!,
        });
        continue;
      }

      // Download
      const download = await downloadFileBytes(
        link.fileId,
        signal !== undefined ? { signal } : undefined,
      );
      if (download.kind === "infra_error") {
        // Transient — keep any prior extracted, no note, retry next sync.
        // Rev was readable but download failed → "known_stale".
        perLink.push({
          ordinal: i,
          ...(recoveredFileId !== undefined ? { recoveredFileId } : {}),
          verdict: "known_stale",
        });
        continue;
      }
      if (download.kind === "unavailable") {
        warnings.push(
          warn(
            "AGENDA_PDF_UNREADABLE",
            `Agenda PDF for "${link.label}" couldn't be downloaded, so crew see the embed only.`,
          ),
        );
        perLink.push({
          ordinal: i,
          ...(recoveredFileId !== undefined ? { recoveredFileId } : {}),
          verdict: "known_stale",
        });
        continue;
      }

      // Extract + build the payload (sourceRevision stamped here, not by the extractor).
      const extraction = await extractAgendaSchedule(download.bytes);
      const payload: AgendaExtraction = {
        ...extraction,
        ...(typeof currentRev === "string" && currentRev.length > 0
          ? { sourceRevision: currentRev }
          : {}),
        extractorVersion: EXTRACTOR_VERSION,
      };

      // Re-getFile stability fence: "fresh" iff rev_before === rev_after (PDF unchanged
      // during download+extract). A throw here → rev_after undefined → not fresh.
      let revAfter: string | undefined;
      try {
        const afterMeta = await driveClient.getFile(link.fileId);
        revAfter = afterMeta.headRevisionId;
      } catch {
        revAfter = undefined;
      }

      const revStable =
        typeof currentRev === "string" &&
        currentRev.length > 0 &&
        payload.extractorVersion === EXTRACTOR_VERSION &&
        typeof payload.sourceRevision === "string" &&
        revAfter === payload.sourceRevision;

      if (revStable) {
        // Mutate link.extracted for backward compat: cron/scan callers read it.
        link.extracted = payload;
        perLink.push({
          ordinal: i,
          ...(recoveredFileId !== undefined ? { recoveredFileId } : {}),
          verdict: "fresh",
          extraction: payload,
        });

        // Data-quality codes — emitted ONLY for fresh (stable) extractions.
        const sessionCount = extraction.days.reduce((total, day) => total + day.sessions.length, 0);
        if (sessionCount === 0) {
          warnings.push(
            warn(
              "AGENDA_PDF_UNREADABLE",
              `Agenda PDF for "${link.label}" produced no readable sessions, so crew see the embed only.`,
            ),
          );
        } else {
          if (extraction.confidence === "low") {
            warnings.push(
              warn(
                "AGENDA_SCHEDULE_LOW_CONFIDENCE",
                `Agenda PDF for "${link.label}" was gated to embed-only (low extraction confidence).`,
              ),
            );
          }
          if (extraction.corrections > 0) {
            warnings.push(
              warn(
                "AGENDA_SCHEDULE_TIME_ADJUSTED",
                `Adjusted ${extraction.corrections} session time(s) while reading the agenda PDF for "${link.label}".`,
              ),
            );
          }
        }
      } else {
        // Revision changed during download → extraction is from a transient state.
        perLink.push({
          ordinal: i,
          ...(recoveredFileId !== undefined ? { recoveredFileId } : {}),
          verdict: "known_stale",
        });
      }
    }
  } catch {
    // Best-effort: never break the scan. A getFile/extract throw leaves the link
    // as-is; prior `extracted` payloads are preserved (we mutate after the reads).
  }

  return { perLink };
}
