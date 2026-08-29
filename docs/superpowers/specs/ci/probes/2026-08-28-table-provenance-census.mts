/**
 * Reproduces every table in `docs/superpowers/specs/ci/2026-08-28-table-provenance.md`.
 *
 * The row `BL-SPECLINT-NUMERIC-TABLE-UNREPRODUCIBLE` asked for a
 * `<!-- table: cmd=`…` -->` marker binding a stated table to a producing
 * command, checked the way `gate:` markers already are. These are the numbers
 * that decide whether either arm of that check is worth shipping:
 *
 *   1. the table population, so the retrofit cost of a MANDATORY rule is visible;
 *   2. the adoption actually achieved by the two opt-in doc markers already
 *      shipped into this corpus, which is the best available predictor of a
 *      third one's adoption;
 *   3. what a TRUTH arm would have to execute — how many tables sit near a
 *      command at all, and how many of those commands are pure enough to run;
 *   4. what the nearest precedent COST to build, in the same unit the row's own
 *      done condition names (review rounds).
 *
 * Tables come from the SHIPPED parser (`remark` + `remark-gfm` +
 * `blocksFrom`, `scripts/spec-lint.ts:163`, `:757`), not from a regex, so the
 * census and any arm built later cannot disagree about what a table is. An
 * earlier draft of this census used a hand-rolled pipe-table regex and reported
 * 3397 where the real parser reports a different number; that gap is stated in
 * the spec rather than hidden, because it is the same class of defect the row is
 * about.
 *
 * Fences come from the shipped `parseDoc` (`lib/specLint/parse.ts:65`).
 *
 * Reads committed content at a REV (default `HEAD`, override with `--at <rev>`)
 * and prints the sha it resolved. It is NOT revision-independent: the corpus
 * grows, so an older rev reports smaller totals. Pass the sha the spec states
 * and every figure reproduces exactly, including after this arc's own documents
 * joined the corpus it walks.
 *
 * Run: pnpm exec tsx docs/superpowers/specs/ci/probes/2026-08-28-table-provenance-census.mts --at <rev>
 */
import { execFileSync } from "node:child_process";

import { remark } from "remark";
import remarkGfm from "remark-gfm";

import { parseDoc } from "../../../../../lib/specLint/parse";
import { blocksFrom } from "../../../../../scripts/lib/acCoverageBlocks";

const ROOT = execFileSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim();
const git = (...a: string[]) => execFileSync("git", ["-C", ROOT, ...a], { encoding: "utf8" });
const PARSER = remark().use(remarkGfm);

/**
 * The revision every figure is measured at. Defaults to `HEAD`; pass `--at <rev>`
 * to reproduce a stated table exactly.
 *
 * Reading at a REV rather than from the working tree is the whole point, and it
 * is this arc's own subject applied to itself. `git ls-files` lists only TRACKED
 * files, so while this census was untracked it silently excluded its own spec,
 * and committing that spec would have moved the corpus totals under a reader who
 * re-ran the command the spec prints. A rev is an immutable anchor; the working
 * tree is not one.
 */
const atFlag = process.argv.indexOf("--at");
let REV = "HEAD";
if (atFlag !== -1) {
  const v = process.argv[atFlag + 1];
  // Do NOT default here. `--at` with no value used to fall through to HEAD and print that sha as
  // though it had been asked for, binding a figure to a tree the reader did not name and saying
  // nothing about it. That is this document's own subject, so the instrument fails loud instead.
  if (v === undefined || v.startsWith("-")) {
    console.error("census: --at requires a revision (e.g. --at 8b4d521cac00)");
    process.exit(2);
  }
  REV = v;
}
const RESOLVED = git("rev-parse", REV).trim();

const mdFiles = git("ls-tree", "-r", "--name-only", RESOLVED, "docs")
  .split("\n")
  .filter((f) => f.endsWith(".md"));

/** File content AT the resolved rev, never from the working tree. */
const readAt = (rel: string): string => git("show", `${RESOLVED}:${rel}`);

/** A number in a table cell. Bare digits, decimals, percentages, ratios. */
const NUM = /(?<![\w.])\d[\d,]*(\.\d+)?[%x]?(?![\w])/;

/** Info strings the corpus uses for runnable shell. */
const CMD_LANG = new Set(["bash", "sh", "shell", "console", "zsh"]);

/**
 * Read-only, repo-local, deterministic. `git` is split by SUBCOMMAND: `git add`
 * is not a producer, and an earlier draft counted two of them as one because it
 * matched the binary alone.
 */
