import { writeFileSync } from "node:fs";
import { collectPsqlUsage } from "../../../../../../tests/cross-cutting/psqlStartupFiles/scan.ts";

import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
/** Repo root, derived from this file so the probe runs in any checkout. */
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../../../../..");
const root = ROOT;
const u = collectPsqlUsage(root) as any;
const keys = Object.keys(u);
console.log("collectPsqlUsage keys:", keys.join(", "));
for (const k of keys) {
  const v = (u as any)[k];
  if (Array.isArray(v)) console.log(`${k}: ${v.length}`);
}
const rows: string[] = [];
for (const k of keys) {
  const v = (u as any)[k];
  if (!Array.isArray(v)) continue;
  for (const e of v) rows.push(`${k}\t${e.file}\t${e.line}\t${(e.text ?? e.form ?? "").toString().slice(0,120)}`);
}
rows.sort();
console.log(`\nTOTAL ROWS: ${rows.length}`);
writeFileSync(process.argv[2]!, rows.join("\n") + "\n");
