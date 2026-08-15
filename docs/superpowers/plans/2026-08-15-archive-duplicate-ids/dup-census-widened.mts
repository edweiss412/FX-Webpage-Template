import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ledgerFiles } from "../../../../scripts/lib/ledger-fields";
import { extractEntries, type ExtractOpts } from "../../../../tests/docs/_ledgerMdast";

const ROOT = process.cwd();
for (const f of ledgerFiles(ROOT)) {
  const opts: ExtractOpts = {
    requirePrefix: f.startsWith("BACKLOG") ? "BL-" : null,
    levels: [1, 2, 3, 4, 5, 6],
  };
  const entries = extractEntries(readFileSync(join(ROOT, f), "utf8"), opts);
  const byId = new Map<string, number[]>();
  for (const e of entries) byId.set(e.id, [...(byId.get(e.id) ?? []), e.line]);
  const dups = [...byId.entries()].filter(([, v]) => v.length > 1);
  console.log(`${f}: entries=${entries.length} dupIds=${dups.length}`);
  for (const [id, lines] of dups) console.log(`  ${id}: lines ${lines.join(",")}`);
}
