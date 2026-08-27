// Client-safe. NO server imports.
//
// Turns a non-`Error` crash value into a legible `message` and a discriminating
// `detail` for the app_events mirror. Imports `serializeError` by its OWN path:
// that module has no imports of its own, so this pulls in nothing else, whereas
// importing `@/lib/log` would drag the logger and the persist sink into the
// browser bundle (lib/observe/reportClientError.ts:1).
//
// Spec: docs/superpowers/specs/observability/2026-08-26-observe-error-telemetry.md §6.2
//
// DOCUMENTED LIMITS this module owns (spec §9):
//  - limit 1: `serializeError`'s ratified §4 limit 5 travels with the helper. An
//    object with no own enumerable keys and no informative `String()` form
//    degrades to its type name — a `Map` becomes "[object Map]". A surfaced type
//    name is not a silent loss, and the tag below separates it from the STRING
//    "[object Map]".
//  - limit 2: `detail` is plain-sliced at the wire's cap, so a truncated value is
//    no longer parseable JSON. The route re-caps with its own plain slice
//    (app/api/observe/client-error/route.ts:51), so a marker appended here would
//    not survive end to end.
//  - limit 6: `-0` and `0` share a row. `String(-0)` is "0" and so is
//    `JSON.stringify(-0)`; only `Object.is` or `1 / x` separates them and neither
//    survives a JSON wire body.
//  - limit 7: a `Date` inside one second, and a `RegExp` differing only in
//    `lastIndex`, share a row. Both reach this module as strings already, because
//    serializeError degraded them via `String(value)`.
//  - limit 8: two crashes identical for their first 200 `detail` characters and
//    first 1000 `message` characters dedup to one POST.
// Re-run trigger for 6, 7 and the discrimination claim generally:
//   node --import tsx docs/superpowers/specs/observability/probes/2026-08-26-client-value-projection.ts
import { serializeError } from "@/lib/log/serializeError";

/**
 * The value's runtime type, DERIVED rather than enumerated: a type nobody has
 * thought of gets its own tag instead of falling into a default that collides.
 * This is what separates the number `0` from the string `"0"` once
 * serializeError has mapped both to the text "0".
 */
function tag(value: unknown): string {
  if (value === null) return "null";
  const t = typeof value;
  if (t !== "object") return t;
  // TOTAL, like serializeError itself. Reading `.constructor` invokes a getter,
  // and a Proxy with a throwing `get` trap makes that throw — measured, not
  // imagined. Unguarded, the throw escapes describeClientValue and then the
  // handler that called it, so the crash this module exists to record is the one
  // crash it loses, and it emits an uncaught error on the way out.
  //
  // A projection whose whole job is "no value, however strange, breaks anything"
  // must not itself be the thing that breaks. That is worth three lines
  // regardless of whether a throwing Proxy is inside the threat fence.
  try {
    const ctor = (value as object).constructor;
    return typeof ctor === "function" && ctor.name ? ctor.name : "object";
  } catch {
    return "object";
  }
}

/**
 * Renders serializeError's already-bounded output to text.
 *
 * NOT `JSON.stringify`, and not a second serializer — it formats what the helper
 * captured rather than deciding what to capture. JSON's number grammar has no
 * `NaN` and no infinities, so it writes all three as `null`, destroying
 * distinctions serializeError deliberately preserved one layer up: `{ a: NaN }`
 * and `{ a: null }` become the same text and the second crash is dropped.
 * `String()` at every leaf keeps them. One rule, no per-type cases.
 */
function render(node: unknown): string {
  if (typeof node === "string") return JSON.stringify(node);
  if (node === null) return "null";
  if (Array.isArray(node)) return `[${node.map(render).join(",")}]`;
  if (typeof node === "object") {
    const o = node as Record<string, unknown>;
    return `{${Object.keys(o)
      .map((k) => `${JSON.stringify(k)}:${render(o[k])}`)
      .join(",")}}`;
  }
  return String(node); // number (NaN and the infinities survive), boolean, bigint
}

/**
 * `message` is a human-legible label and NOTHING more; `detail` is what
 * discriminates. An earlier design made the label the dedup key, and a label
 * built from three fields collides in at least four ordinary ways — same triple
 * with different other fields, different field identity with the same text, an
 * ambiguous `": "` join, and divergence past the message cap. The repair was to
 * stop asking it to: `lib/observe/clientErrorTransport.ts` puts `detail` in the
 * signature.
 */
export function describeClientValue(value: unknown): { message: string; detail: string } {
  let s: ReturnType<typeof serializeError>;
  try {
    s = serializeError(value);
  } catch {
    return { message: "(no message)", detail: `${tag(value)} [Unserializable]` };
  }
  if (typeof s === "string") {
    // Every primitive, and every object serializeError degraded to its String()
    // form. Tagged, because the rendering alone is ambiguous across types.
    return { message: s || "(no message)", detail: `${tag(value)} ${s}` };
  }
  let detail: string;
  try {
    detail = render(s);
  } catch {
    detail = "";
  }
  const parts: string[] = [];
  if (!Array.isArray(s)) {
    for (const k of ["name", "code", "message"] as const) {
      const v = (s as Record<string, unknown>)[k];
      if (typeof v === "string" && v !== "") parts.push(v);
    }
  }
  return { message: parts.length > 0 ? parts.join(": ") : "(no message)", detail };
}
