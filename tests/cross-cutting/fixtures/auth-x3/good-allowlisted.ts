export async function POST() {
  return supabase.from("link_sessions").select("*");
}
