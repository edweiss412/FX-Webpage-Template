export async function lookup(tableName: string) {
	return supabase.from(tableName).select("*");
}
