/**
 * Durable extraction lease — per-show dedupe + deployment-wide concurrency cap.
 *
 * Claim sequence (all inside one pg_advisory_xact_lock so the SELECT→count→INSERT
 * is race-free):
 *   1. pg_advisory_xact_lock(hashtext('agenda-extract-admit')::bigint)
 *   2. DELETE expired leases (GC)
 *   3. Check THIS row's live lease BEFORE the global cap (round-3 ordering)
 *   4. SELECT count(*) → >= AGENDA_GLOBAL_MAX → queued
 *   5. INSERT … ON CONFLICT DO UPDATE WHERE expired RETURNING owner
 *      → 0 rows = live lease for this row → in_progress (belt-and-suspenders)
 *      → 1 row = ok
 */

import {
  AGENDA_EXTRACT_LEASE_TTL_MS,
  AGENDA_GLOBAL_MAX_CONCURRENT_EXTRACTIONS,
  AGENDA_MAX_CONCURRENT_EXTRACTIONS,
} from "@/lib/agenda/constants";

// ─── Types ───────────────────────────────────────────────────────────────────

/**
 * Tagged-template tx compatible with postgres.js TransactionSql (subset).
 * Cast a raw postgres.js tx via `rawTx as unknown as LeaseTx`.
 */
export type LeaseTx = {
  <T extends Record<string, unknown> = Record<string, unknown>>(
    strings: TemplateStringsArray,
    ...values: unknown[]
  ): Promise<T[]>;
};

/**
 * Pool compatible with postgres.js Sql — used by releaseExtractLeaseStandalone.
 * Cast a real postgres pool via `pool as unknown as LeasePool`.
 */
export type LeasePool = LeaseTx & {
  begin(fn: (tx: LeaseTx) => Promise<void>): Promise<void>;
};

export type ClaimResult = { ok: true } | { ok: false; reason: "queued" | "in_progress" };

type LeaseKey = { wizardSessionId: string; driveFileId: string; owner: string };

// ─── Claim ───────────────────────────────────────────────────────────────────

/**
 * Claim a durable extraction lease inside an active caller-owned transaction.
 * The pg_advisory_xact_lock is held for the lifetime of that transaction,
 * serializing every concurrent claimExtractLease call deployment-wide.
 */
export async function claimExtractLease(
  tx: LeaseTx,
  { wizardSessionId, driveFileId, owner }: LeaseKey,
): Promise<ClaimResult> {
  // 1. Acquire deployment-wide admit lock (xact-scoped, auto-released on commit/rollback)
  await tx`SELECT pg_advisory_xact_lock(hashtext('agenda-extract-admit')::bigint)`;

  // 2. GC crashed/expired leases
  await tx`DELETE FROM public.agenda_extract_leases WHERE expires_at <= now()`;

  // 3. Check THIS row's live lease BEFORE the global cap (round-3 ordering):
  //    a same-row duplicate at full cap returns in_progress, not queued.
  const live = await tx<{ one: number }>`
    SELECT 1 AS one
      FROM public.agenda_extract_leases
     WHERE wizard_session_id = ${wizardSessionId}::uuid
       AND drive_file_id     = ${driveFileId}
       AND expires_at        > now()
  `;
  if (live.length > 0) return { ok: false, reason: "in_progress" };

  // 4. Global cap — count live leases (expired already GC'd above)
  const countRows = await tx<{ cnt: number }>`
    SELECT count(*)::int AS cnt FROM public.agenda_extract_leases
  `;
  const cnt = countRows[0]?.cnt ?? 0;
  if (cnt >= AGENDA_GLOBAL_MAX_CONCURRENT_EXTRACTIONS) {
    return { ok: false, reason: "queued" };
  }

  // 5. Upsert — DO UPDATE only when the existing row is expired (belt-and-suspenders)
  const expiresAt = new Date(Date.now() + AGENDA_EXTRACT_LEASE_TTL_MS).toISOString();
  const inserted = await tx<{ owner: string }>`
    INSERT INTO public.agenda_extract_leases
           (wizard_session_id, drive_file_id, owner, expires_at)
    VALUES (${wizardSessionId}::uuid, ${driveFileId}, ${owner}, ${expiresAt}::timestamptz)
    ON CONFLICT (wizard_session_id, drive_file_id) DO UPDATE
      SET owner      = EXCLUDED.owner,
          expires_at = EXCLUDED.expires_at
      WHERE public.agenda_extract_leases.expires_at < now()
    RETURNING owner
  `;
  // 0 rows → existing live lease (belt-and-suspenders); 1 row → claimed
  return inserted.length === 0 ? { ok: false, reason: "in_progress" } : { ok: true };
}

