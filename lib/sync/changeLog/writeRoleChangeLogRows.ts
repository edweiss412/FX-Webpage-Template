import type { ParseResult } from "@/lib/parser/types";
import type { PreviousCrewMember } from "@/lib/sync/applyParseResult";
import type { HoldPort } from "@/lib/sync/holds/holdPort";
import type { IdentityLinkRename } from "@/lib/sync/identityLinkRenames";

/**
 * Identifiable role-change `show_change_log` rows (spec 2026-07-17-role-flags-notice-lead-only-doug
 * §2.4). Written from the shared `runPhase2` point so BOTH apply paths (cron auto-apply AND staged)
 * get a discrete, identifiable per-member row for every applied `role_flags` change on a has-a-prior
 * member — capability OR scope-tile. (The narrowed `ROLE_FLAGS_NOTICE` alert + durable event cover
 * only capability changes; this row is the Doug-visible change-feed audit for role changes.)
 *
 * Contract:
 *  - `source: 'auto_apply'` on every path — a role_flags change is never individually held (only
 *    MI-11 email changes gate); it always auto-applies via Phase 2 UPSERT, so the row is legitimately
 *    an auto-apply feed row even when the sync was triggered by a staged approval. No new
 *    `show_change_log.source` value, no CHECK migration.
 *  - `entity_ref = null` (supersession safety): `cleanup_superseded_before_images` supersedes older
 *    undoable crew rows by matching `entity_ref` WITHOUT restricting the newer row's kind, so a
 *    non-null entity_ref here would null an older `crew_added`/`crew_renamed` row's before_image and
 *    kill Doug's undo. Identity lives in the `summary` (matches existing MI-8 field_changed rows).
 *  - `change_kind: 'field_changed'`, `before_image = after_image = null` (not undoable).
 *  - Rename resolution uses `identityLinkRenames` — the SAME source `capabilityRoleChangesForNotice`
 *    uses (phase2.ts) — so the writer's coverage is the notice producer's existing-member arm (a).
 *  - NO held-name skip: an MI-11 fold applies role_flags onto the retained row, and that change is
 *    audit-worthy; the notice producer catches it too (both diff the applied list).
 *  - Roster arms (b) new-crew and (c) removed-member are `crew_added`/`crew_removed`, NOT role
 *    changes — they are excluded here (the loop skips `!prior`; it never iterates removed members).
 */
type CrewLike = { name: string; role_flags: readonly string[] };

function roleFlagsSetEqual(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) return false;
  const rightSet = new Set(right);
  return left.every((flag) => rightSet.has(flag));
}

function fmtFlags(flags: readonly string[]): string {
  return flags.length > 0 ? [...flags].sort().join(", ") : "none";
}

export async function writeRoleChangeLogRows(
  port: HoldPort,
  showId: string,
  driveFileId: string,
  previousCrewMembers: readonly PreviousCrewMember[],
  appliedCrewMembers: ParseResult["crewMembers"],
  identityLinkRenames: readonly IdentityLinkRename[] = [],
  occurredAt?: string,
): Promise<void> {
  const prevByName = new Map<string, CrewLike>(previousCrewMembers.map((m) => [m.name, m]));
  // Map the applied (added) name back to its identity-linked prior (removed) name, so a renamed
  // member's role_flags are diffed against the correct prior row. Same map as the notice producer.
  const priorNameForAdded = new Map(
    identityLinkRenames.map((rename) => [rename.addedName, rename.removedName]),
  );
  const occ = occurredAt ?? new Date().toISOString();

  for (const next of appliedCrewMembers) {
    const priorName = priorNameForAdded.get(next.name) ?? next.name;
    const prior = prevByName.get(priorName);
    if (!prior) continue; // no prior → a crew_added, not a role change (roster arm, out of scope here)
    if (roleFlagsSetEqual(prior.role_flags, next.role_flags)) continue; // no delta → no row
    // not-subject-to-meta: service-role SQL inside the JS-held show lock (no {data,error} client).
    await port.unsafe(
      `
        insert into public.show_change_log
          (show_id, drive_file_id, occurred_at, source, change_kind, entity_ref, summary,
           before_image, after_image, status, created_by)
        values ($1, $2, $3::timestamptz, 'auto_apply', 'field_changed', null, $4,
                null::jsonb, null::jsonb, 'applied', 'system')
      `,
      [
        showId,
        driveFileId,
        occ,
        `Crew member ${next.name} role assignment changed: ${fmtFlags(prior.role_flags)} → ${fmtFlags(next.role_flags)}`,
      ],
    );
  }
}
