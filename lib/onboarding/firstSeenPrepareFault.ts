import { WorkbookSynthesisError } from "@/lib/drive/exportSheetToMarkdown";

/**
 * Which §12.4 code a live first-seen retry should report for a prepare fault
 * (spec 2026-07-24-test-safety-hardening-batch §4.3).
 *
 * The export helper `fetchSheetMarkdownAndBytesAtRevision` synthesizes the workbook
 * internally (`lib/drive/fetch.ts:511-514`), so a corrupt xlsx throws INSIDE what
 * looks like a Drive call, after Drive itself succeeded. Classifying by call site
 * therefore told Doug we could not fetch his sheet and to check his share settings,
 * when the file had arrived intact and simply could not be read.
 *
 * Lives outside the route module because a Next.js route file may only export its
 * handlers and segment config.
 */
export function firstSeenPrepareCodeFor(
  cause: unknown,
): "DRIVE_FETCH_FAILED" | "STAGED_PARSE_FAILED" {
  return cause instanceof WorkbookSynthesisError ? "STAGED_PARSE_FAILED" : "DRIVE_FETCH_FAILED";
}
