/**
 * Probe 3 (spec §2): does any corpus branch directory hold rows from TWO
 * distinct PRs? A per-directory sum merges every base under one name, so a
 * reused branch name sums two unrelated arcs. This measures how often that is
 * live — the frequency is what decides limit-versus-flaw (spec §4 limit 1).
 */
import { execFileSync } from "node:child_process";

import { readBranchDirs, repoRoot } from "./shared";

const root = repoRoot();
const dirs = readBranchDirs(root);
const haveCorpus = new Set(dirs.map((d) => d.branch));

const log = execFileSync(
  "git",
  ["log", "--merges", "--first-parent", "origin/main", "--format=%H %s"],
  { cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
);

const PULL_REQUEST = /^(\S+) Merge pull request #(\d+) from [^/\s]+\/(.+)$/;
const merges = new Map<string, string[]>();
for (const line of log.split("\n")) {
  const m = PULL_REQUEST.exec(line.trim());
  if (m === null) continue;
  const branch = m[3] as string;
  const list = merges.get(branch);
  if (list) list.push(m[2] as string);
  else merges.set(branch, [m[2] as string]);
}

const reused = [...merges].filter(([, prs]) => prs.length > 1);
const reusedWithCorpus = reused.filter(([branch]) => haveCorpus.has(branch));

console.log(`corpus branch directories: ${dirs.length}`);
console.log(`branch names merged more than once, ANY: ${reused.length}`);
console.log(`of those, ones that HAVE a corpus directory: ${reusedWithCorpus.length}`);
for (const [branch, prs] of reusedWithCorpus.sort()) {
  console.log(`  ${branch} | PRs ${prs.join(",")}`);
}
console.log("");
for (const [branch, prs] of reused.sort()) {
  console.log(
    `  reused: ${branch} | ${prs.length} merges (PRs ${prs.join(",")}) | corpus dir = ${haveCorpus.has(branch)}`,
  );
}
