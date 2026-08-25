/**
 * Probe 2 (spec §2): do existing filing headings declare the PER-BASE count or
 * the ARC SUM? Decides whether `count_mismatch` can move to the arc sum without
 * reddening filings that are immutable evidence.
 */
import { parseFiling } from "../../../lib/reviewRounds/filing";
import { readBranchDirs, repoRoot, type CountedStage } from "./shared";

const dirs = readBranchDirs(repoRoot());

let indistinguishable = 0;
let perBaseOnly = 0;
let arcSumOnly = 0;
let neither = 0;
const decisive: string[] = [];

for (const dir of dirs) {
  for (const arc of dir.arcs) {
    if (arc.filingText === null) continue;
    for (const section of parseFiling(arc.filingText)) {
      const declared = section.declaredRounds;
      if (declared === null) continue;
      const stage = section.stage as CountedStage;
      const base = dir.perBase.get(arc.baseSha)?.get(stage)?.size ?? 0;
      const sum = dir.arcPairs.get(stage)?.size ?? 0;
      if (base === sum) {
        indistinguishable += 1;
        continue;
      }
      if (declared === base) perBaseOnly += 1;
      else if (declared === sum) arcSumOnly += 1;
      else neither += 1;
      decisive.push(
        `  ${dir.branch} | ${arc.baseSha} | ${stage} | declared=${declared} perBase=${base} arcSum=${sum}`,
      );
    }
  }
}

console.log(`filing sections where perBase == arcSum (indistinguishable): ${indistinguishable}`);
console.log(`filing sections where perBase != arcSum (decisive):           ${decisive.length}`);
console.log(`  declared == perBase count : ${perBaseOnly}`);
console.log(`  declared == arc sum       : ${arcSumOnly}`);
console.log(`  declared == neither       : ${neither}`);
console.log("");
for (const line of decisive.sort()) console.log(line);
