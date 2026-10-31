/**
 * The lifecycle half of the saved-copy status route (spec §4.5). Identity is
 * checked separately, by the page's own resolution.
 *
 * Server-only: never import this from the worker or a client component.
 */
export type LifecycleRow = {
  archived: boolean;
  picker_epoch: number;
  unpublished_at: string | null;
};

/** The three lifecycle conditions of spec section 4.5. Identity is checked separately. */
export function lifecycleAllowsEnded(
  row: LifecycleRow | null,
  savedEpoch: number,
  savedAtMs: number,
): boolean {
  // The row exists and is archived.
  if (row === null || row.archived !== true) return false;
  // The archive's own epoch bump and nothing else: a reset before or after it leaves a gap of two
  // or more (R4).
  if (row.picker_epoch !== savedEpoch + 1) return false;
  // No unpublish since the copy was saved (R15). A time that does not parse is NaN, and NaN is
  // never earlier than anything, so it fails closed.
  if (row.unpublished_at === null) return true;
  return Date.parse(row.unpublished_at) < savedAtMs;
}
