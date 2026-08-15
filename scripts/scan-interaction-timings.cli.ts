/**
 * scripts/scan-interaction-timings.cli.ts
 *
 * The command-line face of `scan-interaction-timings.ts`, kept in a SEPARATE
 * file on purpose. The scanner is enrolled in the source-mutation registry, and
 * an argv guard plus a handful of `process.stdout.write` calls are unreachable
 * from any test — every mutation of them survives by construction, dragging the
 * surface's score down for lines that carry no logic worth pinning. Splitting
 * the entry point out keeps the enrolled module to the part that HAS a
 * contract.
 *
 * Usage: pnpm exec tsx scripts/scan-interaction-timings.cli.ts
 */
import { inventoryRows, scanRepo } from "./scan-interaction-timings";

const result = scanRepo(process.cwd());
const rows = inventoryRows(result);
for (const row of rows) {
  process.stdout.write(`${row.file}\t${row.label}\t${row.value}\n`);
}
if (result.unclassified.length > 0) {
  process.stdout.write(`\nUNCLASSIFIED (${result.unclassified.length}):\n`);
  for (const site of result.unclassified) {
    process.stdout.write(`  ${site.file}:${site.line}\t${site.name}\n`);
  }
}
process.stdout.write(
  `\n${result.filesScanned} files, ${rows.length} rows, ${result.unclassified.length} unclassified\n`,
);
