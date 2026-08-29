/**
 * Generator for the per-block candidacy census artifact
 * (`tests/parser/__fixtures__/nearMissBlockCensus.json`), spec
 * `docs/superpowers/specs/parser/2026-08-28-nearmiss-candidacy-field-lists-design.md` §3.5.
 *
 * Run: `node --import tsx docs/superpowers/specs/parser/probes/2026-08-28-nearmiss-block-census.ts`
 * (`pnpm exec tsx` fails in a sandbox that blocks the tsx IPC pipe.)
 *
 * It writes the §3.1 rule out LONGHAND rather than calling `isCandidateHome`. That is the
 * whole point: the artifact is an external authority the suite is measured against, and a
 * generator that called the predicate would record whatever the implementation happens to
 * do and then assert the implementation agrees with itself.
 */
import { writeFileSync } from "node:fs";
import { FIXTURES, readFixture } from "@/tests/parser/mutation/fixtures";
import { anchorNamespace, normalizeV3, scanRowsWithOpener } from "@/lib/parser/fieldNearMiss";

const MATRIX_MIN_VALUE_CELLS = 6;
type B = { fixture: string; ordinal: number; ns: string; opener: string; min: number; rows: number };
const blocks: B[] = [];
for (const f of FIXTURES) {
  let run: string[] = [];
  let ordinal = 0;
  const flush = () => {
    if (run.length === 0) return;
    const rows = scanRowsWithOpener(run.join("\n"));
    run = [];
    const first = rows[0];
    if (first === undefined) return;
    ordinal += 1;
    blocks.push({
      fixture: f.path,
      ordinal,
      ns: anchorNamespace(first.opener),
      opener: first.opener,
      min: first.blockMinValueCells,
      rows: rows.length,
    });
  };
  for (const line of readFixture(f).split("\n")) {
    if (!line.trim().startsWith("|")) flush();
    else run.push(line);
  }
  flush();
}

// The rule as spec section 3.1 states it, written here independently of
// `isCandidateHome` so the artifact is an external authority rather than a recording of
// what the implementation happens to do.
const excluded = blocks
  .map((b) => ({
    ...b,
    arm:
      normalizeV3(b.opener) === "timestamp"
        ? "form-dump"
        : b.min >= MATRIX_MIN_VALUE_CELLS
          ? "matrix"
          : null,
  }))
  .filter((b) => b.arm !== null)
  .map((b) => ({
    id: `${b.fixture}#${b.ordinal}`,
    arm: b.arm,
    ns: b.ns,
    opener: b.opener,
    minValueCells: b.min,
    rowCount: b.rows,
  }));

const nsCount = (ns: string) => blocks.filter((b) => b.ns === ns).length;
const out = {
  note:
    "Per-block candidacy census (spec docs/superpowers/specs/parser/" +
    "2026-08-28-nearmiss-candidacy-field-lists-design.md section 3.5). EXCLUDED blocks in " +
    "full, keyed fixture#ordinal; kept blocks are counted, not listed. Regenerate with " +
    "docs/superpowers/specs/parser/probes/2026-08-28-nearmiss-block-census.ts, never by " +
    "pasting a test's actual output.",
  totalBlocks: blocks.length,
  excludedCount: excluded.length,
  keptCount: blocks.length - excluded.length,
  familyCounts: { venue: nsCount("venue"), details: nsCount("details"), console: nsCount("console") },
  excluded,
};
writeFileSync("tests/parser/__fixtures__/nearMissBlockCensus.json", JSON.stringify(out, null, 2) + "\n");
console.log("total", out.totalBlocks, "excluded", out.excludedCount, "families", JSON.stringify(out.familyCounts));
const byArm = new Map<string, number>();
for (const e of excluded) byArm.set(e.arm!, (byArm.get(e.arm!) ?? 0) + 1);
console.log("by arm", JSON.stringify([...byArm]));
const byNs = new Map<string, number>();
for (const e of excluded) byNs.set(e.ns, (byNs.get(e.ns) ?? 0) + 1);
console.log("excluded by ns", JSON.stringify([...byNs].sort()));