// ─── Release ─────────────────────────────────────────────────────────────────

/**
 * In-tx owner-scoped DELETE. Call inside an existing open transaction
 * (e.g., tx#2's successful persist path).
 */
export async function releaseExtractLease(
  tx: LeaseTx,
  { wizardSessionId, driveFileId, owner }: LeaseKey,
): Promise<void> {
  await tx`
    DELETE FROM public.agenda_extract_leases
     WHERE wizard_session_id = ${wizardSessionId}::uuid
       AND drive_file_id     = ${driveFileId}
       AND owner             = ${owner}
  `;
}

/**
 * Opens its own short transaction and runs the owner-scoped DELETE.
 * For the endpoint's no-open-tx finally paths (round-1 plan finding).
 */
export async function releaseExtractLeaseStandalone(sql: LeasePool, args: LeaseKey): Promise<void> {
  await sql.begin(async (tx) => {
    await releaseExtractLease(tx, args);
  });
}

// ─── Persist guard ───────────────────────────────────────────────────────────

/**
 * Returns true when the caller's lease is still live (owner-scoped, unexpired).
 * Use as the tx#2 persist guard before committing extracted data.
 *
 * SQL equivalent: EXISTS(SELECT 1 FROM agenda_extract_leases
 *                        WHERE wiz=$ AND dfid=$ AND owner=$ AND expires_at > now())
 */
export async function assertLeaseOwned(
  tx: LeaseTx,
  { wizardSessionId, driveFileId, owner }: LeaseKey,
): Promise<boolean> {
  const rows = await tx<{ owned: boolean }>`
    SELECT EXISTS(
      SELECT 1 FROM public.agenda_extract_leases
       WHERE wizard_session_id = ${wizardSessionId}::uuid
         AND drive_file_id     = ${driveFileId}
         AND owner             = ${owner}
         AND expires_at        > now()
    ) AS owned
  `;
  return Boolean(rows[0]?.owned);
}

// ─── In-memory slot store ─────────────────────────────────────────────────────

export type SlotAcquireResult = {
  /** True when this key already has an in-flight entry in THIS store instance. */
  ownsInFlight: boolean;
  /** True when a new per-instance slot was acquired. False when in-flight or at cap. */
  acquiredSlot: boolean;
  /** Release the slot. Idempotent; no-op when acquiredSlot is false. */
  release: () => void;
};

export type InMemorySlotStore = {
  tryAcquire(key: string): SlotAcquireResult;
};

/**
 * Factory — each call returns an INDEPENDENT store closing over its OWN
 * counter and Set. Two stores are fully isolated (round-11 plan finding:
 * enables per-instance route tests without shared module-level state).
 */
export function createInMemorySlotStore(): InMemorySlotStore {
  let count = 0;
  const inFlight = new Set<string>();

  return {
    tryAcquire(key: string): SlotAcquireResult {
      if (inFlight.has(key)) {
        return { ownsInFlight: true, acquiredSlot: false, release: () => {} };
      }
      if (count >= AGENDA_MAX_CONCURRENT_EXTRACTIONS) {
        return { ownsInFlight: false, acquiredSlot: false, release: () => {} };
      }
      count++;
      inFlight.add(key);
      let released = false;
      return {
        ownsInFlight: false,
        acquiredSlot: true,
        release() {
          if (!released) {
            released = true;
            count--;
            inFlight.delete(key);
          }
        },
      };
    },
  };
}

/** Production singleton — one per deployment instance. */
export const defaultSlotStore = createInMemorySlotStore();
