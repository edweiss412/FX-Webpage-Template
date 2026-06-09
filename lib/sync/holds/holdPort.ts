import { canonicalize } from "@/lib/email/canonicalize";

/**
 * Service-role SQL port for hold read/write inside the LOCKED sync transaction.
 * No nested lock-taking RPC (single-holder, invariant 2). The caller already
 * holds the per-show advisory lock; these run as direct `unsafe` SQL on that txn.
 *
 * not-subject-to-meta: service-role SQL inside the JS-held show lock (no {data,error} client).
 */
export type HoldPort = {
  unsafe(query: string, params: unknown[]): Promise<unknown[]>;
};

export type OpenHoldRow = {
  id: string;
  show_id: string;
  drive_file_id: string;
  domain: "crew_email" | "crew_identity";
  entity_key: string;
  held_value: Record<string, unknown>;
  proposed_value: Record<string, unknown> | null;
  base_modified_time: string | null;
  kind: "mi11_pending" | "undo_override";
  reservation_collisions: Array<{ name: string; email: string | null }>;
};

export async function readOpenHolds(port: HoldPort, showId: string): Promise<OpenHoldRow[]> {
  const rows = (await port.unsafe(
    `
      select id, show_id, drive_file_id, domain, entity_key, held_value,
             proposed_value, base_modified_time, kind, reservation_collisions
        from public.sync_holds
       where show_id = $1
    `,
    [showId],
  )) as OpenHoldRow[];
  return rows;
}

export async function deleteHold(port: HoldPort, holdId: string): Promise<void> {
  await port.unsafe(`delete from public.sync_holds where id = $1`, [holdId]);
}

/** §4.3 in-place re-eval: bump proposed_value + base_modified_time (optimistic-concurrency anchor). */
export async function updateHoldProposedValue(
  port: HoldPort,
  holdId: string,
  proposedValue: Record<string, unknown>,
  baseModifiedTime: string,
): Promise<void> {
  await port.unsafe(
    `update public.sync_holds
        set proposed_value = $2::jsonb, base_modified_time = $3::timestamptz
      where id = $1`,
    [holdId, proposedValue, baseModifiedTime],
  );
}

/** Task 2.7 (single owner): re-derive reservation_collisions FRESH each apply (never append). */
export async function setReservationCollisions(
  port: HoldPort,
  holdId: string,
  collisions: Array<{ name: string; email: string | null }>,
): Promise<void> {
  await port.unsafe(
    `update public.sync_holds set reservation_collisions = $2::jsonb where id = $1`,
    [holdId, collisions],
  );
}

export function canonEmail(email: string | null | undefined): string | null {
  return canonicalize(email ?? null);
}
