import { canonicalize } from "@/lib/email/canonicalize";
import type { TriggeredReviewItem } from "@/lib/parser/types";

/**
 * Task 2.2 — write one `mi11_pending` sync_holds row per distinct MI-11 crew.
 *
 * Runs as direct service-role SQL on the LOCKED sync transaction (no nested
 * lock-taking RPC — single-holder discipline, AGENTS.md invariant 2). The
 * caller already holds the per-show advisory lock (see lockedShowTx.ts); this
 * helper acquires NO lock of its own.
 *
 * held_value  = the prior LIVE crew row (old email/name + non-identity fields).
 * proposed_value = { disposition:'email_change', name, email: canonicalize(new) }.
 * ON CONFLICT (show_id, domain, entity_key) → in-place update (no duplicates).
 *
 * $N::jsonb params receive RAW objects — postgres.js double-encodes a stringified
 * value into a jsonb scalar (project memory). The tx port's `unsafe(sql, params)`
 * is the postgres.js boundary that serializes a JS object into jsonb correctly.
 */
export type Mi11Item = Extract<TriggeredReviewItem, { invariant: "MI-11" }>;

export type LiveCrewRow = {
  name: string;
  email: string | null;
  phone: string | null;
  role: string;
  role_flags: string[];
  date_restriction: unknown;
  stage_restriction: unknown;
  flight_info: string | null;
};

export type WriteMi11HoldsTx = {
  unsafe(query: string, params: unknown[]): Promise<unknown[]>;
};

export type WriteMi11HoldsArgs = {
  showId: string;
  driveFileId: string;
  mi11Items: Mi11Item[];
  liveCrewByName: Map<string, LiveCrewRow>;
  baseModifiedTime: string;
};

export async function writeMi11Holds(
  tx: WriteMi11HoldsTx,
  args: WriteMi11HoldsArgs,
): Promise<void> {
  for (const item of args.mi11Items) {
    const live = args.liveCrewByName.get(item.crew_name);
    // held_value is the prior live crew row (identity pinned; non-identity fields recorded but
    // not pinned). If the live row is somehow absent, fall back to the MI-11 prior email + name.
    const heldValue = live ?? {
      name: item.crew_name,
      email: item.prior_email,
      phone: null,
      role: "",
      role_flags: [],
      date_restriction: { kind: "none" },
      stage_restriction: { kind: "none" },
      flight_info: null,
    };
    const proposedValue = {
      disposition: "email_change" as const,
      name: item.crew_name,
      email: canonicalize(item.new_email),
    };

    // not-subject-to-meta: service-role SQL inside the JS-held show lock (no {data,error} client).
    await tx.unsafe(
      `
        insert into public.sync_holds (
          show_id, drive_file_id, domain, entity_key,
          held_value, proposed_value, base_modified_time, kind, created_by
        )
        values ($1, $2, 'crew_email', $3, $4::jsonb, $5::jsonb, $6::timestamptz, 'mi11_pending', 'system')
        on conflict (show_id, domain, entity_key)
        do update set
          held_value = excluded.held_value,
          proposed_value = excluded.proposed_value,
          base_modified_time = excluded.base_modified_time,
          created_at = now()
        -- P2-F5: ONLY overwrite an existing mi11_pending hold. A terminal undo_override row (reject/
        -- undo: kind='undo_override', proposed_value NULL) owns the same (show_id,domain,entity_key)
        -- after a reject; writing a non-null proposed_value onto it violates sync_holds_kind_shape_chk
        -- and fails the whole sync. Skip it so hold-aware apply keeps honoring the override.
        where sync_holds.kind = 'mi11_pending'
      `,
      [
        args.showId,
        args.driveFileId,
        item.crew_name,
        heldValue,
        proposedValue,
        args.baseModifiedTime,
      ],
    );
  }
}
