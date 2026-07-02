// SERVER-ONLY module — never import from a "use client" file (it pulls in node:crypto
// via sha256Base64Url). Enforced by tests/dataQuality/clientBundleBoundary.test.ts.
import { sha256Base64Url } from "@/lib/crypto/sha256";
import type { ParseWarning } from "@/lib/parser/types";
import { normalizeSnippet, hasIgnorableSnippet } from "./ignorableSnippet";

/** Content-key for ignore state. Returns null when the warning is not ignorable. */
export function warningFingerprint(w: Pick<ParseWarning, "code" | "rawSnippet">): string | null {
  if (!hasIgnorableSnippet(w)) return null;
  const normalized = normalizeSnippet(w.rawSnippet as string);
  // Single-space delimiter: codes are [A-Z_]+ (no spaces), so `code + " " + snippet`
  // splits uniquely at the first space (no collision).
  return sha256Base64Url(Buffer.from(`${w.code} ${normalized}`, "utf8"));
}
