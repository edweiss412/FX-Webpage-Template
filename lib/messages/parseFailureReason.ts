// lib/messages/parseFailureReason.ts
//
// The parse hard-fail reason, resolved for operator display. `Phase1Result.code`
// is typed `string` and can be a ninth value (`PARSE_HARD_FAIL`), so the
// allowlist is the persistence + display gate: unknown/dynamic values resolve to
// null and render no reason (spec 2026-07-20-attention-alert-routing §3.1).
// Resolution goes through `messageFor` (invariant 5), never the raw catalog object.
import { messageFor } from "@/lib/messages/lookup";
import type { MessageCode } from "@/lib/messages/catalog";

/** The 8 invariant codes a parse hard-fail can carry (lib/parser/invariants.ts). */
export const PARSE_FAILURE_ALLOWLIST: ReadonlySet<string> = new Set([
  "MI-1_VERSION_DETECTION_FAILED",
  "MI-2_EMPTY_TITLE",
  "MI-3_NO_VALID_DATES",
  "MI-4_NO_CREW",
  "MI-5_NO_ROOMS",
  "MI-5a_DUPLICATE_CREW_NAME",
  "MI-5b_DUPLICATE_CREW_EMAIL",
  "VERSION_AMBIGUOUS",
]);

// Two producer spellings persist as durable `last_error_code` values but have no
// catalog row of their own; the same invariant is cataloged under a different
// name. Bridge, do not duplicate (spec §3.1).
const ALIAS: Record<string, MessageCode> = {
  "MI-2_EMPTY_TITLE": "MI-2_TITLE_MISSING",
  "MI-3_NO_VALID_DATES": "MI-3_NO_PARSEABLE_DATE",
};

/** Operator-facing title for an allowlisted parse-failure code, else null. */
export function parseFailureReasonTitle(code: string | null | undefined): string | null {
  if (!code || !PARSE_FAILURE_ALLOWLIST.has(code)) return null;
  const catalogCode = (ALIAS[code] ?? code) as MessageCode;
  const title = messageFor(catalogCode).title;
  return title && title.length > 0 ? title : null;
}
