export async function runScheduledCronSync(db: QueryClient, fileMeta: FileMeta) {
  const settings = await db.from("app_settings").select("processed_at").single();
  if (fileMeta.modifiedTime > settings.data.processed_at) {
    await db.from("shows").update({ last_seen_modified_time: fileMeta.modifiedTime });
  }
}
