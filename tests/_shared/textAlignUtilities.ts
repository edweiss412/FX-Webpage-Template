/**
 * Every Tailwind utility that sets `text-align`, DERIVED from the installed
 * package rather than typed out.
 *
 * WHY DERIVED. Diff review r2 finding 2: two alignment guards excluded only
 * `text-right` and `text-center`, so adding `text-end` to either shipped
 * paragraph passed both. In the app's LTR direction `text-end` resolves to the
 * same visual result as `text-right`, which recreated the exact ragged-start
 * defect the guards existed to prevent. A hand-written deny-list fails open on
 * the member nobody thought of; that is the same failure mode as round 1's
 * hand-written retirement list, one layer down.
 *
 * So the set is read out of Tailwind's own compiled utility table. A future
 * Tailwind release that adds another alignment utility is covered the day it
 * lands, without anyone remembering to widen a literal.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";

/** The `text-align` utilities Tailwind actually ships, as class names. */
export function tailwindTextAlignUtilities(): string[] {
  // `tailwindcss/dist/lib.js` is not an exported subpath, so resolve the
  // package's own package.json and walk to the file from there.
  const require = createRequire(import.meta.url);
  const pkgRoot = dirname(require.resolve("tailwindcss/package.json"));
  const lib = readFileSync(join(pkgRoot, "dist", "lib.js"), "utf8");

  // Tailwind registers static utilities as e("<name>",[["<prop>","<value>"]]).
  // Match only the ones whose single declaration is `text-align`.
  const found = new Set<string>();
  const pattern = /["'`]?(text-[a-z]+)["'`]?\s*,\s*\[\s*\[\s*["'`]text-align["'`]\s*,/g;
  for (const m of lib.matchAll(pattern)) {
    const name = m[1];
    if (name !== undefined) found.add(name);
  }

  const names = [...found].sort();

  // PREMISE. If Tailwind's internal shape changes, this extractor silently
  // returns a short list and every guard built on it quietly stops guarding.
  // These two are the floor: `text-right` is the utility the original defect
  // used, and `text-end` is the one that escaped review round 2.
  if (!names.includes("text-right") || !names.includes("text-end")) {
    throw new Error(
      `text-align utility extraction looks broken — got [${names.join(", ")}]. ` +
        `Expected at least text-right and text-end. Fix the extractor rather than ` +
        `hardcoding a list, or the guards that use it are inert.`,
    );
  }
  return names;
}

/**
 * Does a class token set `text-align`, under ANY Tailwind variant?
 *
 * Diff review r3 finding 2: the guards compared COMPLETE tokens against the
 * unprefixed utilities, so `max-sm:text-right` passed while compiling to
 * `@media (width < 40rem) { text-align: right }` — right-aligned at both of the
 * widths this arc measures. Variants stack and are open-ended (`sm:`, `max-sm:`,
 * `dark:`, `group-hover:`, arbitrary `[&>*]:`), so the check cannot enumerate
 * them either. It strips everything up to the last colon and asks whether what
 * remains is an alignment utility, which holds for any prefix combination.
 *
 * `!` important markers are stripped from both ends too: Tailwind accepts
 * `!text-right` and `text-right!` depending on version, and both align.
 */
export function isTextAlignToken(token: string, utilities: string[]): boolean {
  const lastColon = token.lastIndexOf(":");
  const bare = (lastColon === -1 ? token : token.slice(lastColon + 1)).replace(/^!+|!+$/g, "");
  return utilities.includes(bare);
}
