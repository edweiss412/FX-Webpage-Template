#!/usr/bin/env node
// Derives the plan's own structural facts and reports every prose claim that
// contradicts them. Written after three consecutive plan-review rounds whose
// findings were all "the restructure left a cross-reference stale": the repair
// for that class is a derivation, never another hand-audit.
import { readFileSync } from "node:fs";

const path = process.argv[2];
const lines = readFileSync(path, "utf8").split("\n");
const problems = [];

// --- derived facts ---------------------------------------------------------
const units = []; // { kind: "Task"|"Gate", id, line }
const markers = []; // { line, redState, target }
const sections = new Set(); // every heading number this document defines
let inFence = false;
lines.forEach((l, i) => {
  if (/^```/.test(l)) inFence = !inFence;
  if (inFence) return;
  const h = /^## (Task|Gate) ([0-9A-Z]+)/.exec(l);
  if (h) units.push({ kind: h[1], id: h[2], line: i + 1 });
  const sec = /^#{2,4} (\d+(?:\.\d+)*)\.? /.exec(l);
  if (sec) sections.add(sec[1]);
  if (/^ {0,3}<!-- task: red=/.test(l)) {
    markers.push({
      line: i + 1,
      redState: (/red-state=(\w+)/.exec(l) ?? [])[1] ?? null,
      target: (/red-target=`([^`]*)`/.exec(l) ?? [])[1] ?? null,
    });
  }
});
const taskIds = new Set(units.filter((u) => u.kind === "Task").map((u) => u.id));
const gateIds = new Set(units.filter((u) => u.kind === "Gate").map((u) => u.id));
const barePathTargets = markers.filter((m) => m.target && !m.target.includes(":"));

// --- claims checked against them -------------------------------------------
lines.forEach((l, i) => {
  const n = i + 1;
  for (const m of l.matchAll(/\bTask (\d+)\b/g)) {
    if (!taskIds.has(m[1]))
      problems.push(
        `${n}: names "Task ${m[1]}", which does not exist (tasks: ${[...taskIds].join(",")})`,
      );
  }
  for (const m of l.matchAll(/\bGate ([A-Z])\b/g)) {
    if (!gateIds.has(m[1]))
      problems.push(
        `${n}: names "Gate ${m[1]}", which does not exist (gates: ${[...gateIds].join(",")})`,
      );
  }
  // A section reference this document does not define. Own sections only:
  // spec-owned refs are written as "spec section N" and are not this file's to check.
  for (const m of l.matchAll(/(?<!spec )(?:§|section )(\d+(?:\.\d+)*)/g)) {
    const ref = m[1];
    if (!sections.has(ref) && !/^\d+$/.test(ref)) {
      problems.push(
        `${n}: references section ${ref}, which this document does not define (defined: ${[...sections].join(",")})`,
      );
    }
  }
  const four = /\b(four|4) path-only/.exec(l);
  if (four && barePathTargets.length !== 4) {
    problems.push(
      `${n}: claims ${four[1]} path-only red-targets; the markers carry ${barePathTargets.length} (lines ${barePathTargets.map((b) => b.line).join(",")})`,
    );
  }
  const live = /\b(one|1) .{0,20}\bred-state=live\b/.exec(l);
  if (live && markers.filter((m) => m.redState === "live").length !== 1) {
    problems.push(
      `${n}: claims one live marker; the markers carry ${markers.filter((m) => m.redState === "live").length}`,
    );
  }
});

console.log(`units: ${units.map((u) => u.kind[0] + u.id).join(" ")}`);
console.log(
  `markers: ${markers.length} (live ${markers.filter((m) => m.redState === "live").length}, authored ${markers.filter((m) => m.redState === "authored").length})`,
);
console.log(
  `bare-path red-targets: ${barePathTargets.length} at lines ${barePathTargets.map((b) => b.line).join(",") || "-"}`,
);
if (problems.length === 0)
  console.log("CONSISTENT: no prose claim contradicts the derived structure");
else {
  console.log(`INCONSISTENT (${problems.length}):`);
  problems.forEach((p) => console.log("  " + p));
}
process.exit(problems.length === 0 ? 0 : 1);
