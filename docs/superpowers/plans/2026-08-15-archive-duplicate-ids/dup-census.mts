import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ledgerFiles } from "../../../../scripts/lib/ledger-fields";
import { extractEntries, type ExtractOpts } from "../../../../tests/docs/_ledgerMdast";

const ROOT = process.cwd();
const DEFERRED_OPTS: ExtractOpts = { requirePrefix: null, levels: [3] };
const BACKLOG_OPTS: ExtractOpts = { requirePrefix: "BL-", levels: [2, 3] };

for (const f of ledgerFiles(ROOT)) {
  const opts = f.startsWith("BACKLOG") ? BACKLOG_OPTS : DEFERRED_OPTS;
  const entries = extractEntries(readFileSync(join(ROOT, f), "utf8"), opts);
  const byId = new Map<string, number[]>();
  for (const e of entries) {
    byId.set(e.id, [...(byId.get(e.id) ?? []), e.line]);
  }
  const dups = [...byId.entries()].filter(([, v]) => v.length > 1);
  console.log(`${f}: entries=${entries.length} dupIds=${dups.length}`);
  for (const [id, lines] of dups) console.log(`  ${id}: lines ${lines.join(",")}`);
}
