/**
 * Probe 1 (spec §2): how many arcs newly owe a filing once the threshold sums
 * per branch directory instead of per base file. The number decides whether the
 * gate change ships hard or advisory-first.
 */
import { maxPerBase, newlyOwing, readBranchDirs, repoRoot, ROUND_THRESHOLD } from "./shared";

const root = repoRoot();
const dirs = readBranchDirs(root);

let stagePairs = 0;
let multiBase = 0;
let malformed = 0;
for (const dir of dirs) {
  stagePairs += dir.arcPairs.size;
  if (dir.perBase.size > 1) multiBase += 1;
  for (const arc of dir.arcs) malformed += arc.malformed.length;
}

console.log(`arcs (branch directories): ${dirs.length}`);
console.log(`arc-stage pairs with counted rows: ${stagePairs}`);
console.log(`multi-base arcs: ${multiBase}`);
console.log(`malformed json lines: ${malformed}`);
console.log("");

const owing: string[] = [];
for (const dir of dirs) {
  for (const stage of newlyOwing(dir)) {
    const sum = dir.arcPairs.get(stage)?.size ?? 0;
    owing.push(
      `  ${dir.branch.padEnd(38)} | ${stage} | maxPerBase=${maxPerBase(dir, stage)} arcSum=${sum}`,
    );
  }
}
console.log(
  `NEWLY OWING (arcSum >= ${ROUND_THRESHOLD}, no base at threshold, no filing section): ${owing.length}`,
);
for (const line of owing) console.log(line);
