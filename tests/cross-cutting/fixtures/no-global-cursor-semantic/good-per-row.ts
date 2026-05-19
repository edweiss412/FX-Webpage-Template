export async function runScheduledCronSync(db: QueryClient, fileMeta: FileMeta, showId: string) {
  const show = await db.from("shows").select("last_seen_modified_time").eq("id", showId).single();
  if (fileMeta.modifiedTime > show.data.last_seen_modified_time) {
    await db.from("shows").update({ last_seen_modified_time: fileMeta.modifiedTime }).eq("id", showId);
  }
}
