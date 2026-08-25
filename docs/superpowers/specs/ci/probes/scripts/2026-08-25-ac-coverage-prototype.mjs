#!/usr/bin/env node
/**
 * Prototype of the acCoverage arm, and the generator of EVERY number in
 * `docs/superpowers/specs/ci/2026-08-25-planlint-ac-command-observability-design.md`.
 *
 * Supersedes the Python prototype of the same date. The rewrite is the round-3
 * repair: three consecutive review rounds each found a defect in a HAND-ROLLED
 * markdown table reader (r1 the optional trailing pipe, r2 the optional leading
 * pipe, r3 backslash parity), plus one I found myself (the delimiter pattern was
 * anchored at column 0, so 106 indented tables were invisible). Growing that
 * recognizer is the losing move, and this repo already ratified the alternative:
 *
 *   "Regex reimplementation of markdown grammar is out of scope (r30
 *    ratification). The AST port IS the sanctioned resolution — grammar
 *    questions go to the parser."
 *   docs/superpowers/specs/2026-08-01-ledger-guard-mdast-rewrite-design.md §1.1
 *
 * So remark decides every grammar question and this file decides none. The
 * synchronous parse pattern is the one at lib/reviewRounds/filing.ts:60.
 *
 * This is NOT the shipped arm. In the shipped design the ADAPTER parses and
 * injects a small view, so `lib/specLint/` keeps its zero-third-party-import
 * property; here the parse and the decisions sit together for brevity.
 *
 * Usage:
 *   node <this> census | hazards | markers [rev] | audit | plants | blobs <dir>
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { remark } from "remark";
import remarkGfm from "remark-gfm";

const parser = remark().use(remarkGfm);
const PLANS = "docs/superpowers/plans";
const FIXTURE = `${PLANS}/2026-08-21-pane-compaction-send-authorization.md`;
const PIN = /(?<![\w/.-])((?:[A-Za-z0-9_.-]+\/)+[A-Za-z0-9_.-]+\.[A-Za-z0-9]+):(\d+)/g;

function walkDir(dir) {
  const out = [];
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) out.push(...walkDir(p));
    else if (p.endsWith(".md")) out.push(p);
  }
  return out;
}

/** Every `table` node, in document order. */
function tablesOf(root) {
  const out = [];
  (function w(n) {
    if (n.type === "table") out.push(n);
    for (const c of n.children ?? []) w(c);
  })(root);
  return out;
}

/** A cell's rendered text, and its inlineCode values. remark decides both. */
function cellView(cell) {
  let text = "";
  const codes = [];
  (function w(n) {
    if (n.type === "text") text += n.value;
    else if (n.type === "inlineCode") {
      text += n.value;
      codes.push(n.value);
    }
    for (const c of n.children ?? []) w(c);
  })(cell);
  return { text, codes };
}

function rowView(row) {
  return { line: row.position.start.line, cells: row.children.map(cellView) };
}

/** A span carries a command only if it is neither blank nor comment-only.
 *  `sh -nc --` exits 0 on `# anything`, so parseability alone accepts a cell
 *  with no command in it (round-3 finding 1). */
function carriesCommand(span) {
  const s = span.trim();
  return s !== "" && !s.startsWith("#");
}

