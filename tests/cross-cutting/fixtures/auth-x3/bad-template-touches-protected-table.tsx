export default async function Template() {
  return supabase.from("deferred_ingestions").select("*");
}
