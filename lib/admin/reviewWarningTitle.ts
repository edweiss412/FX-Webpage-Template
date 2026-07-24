import { isMessageCode, messageFor } from "@/lib/messages/lookup";
import type { MessageCode } from "@/lib/messages/catalog";
import type { ParseWarning } from "@/lib/parser/types";

/**
 * Human title for a review warning, safe for the no-raw-error-codes contract
 * (invariant 5): catalog title first, then the warning's own `message` ONLY
 * when it is neither code-containing nor code-shaped, else the generic fallback.
 * It can never return a raw code.
 *
 * Moved here from `components/admin/wizard/step3ReviewSections.tsx` (warning-trim
 * un-defer spec §2.4) so `NoteWarningCard` can reuse it without the otherwise
 * circular import step3ReviewSections → NoteWarningCard → step3ReviewSections.
 * `step3ReviewSections` re-exports it for its existing test consumers.
 *
 * Rationale: persisted warnings exist whose `message` IS the raw code
 * (`reelWarning`, lib/sync/phase2.ts — e.g. OPENING_REEL_UNREADABLE); the
 * per-show page already pins the no-raw-code rule. A cataloged code with a
 * NULL title (some §12.4 rows are title-less) falls through to the same
 * message guards rather than rendering an empty title.
 */
export function reviewWarningTitle(w: ParseWarning): string {
  if (isMessageCode(w.code)) {
    const title = messageFor(w.code as MessageCode).title;
    if (title) return title;
  }
  const msg = (w.message ?? "").trim();
  if (
    msg.length > 0 &&
    !msg.toLowerCase().includes(w.code.toLowerCase()) &&
    !/^[A-Z0-9_]{2,}$/.test(msg)
  ) {
    return msg;
  }
  return "A parse issue was recorded for this sheet.";
}
