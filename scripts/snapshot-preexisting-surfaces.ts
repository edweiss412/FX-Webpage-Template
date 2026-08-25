// scripts/snapshot-preexisting-surfaces.ts
// Writes the AC-7 baseline: every verdict-deciding field of every surface as the
// MERGE BASE declares them.
//
// FROM THE MERGE BASE, never from HEAD. A snapshot taken from the working tree
// records whatever this diff has already done and then asserts the diff against
// itself, which is the tautology the anti-tautology rule names by name.
//
// Re-run after every absorb. A stale snapshot is not silently weaker: it would be
// missing the surfaces main has added since, so `live minus snapshot` stops equalling
// the ids this branch enrols and the guard fails loudly. That is why the guard needs
// no git call of its own and works on a shallow CI checkout.
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const OUT = "tests/mutation/fixtures/preexisting-surfaces.json";

const base = execFileSync("git", ["merge-base", "origin/main", "HEAD"], {
  encoding: "utf8",
}).trim();

// The registry AS OF the merge base has to be evaluated, not parsed: `operators`
// spreads a constant and `suitePaths` is ordinary TypeScript. Evaluating it needs the
// whole module graph at that sha, so it runs in a detached worktree rather than
// against a single extracted file.
const dir = mkdtempSync(join(tmpdir(), "fx-ac7-base-"));
try {
  execFileSync("git", ["worktree", "add", "--detach", dir, base], { stdio: "ignore" });
  execFileSync("ln", ["-s", join(process.cwd(), "node_modules"), join(dir, "node_modules")]);
  const json = execFileSync(
    "pnpm",
    [
      "tsx",
      "-e",
      [
        'import { GUARD_SURFACES } from "./tests/mutation/source/registry";',
        "const rows = GUARD_SURFACES.map((s) => ({",
        "  id: s.id,",
        "  sourcePath: s.sourcePath,",
        "  suitePaths: [...s.suitePaths].sort(),",
        "  operators: [...s.operators].sort(),",
        "  scoreFloor: s.scoreFloor,",
        "  control: s.control,",
        "  accepted: [...s.accepted].map((a) => ({ siteId: a.siteId, kind: a.kind })).sort((x, y) => x.siteId.localeCompare(y.siteId)),",
        "})).sort((a, b) => a.id.localeCompare(b.id));",
        "process.stdout.write(JSON.stringify(rows));",
      ].join("\n"),
    ],
    { cwd: dir, encoding: "utf8" },
  );
  const rows = JSON.parse(json) as unknown[];
  writeFileSync(OUT, `${JSON.stringify({ baseSha: base, rows }, null, 1)}\n`);
  process.stdout.write(`${OUT}: ${String(rows.length)} surfaces at ${base.slice(0, 9)}\n`);
} finally {
  execFileSync("git", ["worktree", "remove", "--force", dir], { stdio: "ignore" });
  rmSync(dir, { recursive: true, force: true });
}
