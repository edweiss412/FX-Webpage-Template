export default async function Head() {
  return supabase.from("app_settings").select("*");
}
