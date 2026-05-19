export async function POST() {
  await supabase.from("bootstrap_nonces").upsert({ nonce: "n" });
  return supabase.from("link_sessions").insert({ token: "t" });
}
