export default async function Error() {
  return supabase.from("sync_audit").select("*");
}
