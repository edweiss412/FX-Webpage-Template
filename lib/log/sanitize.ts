// lib/log/sanitize.ts
const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const REDACTED = "[email-redacted]";

export function redactEmails(input: string): string {
  // Replacer function: REDACTED carries no `$` today, so this changes nothing now and cannot
  // start changing something if the placeholder is ever edited (spec §6, the hygiene wraps).
  return input.replace(EMAIL_RE, () => REDACTED);
}

type Json = string | number | boolean | null | Json[] | { [k: string]: Json };
const DROP = Symbol("drop");

function sanitizeValue(value: unknown, seen: WeakSet<object>): Json | typeof DROP {
  if (value === null) return null;
  const t = typeof value;
  if (t === "string") return redactEmails(value as string);
  if (t === "number") return Number.isFinite(value as number) ? (value as number) : String(value);
  if (t === "boolean") return value as boolean;
  if (t === "bigint") return (value as bigint).toString();
  if (t === "function" || t === "symbol" || t === "undefined") return DROP;

  const obj = value as object;
  if (seen.has(obj)) return "[Circular]";
  seen.add(obj);
  try {
    if (Array.isArray(obj)) {
      // arrays keep positions; a dropped element becomes null so indices don't shift
      return obj.map((item) => {
        const s = sanitizeValue(item, seen);
        return s === DROP ? null : s;
      });
    }
    // Null-prototype accumulator: a plain {} loses an own "__proto__" key to
    // the inherited setter (the value silently becomes the accumulator's
    // prototype). Keys are redacted like values -- an email-bearing key is a
    // leak channel once structure survives serialization.
    const out: { [k: string]: Json } = Object.create(null) as { [k: string]: Json };
    for (const [k, v] of Object.entries(obj)) {
      const s = sanitizeValue(v, seen);
      if (s !== DROP) out[redactEmails(k)] = s;
    }
    return out;
  } finally {
    // only true ancestor cycles count; release so sibling repeats aren't flagged
    seen.delete(obj);
  }
}

export function sanitizeContext(
  message: string,
  context: Record<string, unknown>,
): { message: string; context: Record<string, unknown> } {
  const seen = new WeakSet<object>();
  const sanitized = sanitizeValue(context, seen);
  const safeContext =
    sanitized !== DROP &&
    sanitized !== null &&
    typeof sanitized === "object" &&
    !Array.isArray(sanitized)
      ? (sanitized as Record<string, unknown>)
      : {};
  return { message: redactEmails(message), context: safeContext };
}
