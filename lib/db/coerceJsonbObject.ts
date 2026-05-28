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
 * `parse_result`-specific coercer. Additionally asserts `.show` is an object so
 * the exact production `TypeError` (`parseResult.show.title` on a string) is
 * converted into a typed error at the read boundary, not deep in the publish SQL.
 */
export function asParseResult(value: unknown): ParseResult {
  const obj = coerceJsonbObject<Record<string, unknown>>(value, "parse_result");
  const show = obj.show;
  if (show === null || typeof show !== "object" || Array.isArray(show)) {
    throw new JsonbCoercionError("parse_result.show is missing or not an object");
  }
  return obj as unknown as ParseResult;
}
