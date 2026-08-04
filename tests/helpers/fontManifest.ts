// Pure constants for the one committed font face, shared by the Vitest guards,
// the harness toolchain and the Playwright specs.
//
// NO TEST-FRAMEWORK IMPORT MAY EVER ENTER THIS FILE. `tests/e2e/helpers/
// liveEntryToolchain.ts` imports these and runs inside Playwright processes; a
// Vitest declaration evaluated outside a Vitest suite throws "Vitest failed to
// find the current suite". That is why these live here rather than being
// exported from the `*.test.ts` that asserts on them — the same pure-core split
// `tests/docs/_invariant8Closeout.ts` uses beside its own walker test.

/** The one binary the app and every harness render, relative to the repo root. */
export const PUBLIC_FONT_PATH = "public/fonts/InterVariable-latin.woff2";

/**
 * The URL `app/fonts.css` requests. `compileEntryCss` rewrites this to a bare
 * sibling filename for the harnesses, whose stylesheet sits in the same
 * directory as the copied binary rather than at a server root.
 */
export const PUBLIC_FONT_URL = "/fonts/InterVariable-latin.woff2";

/** Bare sibling form of the same file, as the harness-emitted CSS references it. */
export const HARNESS_FONT_FILENAME = "InterVariable-latin.woff2";

/**
 * Digest of the committed bytes. Measured, not copied from documentation —
 * `public/fonts/PROVENANCE.md` records the same value, and the two agreeing is
 * the point.
 */
export const EXPECTED_SHA256 = "fada467be8d8ebb5dccc346d29dc6ea37423da14c87dafed009631cb85632a54";

/**
 * The family the hand-written stylesheet declares. Capital `Inter`, which is
 * also the first literal in `app/globals.css`'s `--font-sans` var() fallback —
 * and that agreement is load-bearing, not incidental. The app resolves the face
 * through the `--font-inter` token; every harness resolves it through that
 * literal, because `compileEntryCss` emits no token definition at all. Rename
 * one without the other and all 32 harness callers fall back to the ambient
 * host font while every other guard row stays green.
 *
 * (`next/font/local` generated a LOWERCASE `inter` from its module variable
 * name. Nothing depended on the spelling, because `tests/e2e/font-binding.spec.ts`
 * reads both family names out of the token rather than naming either.)
 */
export const FONT_FAMILY = "Inter";

/** The metric-matched companion, second entry in `--font-inter`. */
export const FALLBACK_FAMILY = "Inter Fallback";
