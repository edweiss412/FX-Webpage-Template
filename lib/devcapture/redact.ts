/**
 * lib/devcapture/redact.ts - §4.5 value-walk redaction for the dev capture
 * bundle. Pure; no imports. Applies three rules to every string VALUE and
 * every object KEY in the tree:
 *   1. email grammar        -> "[email redacted]"
 *   2. hex runs >= 32 chars -> "[redacted]"   (share token is 64-hex)
 *   3. JWT shape            -> "[redacted]"
 * Exemption (rule 2 only): meta.commitSha / server.commitSha when the value
 * is EXACTLY 40 hex chars (git SHA provenance).
 */
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const HEX_RE = /[0-9a-fA-F]{32,}/g;
const JWT_RE = /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g;
const SHA40_RE = /^[0-9a-f]{40}$/i;

function redactString(s: string, hexExempt: boolean): string {
  // §4.5 rule order is fixed: email (1), hex (2), JWT (3).
  let out = s.replace(EMAIL_RE, "[email redacted]");
  if (!(hexExempt && SHA40_RE.test(s))) out = out.replace(HEX_RE, "[redacted]");
  return out.replace(JWT_RE, "[redacted]");
}

function walk(node: unknown, path: readonly string[]): unknown {
  if (typeof node === "string") {
    const hexExempt =
      path.length === 2 && (path[0] === "meta" || path[0] === "server") && path[1] === "commitSha";
    return redactString(node, hexExempt);
  }
  if (Array.isArray(node)) return node.map((v, i) => walk(v, [...path, String(i)]));
  if (node !== null && typeof node === "object") {
    // Null-prototype + defineProperty: a plain `out[key] =` would invoke the
    // prototype setter for an own "__proto__" key (dropping the key and
    // mutating the rebuilt object's prototype) instead of copying it.
    const out: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      Object.defineProperty(out, redactString(k, false), {
        value: walk(v, [...path, k]),
        enumerable: true,
        writable: true,
        configurable: true,
      });
    }
    return out;
  }
  return node;
}

export function redactTelemetry(doc: unknown): unknown {
  return walk(doc, []);
}
