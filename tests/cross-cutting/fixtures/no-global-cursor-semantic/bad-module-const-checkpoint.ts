export let CHECKPOINT = "2026-01-01T00:00:00Z";

export async function runScheduledCronSync(db: QueryClient, fileMeta: FileMeta) {
  if (fileMeta.modifiedTime > CHECKPOINT) {
    await db.from("shows").update({ last_seen_modified_time: fileMeta.modifiedTime });
  }
}
