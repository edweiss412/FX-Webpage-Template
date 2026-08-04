/**
 * The mutant overlay (spec §3.3).
 *
 * A Vite `load` hook that serves mutated text for exactly one module id. The
 * tracked source file is never written to, so a crashed or killed run cannot
 * leave a mutant on disk, and concurrent runs cannot race on the working tree.
 *
 * This is the harness's highest-consequence surface. If the hook fails to
 * recognise its target, every mutant runs against CLEAN source: the suite
 * passes each time, the run reports a perfect score, and nothing was tested.
 * The recognition rules below are therefore deliberately narrow in one
 * direction and deliberately tolerant in the other:
 *
 *   - tolerant of a query suffix, because Vite resolves ids with `?v=`,
 *     `?import` and friends, and an equality-only check would silently fall
 *     through to the clean file;
 *   - narrow about everything else, because a suffix match (`endsWith`) would
 *     overlay any same-named module anywhere in the graph and mutate the wrong
 *     file.
 */
export type MutantLoadHook = (id: string) => string | null;

/** Strip the Vite query/hash suffix from a resolved module id. */
const bareId = (id: string): string => id.split("?")[0]!.split("#")[0]!;

/**
 * Build the `load` hook for one mutant.
 *
 * @param targetAbs absolute, resolved path of the module under mutation
 * @param mutantSource full mutated source text to serve in its place
 */
export function createMutantLoadHook(targetAbs: string, mutantSource: string): MutantLoadHook {
  return (id: string): string | null => (bareId(id) === targetAbs ? mutantSource : null);
}

/**
 * The Vite plugin wrapper. `enforce: "pre"` so the overlay wins before any
 * other plugin can load the real file from disk.
 */
export function mutantOverlayPlugin(
  targetAbs: string,
  mutantSource: string,
): { name: string; enforce: "pre"; load: MutantLoadHook } {
  return {
    name: "mutant-overlay",
    enforce: "pre",
    load: createMutantLoadHook(targetAbs, mutantSource),
  };
}
