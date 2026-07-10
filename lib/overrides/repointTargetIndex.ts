// Serializable CAS-B repoint index (spec §8, R6). PURE + CLIENT-SAFE by design:
// this module imports NOTHING at runtime (only `import type`, which the bundler erases),
// so a `"use client"` edit surface (the review wizard, <OverrideableField>) can build the
// index from already-serialized ShowOverridesView data WITHOUT dragging loadShowOverrides's
// server-only chain (it imports `@/lib/log` -> lib/log/requestContext.ts's AsyncLocalStorage,
// plus the supabase server client) into the client bundle.
//
// Why its own file: pulling a VALUE (`makeRepointTargetIndex`) from loadShowOverrides.ts into a
// client component makes Turbopack bundle that whole server module for the browser and the build
// FAILS ("Code generation for chunk item errored" on requestContext.ts). `tsc`/`vitest` do not
// catch it — only `next build` does. loadShowOverrides.ts re-exports these for server callers.
//
// A SERIALIZABLE lookup of every live target's CAS-B inputs, keyed by the DURABLE parsed
// matchKey (§8.2a). The RPC validates CAS-B against the NEW target B (not the old paused
// target) and resolves B's hotel row via p_expected_live_hotel_name, so the client must
// supply B's live value (+ live hotel name) for the entered key. A key that matches no entry
// → null CAS-B → the RPC fail-closes (409) instead of guessing a row.
import type { ShowOverridesView } from "./loadShowOverrides";

export type RepointTargetIndex = {
  crew: Record<string, { name: unknown; role: unknown }>;
  hotel: Record<
    string,
    { hotel_name: unknown; hotel_address: unknown; liveHotelName: string | null }
  >;
};

// Build the serializable repoint index from an already-loaded ShowOverridesView (pure).
export function makeRepointTargetIndex(view: ShowOverridesView): RepointTargetIndex {
  const crew: RepointTargetIndex["crew"] = {};
  for (const c of view.crew) {
    crew[c.matchKey] = { name: c.name.expectedCurrentValue, role: c.role.expectedCurrentValue };
  }
  const hotel: RepointTargetIndex["hotel"] = {};
  for (const h of view.hotels) {
    hotel[h.matchKey] = {
      hotel_name: h.hotel_name.expectedCurrentValue,
      hotel_address: h.hotel_address.expectedCurrentValue,
      liveHotelName: h.currentLiveHotelName,
    };
  }
  return { crew, hotel };
}
