/**
 * lib/planFences/registry.ts — the KNOWN-API registry, a closed list.
 *
 * `UNIMPORTED_IDENTIFIER` fires only on names in here (spec §2.1). Documented
 * limit 2 states the trade plainly: an API outside this list escapes BY DESIGN.
 * That is the price of a rule that never guesses — a name the gate does not know
 * could be a local helper defined in a neighbouring fence, and flagging it would
 * make the gate wrong on correct plans, which is the failure that gets a gate
 * disabled rather than fixed.
 *
 * The list GROWS BY COMMIT, with the corpus re-run in the same commit so the
 * baseline consequences of a widening are visible at the moment it lands.
 */

/** vitest globals a plan fence would use without importing. */
const VITEST = [
  "describe",
  "it",
  "test",
  "expect",
  "vi",
  "beforeAll",
  "afterAll",
  "beforeEach",
  "afterEach",
] as const;

/** The node:fs / node:path names that actually appear in this corpus's fences. */
const NODE = [
  "readFileSync",
  "writeFileSync",
  "existsSync",
  "readdirSync",
  "mkdirSync",
  "rmSync",
  "statSync",
  "join",
  "resolve",
  "dirname",
  "basename",
  "relative",
  "execFileSync",
  "execSync",
  "spawnSync",
] as const;

/** testing-library names. */
const TESTING_LIBRARY = [
  "render",
  "screen",
  "fireEvent",
  "waitFor",
  "within",
  "act",
  "cleanup",
  "renderHook",
] as const;

export const KNOWN_API: ReadonlySet<string> = new Set<string>([
  ...VITEST,
  ...NODE,
  ...TESTING_LIBRARY,
]);
