#!/usr/bin/env node
// Census probe for BL-INVARIANT8-CLOSEOUT-ENFORCEMENT (spec sibling; run from repo root).
// Enumerates plan UNITS, their invariant-8 gate declarations, and where (if anywhere)
// each unit's closeout lives today. Output tables are draft-time inputs to the spec
// (probe-before-argue; docs/agents/adversarial-round-economy-2026-07-31.md).
//
// Unit definition under probe: the TOPMOST dated path segment (/^\d{4}-\d{2}-\d{2}-/)
// under docs/superpowers/plans/ — a dated flat .md file is a unit; a dated directory
// (at any depth, including inside category dirs like admin/) is a unit owning every
// file beneath it. Undated top-level files/dirs are reported separately.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = "docs/superpowers/plans";
const DATED = /^\d{4}-\d{2}-\d{2}-/;
const CRITIQUE = /impeccable critique/i;
const AUDIT = /impeccable audit/i;
const HEDGES = /\b(skipped|pending|not run|TBD)\b/i;

function* walk(dir) {
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, ent.name);
    if (ent.isDirectory()) yield* walk(p);
    else yield p;
  }
}

// Partition every file into its unit (topmost dated segment) or "undated".
const units = new Map(); // unitKey -> {kind, files[]}
const undated = [];
for (const file of walk(ROOT)) {
  const rel = relative(ROOT, file);
  const segs = rel.split("/");
  const datedIdx = segs.findIndex((s) => DATED.test(s));
  if (datedIdx === -1) {
    undated.push(rel);
    continue;
  }
  const key = segs.slice(0, datedIdx + 1).join("/");
  const kind = datedIdx === segs.length - 1 ? "flat-file" : "directory";
  if (!units.has(key)) units.set(key, { kind, files: [] });
  units.get(key).files.push(rel);
}

let declaring = 0;
let flatDeclaring = 0;
let dirDeclaring = 0;
const rows = [];
for (const [key, u] of [...units.entries()].sort()) {
  let hasCritique = false;
  let hasAudit = false;
  const closeoutFiles = [];
  const s12Files = [];
  const hedgedCloseouts = [];
  for (const rel of u.files) {
    const text = readFileSync(join(ROOT, rel), "utf8");
    if (CRITIQUE.test(text)) hasCritique = true;
    if (AUDIT.test(text)) hasAudit = true;
    const base = rel.split("/").pop();
    if (/closeout/i.test(base)) {
      closeoutFiles.push(rel);
      if (HEDGES.test(text)) hedgedCloseouts.push(rel);
    }
    if (/^##+ +12\b/m.test(text)) s12Files.push(rel);
  }
  const declares = hasCritique && hasAudit;
  if (declares) {
    declaring += 1;
    if (u.kind === "flat-file") flatDeclaring += 1;
    else dirDeclaring += 1;
    rows.push({
      unit: key,
      kind: u.kind,
      files: u.files.length,
      closeouts: closeoutFiles,
      s12: s12Files,
      hedged: hedgedCloseouts,
    });
  }
}

console.log(`units total: ${units.size} (flat+dir), undated files: ${undated.length}`);
console.log(
  `declaring BOTH halves: ${declaring} (flat ${flatDeclaring}, dir ${dirDeclaring})`,
);
console.log("");
console.log("unit | kind | closeout files | ##12-bearing files | hedge-bearing closeouts");
for (const r of rows) {
  console.log(
    `${r.unit} | ${r.kind} | ${r.closeouts.join(",") || "-"} | ${
      r.s12.join(",") || "-"
    } | ${r.hedged.join(",") || "-"}`,
  );
}
console.log("");
console.log("undated (outside any unit):");
for (const f of undated) console.log(`  ${f}`);
