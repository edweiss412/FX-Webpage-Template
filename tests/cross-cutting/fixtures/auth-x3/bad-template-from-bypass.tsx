export async function GET(prefix: string, suffix: string) {
  return supabase.from(`${prefix}_${suffix}`).select("*");
}
