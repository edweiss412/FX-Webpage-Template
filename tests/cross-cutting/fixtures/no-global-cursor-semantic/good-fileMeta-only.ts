export async function runScheduledCronSync(db: QueryClient, fileMeta: FileMeta, show: { last_seen_modified_time: string }) {
  if (fileMeta.modifiedTime > show.last_seen_modified_time) {
    await db.from("shows").update({ last_seen_modified_time: fileMeta.modifiedTime });
  }
}
