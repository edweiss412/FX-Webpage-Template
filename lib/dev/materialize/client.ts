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

import { makeObservingFetch } from "@/lib/supabase/observeTransport";

import type { SupabaseLike } from "./run";

export function createMaterializeClient(url: string, key: string): SupabaseLike {
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: {
      // OBSERVED, because this IS a request path and an earlier exemption said otherwise.
      // `app/admin/dev/actions.ts` is a `"use server"` module and constructs this client inside
      // two server actions — `applyAttentionScenario` and `clearAttentionScenario`, both behind
      // `assertSameOriginServerAction` and `requireDeveloperIdentity`. Their zero-write fault
      // paths return `infra_error` without reaching `logAdminOutcome`, so an upstream fault here
      // was swallowed with no durable record at all.
      //
      // `baseUrl` is the caller's target rather than a constant: this client is pointed at
      // whichever environment the action resolved, so the observer's RPC-vs-path decision has to
      // be made against THAT mount.
      //
      // Late-bound, for the same reason the service-role factory is: supabase-js resolves `fetch`
      // per request when none is supplied, and the behavioral proofs substitute a stub for this
      // module rather than mocking the driver.
      fetch: makeObservingFetch((input, init) => globalThis.fetch(input, init), { baseUrl: url }),
    },
  }) as unknown as SupabaseLike;
}
