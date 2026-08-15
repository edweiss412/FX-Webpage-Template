// Pure constants for the one committed font face, shared by the Vitest guards,
// the harness toolchain and the Playwright specs.
//
// NO TEST-FRAMEWORK IMPORT MAY EVER ENTER THIS FILE. `tests/e2e/helpers/
// liveEntryToolchain.ts` imports these and runs inside Playwright processes; a
// Vitest declaration evaluated outside a Vitest suite throws "Vitest failed to
// find the current suite". That is why these live here rather than being
// exported from the `*.test.ts` that asserts on them — the same pure-core split
// `tests/docs/_invariant8Closeout.ts` uses beside its own walker test.

/**
 * The one binary the app and every harness render, relative to the repo root.
 *
 * THE FILENAME CARRIES A CONTENT HASH, and that is load-bearing rather than
 * decorative. `next/font` served this from `/_next/static/media/<hash>.woff2`
 * with `Cache-Control: public, max-age=31536000, immutable`; moving it under
 * `public/` dropped it to Next's `send` default of `max-age=0`, so every cold
 * navigation paid a conditional round-trip before the swap could resolve --
 * on a crew phone on venue 4G, which is the case that matters most.
 * `next.config.ts` restores the one-year immutable header, and `immutable` is
 * only honest if the URL changes when the bytes do. Replacing the font means
 * renaming this file, which is exactly the review event a font swap deserves.
 */
export const PUBLIC_FONT_PATH = "public/fonts/InterVariable-latin.d5549562.woff2";

/**
 * The URL `app/fonts.css` requests. `compileEntryCss` rewrites this to a bare
 * sibling filename for the harnesses, whose stylesheet sits in the same
 * directory as the copied binary rather than at a server root.
 */
export const PUBLIC_FONT_URL = "/fonts/InterVariable-latin.d5549562.woff2";

/** Bare sibling form of the same file, as the harness-emitted CSS references it. */
export const HARNESS_FONT_FILENAME = "InterVariable-latin.d5549562.woff2";

/**
 * Digest of the committed bytes. Measured, not copied from documentation —
 * `public/fonts/PROVENANCE.md` records the same value, and the two agreeing is
 * the point.
 */
export const EXPECTED_SHA256 = "d554956247d03a2513f0514aebbfc9ec07e891409855b81be32ba723cc08407b";

/**
 * The family the hand-written stylesheet declares. Capital `Inter`, which is
 * also the first literal in `app/globals.css`'s `--font-sans` var() fallback.
 *
 * BOTH the app and the harnesses resolve the face through the `--font-inter`
 * TOKEN. An earlier version of this comment claimed the harnesses resolved the
 * inline literal instead, "because compileEntryCss emits no token definition at
 * all" — that was measured against the compiled `globals.css` ALONE and stopped
 * being true the moment the post-step landed, since it appends `app/fonts.css`
 * WHOLE, `:root { --font-inter }` included. Verified: the emitted harness
 * stylesheet contains exactly one definition of the token.
 *
 * The literal is therefore a SAFETY NET rather than the binding mechanism —
 * kept deliberately so the declaration stays valid at computed-value time on any
 * surface that somehow lacks the token, which is what the spec ratified. The
 * guard pinning literal and declared family together is defense in depth, not
 * the primary contract.
 *
 * (`next/font/local` generated a LOWERCASE `inter` from its module variable
 * name. Nothing depended on the spelling, because `tests/e2e/font-binding.spec.ts`
 * reads both family names out of the token rather than naming either.)
 */
export const FONT_FAMILY = "Inter";

/** The metric-matched companion, second entry in `--font-inter`. */
export const FALLBACK_FAMILY = "Inter Fallback";
