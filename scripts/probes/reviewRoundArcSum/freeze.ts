/**
 * Probe 4 (spec §2): the freeze boundary for the grandfather set. Additions are
 * rejected by requiring every grandfathered pair's counted rows to predate a
 * declared timestamp, so this finds the latest such row — the declared value
 * sits above it and below anything written from now on.
 */
import { newlyOwing, readBranchDirs, repoRoot, type CountedStage } from "./shared";

const dirs = readBranchDirs(repoRoot());

const stamps: string[] = [];
let missing = 0;
const lines: string[] = [];

for (const dir of dirs) {
  for (const stage of newlyOwing(dir)) {
    const own: string[] = [];
    let missingHere = 0;
    for (const arc of dir.arcs) {
      for (const row of arc.rows) {
        if (row.status !== "verdict" || row.stage !== (stage as CountedStage)) continue;
        if (row.startedAt === null) missingHere += 1;
        else own.push(row.startedAt);
      }
    }
    missing += missingHere;
    own.sort();
    const latest = own[own.length - 1] ?? null;
    if (latest !== null) stamps.push(latest);
    lines.push(
      `  ${dir.branch.padEnd(38)} | ${stage} | arcSum=${dir.arcPairs.get(stage)?.size ?? 0} | latest=${latest ?? "NONE"} | missingStartedAt=${missingHere}`,
    );
  }
}

const every: string[] = [];
for (const dir of dirs) {
  for (const arc of dir.arcs) {
    for (const row of arc.rows) if (row.startedAt !== null) every.push(row.startedAt);
  }
}
every.sort();
stamps.sort();

for (const line of lines) console.log(line);
console.log("");
console.log(
  `latest startedAt across the ${lines.length} grandfathered pairs: ${stamps[stamps.length - 1] ?? "NONE"}`,
);
console.log(`entries with a row missing startedAt:               ${missing}`);
console.log(
  `latest startedAt anywhere in the corpus:            ${every[every.length - 1] ?? "NONE"}`,
);
