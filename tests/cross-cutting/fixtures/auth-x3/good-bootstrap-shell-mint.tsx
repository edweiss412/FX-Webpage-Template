export default async function BootstrapShell() {
  return supabase.from("bootstrap_nonces").insert({ nonce: "n" });
}
