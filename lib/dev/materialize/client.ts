/**
 * lib/dev/materialize/client.ts
 *
 * One-line indirection over `createClient`, existing so the behavioral proofs
 * can substitute a stub for THIS module rather than mocking
 * `@supabase/supabase-js` globally — a file-wide mock of the driver would reach
 * every other surface in the same test file.
 *
 * The narrowing to `SupabaseLike` is a cast, not an annotation: contextually
 * typing the `createClient` call against it makes tsc instantiate the client's
 * generics deeply enough to bail with TS2589. The runtime object is untouched,
 * and `SupabaseLike` is a structural subset of what `createClient` returns.
 */
import { createClient } from "@supabase/supabase-js";
import type { SupabaseLike } from "./run";

export function createMaterializeClient(url: string, key: string): SupabaseLike {
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  }) as unknown as SupabaseLike;
}
