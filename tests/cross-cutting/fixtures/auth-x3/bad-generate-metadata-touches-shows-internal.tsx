export async function generateMetadata() {
  return supabase.from("shows_internal").select("*");
}
