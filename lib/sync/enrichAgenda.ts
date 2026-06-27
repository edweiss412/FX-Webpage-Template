/**
 * lib/sync/enrichAgenda.ts (agenda Phase B, Task 10)
 *
 * Best-effort sync step that surfaces each show's agenda PDF schedule. Runs inside
 * the shared `enrichWithDrivePins` so all four sync paths inherit it (spec §4.5.4).
 * It NEVER throws out of the scan — the whole body is wrapped in try/catch; a Drive
 * fault leaves the links as-is and retries next sync (mirrors PR #134's anchor
 * attach).
 *
 * Flow (spec §4.5.1–§4.5.4):
 *  1. fileId recovery — document-order ORDINAL 1:1 correlation between the full
 *     ordered `agenda_links` list and the full ordered `getAgendaChips` row list.
 *     Counts AND per-position labels must align exactly; any divergence binds
 *     nothing and emits AGENDA_PDF_UNREADABLE once for the fileId-less entries
 *     (url-form entries keep their parser-supplied fileId). `getAgendaChips` is
 *     gated — fired only when ≥1 entry lacks a fileId. An `infra_error` from it
 *     leaves the links unenriched and retries next sync (NOT a count-mismatch).
 *  2. metadata gate + cache — `getFile(fileId)` supplies the PDF-type gate and the
 *     `headRevisionId` cache key; re-extraction is skipped iff the stored
 *     `sourceRevision` AND `extractorVersion` both match.
 *  3. download + extract — `downloadFileBytes` (bytes → extract; unavailable →
 *     AGENDA_PDF_UNREADABLE; infra_error → preserve prior `extracted`, no note).
 *  4. data-quality codes — 0 sessions → AGENDA_PDF_UNREADABLE; else low confidence
 *     → AGENDA_SCHEDULE_LOW_CONFIDENCE and any corrections → AGENDA_SCHEDULE_TIME_ADJUSTED.
 *
 * Invariant 9: every Drive/Sheets outcome is a discriminated union; an infra fault
 * is never collapsed into "no agenda".
 */
import type { ParseResult, ParseWarning } from "@/lib/parser/types";
import type { DriveClient } from "@/lib/sync/enrichWithDrivePins";
import { extractAgendaSchedule } from "@/lib/agenda/extractAgendaSchedule";
import { EXTRACTOR_VERSION } from "@/lib/agenda/constants";

function warn(code: string, message: string): ParseWarning {
  return { severity: "warn", code, message };
}

/** Tolerant per-position label sanity check (trim + case-insensitive) — catches a
 *  genuine reorder/extra/missing row without false-flagging whitespace/case noise. */
function labelsAlign(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

export async function enrichAgenda(
  result: ParseResult,
  driveClient: DriveClient,
  spreadsheetId: string,
): Promise<void> {
  // Required-ness is enforced at runtime (the methods are optional on the
  // interface so existing impls compile). Mirrors the listSpreadsheetSheets guard.
  if (!driveClient.getAgendaChips || !driveClient.downloadFileBytes) return;

  const warnings = result.warnings;
  const links = result.show.agenda_links;

  try {
    // ── 1. fileId recovery via ordinal chip correlation ───────────────────────
    const needsChips = links.some((link) => !link.fileId);
    if (needsChips) {
      const chips = await driveClient.getAgendaChips(spreadsheetId);
      if (chips.kind === "infra_error") {
        // Couldn't read the sheet — leave links unenriched and retry next sync.
        // NOT a count-mismatch, NOT AGENDA_PDF_UNREADABLE (invariant 9).
        return;
      }
      const rows = chips.rows;
      const aligned =
        rows.length === links.length &&
        links.every((link, i) => labelsAlign(link.label, rows[i]!.label));
      if (aligned) {
        links.forEach((link, i) => {
          const chipFileId = rows[i]!.chipFileId;
          if (!link.fileId && chipFileId) link.fileId = chipFileId;
        });
      } else {
        // Untrustworthy mapping → bind nothing; one note for the chip entries.
        warnings.push(
          warn(
            "AGENDA_PDF_UNREADABLE",
            "Agenda links on the INFO tab didn't line up 1:1 with their smart-chip rows, so the linked agenda PDFs couldn't be resolved.",
          ),
        );
      }
    }

    // ── 2-4. per-entry metadata gate, cache, download, extract, codes ──────────
    for (const link of links) {
      if (!link.fileId) continue;

      const fileMeta = await driveClient.getFile(link.fileId);
      const trashed = (fileMeta as { trashed?: boolean }).trashed === true;
      if (fileMeta.mimeType !== "application/pdf" || trashed) {
        warnings.push(
          warn(
            "AGENDA_PDF_UNREADABLE",
            `Agenda link "${link.label}" doesn't point at a readable PDF, so crew see the embed only.`,
          ),
        );
        continue;
      }

      const cached =
        link.extracted?.sourceRevision === fileMeta.headRevisionId &&
        link.extracted?.extractorVersion === EXTRACTOR_VERSION;
      if (cached) continue;

      const download = await driveClient.downloadFileBytes(link.fileId);
      if (download.kind === "infra_error") {
        // Transient — keep any prior extracted, no note, retry next sync.
        continue;
      }
      if (download.kind === "unavailable") {
        warnings.push(
          warn(
            "AGENDA_PDF_UNREADABLE",
            `Agenda PDF for "${link.label}" couldn't be downloaded, so crew see the embed only.`,
          ),
        );
        continue;
      }

      const extraction = await extractAgendaSchedule(download.bytes);
      link.extracted = {
        ...extraction,
        sourceRevision: fileMeta.headRevisionId,
        extractorVersion: EXTRACTOR_VERSION,
      };

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
    }
  } catch {
    // Best-effort: never break the scan. A getFile/extract throw leaves the link
    // as-is; prior `extracted` payloads are preserved (we mutate after the reads).
  }
}
