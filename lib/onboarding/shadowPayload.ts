import type { ParseResult, TriggeredReviewItem } from "@/lib/parser/types";
import type { Mi11Item } from "@/lib/sync/holds/writeMi11Holds";
import type { ReviewerChoice } from "@/lib/sync/applyStagedCore";
import { asParseResult, coerceJsonbArray } from "@/lib/db/coerceJsonbObject";
import { parseTriggeredReviewItems } from "@/lib/staging/triggeredReviewItems";

/**
 * F1 Task 1.4 — the single typed, FAIL-CLOSED interpretation boundary for
 * `shows_pending_changes.payload` at Phase D (finalize-cas).
 *
 * Phase B (`stageExistingShowShadow`) deletes the `pending_syncs` row after
 * staging the shadow, so `triggered_review_items` and `base_modified_time`
 * exist ONLY inside this payload by the time Phase D applies it. Coercing a
 * missing/corrupt items key to `[]` would FAIL OPEN: an MI-11 email change
 * would apply with no hold and no revocation floor (spec §3.2 R2-1). And the
 * legacy applyShadow branch CONSUMED a parse_result-less shadow as OK — the
 * damaged shadow disappeared during finalize-cas, leaving stale live data with
 * no retry surface. Both postures are refused here with §12.4-cataloged codes;
 * the caller retains the shadow row for operator recovery.
 *
 * The column is unconstrained jsonb beyond NOT NULL, so top-level JSON null /
 * arrays / scalars are representable — the parser starts with an explicit
 * non-null plain-object guard and NEVER throws while probing fields (one
 * corrupt shadow must produce a per-row refusal, not an uncaught 500 for the
 * whole batch).
 *
 * `parse_result` is decoded (object or legacy double-encoded JSON-string-of-
 * object) AND its FULL ParseResult shape is validated here via `asParseResult`
 * — finalize-cas consumes `parsed.parseResult` directly, so this parser IS the
 * apply boundary for the shadow payload.
 */
export type ShadowPayloadRefusalCode =
  | "STAGED_REVIEW_ITEMS_CORRUPT"
  | "STAGED_PARSE_RESULT_CORRUPT"
  | "STAGED_PARSE_OUTDATED_AT_PHASE_D";

export type ParsedShadowPayloadForApply =
  | {
      ok: true;
      parseResult: ParseResult;
      stagedId: string;
      stagedModifiedTime: string;
      triggeredReviewItems: TriggeredReviewItem[];
      mi11Items: Mi11Item[];
      reviewerChoices: ReviewerChoice[];
      /** ISO string, or null ONLY for an explicit jsonb null (null watermark at staging). */
      baseModifiedTime: string | null;
    }
  | { ok: false; code: ShadowPayloadRefusalCode };

function refuse(code: ShadowPayloadRefusalCode): ParsedShadowPayloadForApply {
  return { ok: false, code };
}

/**
 * jsonb timestamptz values come back as strings (`jsonb_build_object('…', $n::timestamptz)`
 * stores the `+00:00` ISO form); normalize to the project-canonical `Z` ISO string.
 * Returns null for anything unparseable.
 */
function toIsoOrNull(value: unknown): string | null {
  if (typeof value !== "string" && !(value instanceof Date)) return null;
  const ms = value instanceof Date ? value.getTime() : Date.parse(value);
  if (!Number.isFinite(ms)) return null;
  return new Date(ms).toISOString();
}

export function parseShadowPayloadForApply(payload: unknown): ParsedShadowPayloadForApply {
  // Non-null plain-object guard: jsonb permits top-level null / string / number /
  // boolean / array; none of those carries an interpretable apply payload.
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) {
    return refuse("STAGED_PARSE_RESULT_CORRUPT");
  }
  const obj = payload as Record<string, unknown>;

  // parse_result: ABSENT/null → refuse, NEVER consume-and-OK (the legacy
  // silent-success bug). Present → decode object-or-double-encoded-string AND
  // validate the full ParseResult shape; anything else is corrupt.
  if (obj.parse_result === null || obj.parse_result === undefined) {
    return refuse("STAGED_PARSE_RESULT_CORRUPT");
  }
  let parseResult: ParseResult;
  try {
    // asParseResult validates the FULL non-optional ParseResult contract (not just
    // object-shape): an object-shaped-but-invalid payload (`{}`, `{ show: {} }`) must
    // refuse HERE, not pass ok:true and TypeError at finalize-cas's
    // `parsed.parseResult.show.title` deref — which surfaced as a route-level
    // ONBOARDING_FINALIZE_INTERNAL_ERROR hiding the per-row retained-row recovery path.
    // Bare catch (JsonbCoercionError and anything else): this parser NEVER throws.
    parseResult = asParseResult(obj.parse_result);
  } catch {
    return refuse("STAGED_PARSE_RESULT_CORRUPT");
  }

  // staged_id + staged_modified_time: the apply core requires both for the
  // audit row and the holds binding.
  const stagedId = obj.staged_id;
  if (typeof stagedId !== "string" || stagedId.length === 0) {
    return refuse("STAGED_PARSE_RESULT_CORRUPT");
  }
  const stagedModifiedTime = toIsoOrNull(obj.staged_modified_time);
  if (stagedModifiedTime === null) {
    return refuse("STAGED_PARSE_RESULT_CORRUPT");
  }

  // triggered_review_items: key ABSENT → refuse (a legacy/truncated payload must
  // not bypass the identity gate). Present → the single gate-boundary parser;
  // a present-but-null value is its legitimate-empty case.
  if (!("triggered_review_items" in obj)) {
    return refuse("STAGED_REVIEW_ITEMS_CORRUPT");
  }
  const parsedItems = parseTriggeredReviewItems(obj.triggered_review_items);
  if (!parsedItems.ok) {
    return refuse("STAGED_REVIEW_ITEMS_CORRUPT");
  }
  const mi11Items = parsedItems.items.filter(
    (item): item is Mi11Item => item.invariant === "MI-11",
  );

  // base_modified_time: key ABSENT → cannot prove baseline currency → refuse as
  // outdated. An explicit null VALUE is legal (the show had a null watermark at
  // staging); anything else must parse to an instant.
  if (!("base_modified_time" in obj)) {
    return refuse("STAGED_PARSE_OUTDATED_AT_PHASE_D");
  }
  let baseModifiedTime: string | null = null;
  if (obj.base_modified_time !== null && obj.base_modified_time !== undefined) {
    baseModifiedTime = toIsoOrNull(obj.base_modified_time);
    if (baseModifiedTime === null) {
      return refuse("STAGED_PARSE_OUTDATED_AT_PHASE_D");
    }
  }

  // reviewer_choices: absent/null is legitimately empty; a non-array value is a
  // corrupt payload (never re-stored raw into a $::jsonb audit param).
  let reviewerChoices: ReviewerChoice[];
  try {
    reviewerChoices = coerceJsonbArray<ReviewerChoice>(
      obj.reviewer_choices,
      "shadow payload reviewer_choices",
    );
  } catch {
    return refuse("STAGED_PARSE_RESULT_CORRUPT");
  }

  return {
    ok: true,
    parseResult,
    stagedId,
    stagedModifiedTime,
    triggeredReviewItems: parsedItems.items,
    mi11Items,
    reviewerChoices,
    baseModifiedTime,
  };
}
