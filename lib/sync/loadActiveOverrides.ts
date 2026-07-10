import type { ActiveOverrideRow } from "@/lib/sync/overrideShowHotel";

// Reads the show's ACTIVE `admin_overrides` rows once, inside the locked sync tx, so Stage A
// (show/hotel — Task 6) and the §3.6 crew reconciliation (Task 7) both consume the SAME snapshot
// (SYNC-1: a single locked-tx read, never a second query). The concrete Supabase/service-role read
// lives in the tx-port implementation (runScheduledCronSync.ts); this helper owns the
// call-boundary discipline (invariant 9): it distinguishes a RETURNED error from a THROWN one and
// surfaces either as a typed, discriminable infra fault — never a silent empty result.

/** The `{ data, error }` result the read port yields (PostgREST-shaped). */
export type ActiveOverridesReadResult = {
  data: ActiveOverrideRow[] | null;
  error: unknown;
};

/** The minimal read port `loadActiveOverrides` consumes. Implemented by the sync tx port. */
export type ActiveOverridesReadPort = {
  loadActiveOverrides(driveFileId: string): Promise<ActiveOverridesReadResult>;
};

/** Typed infra fault — a returned OR thrown read error, distinguished by `kind`. */
export class LoadActiveOverridesInfraError extends Error {
  readonly kind: "returned_error" | "thrown_error";
  override readonly cause: unknown;

  constructor(kind: "returned_error" | "thrown_error", cause: unknown) {
    super(`Active-overrides read failed (${kind})`);
    this.name = "LoadActiveOverridesInfraError";
    this.kind = kind;
    this.cause = cause;
  }
}

export async function loadActiveOverrides(
  port: ActiveOverridesReadPort,
  driveFileId: string,
): Promise<ActiveOverrideRow[]> {
  let result: ActiveOverridesReadResult;
  try {
    result = await port.loadActiveOverrides(driveFileId);
  } catch (cause) {
    // THROWN fault (network/driver) — never collapse into "no overrides".
    throw new LoadActiveOverridesInfraError("thrown_error", cause);
  }

  const { data, error } = result;
  if (error) {
    // RETURNED PostgREST error — distinguished from the thrown path above.
    throw new LoadActiveOverridesInfraError("returned_error", error);
  }
  return data ?? [];
}
