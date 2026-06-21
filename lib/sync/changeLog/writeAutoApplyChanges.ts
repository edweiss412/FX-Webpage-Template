import { canonicalize } from "@/lib/email/canonicalize";
import type { ParseResult, TriggeredReviewItem } from "@/lib/parser/types";
import type { PreviousCrewMember } from "@/lib/sync/applyParseResult";
import type { HoldPort } from "@/lib/sync/holds/holdPort";

/**
 * Task 2.9 — write one show_change_log row per AUTO-APPLIED notable change.
 *
 * Runs inside the locked sync txn, AFTER the prior snapshot is captured and AFTER the reconcile,
 * but uses the PRE-mutation `previousCrewMembers` so `before_image` is the pre-reconcile state
 * (load-bearing for Phase-4 undo). before_image for crew-domain kinds carries id +
 * claimed_via_oauth_at (PF38). change_kind is STRUCTURAL only (never MI-*; PF8). entity_ref for a
 * rename = the PRIOR/old name (resolution #19). Held entities are EXCLUDED (their feed entry comes
 * from sync_holds, surfaced by Phase 5). Non-crew kinds get before_image = null (notification-only).
 *
 * summary is plain descriptive English — it contains NO raw error/invariant code (invariant 5;
 * the MI code, if useful, is never placed in change_kind or summary as a raw code).
 */

export type AutoApplyChangeKind =
  | "crew_added"
  | "crew_removed"
  | "crew_renamed"
  | "field_changed"
  | "section_shrunk"
  | "asset_drift";

export type WriteAutoApplyChangesArgs = {
  port: HoldPort;
  showId: string;
  driveFileId: string;
  previousCrewMembers: PreviousCrewMember[];
  nextCrewMembers: ParseResult["crewMembers"];
  triggeredItems: TriggeredReviewItem[];
  /** Names whose change is gated by an open MI-11 hold — excluded from the auto-apply feed. */
  heldNames: Set<string>;
  occurredAt?: string;
};

type RenamePair = { prior: string; added: string };

function renamePairs(items: TriggeredReviewItem[]): RenamePair[] {
  const pairs: RenamePair[] = [];
  for (const item of items) {
    if (item.invariant === "MI-12" || item.invariant === "MI-13" || item.invariant === "MI-14") {
      pairs.push({ prior: item.removed_name, added: item.added_name });
    }
  }
  return pairs;
}

function crewImage(member: PreviousCrewMember): Record<string, unknown> {
  return {
    id: member.id,
    name: member.name,
    email: member.email,
    phone: member.phone,
    role: member.role,
    role_flags: member.role_flags,
    date_restriction: member.date_restriction,
    stage_restriction: member.stage_restriction,
    flight_info: member.flight_info,
    claimed_via_oauth_at: member.claimed_via_oauth_at,
  };
}

function hasInvariant(
  items: TriggeredReviewItem[],
  pred: (i: TriggeredReviewItem) => boolean,
): boolean {
  return items.some(pred);
}

