export default async function NotFound() {
  return supabase.from("admin_alerts").select("*");
}