function shParses(command) {
  try {
    execFileSync("sh", ["-nc", "--", command], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

/** A character that can continue a path. The pin must not be glued to one on
 *  either side, or a longer path swallows it. */
const PATH_CHAR = /[A-Za-z0-9_./-]/;

/**
 * Arm (b), narrowed to what is decidable WITHOUT a shell lexer (round-3 finding 2).
 *
 * Three rounds each found a false accept in a matcher that tried to identify a
 * shell ARGUMENT: a superstring (r1), a wrong prefix (r2), then quoting, escaped
 * whitespace and comments (r3). Splitting on whitespace is a shell-word
 * approximation and every round found another way it is wrong, so the arm stops
 * approximating: it tests LEXICAL PATH BOUNDARIES and claims nothing about shell
 * words. The pin occurs, and neither the character before it nor the character
 * after it can continue a path.
 *
 * That keeps both repaired cases firing — an appended character fails the right
 * boundary, a prepended segment fails the left — and needs no grammar. What it
 * does NOT do is notice that a correctly-bounded path sits inside quotes, after
 * an escape, or behind a `#`. Those are r3 finding 2's families; they are not
 * ordinary authoring mistakes, the threat fence puts them out of scope, and they
 * are recorded in the spec's L-6 rather than chased with another epicycle.
 */
function pinUnobserved(commandText, path) {
  for (let i = commandText.indexOf(path); i !== -1; i = commandText.indexOf(path, i + 1)) {
    const before = i === 0 ? "" : commandText[i - 1];
    const after = commandText[i + path.length] ?? "";
    if (!PATH_CHAR.test(before) && !PATH_CHAR.test(after)) return false;
  }
  return true;
}

/** The arm, over one declared table. */
function checkTable(table, commandCol) {
  const findings = [];
  const [header, ...rows] = table.children.map(rowView);
  if (commandCol > header.cells.length) {
    findings.push([table.position.start.line, "HARD", "AC_COVERAGE_COL_OUT_OF_RANGE",
      `header has ${header.cells.length} columns`]);
    return { rows: rows.length, findings };
  }
  for (const row of rows) {
    const cell = row.cells[commandCol - 1];
    if (cell === undefined) {
      findings.push([row.line, "HARD", "AC_COVERAGE_COL_OUT_OF_RANGE",
        `row has ${row.cells.length} cells`]);
      continue;
    }
    const spans = cell.codes.filter(carriesCommand);
    if (spans.length === 0) {
      findings.push([row.line, "HARD", "AC_COMMAND_CELL_NOT_RUNNABLE",
        JSON.stringify(cell.text.trim().slice(0, 70))]);
      continue;
    }
    // EVERY span, each judged on its own (round-1 finding 1). Keyed per span, so
    // an earlier failure cannot be overwritten by a later success (round-2 finding 2).
    const outcomes = spans.map((s) => [s, shParses(s)]);
    for (const [s, ok] of outcomes) {
      if (!ok) findings.push([row.line, "HARD", "AC_COMMAND_UNPARSABLE", JSON.stringify(s.slice(0, 70))]);
    }
    const commandText = spans.join(" ");
    const other = row.cells.filter((_, k) => k !== commandCol - 1).map((c) => c.text).join(" | ");
    for (const m of other.matchAll(PIN)) {
      if (!m[1].startsWith("tests/")) continue;
      if (pinUnobserved(commandText, m[1])) {
        findings.push([row.line, "ADVISORY", "AC_COMMAND_PIN_UNOBSERVED", m[0]]);
      }
    }
  }
  return { rows: rows.length, findings };
}

const isAcTable = (t) => {
  const rows = t.children.slice(1);
  if (rows.length === 0) return false;
  const hits = rows.filter((r) => /^\**\s*AC-\d/.test(cellView(r.children[0] ?? {}).text.trim())).length;
  return hits >= Math.max(1, Math.floor(rows.length / 2));
};

const acTableOf = (text) =>
  tablesOf(parser.parse(text)).find(
    (t) => cellView(t.children[0].children[2] ?? {}).text.trim() === "Producing command",
  );

function census() {
  let total = 0;
  const ac = [];
  const headers = new Set(), headings = new Set(), cols = new Set();
  let exact = 0;
  for (const f of walkDir(PLANS)) {
    const text = readFileSync(f, "utf8");
    const root = parser.parse(text);
    const heads = (root.children ?? []).filter((n) => n.type === "heading");
    for (const t of tablesOf(root)) {
      total++;
      if (!isAcTable(t)) continue;
      ac.push(f);
      const hdr = t.children[0].children.map((c) => cellView(c).text.trim());
      headers.add(hdr.join(" | "));
      cols.add(hdr.length);
      if (hdr.join(" | ") === "AC | Proved by | Producing command") exact++;
      const above = heads.filter((h) => h.position.start.line < t.position.start.line).pop();
      headings.add(above ? cellView(above).text.trim() : "<none>");
    }
  }
  console.log(`total markdown tables in plan corpus: ${total}`);
  console.log(`AC coverage tables:                   ${ac.length}`);
  console.log(`distinct header rows among them:      ${headers.size}`);
  console.log(`distinct enclosing headings:          ${headings.size}`);
  console.log(`column counts observed:               ${Math.min(...cols)} to ${Math.max(...cols)}`);
  console.log(`tables in the PLAN CORPUS using the fixture's exact header: ${exact}`);
}

function hazards() {
  let tables = 0, rows = 0, multi = 0;
  const multiDocs = [];
  for (const f of walkDir(PLANS)) {
    const root = parser.parse(readFileSync(f, "utf8"));
    let acHere = 0;
    for (const t of tablesOf(root)) {
      tables++;
      rows += t.children.length - 1;
      if (isAcTable(t)) acHere++;
    }
    if (acHere > 1) { multi++; multiDocs.push(`${f} (${acHere})`); }
  }
  console.log(`tables in the plan corpus, per remark:        ${tables}`);
  console.log(`data rows across them:                        ${rows}`);
  console.log(`documents carrying MORE THAN ONE AC table:    ${multi}`);
  for (const d of multiDocs) console.log(`   ${d}`);
  console.log("every pipe/whitespace/backslash question above is remark's, not this arm's");
}

function markers(rev) {
  const args = ["grep", "-hoE", "<!-- task: red=`[^`]*`"];
  if (rev) args.push(rev);
  args.push("--", "*.md");
  const out = execFileSync("git", args, { encoding: "utf8" }).split("\n").filter(Boolean);
  const cmds = out.map((l) => l.replace(/^.*red=`/, "").replace(/`$/, ""));
  console.log(`rev: ${rev ?? "(index/worktree — pin a rev for a reproducible count)"}`);
  console.log(`red= markers in tracked markdown: ${cmds.length}`);
  console.log(`  beginning with a dash:          ${cmds.filter((c) => c.trimStart().startsWith("-")).length}`);
}

function audit() {
  const buckets = { v1: [0, 0], modern: [0, 0] };
  const items = [];
  for (const f of walkDir(PLANS)) {
    const root = parser.parse(readFileSync(f, "utf8"));
    for (const t of tablesOf(root)) {
      if (!isAcTable(t)) continue;
      const nc = t.children[0].children.length;
      const rows = t.children.slice(1).map(rowView);
      const withSpan = rows.filter((r) => (r.cells[nc - 1]?.codes ?? []).some(carriesCommand)).length;
      if (withSpan / rows.length < 0.8) continue;
      const { findings } = checkTable(t, nc);
      const hard = findings.filter((x) => x[1] === "HARD").length;
      const k = f.includes("v1-pre-deployment") ? "v1" : "modern";
      buckets[k][0]++; buckets[k][1] += hard;
      if (k === "modern") for (const x of findings) items.push([f, ...x]);
    }
  }
  console.log(`v1-era handoff tables: ${buckets.v1[0]} tables, ${buckets.v1[1]} hard`);
  console.log(`2026-08 plan tables:   ${buckets.modern[0]} tables, ${buckets.modern[1]} hard`);
  console.log(`total:                 ${buckets.v1[0] + buckets.modern[0]} tables, ${buckets.v1[1] + buckets.modern[1]} hard`);
  console.log("2026-08 findings, itemised:");
  for (const r of items) console.log(`  ${r[0]} L${r[1]} ${r[2]} ${r[3]} ${r[4]}`);
}

const PLANTS = {
  unplanted: null,
  a_prose_cell: ["| AC-1 (one read-once pass; read-member spy) | Task 2 structural cover | `pnpm vitest run tests/paneCompaction/adapter.test.ts` |",
    "| AC-1 (one read-once pass; read-member spy) | Task 2 structural cover | both red commands above |"],
  a2_comment_only_span: ["`pnpm vitest run tests/paneCompaction/adapter.test.ts` |\n| AC-2",
    "`# both red commands above` |\n| AC-2"],
  b_pin_dropped: ["`pnpm vitest run tests/paneCompaction/adapter.test.ts tests/paneCompaction/driver.test.ts tests/docs/_metaPaneCompactionContract.test.ts`",
    "`pnpm vitest run tests/paneCompaction/adapter.test.ts tests/docs/_metaPaneCompactionContract.test.ts`"],
  c_later_span_broken: ["`pnpm vitest run tests/paneCompaction/adapter.test.ts`; `pnpm vitest run tests/docs/_metaPaneCompactionContract.test.ts` |",
    "`pnpm vitest run 'tests/paneCompaction/adapter.test.ts`; `pnpm vitest run tests/docs/_metaPaneCompactionContract.test.ts` |"],
  c2_FIRST_span_broken: ["| `pnpm vitest run tests/paneCompaction/authorization.test.ts`; `pnpm vitest run tests/paneCompaction/adapter.test.ts`;",
    "| `pnpm vitest run 'tests/paneCompaction/authorization.test.ts`; `pnpm vitest run tests/paneCompaction/adapter.test.ts`;"],
  d_superstring_appended: ["tests/paneCompaction/driver.test.ts tests/docs/_metaPaneCompactionContract.test.ts`",
    "tests/paneCompaction/driver.test.tsx tests/docs/_metaPaneCompactionContract.test.ts`"],
  e_superstring_prepended: ["tests/paneCompaction/driver.test.ts tests/docs/_metaPaneCompactionContract.test.ts`",
    "archive/tests/paneCompaction/driver.test.ts tests/docs/_metaPaneCompactionContract.test.ts`"],
  // The leading pipe is removed AND the command cell is made prose. Removing the
  // pipe alone moves nothing — the row still holds a valid command — so that plant
  // would be decoration. This one is red only if the row is SEEN at all, which is
  // exactly what the hand-rolled `^\s*\|` predicate got wrong (round-2 finding 1).
  f_prose_in_a_row_without_leading_pipe: [
    "| AC-5 (resume predicate; mode verdict gates) | Task 1 + Task 2 | `pnpm vitest run tests/paneCompaction/authorization.test.ts tests/paneCompaction/adapter.test.ts` |",
    "AC-5 (resume predicate; mode verdict gates) | Task 1 + Task 2 | both red commands above |"],
  g_backslash_parity: ["| AC-4 (refusals name the condition) | Task 2 (restored verbatim class) | `pnpm vitest run tests/paneCompaction/adapter.test.ts` |",
    "| AC-4 (refusals name the condition) | Task 2 (restored verbatim class) | `echo a\\\\|true` |"],
};

function plants() {
  const src = readFileSync(FIXTURE, "utf8");
  for (const [name, pair] of Object.entries(PLANTS)) {
    let text = src;
    if (pair) {
      const [old, next] = pair;
      const n = src.split(old).length - 1;
      if (n !== 1) { console.log(`${name}: ANCHOR MATCHED ${n} TIMES — plant not applied`); continue; }
      text = src.replace(old, next);
    }
    const t = acTableOf(text);
    if (!t) { console.log(`${name}: no declared-shape table found`); continue; }
    const { rows, findings } = checkTable(t, 3);
    const hard = findings.filter((x) => x[1] === "HARD").length;
    const adv = findings.filter((x) => x[1] === "ADVISORY").length;
    console.log(`${name}: rows=${rows} ${hard} hard, ${adv} advisory`);
    for (const x of findings) console.log(`    ${JSON.stringify(x)}`);
  }
}

function blobs(dir) {
  for (const c of ["173bfccfe", "b1db667e0", "f921a138b", "b3705cebd", "HEAD"]) {
    const t = acTableOf(readFileSync(join(dir, `${c}.md`), "utf8"));
    const { rows, findings } = checkTable(t, 3);
    const hard = findings.filter((x) => x[1] === "HARD").length;
    const adv = findings.filter((x) => x[1] === "ADVISORY").length;
    console.log(`${c}: rows=${rows} ${hard} hard, ${adv} advisory`);
    for (const x of findings) console.log(`    ${JSON.stringify(x)}`);
  }
}

const [, , cmd, arg] = process.argv;
({ census, hazards, markers: () => markers(arg), audit, plants, blobs: () => blobs(arg) })[cmd]();
