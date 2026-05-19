"use server";

export async function clearAlerts() {
  await supabase.from("admin_alerts").select("*");
}
