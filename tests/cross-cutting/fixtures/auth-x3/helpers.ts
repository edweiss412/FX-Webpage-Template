export async function loadShow() {
  return supabase.from("shows_internal").select("*");
}
