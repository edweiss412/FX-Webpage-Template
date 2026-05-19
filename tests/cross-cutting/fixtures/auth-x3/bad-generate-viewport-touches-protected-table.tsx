export async function generateViewport() {
  return supabase.from("reports").select("*");
}
