export async function GET() {
  return supabase.from("link_sessions").select("*");
}
