#!/usr/bin/env tsx
import { pathToFileURL } from "node:url";

import {
  type DeterminismInput,
  type DeterminismOutcome,
  renderDeterminism,
  runDeterminism,
} from "../tests/mutation/source/determinism";

/**
 * `pnpm mutation:determinism --surface <id> --site <siteId> --runs <n>`
 *
 * A THIN adapter over `tests/mutation/source/determinism`. Every decision lives
 * in the core, which is an importable module with in-process assertions (AC-9);
 * this file exists only to turn argv into a core call and a core result into
 * text, and it is kept thin deliberately — a branch that lives here is a branch
 * the source-mutation runner cannot overlay.
 *
 * RENDERING FIDELITY AND WIRING ARE SEPARATE PROPERTIES AND ARE PROVED
 * SEPARATELY. A correct renderer sitting in front of an entry that never invokes
 * the core — or that prints fabricated output — passes every output assertion
 * while the operator-facing command reports nothing the core produced. So `main`
 * takes its collaborators as `deps`, a spy proves it CALLS them with the
 * operator's arguments, and `DEFAULT_DEPS` is separately asserted to be bound to
 * the real core so the injectable seam cannot certify a production path that is
 * wired to something else.
 */

export type Deps = {
  run: (input: DeterminismInput) => DeterminismOutcome;
  render: (outcome: DeterminismOutcome) => string;
  write: (text: string) => void;
};

export const DEFAULT_DEPS: Deps = {
  run: runDeterminism,
  render: renderDeterminism,
  write: (text) => process.stdout.write(text),
};

export type ParsedArgv = {
  surface: string | undefined;
  site: string | undefined;
  runs: string | undefined;
};

/**
 * `--flag value` only.
 *
 * A missing value reads as `undefined` rather than as the next flag: `--runs
 * --surface x` must refuse on `--runs`, not silently take the string
 * `"--surface"` and then fail somewhere less legible.
 */
export function parseArgv(argv: readonly string[]): ParsedArgv {
  const read = (name: string): string | undefined => {
    const i = argv.indexOf(`--${name}`);
    if (i === -1) return undefined;
    const value = argv[i + 1];
    if (value === undefined || value.startsWith("--")) return undefined;
    return value;
  };
  return { surface: read("surface"), site: read("site"), runs: read("runs") };
}

export const EXIT_OK = 0;
/** Every refusal is a usage error and exits 2, emitting NO distribution. */
export const EXIT_REFUSED = 2;
/**
 * A distribution WAS produced, and its inputs moved while it was being produced.
 * Distinct from `EXIT_REFUSED` on purpose: that code promises NO distribution was
 * emitted, and reusing it here would make one of the two claims false. Distinct
 * from `EXIT_OK` because exit 0 is what a caller reads as certified.
 */
export const EXIT_UNATTRIBUTABLE = 3;

export function main(argv: readonly string[], deps: Deps = DEFAULT_DEPS): number {
  const parsed = parseArgv(argv);
  const outcome = deps.run({
    surface: parsed.surface ?? "",
    site: parsed.site ?? "",
    runs: parsed.runs,
  });
  deps.write(`${deps.render(outcome)}\n`);
  if (outcome.kind === "refusal") return EXIT_REFUSED;
  return outcome.inputsMoved.length > 0 ? EXIT_UNATTRIBUTABLE : EXIT_OK;
}

/* c8 ignore start — the process entry, exercised by running the command itself */
const invokedDirectly =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1] as string).href;
if (invokedDirectly) {
  process.exit(main(process.argv.slice(2)));
}
/* c8 ignore stop */
