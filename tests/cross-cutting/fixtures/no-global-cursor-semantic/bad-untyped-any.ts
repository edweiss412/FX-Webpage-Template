export async function runScheduledCronSync(db: QueryClient, fileMeta: FileMeta, rows: unknown[]) {
  const cursor = (rows[0] as any).runStartedAt;
  if (fileMeta.modifiedTime > cursor) {
    await db.from("shows").update({ last_seen_modified_time: fileMeta.modifiedTime });
  }
}