const GIT_READ = new Set(["diff", "log", "show", "ls-files", "rev-list", "grep", "rev-parse", "cat-file", "merge-base", "shortlog"]);
const PURE_HEAD = /^(grep|rg|ls|find|wc|awk|sed|cat|jq|sort|uniq|head|tail|comm)\b/;
/** Anything needing a live DB, the network, a heavy phase, or that writes. */
const IMPURE =
  /\b(gh|codex|curl|wget|npx|supabase|psql|pnpm|npm|yarn|vitest|playwright|docker)\b|\bnext\s+(build|dev|start)\b|>>|>\s*\S|\b(rm|mv|mkdir|touch|cp|tee)\b|\b(insert|update|delete|alter|revoke|grant|create)\s+(into|table|index|policy|from)?\b/i;
/** A path outside the repo cannot be reproduced by any CI checkout. */
const OUTSIDE_REPO = /(^|\s)(\/Users\/|~\/|\.\.\/\.\.\/\.\.)/;

interface Fence {
  start: number;
  end: number;
  lang: string;
  body: string[];
}

function fencesOf(text: string): Fence[] {
  const model = parseDoc(text);
  const out: Fence[] = [];
  let open: number | null = null;
  for (let i = 0; i < model.fencedInfo.length; i++) {
    const info = model.fencedInfo[i];
    if (info === null) {
      // delimiter line
      if (open === null) open = i;
      else {
        out.push({
          start: open,
          end: i,
          lang: (model.fencedInfo[open + 1] ?? "") as string,
          body: model.lines.slice(open + 1, i),
        });
        open = null;
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------- section 1
let tables = 0;
let numericTables = 0;
const tableLinesByFile = new Map<string, number[]>();
const fencesByFile = new Map<string, Fence[]>();

for (const rel of mdFiles) {
  const text = readAt(rel);
  const blocks = blocksFrom(PARSER.parse(text));
  const lines: number[] = [];
  for (const b of blocks) {
    if (b.kind !== "table") continue;
    tables++;
    lines.push(b.line);
    const cells = b.rows.flatMap((r) => r.cells.map((c) => c.text)).join(" ");
    if (NUM.test(cells)) numericTables++;
  }
  if (lines.length > 0) tableLinesByFile.set(rel, lines);
  fencesByFile.set(rel, fencesOf(text));
}

console.log(`base: ${RESOLVED.slice(0, 12)}  (${mdFiles.length} .md under docs/ at that rev)`);
console.log(`\n## 1. table population — the retrofit cost of a mandatory rule\n`);
console.log(`| population | tables |`);
console.log(`| --- | ---: |`);
console.log(`| every table remark parses under \`docs/**\` | ${tables} |`);
console.log(`| ...with at least one number in a body cell | ${numericTables} |`);
console.log(`| ...purely non-numeric | ${tables - numericTables} |`);

// ---------------------------------------------------------------- section 2
const DECL_AC = /^ {0,3}<!-- ac-coverage: command-col=([1-9][0-9]*) -->[ \t]*$/;
const DECL_AC_ANY = /^ {0,3}<!-- ac-coverage:/;
const GATE = /^ {0,3}<!-- gate: cmd=`([^`]*)`( probed=`([^`]*)`)? -->[ \t]*$/;
const GATE_ANY = /^ {0,3}<!-- gate:/;

let acWellFormed = 0;
let acMalformed = 0;
let gateTotal = 0;
let gateProbed = 0;
const acSites: string[] = [];

for (const rel of mdFiles) {
  const text = readAt(rel);
  const model = parseDoc(text);
  for (let i = 0; i < model.lines.length; i++) {
    if (model.fencedInfo[i] !== undefined) continue; // fence-aware, as the arms are
    const l = model.lines[i]!;
    if (DECL_AC_ANY.test(l)) {
      if (DECL_AC.test(l)) { acWellFormed++; acSites.push(`${rel}:${i + 1}`); }
      else acMalformed++;
    }
    if (GATE_ANY.test(l)) {
      gateTotal++;
      const m = GATE.exec(l);
      if (m?.[2] !== undefined) gateProbed++;
    }
  }
}

console.log(`\n## 2. adoption of the opt-in doc markers already shipped\n`);
console.log(`| marker | live uses | note |`);
console.log(`| --- | ---: | --- |`);
console.log(`| \`ac-coverage\` (opt-in TABLE marker, well-formed) | ${acWellFormed} | ${acSites.join(", ") || "none"} |`);
console.log(`| \`ac-coverage\` marker-shaped but malformed | ${acMalformed} | grammar examples in its own design spec |`);
console.log(`| \`gate:\` (opt-in COMMAND marker) | ${gateTotal} | ${gateProbed} carry \`probed=\` |`);

// ---------------------------------------------------------------- section 3
const WINDOWS = [8, 12, 20, 40];
console.log(`\n## 3. what a TRUTH arm would have to execute\n`);
console.log(`| window (lines) | tables with a shell fence within it | share of ${tables} |`);
console.log(`| --- | ---: | ---: |`);
const adjacencyAt = new Map<number, number>();
for (const w of WINDOWS) {
  let n = 0;
  for (const [rel, lines] of tableLinesByFile) {
    const fences = (fencesByFile.get(rel) ?? []).filter((f) => CMD_LANG.has(f.lang));
    for (const t of lines) {
      if (fences.some((f) => Math.abs(f.end - t) <= w || Math.abs(f.start - t) <= w)) n++;
    }
  }
  adjacencyAt.set(w, n);
  console.log(`| ${w} | ${n} | ${((100 * n) / tables).toFixed(1)}% |`);
}

// purity, at the widest window so the population is as favourable as it gets
const W = 40;
let adjacent = 0, pure = 0, outsideRepo = 0;
const pureSites: string[] = [];
for (const [rel, lines] of tableLinesByFile) {
  const fences = (fencesByFile.get(rel) ?? []).filter((f) => CMD_LANG.has(f.lang));
  for (const t of lines) {
    const near = fences.filter((f) => Math.abs(f.end - t) <= W || Math.abs(f.start - t) <= W);
    if (near.length === 0) continue;
    adjacent++;
    for (const f of near) {
      const cmds = f.body.map((l) => l.trim().replace(/^\$\s*/, "")).filter((l) => l && !l.startsWith("#"));
      if (cmds.length === 0) continue;
      const head = cmds[0]!;
      const joined = cmds.join(" ; ");
      const isGitRead = /^git\s+(\S+)/.test(head) && GIT_READ.has(/^git\s+(\S+)/.exec(head)![1]!);
      if (!PURE_HEAD.test(head) && !isGitRead) continue;
      if (IMPURE.test(joined)) continue;
      pure++;
      if (OUTSIDE_REPO.test(joined)) outsideRepo++;
      pureSites.push(`${rel}:${t}  ${head.slice(0, 88)}`);
      break;
    }
  }
}
console.log(`\n| at a ${W}-line window | tables |`);
console.log(`| --- | ---: |`);
console.log(`| adjacent to a shell fence | ${adjacent} |`);
console.log(`| ...whose command is pure, repo-local, read-only | ${pure} |`);
console.log(`| ...of those, reading a path OUTSIDE the repo (unreproducible in CI) | ${outsideRepo} |`);
console.log(`\nthe pure population in full, so the classification can be checked by reading:`);
for (const s of pureSites) console.log(`  ${s}`);

// ---------------------------------------------------------------- section 4
console.log(`\n## 4. what the nearest precedent cost, in the row's own unit\n`);
const arcs = ["feat/planlint-ac-command-observability"];
console.log(`| arc | spec rounds | plan rounds | diff rounds | total | declared findings |`);
console.log(`| --- | ---: | ---: | ---: | ---: | ---: |`);
for (const arc of arcs) {
  const files = git("ls-tree", "-r", "--name-only", RESOLVED, `docs/review-rounds/${arc}`)
    .split("\n")
    .filter((f) => f.endsWith(".jsonl"));
  const seen = new Set<string>();
  let findings = 0;
  const per: Record<string, Set<string>> = { spec: new Set(), plan: new Set(), diff: new Set() };
  for (const f of files) {
    for (const line of readAt(f).split("\n")) {
      if (!line.trim()) continue;
      const r = JSON.parse(line);
      if (r.status !== "verdict") continue;
      const stage = r.stage as string;
      if (!(stage in per)) continue;
      const key = `${r.baseSha ?? "?"}:${r.round}`;
      if (seen.has(`${stage}:${key}`)) continue;
      seen.add(`${stage}:${key}`);
      per[stage]!.add(key);
      if (typeof r.findingCount === "number") findings += r.findingCount;
    }
  }
  const tot = per.spec!.size + per.plan!.size + per.diff!.size;
  console.log(`| \`${arc}\` | ${per.spec!.size} | ${per.plan!.size} | ${per.diff!.size} | **${tot}** | ${findings} |`);
}
console.log(`\nThe class this arc would police has cost 6 review rounds across its four namings`);
console.log(`(1 + 3 + 1 + 1, per BACKLOG.md's own done-condition sentence).`);
