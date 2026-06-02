// M12.2 Phase B2 — shared archived-immutability guard for the sync pipeline (DEF-2/3/4/5).
// Mutations to an archived show must be refused at every entry point that re-reads state under the
// per-show advisory lock. SHOW_ARCHIVED_IMMUTABLE is a §12.4 catalog code (Phase 5).

export const SHOW_ARCHIVED_IMMUTABLE = "SHOW_ARCHIVED_IMMUTABLE" as const;

/** Re-read shows.archived for a drive_file_id (call AFTER the advisory lock is held). */
export async function readShowArchived_unlocked(
  tx: { queryOne<T>(sql: string, params: unknown[]): Promise<T> },
  driveFileId: string,
): Promise<boolean> {
  const row = await tx.queryOne<{ archived: boolean } | null>(
    "select archived from public.shows where drive_file_id = $1",
    [driveFileId],
  );
  return Boolean(row?.archived);
}
