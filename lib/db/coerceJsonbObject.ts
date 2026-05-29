import type { ParseResult } from "@/lib/parser/types";

/**
 * Typed, catchable failure for a jsonb value that cannot be interpreted as an
 * object. Callers turn this into a typed `errorResponse(...)` (JSON body) rather
 * than letting a raw `TypeError` escape as an empty 500.
 */
export class JsonbCoercionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "JsonbCoercionError";
  }
}

/**
 * The single read boundary for a jsonb column that must be an OBJECT, read
 * through postgres.js.
 *
 * Why this exists: postgres.js serializes a jsonb parameter by running its own
 * JSON serializer on the JS value. A write site that passed `JSON.stringify(obj)`
 * (a string) for a `$N::jsonb` param therefore DOUBLE-ENCODED it into a jsonb
 * STRING SCALAR. postgres.js reads that back as a JS `string`, and dereferencing
 * a nested field (`value.show.title`) throws an uncaught `TypeError` → empty 500.
 *
 * This coercer tolerates BOTH shapes so a legacy double-encoded row still reads:
 *   - a real object (correctly-encoded jsonb) → returned as-is,
 *   - a JSON-string-of-object (legacy double-encoded scalar) → parsed once,
 * and converts anything else (null, array, scalar, unparseable) into a typed
 * `JsonbCoercionError` the caller can map to a JSON error response.
 *
 * Mirrors `parseTriggeredReviewItems` (the same class for the gate column).
 */
export function coerceJsonbObject<T = Record<string, unknown>>(
  value: unknown,
  label = "jsonb value",
): T {
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    return value as T;
  }
  if (typeof value === "string") {
    let decoded: unknown;
    try {
      decoded = JSON.parse(value);
    } catch {
      throw new JsonbCoercionError(`${label} is an unparseable JSON string`);
    }
    if (decoded !== null && typeof decoded === "object" && !Array.isArray(decoded)) {
      return decoded as T;
    }
    throw new JsonbCoercionError(`${label} decoded to a non-object (${typeof decoded})`);
  }
  throw new JsonbCoercionError(
    `${label} is ${value === null ? "null" : typeof value} (expected an object)`,
  );
}

/**
 * The array peer of {@link coerceJsonbObject}, for jsonb columns that must be an
 * ARRAY read through postgres.js (e.g. `wizard_reviewer_choices`). A legacy
 * double-encoded row comes back as a JSON-string-of-array scalar; this decodes
 * it once. `null`/`undefined` are legitimately empty (the callers already treat
 * a missing value as `[]`). Anything else (object, scalar, unparseable) becomes
 * a typed `JsonbCoercionError` — so a legacy scalar is never re-written raw into
 * a `$N::jsonb` audit column, preserving the corruption.
 */
export function coerceJsonbArray<T = unknown>(value: unknown, label = "jsonb array"): T[] {
  if (Array.isArray(value)) return value as T[];
  if (value === null || value === undefined) return [];
  if (typeof value === "string") {
    let decoded: unknown;
    try {
      decoded = JSON.parse(value);
    } catch {
      throw new JsonbCoercionError(`${label} is an unparseable JSON string`);
    }
    if (Array.isArray(decoded)) return decoded as T[];
    throw new JsonbCoercionError(`${label} decoded to a non-array (${typeof decoded})`);
  }
  throw new JsonbCoercionError(`${label} is ${typeof value} (expected an array)`);
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

/**
 * `parse_result`-specific coercer. Beyond decoding a legacy double-encoded
 * scalar (asParseResult tolerates a real object OR a JSON-string-of-object), it
 * validates the FULL non-optional ParseResult contract — so a corrupt-but-object
 * row (e.g. `{ show: {} }`, or one missing `hotelReservations`/`contacts`/...) is
 * rejected at the read boundary with a TYPED JsonbCoercionError rather than
 * throwing an uncaught TypeError in some downstream consumer.
 *
 * IMPORTANT (Codex R3→R4 convergence): the validated set mirrors the ParseResult
 * type in `lib/parser/types.ts` ONE-FOR-ONE, NOT a hand-picked list of "unsafe
 * derefs" — because that list was repeatedly under-enumerated (R3 missed the
 * arrays; R4 missed hotelReservations/transportation/contacts/raw_unrecognized
 * that `lib/sync/applyParseResult.ts` iterates). Mirroring the type means a new
 * consumer deref of ANY non-optional field is covered by construction. Every
 * field below is non-optional in a real ParseResult, so a genuine row (or a
 * legacy double-encoded one) always passes; only genuinely-corrupt data fails.
 * If the ParseResult type gains/loses a non-optional field, update this list AND
 * the contract test in tests/db/coerceJsonbObject.test.ts.
 */
export function asParseResult(value: unknown): ParseResult {
  const obj = coerceJsonbObject<Record<string, unknown>>(value, "parse_result");

  const show = obj.show;
  if (!isPlainObject(show)) {
    throw new JsonbCoercionError("parse_result.show is missing or not an object");
  }
  if (typeof show.title !== "string") {
    throw new JsonbCoercionError("parse_result.show.title is missing or not a string");
  }
  if (!isPlainObject(show.dates)) {
    throw new JsonbCoercionError("parse_result.show.dates is missing or not an object");
  }
  if (!Array.isArray((show.dates as Record<string, unknown>).showDays)) {
    throw new JsonbCoercionError("parse_result.show.dates.showDays is missing or not an array");
  }

  // Array fields (always present, possibly empty, in a real ParseResult).
  for (const field of [
    "crewMembers",
    "hotelReservations",
    "rooms",
    "contacts",
    "raw_unrecognized",
    "warnings",
    "hardErrors",
  ] as const) {
    if (!Array.isArray(obj[field])) {
      throw new JsonbCoercionError(`parse_result.${field} is missing or not an array`);
    }
  }

  // Object fields.
  if (!isPlainObject(obj.diagrams)) {
    throw new JsonbCoercionError("parse_result.diagrams is missing or not an object");
  }

  // Nullable object/array fields: must be present as null OR the right kind
  // (a scalar/string here would be a corrupt double-encode that downstream
  // consumers passing the value to `$::jsonb` or dereferencing would mishandle).
  if (obj.transportation !== null && !isPlainObject(obj.transportation)) {
    throw new JsonbCoercionError("parse_result.transportation must be an object or null");
  }
  if (obj.openingReel !== null && !isPlainObject(obj.openingReel)) {
    throw new JsonbCoercionError("parse_result.openingReel must be an object or null");
  }
  if (obj.pullSheet !== null && !Array.isArray(obj.pullSheet)) {
    throw new JsonbCoercionError("parse_result.pullSheet must be an array or null");
  }

  return obj as unknown as ParseResult;
}
