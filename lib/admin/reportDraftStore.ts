/**
 * lib/admin/reportDraftStore.ts
 * (spec 2026-08-29-wizard-report-draft-escape.md §2)
 *
 * The wizard report draft's persistence, as pure-ish functions over
 * `sessionStorage`. Extracted from `ReportIssueSection` so the harness can
 * overlay it: the source-mutation runner overlays a target only when a Vitest
 * suite imports it, and module-private helpers inside a 5000-line component
 * file are reachable by neither an import nor a mutant.
 *
 * The extraction is also the honest shape for what these are. Four rounds of
 * cross-model review produced fourteen findings, seven of them one class — a
 * test that reads as a pin while being satisfiable without the behaviour it
 * names — and the arc could not close that class by argument because "could a
 * test be weaker than it reads" is an open axis. A mutation score over a closed
 * operator set is the same claim, decidable. That is why this file exists as a
 * module rather than as five functions in a component.
 *
 * THE INVARIANT THESE FUNCTIONS SHARE:
 *   capDraft(whatever is in the store) === the state it restores into
 * `read` caps on the way out and `clearIfUnchanged` compares through the same
 * cap, so those two agree by construction. `write` does NOT cap on the way in,
 * and does not need to only because every value reaching it comes from a
 * textarea bounded by `maxLength={REPORT_MESSAGE_MAX_CHARS}`. If a later edit
 * drops that attribute, or writes a draft from anywhere else, the invariant
 * breaks silently and a sent report starts coming back as a ghost. Capping here
 * as well would close it by construction; deliberately not done, because no
 * reachable input exercises the difference and a guard no test can distinguish
 * from its absence is worse than a stated limit (spec §7).
 */

/** The textarea's `maxLength`, and the cap re-applied on every read. */
export const REPORT_MESSAGE_MAX_CHARS = 2000;

/** Scoped to wizard session AND drive file, exactly as the attempt key beside
 *  it is, and for the same reason: a later wizard session for the same file is
 *  a DIFFERENT report and must not inherit the earlier session's text. */
export function reportDraftStorageKey(wizardSessionId: string, driveFileId: string): string {
  return `fxav-report-draft-wizard-${wizardSessionId}-${driveFileId}`;
}

/** The cap, applied so it can never split a character in half.
 *
 *  `slice` counts UTF-16 code units, so 1999 ASCII characters followed by an
 *  emoji sliced at 2000 ends in a lone high surrogate: not truncated text but
 *  MALFORMED text, which is a different and worse thing than the truncation §7
 *  documents as a limit. Dropping the orphan is the whole fix; the operator
 *  loses the character they were told they might lose, and never gains a broken
 *  one. */
export function capDraft(value: string): string {
  if (value.length <= REPORT_MESSAGE_MAX_CHARS) return value;
  const cut = value.slice(0, REPORT_MESSAGE_MAX_CHARS);
  const last = cut.charCodeAt(cut.length - 1);
  const isLoneHighSurrogate = last >= 0xd800 && last <= 0xdbff;
  return isLoneHighSurrogate ? cut.slice(0, -1) : cut;
}

/** An unreadable store degrades to the pre-persistence behaviour and never to a
 *  crash. `window.sessionStorage` is read INSIDE the try because the property
 *  accessor itself throws `SecurityError` when site data is blocked. */
export function readStoredDraft(storageKey: string): string {
  try {
    const stored = window.sessionStorage.getItem(storageKey);
    if (stored == null || stored === "") return "";
    return capDraft(stored);
  } catch {
    return ""; // storage unavailable — exactly the pre-repair initial value
  }
}

/** An empty draft REMOVES the key rather than storing `""`, so a cleared field
 *  leaves nothing behind for the next mount to find.
 *
 *  A write can fail AFTER an earlier one succeeded (a mid-session
 *  `QuotaExceededError`), and then the key still holds the older, SHORTER text.
 *  Restored later that reads as a complete draft while silently missing its
 *  tail, which is worse than restoring nothing at all — so drop the key rather
 *  than leave a stale prefix under it. Best-effort inside its own try: on the
 *  store-is-entirely-unavailable path this throws too, and there was never
 *  anything written to strand. */
export function writeStoredDraft(storageKey: string, value: string): void {
  try {
    if (value === "") window.sessionStorage.removeItem(storageKey);
    else window.sessionStorage.setItem(storageKey, value);
  } catch {
    try {
      window.sessionStorage.removeItem(storageKey);
    } catch {
      /* nothing was ever stored, so there is nothing stale to clear */
    }
  }
}

/** Clear the draft ONLY if the store still holds the text this submit sent.
 *
 *  The success branch runs after two suspension points, and a modal unmount
 *  mid-flight is fire-and-forget BY DESIGN — the detached handler keeps running.
 *  Before persistence that cost nothing, because the detached instance's
 *  `setDraft("")` touched only its own dead state. Persisting to a SHARED key
 *  changed that: submit A, close while it is pending, reopen, type B, then let
 *  A's request succeed, and an unconditional clear removes B's stored text.
 *
 *  Compared through `readStoredDraft`, NOT a raw `getItem`, so both sides have
 *  been through the same cap: a raw read fails to match whenever the stored
 *  value was over-length, and the guard would decline to clear a draft that HAD
 *  been sent, returning it as a ghost. */
export function clearStoredDraftIfUnchanged(storageKey: string, expected: string): void {
  try {
    if (readStoredDraft(storageKey) === expected) {
      window.sessionStorage.removeItem(storageKey);
    }
  } catch {
    /* storage unavailable — nothing was persisted, so nothing to clear */
  }
}
