/**
 * 2026-10-26 pack-list-missing probe — the corpus census behind the proposed
 * `PULL_SHEET_MISSING` notice (docs/superpowers/specs/parser/2026-10-26-pack-list-missing-warning-design.md).
 *
 * Run (from the repo root):
 *   pnpm exec tsx docs/superpowers/specs/parser/probes/2026-10-26-pack-list-missing-probe.ts
 *
 * Tables:
 *   TABLE-A  every raw fixture: parsed `pullSheet` shape (null / case count / item count).
 *   TABLE-B  every exporter fixture: the same, plus the archived pull-sheet tabs the production
 *            exporter returns for the committed `.xlsx` (`synthesizeMarkdownFromXlsx`), and the
 *            resulting verdict under the spec's rule: FIRES when `pullSheet === null` and no
 *            archived pull-sheet tab exists; SUPPRESSED when `pullSheet === null` but an archived
 *            tab exists; QUIET when a pack list parsed.
 *
 * Controls: the exporter fixture `.md` must equal the synthesis of its `.xlsx` (the round-trip
 * guard's premise), so TABLE-B reads the archived tabs from the same bytes the `.md` came from.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { synthesizeMarkdownFromXlsx } from "@/lib/drive/exportSheetToMarkdown";
import { parseSheet } from "@/lib/parser";

const RAW_DIR = "fixtures/shows/raw";
const EXP_DIR = "fixtures/shows/exporter-xlsx";

function shape(pullSheet: ReturnType<typeof parseSheet>["pullSheet"]): string {
  if (pullSheet === null) return "null";
  const items = pullSheet.reduce((n, c) => n + c.items.length, 0);
  return `${pullSheet.length} case(s), ${items} item(s)`;
}

console.log("TABLE-A raw fixtures");
for (const f of readdirSync(RAW_DIR).filter((n) => n.endsWith(".md")).sort()) {
  const r = parseSheet(readFileSync(join(RAW_DIR, f), "utf8"));
  console.log(`  ${f.padEnd(62)} ${shape(r.pullSheet)}`);
}

console.log("TABLE-B exporter fixtures");
let controlFailures = 0;
for (const f of readdirSync(EXP_DIR).filter((n) => n.endsWith(".md") && n !== "README.md").sort()) {
  const md = readFileSync(join(EXP_DIR, f), "utf8");
  const xlsx = readFileSync(join(EXP_DIR, f.replace(/\.md$/, ".xlsx")));
  const buf = xlsx.buffer.slice(xlsx.byteOffset, xlsx.byteOffset + xlsx.byteLength) as ArrayBuffer;
  const synth = synthesizeMarkdownFromXlsx(buf);
  if (synth.markdown !== md) controlFailures += 1;
  const r = parseSheet(md);
  const tabs = synth.archivedPullSheetTabs.map((t) => t.tabName);
  const verdict =
    r.pullSheet !== null ? "QUIET" : tabs.length > 0 ? "SUPPRESSED" : "FIRES";
  console.log(
    `  ${f.padEnd(20)} ${shape(r.pullSheet).padEnd(24)} archived=${JSON.stringify(tabs).padEnd(24)} ${verdict}`,
  );
}
console.log(`CONTROL round-trip mismatches: ${controlFailures}`);
