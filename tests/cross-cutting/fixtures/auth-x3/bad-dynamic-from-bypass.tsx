export async function GET(req: Request) {
  const tableName = new URL(req.url).searchParams.get("table");
  return supabase.from(tableName).select("*");
}