export async function writeAutoApplyChanges(args: WriteAutoApplyChangesArgs): Promise<void> {
  const prevByName = new Map(args.previousCrewMembers.map((m) => [m.name, m]));
  const nextByName = new Map(args.nextCrewMembers.map((m) => [m.name, m]));
  const renames = renamePairs(args.triggeredItems);
  const renamedPriorNames = new Set(renames.map((r) => r.prior));
  const renamedAddedNames = new Set(renames.map((r) => r.added));

  type Row = {
    changeKind: AutoApplyChangeKind;
    entityRef: string | null;
    summary: string;
    beforeImage: Record<string, unknown> | null;
    afterImage: Record<string, unknown> | null;
  };
  const rows: Row[] = [];

  // ---- Renames (crew_renamed): entity_ref = PRIOR/old name (resolution #19). ----
  for (const { prior, added } of renames) {
    if (args.heldNames.has(prior) || args.heldNames.has(added)) continue;
    const priorRow = prevByName.get(prior);
    rows.push({
      changeKind: "crew_renamed",
      entityRef: prior,
      summary: `Crew member ${prior} renamed to ${added}`,
      beforeImage: priorRow ? crewImage(priorRow) : null,
      afterImage: { name: added, email: nextByName.get(added)?.email ?? null },
    });
  }

  // ---- Removals (crew_removed): in prev, not in next, NOT a rename, NOT held. ----
  for (const member of args.previousCrewMembers) {
    if (nextByName.has(member.name)) continue;
    if (renamedPriorNames.has(member.name)) continue; // counted as rename
    if (args.heldNames.has(member.name)) continue;
    rows.push({
      changeKind: "crew_removed",
      entityRef: member.name,
      summary: `Crew member ${member.name} removed`,
      beforeImage: crewImage(member),
      afterImage: null,
    });
  }

  // ---- Additions (crew_added): in next, not in prev, NOT a rename target, NOT held. ----
  for (const member of args.nextCrewMembers) {
    if (prevByName.has(member.name)) continue;
    if (renamedAddedNames.has(member.name)) continue; // counted as rename
    if (args.heldNames.has(member.name)) continue;
    rows.push({
      changeKind: "crew_added",
      entityRef: member.name,
      summary: `Crew member ${member.name} added`,
      beforeImage: null,
      afterImage: { name: member.name, email: member.email },
    });
  }

  // ---- Non-crew notifications (before_image null). ----
  // Section shrinkage (MI-7/7b).
  if (hasInvariant(args.triggeredItems, (i) => i.invariant === "MI-7" || i.invariant === "MI-7b")) {
    rows.push({
      changeKind: "section_shrunk",
      entityRef: null,
      summary: "A section lost rows on this sync",
      beforeImage: null,
      afterImage: null,
    });
  }
  // Field changes (MI-8/8b/8c + MI-9 LEAD — non-identity crew field, not undoable per F17).
  if (
    hasInvariant(
      args.triggeredItems,
      (i) =>
        i.invariant === "MI-8" ||
        i.invariant === "MI-8b" ||
        i.invariant === "MI-8c" ||
        i.invariant === "MI-9",
    )
  ) {
    rows.push({
      changeKind: "field_changed",
      entityRef: null,
      summary: "A field changed on this sync",
      beforeImage: null,
      afterImage: null,
    });
  }
  // Asset drift (DIAGRAMS_* / REEL_DRIFT).
  if (
    hasInvariant(
      args.triggeredItems,
      (i) => i.invariant.startsWith("DIAGRAMS_") || i.invariant === "REEL_DRIFT_PENDING",
    )
  ) {
    rows.push({
      changeKind: "asset_drift",
      entityRef: null,
      summary: "Linked assets changed on this sync",
      beforeImage: null,
      afterImage: null,
    });
  }

  const occurredAt = args.occurredAt ?? new Date().toISOString();
  for (const row of rows) {
    // canonicalize emails in before/after images at this boundary (invariant 3).
    const before = row.beforeImage ? canonImage(row.beforeImage) : null;
    const after = row.afterImage ? canonImage(row.afterImage) : null;
    // not-subject-to-meta: service-role SQL inside the JS-held show lock (no {data,error} client).
    await args.port.unsafe(
      `
        insert into public.show_change_log
          (show_id, drive_file_id, occurred_at, source, change_kind, entity_ref, summary,
           before_image, after_image, status, created_by)
        values ($1, $2, $3::timestamptz, 'auto_apply', $4, $5, $6, $7::jsonb, $8::jsonb, 'applied', 'system')
      `,
      [
        args.showId,
        args.driveFileId,
        occurredAt,
        row.changeKind,
        row.entityRef,
        row.summary,
        before,
        after,
      ],
    );
  }
}

function canonImage(image: Record<string, unknown>): Record<string, unknown> {
  if ("email" in image) {
    return { ...image, email: canonicalize((image.email as string | null) ?? null) };
  }
  return image;
}
