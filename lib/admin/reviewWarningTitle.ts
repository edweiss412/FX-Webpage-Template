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

/**
 * Title for a summary row that stands for `count` notices sharing one title.
 * One notice (or a count that is not a whole number of at least 2) reads exactly
 * as `reviewWarningTitle`. Otherwise the catalog's `titlePlural` names the count
 * in the code's own words ("3 rows we couldn't match"), and a code without one
 * gets the counted form "3 notices: <title>". The plural is read only when the
 * singular title also came from the catalog, so a message-derived title never
 * pairs with another code's plural. Never returns a raw code.
 */
export function reviewWarningGroupTitle(w: ParseWarning, count: number): string {
  const title = reviewWarningTitle(w);
  if (!Number.isInteger(count) || count < 2) return title;
  if (isMessageCode(w.code)) {
    const entry = messageFor(w.code as MessageCode);
    if (entry.title && entry.titlePlural) {
      return entry.titlePlural.replace("{count}", String(count));
    }
  }
  return `${count} notices: ${title}`;
}

/** One summary row: the notices that share a title, in input order. */
export type ReviewWarningGroup<T extends { warning: ParseWarning }> = {
  /** `reviewWarningGroupTitle` for the first member and the group size. */
  title: string;
  /** Never empty. */
  members: readonly T[];
};

/**
 * Collapses notices whose rows would read identically into one group per title,
 * ordered by each title's first appearance. The key is the rendered title, not
 * the code: two codes that render one title are, to the reader, the same row.
 */
export function groupWarningsByTitle<T extends { warning: ParseWarning }>(
  entries: readonly T[],
): ReviewWarningGroup<T>[] {
  const byTitle = new Map<string, T[]>();
  for (const entry of entries) {
    const key = reviewWarningTitle(entry.warning);
    const members = byTitle.get(key);
    if (members) members.push(entry);
    else byTitle.set(key, [entry]);
  }
  return [...byTitle.values()].map((members) => ({
    title: reviewWarningGroupTitle(members[0]!.warning, members.length),
    members,
  }));
}
