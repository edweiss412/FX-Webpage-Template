// Canonical types for the sync changes-feed + identity-only gate (00-overview "Shared contracts").
// Defined once, imported everywhere — Phases 2/3/4/5/6 reference these signatures.

export type HoldKind = "mi11_pending" | "undo_override";
export type HoldDomain = "crew_email" | "crew_identity";

export type Disposition =
  | { disposition: "email_change"; name: string; email: string | null }
  | { disposition: "rename"; name: string; email: string | null }
  | { disposition: "removal" };

export type SyncHold = {
  id: string;
  showId: string;
  driveFileId: string;
  domain: HoldDomain;
  entityKey: string;
  heldValue: unknown;
  proposedValue: Disposition | null;
  baseModifiedTime: string | null;
  kind: HoldKind;
  reservationCollisions: Array<{ name: string; email: string | null }>;
  createdAt: string;
  createdBy: string;
};

export type ChangeLogSource = "auto_apply" | "mi11_approve" | "mi11_reject" | "undo";

// 'superseded' = a newer same-entity change made this row non-actionable (resolution #18);
// feed → action='none', a distinct badge.
export type ChangeStatus = "applied" | "pending" | "rejected" | "undone" | "superseded";

// STRUCTURAL change_kind values only, NEVER 'MI-*' (resolution #3 / #13 / PF8).
// Undoable crew-identity: crew_added | crew_removed | crew_renamed.
// Gate-resolved (NOT undoable): crew_email_changed.
// Non-crew notification: field_changed | section_shrunk | asset_drift.
export type ChangeKind =
  | "crew_added"
  | "crew_removed"
  | "crew_renamed"
  | "crew_email_changed"
  | "field_changed"
  | "section_shrunk"
  | "asset_drift";

export const UNDOABLE_CHANGE_KINDS = ["crew_added", "crew_removed", "crew_renamed"] as const;
