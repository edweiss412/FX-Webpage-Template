export async function runScheduledCronSync(db: QueryClient, fileMeta: FileMeta) {
  const checkpoint = process.env["LAST_WATERMARK"];
  if (fileMeta.modifiedTime > checkpoint) {
    await db.from("shows").update({ last_seen_modified_time: fileMeta.modifiedTime });
  }
}
