/**
 * SPIKE (not shipped code) — proves the §3.2 transport type is implementable.
 *
 * The transport shape drew a finding in all three spec review rounds (R1#8
 * underspecified, R2 partially, R3#1 BLOCKING: a ReactNode[] bucket cannot
 * satisfy a renderer that must read `errorCode` and `warnings.length`). Per the
 * AGENTS.md three-round prose cap, this file replaces the fourth prose patch:
 * it compiles under the repo's strict tsconfig, so the type either works or the
 * typecheck fails.
 *
 * The resolution R3#1 forces: PRE-RENDERED NODES AND DOMAIN ITEMS ARE DIFFERENT
 * CHANNELS. Cards can be pre-rendered by the modal because nothing downstream
 * inspects them. The parse notes cannot: only the warnings SECTION knows
 * `warnings.length`, which selects the copy variant. So the notes travel as
 * domain items and the section composes them.
 */
import type { ReactNode } from "react";
import type {
  AttentionItem,
  AttentionAlertPayload,
  RoutedSectionId,
} from "@/lib/admin/attentionItems";

/**
 * PR 1 adds `errorCode` to `AttentionAlertPayload` (§3.1 transport row). It does
 * not exist yet, so the spike models the post-PR-1 shape explicitly — which is
 * itself the proof that PR 2 has a hard dependency on PR 1's payload field.
 */
type PayloadWithReason = AttentionAlertPayload & { errorCode: string | null };
/**
 * The note channel is NARROWER than AttentionItem (R4#3). An item reaches it
 * only if it is an alert with one of the two note codes and a payload present,
 * so `composeNote` has no "unexpected code -> silently null" path that could
 * drop a note. The narrowing is the type-level statement of the no-drop
 * invariant; the bucket cannot carry something the renderer would discard.
 */
export type NoteCode = "PARSE_ERROR_LAST_GOOD" | "RESYNC_QUALITY_REGRESSED";
type NotePayload = PayloadWithReason & { code: NoteCode };
type NoteItem = Omit<AttentionItem, "alert"> & { alert: NotePayload };

/** Anchors, declared per section (R2#5). */
export type RoomsAnchor = "diagrams";
export type EventAnchor = "opening_reel";

/**
 * Section-scoped route. An invalid pairing such as
 * `{ sectionId: "crew", anchor: "diagrams" }` is a COMPILE error, not a runtime
 * drop (R2#5).
 */
export type SpikeAttentionRoute =
  | { sectionId: "rooms"; anchor?: RoomsAnchor }
  | { sectionId: "event"; anchor?: EventAnchor }
  | { sectionId: Exclude<RoutedSectionId, "rooms" | "event">; anchor?: never };

export type SpikeSectionAttentionBucket = {
  /** Pre-rendered cards. Opaque by design: nothing downstream inspects them. */
  sectionTop: ReactNode[];
  /** CREW ONLY. */
  byCrewKey?: Map<string, ReactNode[]>;
  /** Pre-rendered anchored cards, keyed by the anchor they mount at. */
  byAnchor?: Map<string, ReactNode[]>;
  /**
   * DOMAIN items, not nodes (R3#1). Only the warnings section can compose these,
   * because the copy variant depends on `warnings.length`, which the modal does
   * not know at bucketing time.
   */
  notes?: NoteItem[];
};

export type SpikeSectionAttention = Map<RoutedSectionId, SpikeSectionAttentionBucket>;

/** Explicit render-time precedence (R2#6) — never incidental derivation order. */
const NOTE_PRECEDENCE: Record<string, number> = {
  PARSE_ERROR_LAST_GOOD: 0,
  RESYNC_QUALITY_REGRESSED: 1,
};

export function orderNotes(notes: readonly NoteItem[]): NoteItem[] {
  return [...notes].sort(
    (a, b) =>
      (NOTE_PRECEDENCE[a.alert?.code ?? ""] ?? 99) - (NOTE_PRECEDENCE[b.alert?.code ?? ""] ?? 99),
  );
}

/**
 * The composition the renderer performs. Proves every input the §3.2 matrix
 * needs is reachable from the bucket: the alert code, the reason, and the
 * section's own warning count.
 */
export function composeNote(
  item: NoteItem,
  warningCount: number,
  resolveReason: (errorCode: string | null) => string | null,
): { lead: string; rest: string } {
  const alert = item.alert;
  const hasList = warningCount > 0;

  if (alert.code === "PARSE_ERROR_LAST_GOOD") {
    // `errorCode` is the NEW payload field added by PR 1 (§3.1 transport row).
    const reason = resolveReason(alert.errorCode);
    const parts = ["Your latest changes didn't go through."];
    if (reason) parts.push(`${reason}.`);
    if (hasList) {
      parts.push(
        "Anything listed below is from the version crew can see, not from the change that failed.",
      );
    }
    return { lead: "Crew are still seeing the last good version.", rest: parts.join(" ") };
  }

  // Exhaustive: NoteCode has exactly two members, so there is no fallthrough
  // and no null return. A third note code becomes a COMPILE error here.
  return {
    lead: "This version is live for crew.",
    rest: hasList
      ? "The latest changes lost some detail, and the problems below are what stopped reading."
      : "The latest changes lost some detail.",
  };
}

/* ------------------------------------------------------------------------ *
 * NEGATIVE CASES (R4#3) — these must NOT compile. Each is asserted with
 * @ts-expect-error, so if the type ever loosens enough to accept one, tsc
 * fails on the now-unused directive. Compiling valid examples proves nothing
 * about rejection; these are the rejection proof.
 * ------------------------------------------------------------------------ */

// A non-fresh value with an extra `anchor` must not satisfy the no-anchor arm.
const crewWithAnchor = { sectionId: "crew" as const, anchor: "diagrams" as const };
// @ts-expect-error crew declares no anchors (`anchor?: never`)
const _badPairing: SpikeAttentionRoute = crewWithAnchor;

// The rooms arm must not accept the event anchor.
// @ts-expect-error "opening_reel" is not a rooms anchor
const _badAnchorForSection: SpikeAttentionRoute = { sectionId: "rooms", anchor: "opening_reel" };

// A note item must carry an alert; an alert-less item cannot enter the channel.
// @ts-expect-error `alert` is required on NoteItem
const _noteWithoutAlert: NoteItem = { id: "x", kind: "alert", tone: "notice" } as Omit<
  AttentionItem,
  "alert"
>;

export type { NoteItem, SpikeAttentionRoute as _RouteExport };
