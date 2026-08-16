// lib/log/serializeError.ts
/**
 * The single canonical "turn an unknown thrown value into a loggable shape"
 * helper. Structural for objects since fix/serialize-error-structure -- a plain
 * object (a Supabase/PostgREST returned-error) serializes to its own bounded
 * enumerable fields instead of collapsing to "[object Object]".
 *
 * Total function: never throws (it runs inside buildRecord on every log.*
 * call). Pure: no redaction here -- sanitizeContext is THE sanitization pass on
 * the persisted path. Spec:
 * docs/superpowers/specs/observability/2026-08-16-serialize-error-structure-design.md
 */

export const DEPTH_MAX = 3;
export const KEYS_MAX = 32;
export const ITEMS_MAX = 32;
export const STR_MAX = 500;
export const STACK_MAX = 8000;
export const NODES_MAX = 200;

export type SerializedError = string | Record<string, unknown> | unknown[];

const DROP = Symbol("drop");

type Budget = { nodes: number };

function capString(value: string): string {
  return value.slice(0, STR_MAX);
}

/** Bounded recursive capture. Depth 1 is the root; deeper than DEPTH_MAX truncates. */
function serializeValue(
  value: unknown,
  depth: number,
  budget: Budget,
  ancestors: WeakSet<object>,
): unknown {
  if (budget.nodes <= 0) return "[Truncated: budget]";
  budget.nodes -= 1;

  if (value === null) return null;
  const t = typeof value;
  if (t === "string") return capString(value as string);
  if (t === "number" || t === "boolean") return value;
  if (t === "bigint") return capString(String(value));
  // undefined / function / symbol VALUES: dropped from objects, null at array
  // positions (the sanitizeContext posture) -- signalled via DROP.
  if (t === "function" || t === "symbol" || t === "undefined") return DROP;

  const obj = value as object;
  if (ancestors.has(obj)) return "[Circular]";
  if (depth > DEPTH_MAX) return "[Truncated: depth]";
  ancestors.add(obj);
  try {
    if (Array.isArray(obj)) {
      const kept = obj.slice(0, ITEMS_MAX).map((item) => {
        const s = serializeValue(item, depth + 1, budget, ancestors);
        return s === DROP ? null : s;
      });
      if (obj.length > ITEMS_MAX) kept.push(`[+${obj.length - ITEMS_MAX} more]`);
      return kept;
    }
    if (obj instanceof Error) return serializeErrorInstance(obj, depth, budget, ancestors);
    return serializePlainObject(obj, depth, budget, ancestors);
  } finally {
    ancestors.delete(obj);
  }
}

/**
 * Own enumerable string-keyed fields, keys sliced like values, null-prototype
 * accumulator so an own "__proto__" key is captured instead of hitting the
 * inherited setter. Keys listed with Object.keys (does not invoke getters);
 * each property read individually so a throwing getter poisons one field, not
 * the object.
 */
function serializePlainObject(
  obj: object,
  depth: number,
  budget: Budget,
  ancestors: WeakSet<object>,
): unknown {
  const out: Record<string, unknown> = Object.create(null);
  const keys = Object.keys(obj);
  for (const key of keys.slice(0, KEYS_MAX)) {
    let raw: unknown;
    try {
      raw = (obj as Record<string, unknown>)[key];
    } catch {
      out[capString(key)] = "[Throwing getter]";
      continue;
    }
    const s = serializeValue(raw, depth + 1, budget, ancestors);
    if (s !== DROP) out[capString(key)] = s;
  }
  if (keys.length > KEYS_MAX) out["~truncated"] = `${keys.length - KEYS_MAX} more keys`;
  if (keys.length === 0) {
    // Non-plain object with no capturable fields (Date, RegExp, URL, custom
    // toString): degrade to its string form when that form says more than
    // "[object Object]".
    const text = String(obj);
    if (text !== "[object Object]") return capString(text);
  }
  return out;
}

/**
 * Error branch: bounded own-enumerable capture first, protocol triple written
 * last so it wins collisions (PostgrestError has an own enumerable `name`),
 * plus the two standard own NON-enumerable payload fields this runtime
 * defines: `cause` and (AggregateError) `errors`.
 */
function serializeErrorInstance(
  error: Error,
  depth: number,
  budget: Budget,
  ancestors: WeakSet<object>,
): Record<string, unknown> {
  const captured = serializePlainObject(error, depth, budget, ancestors);
  const out: Record<string, unknown> = Object.create(null);
  if (typeof captured === "object" && captured !== null && !Array.isArray(captured)) {
    Object.assign(out, captured);
  }
  out.name = capString(String(error.name));
  out.message = capString(String(error.message));
  if (typeof error.stack === "string") out.stack = error.stack.slice(0, STACK_MAX);
  if ("cause" in error && error.cause !== undefined) {
    const cause = serializeValue(error.cause, depth + 1, budget, ancestors);
    if (cause !== DROP) out.cause = cause;
  }
  const aggregate = (error as Partial<AggregateError>).errors;
  if (Array.isArray(aggregate)) {
    out.errors = serializeValue(aggregate, depth + 1, budget, ancestors);
  }
  return out;
}

export function serializeError(error: unknown): SerializedError {
  try {
    if (error !== null && (typeof error === "object" || error instanceof Error)) {
      const budget: Budget = { nodes: NODES_MAX };
      const result = serializeValue(error, 1, budget, new WeakSet<object>());
      return result === DROP ? capString(String(error)) : (result as SerializedError);
    }
    // Primitives (null, undefined, string, number, boolean, bigint, symbol)
    // and functions: the pre-redesign behavior plus the string cap.
    return capString(String(error));
  } catch {
    return "[Unserializable]";
  }
}
