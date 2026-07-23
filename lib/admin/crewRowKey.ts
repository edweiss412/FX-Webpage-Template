import type { ParseWarning } from "@/lib/parser/types";
import { CREW_SCOPED_WARNING_CODES } from "@/lib/parser/autocorrectCodes";
import { canonicalCrewKey } from "@/lib/admin/attentionItems";
import { stripDayRestrictionParen } from "@/lib/parser/personalization";

/** Canonical crew-row key for under-row warning placement, or null when the
 *  warning carries no usable crew identity (falls back to the section group).
 *  Spec 2026-07-23-crew-warning-attachment §2A.
 *  - The 2 autocorrect codes key off `autocorrect.subject` ONLY (today's
 *    behavior, byte-identical; a blank subject falls back even if a crew
 *    blockRef exists).
 *  - Any OTHER code keys off `blockRef` when kind === "crew" and `name` is a
 *    non-blank string. blockRef.name is the RAW name cell (crew.ts keeps it
 *    raw for deep-link anchoring), while the rendered roster name is the
 *    day-restriction-stripped displayName — so the raw name is passed through
 *    the SAME paren-ONLY strip before keying (spec R3-F1). */
export function crewRowKeyForWarning(w: ParseWarning): string | null {
  if (CREW_SCOPED_WARNING_CODES.has(w.code)) {
    const subject = w.autocorrect?.subject;
    if (typeof subject !== "string") return null;
    const key = canonicalCrewKey(subject);
    return key.length === 0 ? null : key;
  }
  const ref = w.blockRef;
  if (!ref || ref.kind !== "crew" || typeof ref.name !== "string") return null;
  const key = canonicalCrewKey(stripDayRestrictionParen(ref.name));
  return key.length === 0 ? null : key;
}
