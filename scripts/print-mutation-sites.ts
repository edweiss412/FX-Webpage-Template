/**
 * scripts/print-mutation-sites.ts
 *
 * Prints the CURRENT mutation site ids for every surface enrolled in
 * `tests/mutation/source/registry.ts`, or for the surfaces named as arguments.
 *
 *   pnpm mutation:sites                          # every enrolled surface
 *   pnpm mutation:sites scripts/scan-interaction-timings.ts
 *
 * WHY THIS EXISTS. A siteId is keyed by LINE, so ANY edit to an enrolled source
 * shifts every accepted row below it and the gate reports the whole set stale by
 * construction — including edits that change no behaviour at all, like adding a
 * comment. On one arc that happened three times in eight review rounds, each
 * time costing a round to notice and a hand-transcription to repair. The repair
 * was always mechanical, which is the definition of something that should be a
 * command rather than a habit.
 *
 * Run it as the LAST step before pushing a change to an enrolled source, and
 * paste the ids it prints into the registry's `accepted` rows. It reads the
 * registry from disk, so a newly enrolled surface is covered the day it lands.
 */
import { readFileSync } from "node:fs";

import { enumerateSites, siteId } from "../tests/mutation/source/operators";
import { GUARD_SURFACES } from "../tests/mutation/source/registry";

type Surface = {
  readonly id: string;
  readonly sourcePath: string;
  readonly operators: readonly string[];
  readonly accepted: readonly { readonly siteId: string }[];
};

const requested = process.argv.slice(2);
const surfaces = (GUARD_SURFACES as readonly Surface[]).filter(
  (s) => requested.length === 0 || requested.includes(s.sourcePath) || requested.includes(s.id),
);

if (surfaces.length === 0) {
  console.error(`no enrolled surface matches: ${requested.join(", ")}`);
  process.exit(2);
}

let staleTotal = 0;
for (const surface of surfaces) {
  const source = readFileSync(surface.sourcePath, "utf8");
  const live = new Set(
    enumerateSites(surface.sourcePath, source, surface.operators as never).map(siteId),
  );
  const stale = surface.accepted.filter((row) => !live.has(row.siteId));
  staleTotal += stale.length;

  console.log(`\n# ${surface.id} — ${surface.sourcePath}`);
  if (surface.accepted.length === 0) {
    console.log("  (no accepted rows)");
  }
  for (const row of surface.accepted) {
    console.log(`  ${live.has(row.siteId) ? "ok    " : "STALE "} ${row.siteId}`);
  }
  if (stale.length > 0) {
    // Everything except the LINE is stable across an edit, so matching on
    // operator + column + replacement usually names exactly one successor and
    // the repair is a copy rather than a search. Where it names several, the
    // edit really did change the code and a human has to look.
    const withoutLine = (id: string) => {
      const [operator, , column, ...replacement] = id.split(":");
      return `${operator}:${column}:${replacement.join(":")}`;
    };
    const byShape = new Map<string, string[]>();
    for (const id of live) {
      const key = withoutLine(id);
      byShape.set(key, [...(byShape.get(key) ?? []), id]);
    }
    console.log("  candidates (same operator, column and replacement; only the line moved):");
    for (const row of stale) {
      const candidates = byShape.get(withoutLine(row.siteId)) ?? [];
      console.log(
        `    ${row.siteId} -> ${candidates.length === 0 ? "(none — the site is gone)" : candidates.join(", ")}`,
      );
    }
  }
}

console.log(
  `\n${staleTotal === 0 ? "all accepted rows resolve" : `${staleTotal} stale row(s) — update the registry`}`,
);
process.exit(staleTotal === 0 ? 0 : 1);
