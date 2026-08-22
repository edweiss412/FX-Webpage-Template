// The cross-construct delimiter shapes, each run against BASH (a fake psql on
// PATH counts executions) and against the scanner, side by side.
//
// `SCAN_MODULE=<path>` points the scanner half at a different module — the
// prototype walk during the spike, the repaired tree afterwards. Default is the
// shipped scan.ts. `--expect-repaired` turns the report into a GATE: every row's
// `after` column must hold, exit 1 naming each row that does not.
//
// Snippets are base64 for the same reason the 2026-08-21 oracle's are: they are
// instances of the family this arc measures, and a literal `.sh` holding them
// would enter the corpus the scanner censuses.
import { mkdtempSync, writeFileSync, readFileSync, chmodSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

type Row = {
  id: string;
  b64: string;
  /** what bash does: RUNS psql (at least once) or is SILENT (never runs it).
   * The count is printed, not asserted: bash 5.2 re-expands a redirection
   * word that splits into several words before reporting the ambiguous
   * redirect, so a substitution there can execute more than once. */
  bash: "runs" | "silent";
  /** post-repair expectation on the scanner */
  after: { sites: number; nested?: boolean; nestedInBacktick?: boolean; indirections: number };
  note: string;
  /** A DOCUMENTED LIMIT row: outside the accept-set, so the expectation is not
   * `after` but UNCHANGED — the module under test must report exactly what the
   * shipped scan.ts reports. Checked only when SCAN_MODULE names another module. */
  limit?: true;
};

const b = (s: string): string => Buffer.from(s + "\n", "utf8").toString("base64");

const ROWS: Row[] = [
  // ── the ledger row's two probe shapes, both placements ───────────────────
  { id: "R1-attached", b64: b(`cat >"$(echo \${A:-)}; psql -c 'x')"`), bash: "runs",
    after: { sites: 1, nested: true, nestedInBacktick: false, indirections: 0 },
    note: "row 1 verbatim: `)` inside \${} closes $( early — SILENT MISS today" },
  { id: "R1-detached", b64: b(`cat > "$(echo \${A:-)}; psql -c 'x')"`), bash: "runs",
    after: { sites: 1, nested: true, nestedInBacktick: false, indirections: 0 },
    note: "row 1, detached target (the pre-existing proof path)" },
  { id: "R2-attached", b64: b(`cat >\${OUT:-$(echo }; psql -c 'x')}`), bash: "runs",
    after: { sites: 1, nested: true, nestedInBacktick: false, indirections: 0 },
    note: "row 2 verbatim: `}` inside $() closes \${ early — WRONG ATTRIBUTION today (nested:false)" },
  { id: "R2-detached", b64: b(`cat > \${OUT:-$(echo }; psql -c 'x')}`), bash: "runs",
    after: { sites: 1, nested: true, nestedInBacktick: false, indirections: 0 },
    note: "row 2, detached target" },
  // ── one ordinary edit from the four: same crossing, other contexts ───────
  { id: "R1-bare-word", b64: b(`echo $(echo \${A:-)}; psql -c 'x')`), bash: "runs",
    after: { sites: 1, nested: true, nestedInBacktick: false, indirections: 0 },
    note: "row 1 crossing as an ordinary argument, no redirection, no quotes" },
  { id: "R2-bare-word", b64: b(`echo \${OUT:-$(echo }; psql -c 'x')}`), bash: "runs",
    after: { sites: 1, nested: true, nestedInBacktick: false, indirections: 0 },
    note: "row 2 crossing as an ordinary argument" },
  { id: "R1-attached-nodq", b64: b(`cat >$(echo \${A:-)}; psql -c 'x')`), bash: "runs",
    after: { sites: 1, nested: true, nestedInBacktick: false, indirections: 0 },
    note: "row 1 without the double quotes" },
  { id: "R2-attached-dq", b64: b(`cat >"\${OUT:-$(echo }; psql -c 'x')}"`), bash: "runs",
    after: { sites: 1, nested: true, nestedInBacktick: false, indirections: 0 },
    note: "row 2 inside double quotes (attachedTargetEnd's closeDoubleQuoted path)" },
  { id: "Q1-dq-inside-subst-inside-dq", b64: b(`cat >"$(echo ")"; psql -c 'x')"`), bash: "runs",
    after: { sites: 1, nested: true, nestedInBacktick: false, indirections: 0 },
    note: "a double quote inside $() inside a double-quoted target: the quote tracker crosses the construct" },
  { id: "Q2-backtick-inside-subst", b64: b("cat >$(echo `echo )`; psql -c 'x')"), bash: "runs",
    after: { sites: 1, nested: true, nestedInBacktick: false, indirections: 0 },
    note: "`)` inside a backtick body inside $()" },
  { id: "Q3-subst-inside-backtick-in-brace", b64: b("cat >${OUT:-`echo }`; psql -c 'x'}"), bash: "silent",
    after: { sites: 0, indirections: 0 },
    note: "`}` inside a backtick body inside ${}; the `;` is LITERAL in a brace operand so psql never runs. Today: a FALSE advisory (1 hit)" },
  // ── controls: correct today, must stay correct ───────────────────────────
  { id: "C1-psql-before-crossing", b64: b(`cat >"$(psql -c 'x'; echo \${A:-)})"`), bash: "runs",
    after: { sites: 1, nested: true, nestedInBacktick: false, indirections: 0 },
    note: "CONTROL: the row's own note — psql BEFORE the crossing delimiter attributes correctly today" },
  { id: "C2-plain-attached-subst", b64: b(`cat >"$(psql -c 'x')"`), bash: "runs",
    after: { sites: 1, nested: true, nestedInBacktick: false, indirections: 0 },
    note: "CONTROL: sibling arc case B" },
  { id: "C3-plain-call", b64: b(`psql -c 'x'`), bash: "runs",
    after: { sites: 1, nested: false, nestedInBacktick: false, indirections: 0 },
    note: "CONTROL: top-level call" },
  { id: "C4-quoted-paren-in-subst", b64: b(`cat > "$(echo ')'; psql -c 'x')"`), bash: "runs",
    after: { sites: 1, nested: true, nestedInBacktick: false, indirections: 0 },
    note: "CONTROL: the quoted `)` the shipped walk already handles (its own comment's example)" },
  { id: "C5-nested-same-pair", b64: b(`cat > "$(echo $(echo x); psql -c 'x')"`), bash: "runs",
    after: { sites: 1, nested: true, nestedInBacktick: false, indirections: 0 },
    note: "CONTROL: same-pair nesting, depth counting" },
  // ── documented limits: OUTSIDE the accept-set, must stay exactly as today ──
  { id: "L1-ansi-c-inside-subst", b64: b(`echo $(echo $'\\''; psql -c 'x')`), bash: "runs", limit: true,
    after: { sites: 1, nested: true, nestedInBacktick: false, indirections: 0 },
    note: "LIMIT: $'…' is not in the accept-set; `'` opens a plain single-quote span as today" },
  { id: "L2-comment-hides-paren", b64: b(`echo $(echo x # )\npsql -c 'x')`), bash: "runs", limit: true,
    after: { sites: 1, nested: true, nestedInBacktick: false, indirections: 0 },
    note: "LIMIT: a `#` comment inside $() hides a `)` from bash but not from the walk — as today" },
  { id: "L3-case-pattern-paren", b64: b(`echo $(case x in x) psql -c 'x';; esac)`), bash: "runs", limit: true,
    after: { sites: 1, nested: true, nestedInBacktick: false, indirections: 0 },
    note: "LIMIT: a case-pattern `)` is not a closer in bash; the walk counts it — as today" },
  { id: "L4-heredoc-inside-subst", b64: b(`echo $(cat <<EOF\n)\nEOF\npsql -c 'x')`), bash: "runs", limit: true,
    after: { sites: 1, nested: true, nestedInBacktick: false, indirections: 0 },
    note: "LIMIT: a here-document body inside $() is literal to bash; the walk reads its `)` — as today" },
  { id: "L5-squote-in-brace-in-dquote", b64: b(`cat >"\${A:-'}'; psql -c 'x'}"`), bash: "silent", limit: true,
    after: { sites: 0, indirections: 0 },
    note: "LIMIT: inside double quotes bash reads a single quote in a brace operand as LITERAL (probed: `A=; echo \"${A:-'}'; psql -c x}\"` prints `'}'; psql -c x`); the walk's nested ${} reads it as a quote. The enclosing double quote bounds the span either way" },
  { id: "C6-arith-not-subst", b64: b(`cat >"$((1+2))"; psql -c 'x'`), bash: "runs",
    after: { sites: 1, nested: false, nestedInBacktick: false, indirections: 0 },
    note: "CONTROL: $(( )) is arithmetic; the psql after it is top-level" },
];

const ROOT = resolve(import.meta.dirname, "../../../../../..");
const modulePath = process.env.SCAN_MODULE
  ? resolve(process.env.SCAN_MODULE)
  : join(ROOT, "tests/cross-cutting/psqlStartupFiles/scan.ts");
const scan = (await import(pathToFileURL(modulePath).href)) as {
  scanSource: (source: string, file: string) => Array<Record<string, unknown>>;
  scanShellIndirection: (source: string, file: string) => Array<Record<string, unknown>>;
};
console.log(`scanner module: ${modulePath}`);
const shippedPath = join(ROOT, "tests/cross-cutting/psqlStartupFiles/scan.ts");
const shipped =
  process.env.SCAN_MODULE === undefined
    ? null
    : ((await import(pathToFileURL(shippedPath).href)) as typeof scan);

const FAKE = "#!/bin/bash\nprintf 'RAN argv=%s\\n' \"$*\" >> \"$LOGFILE\"\necho out.txt\n";
const dir = mkdtempSync(join(tmpdir(), "bracecross-"));
const bin = join(dir, "bin");
mkdirSync(bin);
writeFileSync(join(bin, "psql"), FAKE);
chmodSync(join(bin, "psql"), 0o755);

const expectRepaired = process.argv.includes("--expect-repaired");
let bashMismatch = 0;
/** Accept-set rows that do not meet their post-repair expectation. */
let unmetAccept = 0;
/** Documented-limit rows whose reading MOVED against the shipped module.
 *  Counted separately: a moved limit is scope creep, not an unmet expectation,
 *  and folding it into the accept-set tally reports one population's failure
 *  against the other's denominator. */
let movedLimits = 0;
const pad = (s: string, n: number): string => s.padEnd(n);
console.log(`\n${pad("id", 36)} ${pad("ran", 5)} ${pad("sites", 6)} ${pad("nested", 7)} ${pad("bt", 6)} ${pad("hits", 5)} today-vs-after`);
for (const row of ROWS) {
  const source = Buffer.from(row.b64, "base64").toString("utf8");
  const script = join(dir, `${row.id}.sh`);
  writeFileSync(script, source);
  const log = join(dir, `${row.id}.log`);
  writeFileSync(log, "");
  try {
    execFileSync("bash", [script], {
      cwd: dir,
      env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, LOGFILE: log },
      stdio: "ignore",
    });
  } catch {
    // a failed redirect is fine - the question is only whether psql ran
  }
  const ran = readFileSync(log, "utf8").split("\n").filter((l) => l.includes("RAN")).length;
  if ((ran > 0) !== (row.bash === "runs")) bashMismatch++;

  const sites = scan.scanSource(source, "probe.sh");
  const hits = scan.scanShellIndirection(source, "probe.sh");
  const nestedAll = sites.length > 0 && sites.every((s) => s.nested === true);
  const nestedNone = sites.every((s) => s.nested === false);
  const btAll = sites.length > 0 && sites.every((s) => s.nestedInBacktick === true);
  const btNone = sites.every((s) => s.nestedInBacktick === false);
  const nestedCol = sites.length === 0 ? "-" : nestedAll ? "true" : nestedNone ? "false" : "MIXED";
  const btCol = sites.length === 0 ? "-" : btAll ? "true" : btNone ? "false" : "MIXED";
  const summarise = (ss: Array<Record<string, unknown>>, hs: Array<Record<string, unknown>>): string =>
    JSON.stringify([ss.map((x) => [x.line, x.offset, x.nested, x.nestedInBacktick, x.tokens]), hs.map((h) => [h.line, h.text])]);
  const unchanged =
    shipped === null
      ? null
      : summarise(sites, hits) ===
        summarise(shipped.scanSource(source, "probe.sh"), shipped.scanShellIndirection(source, "probe.sh"));
  const ok = row.limit
    ? unchanged !== false
    :
    sites.length === row.after.sites &&
    hits.length === row.after.indirections &&
    (row.after.nested === undefined || (row.after.nested ? nestedAll : nestedNone)) &&
    (row.after.nestedInBacktick === undefined || (row.after.nestedInBacktick ? btAll : btNone));
  if (!ok) {
    if (row.limit) movedLimits++;
    else unmetAccept++;
  }
  console.log(
    `${pad(row.id, 36)} ${pad(String(ran), 5)} ${pad(String(sites.length), 6)} ${pad(nestedCol, 7)} ${pad(btCol, 6)} ${pad(String(hits.length), 5)} ${row.limit ? (unchanged === null ? "(limit; shipped)" : unchanged ? "UNCHANGED" : "MOVED") : ok ? "MEETS after" : "UNMET"}  ${row.note}`,
  );
  if (hits.length > 0) for (const h of hits) console.log(`    hit: ${JSON.stringify(h.text)}`);
}
console.log(`\nbash oracle: ${bashMismatch === 0 ? "every row executed psql exactly as declared" : `${bashMismatch} row(s) DISAGREE with their declared bash column`}`);
if (bashMismatch > 0) {
  console.error("ABORT: the bash column is wrong for some row; the scanner comparison is unattributable there");
  process.exit(2);
}
const limits = ROWS.filter((r) => r.limit).length;
const accept = ROWS.length - limits;
console.log(`ROWS: ${ROWS.length} total = ${accept} accept-set + ${limits} documented-limit`);
// Each population reconciles against its OWN denominator. Reported even when
// zero, so a run that observed nothing is distinguishable from one that
// observed nothing wrong.
console.log(`${accept - unmetAccept}/${accept} accept-set rows meet their post-repair expectation`);
console.log(
  `${limits - movedLimits}/${limits} documented-limit rows ${shipped === null ? "reported (shipped module, nothing to compare against)" : "UNCHANGED against the shipped module"}`,
);
if (expectRepaired && (unmetAccept > 0 || movedLimits > 0)) {
  console.error(
    `FAIL under --expect-repaired: ${unmetAccept} accept-set row(s) unmet, ${movedLimits} documented-limit row(s) MOVED`,
  );
  process.exit(1);
}
