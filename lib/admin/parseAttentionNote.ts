// lib/admin/parseAttentionNote.ts
//
// The parse-notice channel (attention-alert-routing §3.2). The two parse codes
// render as banner LINES atop the Parse-warnings panel, not as cards, because the
// copy variant depends on `warnings.length` which only the warnings section knows.
// So they travel as DOMAIN items (NoteItem) and the section composes them. Ported
// from the compiling spike (docs/.../attention-alert-routing-spike/transport.ts),
// which pins the negative-type guarantees the shipped types must also hold
// (tests/admin/spikeParity.test.ts).
import type { AttentionItem, AttentionAlertPayload } from "@/lib/admin/attentionItems";
import { parseFailureReasonTitle } from "@/lib/messages/parseFailureReason";

export type NoteCode = "PARSE_ERROR_LAST_GOOD" | "RESYNC_QUALITY_REGRESSED";
type NotePayload = AttentionAlertPayload & { code: NoteCode };
export type NoteItem = Omit<AttentionItem, "alert"> & { alert: NotePayload };

/** Runtime guard: an item enters the note channel only if it is an alert with one
 *  of the two note codes. Narrowing IS the no-drop invariant — the bucket cannot
 *  carry something `composeParseNote` would discard. */
export function toNoteItem(item: AttentionItem): NoteItem | null {
  const a = item.alert;
  if (!a) return null;
  if (a.code !== "PARSE_ERROR_LAST_GOOD" && a.code !== "RESYNC_QUALITY_REGRESSED") return null;
  return item as NoteItem;
}

// Explicit render-time precedence — NEVER incidental derivation order (§3.2, R2#6).
const NOTE_PRECEDENCE: Record<NoteCode, number> = {
  PARSE_ERROR_LAST_GOOD: 0,
  RESYNC_QUALITY_REGRESSED: 1,
};

export function orderNotes(notes: readonly NoteItem[]): NoteItem[] {
  return [...notes].sort((a, b) => NOTE_PRECEDENCE[a.alert.code] - NOTE_PRECEDENCE[b.alert.code]);
}

/** Total by construction: the exhaustive switch's `never` default makes a third
 *  NoteCode a compile error, so there is no silent-null drop path (R5#1). */
export function composeParseNote(
  item: NoteItem,
  warningCount: number,
): { lead: string; rest: string } {
  const alert = item.alert;
  const hasList = warningCount > 0;

  switch (alert.code) {
    case "PARSE_ERROR_LAST_GOOD": {
      const reason = parseFailureReasonTitle(alert.errorCode);
      const parts = ["Your latest changes didn't go through."];
      if (reason) parts.push(`${reason}.`);
      if (hasList) {
        parts.push(
          "Anything listed below is from the version crew can see, not from the change that failed.",
        );
      }
      return { lead: "Crew are still seeing the last good version.", rest: parts.join(" ") };
    }
    case "RESYNC_QUALITY_REGRESSED": {
      return {
        lead: "This version is live for crew.",
        rest: hasList
          ? "The latest changes lost some detail, and the problems below are what stopped reading."
          : "The latest changes lost some detail.",
      };
    }
    default: {
      const exhaustive: never = alert.code;
      return exhaustive;
    }
  }
}
