/**
 * Duplicate-id census over the ledger corpus (BL-ARCHIVE-DUPLICATE-ENTRY-IDS).
 *
 * Walks every registered ledger file (`ledgerFiles`) with the ratified mdast
 * grammar (`extractEntries`) and reports every id that appears on more than one
 * heading, with line numbers. Two modes:
 *
 *   pnpm exec tsx scripts/ledger-dup-census.mts            # family opts (the
 *     per-family ratified levels/prefix, via optsFor)
 *   pnpm exec tsx scripts/ledger-dup-census.mts --all-depth # family prefix at
 *     every heading depth 1-6 (the uniqueness lane's SCAN shape)
 *
 * Probe evidence for the 2026-08-15 archive-duplicate-ids spec lives at
 * docs/superpowers/plans/2026-08-15-archive-duplicate-ids/dup-census-2026-08-15.txt.
 * This lives under scripts/ (not the plan dir) because only tests/ and scripts/
 * may import from tests/ (the sheetIconLinkContainment tests-import boundary).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { ledgerFiles, optsFor } from "./lib/ledger-fields";
import { extractEntries, type ExtractOpts } from "../tests/docs/_ledgerMdast";

const ROOT = process.cwd();
const allDepth = process.argv.includes("--all-depth");

for (const f of ledgerFiles(ROOT)) {
  const family = optsFor(f);
  const opts: ExtractOpts = allDepth
    ? { requirePrefix: family.requirePrefix, levels: [1, 2, 3, 4, 5, 6] }
    : family;
  const entries = extractEntries(readFileSync(join(ROOT, f), "utf8"), opts);
  const byId = new Map<string, number[]>();
  for (const e of entries) byId.set(e.id, [...(byId.get(e.id) ?? []), e.line]);
  const dups = [...byId.entries()].filter(([, v]) => v.length > 1);
  console.log(`${f}: entries=${entries.length} dupIds=${dups.length}`);
  for (const [id, lines] of dups) console.log(`  ${id}: lines ${lines.join(",")}`);
}
