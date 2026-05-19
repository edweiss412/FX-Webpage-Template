export async function GET() {
  return supabase.from("bootstrap_nonces").select("*");
}
