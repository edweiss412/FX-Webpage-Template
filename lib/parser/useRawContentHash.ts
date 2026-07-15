import { createHash } from "node:crypto";

/**
 * Content-pin hashing for "use the sheet's raw value" decisions
 * (spec 2026-07-10-structural-transform-use-raw §5).
 *
 * The pin is on the CANONICAL (whitespace-collapsed) form of the raw cell so a
 * cosmetic whitespace edit does NOT invalidate a decision, while any substantive
 * edit does. rooms/hotels pin `sha256hex(collapse(rawSnippet))`; dates pin a
 * length-prefixed join of the block's collapsed date tokens (so re-ordering or
 * editing any token changes the hash). These are the SINGLE source of the
 * `resolution.contentHash` the parser attaches and the overlay/actions compare.
 */

/** Whitespace-collapse: fold every run of whitespace to one space, trim ends. */
export function collapse(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

function sha256hex(s: string): string {
  return createHash("sha256").update(s, "utf8").digest("hex");
}

/**
 * The exact shape every `resolution.contentHash` takes: `sha256hex` returns
 * `createHash("sha256").digest("hex")` — always exactly 64 lowercase hex chars.
 * This is the SINGLE source for that format, so the JSONB validation boundary
 * (`normalizeUseRawDecisions`) can drop any persisted row whose `contentHash` is
 * not a real content pin (corrupt jsonb) rather than trusting a nonblank string.
 */
export const USE_RAW_CONTENT_HASH_RE = /^[0-9a-f]{64}$/;

/** True iff `s` is a well-formed use-raw content pin (64 lowercase hex chars). */
export function isContentHash(s: string): boolean {
  return USE_RAW_CONTENT_HASH_RE.test(s);
}

/** Content hash for a rooms/hotels raw cell — hash of its collapsed form. */
export function contentHashForRawSnippet(rawSnippet: string): string {
  return sha256hex(collapse(rawSnippet));
}

/**
 * Content hash for a DATES block. Serializes each token's collapsed raw as
 * `<len>:<collapsed>` (empty → `0:`) joined by US (\x1f), then sha256hex. The
 * length prefix makes the join injective, so no token-boundary collision is
 * possible regardless of the raw contents.
 */
export function contentHashForDateTokens(rawTokens: string[]): string {
  const serialized = rawTokens
    .map((raw) => {
      const c = collapse(raw);
      return `${c.length}:${c}`;
    })
    .join("\x1f");
  return sha256hex(serialized);
}
