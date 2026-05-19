export default async function Loading() {
  return supabase.from("pending_syncs").select("*");
}
