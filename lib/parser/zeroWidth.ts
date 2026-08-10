/**
 * The ONE shared zero-width strip every payload boundary imports (spec
 * 2026-08-09-m-wave-2-design §2.2). Character class: ZWSP U+200B - ZWJ U+200D,
 * plus BOM U+FEFF.
 *
 * This module is the single production definition site of that class — the
 * parser entry (`lib/parser/index.ts`), the cell boundary (`blocks/_helpers.ts`
 * `clean()`), the hotel cell normalizer (`blocks/hotelConfTokens.ts`), and the
 * Drive-string payload boundaries (`lib/sync/enrichWithDrivePins.ts`,
 * `lib/drive/exportSheetToMarkdown.ts`) all import it, so the boundaries can
 * never drift on what "invisible" means. `tests/parser/payloadZeroWidthEnriched.test.ts`
 * pins the uniqueness structurally. The regex stays module-private (a shared
 * global-flagged RegExp carries `lastIndex` state across callers).
 */
export const stripZeroWidth = (s: string): string => s.replace(/[\u200B-\u200D\uFEFF]/g, "");
