import type { ParseResult } from "@/lib/parser/types";

/**
 * The show title for a per-row blocker label, or null when none is derivable.
 *
 * Runs on the FAILURE path, where a row may carry a corrupt / legacy / double-
 * encoded `parse_result` jsonb — so it accepts `unknown` and NEVER throws: it
 * decodes a JSON-string shape (asParseResult, lib/db/coerceJsonbObject.ts:133,
 * decodes the same legacy double-encoding) and otherwise degrades to null.
 * Empty / whitespace titles collapse to null so they never reach the wire.
 */
export function parsedShowTitle(pr: ParseResult | unknown): string | null {
  let obj: unknown = pr;
  if (typeof obj === "string") {
    try {
      obj = JSON.parse(obj);
    } catch {
      return null;
    }
  }
  const title = (obj as { show?: { title?: unknown } } | null | undefined)?.show?.title;
  return typeof title === "string" && title.trim() !== "" ? title : null;
}
