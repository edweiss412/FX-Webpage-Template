/**
 * tests/components/offline/_durationTokens.ts
 *
 * The saved-copy bar's `updated` fade runs on the duration-normal token, so
 * its tests read the token's length from its definition in app/globals.css
 * rather than restating 220. One reader, shared by every file that needs it,
 * so they cannot disagree about what the token is.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

/** `--duration-normal` in milliseconds, as app/globals.css defines it. Throws when it is not defined in ms. */
export function durationNormalMs(): number {
  const css = readFileSync(join(process.cwd(), "app", "globals.css"), "utf8");
  const match = /--duration-normal:\s*(\d+)ms;/.exec(css);
  if (match === null) throw new Error("app/globals.css defines no --duration-normal in ms");
  return Number(match[1]);
}
