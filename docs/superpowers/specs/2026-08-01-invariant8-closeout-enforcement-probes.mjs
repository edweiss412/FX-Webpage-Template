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
// Closeout-attach rule (spec r2 F1): a flat file `X-closeout.md` / `X-CLOSEOUT.md`
// whose plan `X.md` exists in the same directory is a MEMBER of unit `X.md`,
// not its own unit. Applies only to flat files with that exact suffix + an
// existing same-directory plan; `*-closeout` DIRECTORIES and stem-extending
// names like `X-fidelity-fixes` stay their own units.
const rawKeys = [];
for (const file of walk(ROOT)) rawKeys.push(relative(ROOT, file));
const flatSet = new Set(
  rawKeys.filter((rel) => {
    const segs = rel.split("/");
    const datedIdx = segs.findIndex((s) => DATED.test(s));
    return datedIdx === segs.length - 1 && datedIdx !== -1;
  }),
);
const CLOSEOUT_SUFFIX = /-(closeout|CLOSEOUT)\.md$/;
function attachTarget(rel) {
  if (!CLOSEOUT_SUFFIX.test(rel)) return null;
  const plan = rel.replace(CLOSEOUT_SUFFIX, ".md");
  return flatSet.has(plan) ? plan : null;
}
const units = new Map(); // unitKey -> {kind, files[]}
const undated = [];
let attached = 0;
for (const rel of rawKeys) {
  const segs = rel.split("/");
  const datedIdx = segs.findIndex((s) => DATED.test(s));
  if (datedIdx === -1) {
    undated.push(rel);
    continue;
  }
  let key = segs.slice(0, datedIdx + 1).join("/");
  let kind = datedIdx === segs.length - 1 ? "flat-file" : "directory";
  if (kind === "flat-file") {
    const target = attachTarget(rel);
    if (target !== null) {
      key = target;
      kind = "flat-file";
      attached += 1;
    }
  }
  if (!units.has(key)) units.set(key, { kind, files: [] });
  units.get(key).files.push(rel);
}
console.log(`closeout-attached flat files: ${attached}`);

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
// Aggregates the spec cites directly (r1 F4) + fold-comparison (r1 F3) + canaries (r1 F1).
const withCloseout = rows.filter((r) => r.closeouts.length > 0).length;
const withS12 = rows.filter((r) => r.s12.length > 0).length;
console.log(`declaring units with *closeout* file: ${withCloseout}`);
console.log(`declaring units with ##12-bearing file: ${withS12}`);

let sameFileBoth = 0;
let splitOnly = 0;
for (const [, u] of units) {
  let anyC = false;
  let anyA = false;
  let both = false;
  for (const rel of u.files) {
    const text = readFileSync(join(ROOT, rel), "utf8");
    const c = CRITIQUE.test(text);
    const a = AUDIT.test(text);
    anyC ||= c;
    anyA ||= a;
    both ||= c && a;
  }
  if (anyC && anyA) {
    if (both) sameFileBoth += 1;
    else splitOnly += 1;
  }
}
console.log(`fold comparison — same-file-BOTH units: ${sameFileBoth}; split-across-files-only units: ${splitOnly}`);

const CANARIES = [
  "2026-07-18-alert-copy-full-sweep.md",
  "admin/2026-06-22-validation-reset-button.md",
  "v1-pre-deployment-amendments/2026-05-19-solo-dev-ux-validation",
  "2026-04-30-fxav-crew-pages-v1",
];
for (const c of CANARIES) console.log(`canary ${units.has(c) ? "OK" : "MISSING"}: ${c}`);

console.log("");
console.log("undated (outside any unit):");
for (const f of undated) console.log(`  ${f}`);
