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
   * merge-base scanner reports. */
  limit?: true;
  /** A row whose input bash REFUSES TO PARSE.
   *
   * The consequence bound ranges over inputs bash EXECUTES: on an input the
   * shell rejects, no site is "correct", the walk cannot know a later stray
   * token invalidates the command, and the scanner has fabricated on such input
   * since long before this arc (`syntax-error-class.mts`: five ordinary syntax
   * errors, five sites). So these rows assert neither an absolute outcome nor
   * "unchanged" — they RECORD THE MOVEMENT as an exact pair, base then
   * candidate, and fail when either half moves.
   *
   * That is the honest instrument, because the movement runs in BOTH directions
   * and neither direction can be argued away: the repair adds a site on one
   * spelling and removes a fabricated one on another. Recording it means a
   * later change to either is visible instead of discovered. */
  rejectedByBash?: { base: [sites: number, hits: number]; candidate: [sites: number, hits: number] };
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
  // ── the $$ precedence class (spec review round 1 finding 2) ───────────────
  //    `$$` is bash's PID parameter and consumes BOTH characters, so the `$`
  //    that follows it is ordinary text and the `(` after THAT opens nothing.
  //    Reading the second `$` as opening `$(` resolves a span bash never
  //    parses, and both the shipped walk and the first cut of the repair
  //    report a site for input bash refuses to run.
  { id: "P1-dollardollar-in-brace", b64: b(`echo \${OUT:-$$(echo }; psql -c "x")}`), bash: "silent",
    rejectedByBash: { base: [1, 0], candidate: [1, 0] },
    after: { sites: 1, nested: false, nestedInBacktick: false, indirections: 0 },
    note: "LIMIT: bash -n exits 2 and NOTHING runs, yet a site reports - an instance of the general syntax-error limit (design section 7 item 6), not of the crossing. The $$ precedence rule is what keeps it UNCHANGED: without it the repair resolves the same site with MORE confidence (nested:true), which would be a regression inside a limit" },
  { id: "P2-dollardollar-attached", b64: b(`cat >$$(echo \${A:-)}; psql -c 'x')`), bash: "silent",
    rejectedByBash: { base: [1, 0], candidate: [1, 0] },
    after: { sites: 1, nested: false, nestedInBacktick: false, indirections: 0 },
    note: "LIMIT: the same, on the attached-target path - one character from R1-attached. It is why the $$ rule lands in BOTH recognizers: taught to the delimiter walk alone, this row MOVES to nested:true" },
  { id: "P3-dollardollar-control", b64: b(`echo $\${A:-y}; psql -c 'x'`), bash: "runs",
    after: { sites: 1, nested: false, nestedInBacktick: false, indirections: 0 },
    note: "CONTROL: $$ followed by an ordinary brace expansion parses fine and the psql after the `;` is a real top-level call — the $$ rule must not silence it" },

  // ── rows that discriminate a repair of the RIGHT shape that stops one step
  //    short. Both were added after building four strictly weaker walks and
  //    measuring that two of them passed the set as first authored.
  { id: "W2k-squote-in-dq-in-subst", b64: b(`cat >$(echo "it\'s"; psql -c 'x')`), bash: "runs",
    after: { sites: 1, nested: true, nestedInBacktick: false, indirections: 0 },
    note: "a single quote inside DOUBLE quotes inside $(): literal to bash, so the span ends at the closing double quote. One recognizer shared across both contexts reads it as an opener and loses the site" },
  { id: "W2k-squote-in-dq-in-dq-target", b64: b(`cat >"$(echo "'"; psql -c 'x')"`), bash: "runs",
    after: { sites: 1, nested: true, nestedInBacktick: false, indirections: 0 },
    note: "the same crossing one layer deeper, inside a double-quoted attached target" },
  { id: "W4k-unclosed-backtick-in-subst", b64: b("cat >$(echo `echo x; psql -c 'x')"), bash: "silent",
    rejectedByBash: { base: [1, 0], candidate: [0, 1] },
    after: { sites: 0, indirections: 1 },
    note: "an UNCLOSED backtick inside $(): bash dies on the unexpected EOF and runs NOTHING. The merge-base FABRICATES a site; the repair replaces it with an advisory. Movement recorded, and it is the direction the bound prefers" },
  { id: "X1-stray-paren-after-crossing", b64: b(`cat >"$(echo \${A:-)}; psql -c 'x')" )`), bash: "silent",
    rejectedByBash: { base: [0, 0], candidate: [1, 0] },
    after: { sites: 1, nested: true, nestedInBacktick: false, indirections: 0 },
    note: "spec review r2 finding 1. One ordinary edit from R1-attached: a trailing stray `)` makes the whole command a syntax error. The base is SILENT here and the repair REPORTS -- but the base's silence was its own early-closing defect coincidentally hiding the psql, not correctness: delete the stray paren and the identical input PARSES, runs psql, and the base is still silent (that is R1-attached, the row's own defect). The movement is recorded rather than argued away" },

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
const TRACKED = "tests/cross-cutting/psqlStartupFiles/scan.ts";
const modulePath = process.env.SCAN_MODULE ? resolve(process.env.SCAN_MODULE) : join(ROOT, TRACKED);
type Scanner = {
  scanSource: (source: string, file: string) => Array<Record<string, unknown>>;
  scanShellIndirection: (source: string, file: string) => Array<Record<string, unknown>>;
};
const scan = (await import(pathToFileURL(modulePath).href)) as Scanner;
console.log(`scanner module: ${modulePath}`);

/**
 * The documented-limit baseline is the MERGE-BASE scanner, extracted with git.
 *
 * It was the WORKING TREE's `scan.ts` until spec review round 1 finding 1, and
 * that is a control which supplies the mechanism under test: once the repair
 * lands in that file, candidate and baseline are the same module and every
 * limit row reports UNCHANGED by construction. The §2.1b widening defect was
 * caught only because the prototype happened to live outside the tree — an
 * accident of when the probe was written, not a property of the check.
 *
 * Extracted into `node_modules/`, which the scanner's walk skips at every depth
 * (`IGNORED_ANYWHERE`), so the baseline copy can never enter the corpus it is
 * used to measure. A copy beside the original would be scanned like source.
 *
 * Failure to obtain it ABORTS. A limit comparison that silently degrades to
 * comparing the candidate with itself is the defect this repair removes.
 */
const baseSha = execFileSync("git", ["-C", ROOT, "merge-base", "origin/main", "HEAD"], {
  encoding: "utf8",
}).trim();
const baselineDir = join(ROOT, "node_modules/.cache/bracecross-baseline");
mkdirSync(baselineDir, { recursive: true });
const baselinePath = join(baselineDir, `scan.${baseSha.slice(0, 12)}.ts`);
let baselineSource: string;
try {
  baselineSource = execFileSync("git", ["-C", ROOT, "show", `${baseSha}:${TRACKED}`], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
} catch (error) {
  console.error(`ABORT: cannot read ${TRACKED} at merge-base ${baseSha}: ${(error as Error).message}`);
  console.error("The documented-limit rows have no baseline to compare against, so they prove nothing.");
  process.exit(2);
}
writeFileSync(baselinePath, baselineSource);
const shipped = (await import(pathToFileURL(baselinePath).href)) as Scanner;
console.log(`limit baseline: ${TRACKED} at merge-base ${baseSha.slice(0, 12)}`);
/** True when candidate and baseline are the same bytes — the limit rows then
 *  cannot discriminate anything, and saying so beats printing UNCHANGED. */
const baselineIsCandidate = readFileSync(modulePath, "utf8") === baselineSource;
if (baselineIsCandidate)
  console.log(
    "NOTE: the candidate is byte-identical to the merge-base scanner, so the documented-limit rows are VACUOUS in this run (nothing has changed yet for them to detect).",
  );

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
/** bash-REJECTED rows whose recorded base->candidate movement no longer holds. */
let movedRejected = 0;
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
  // EVERY field, DERIVED from each record rather than hand-listed. AC-3 promises
  // byte-identical records and the earlier five-field summary could not keep it:
  // a moved `form`, `tokens`, `precedingWords`, `hasDynamicTokens`,
  // `suppressesStartupFiles` or `exemptReason` compared equal (round 1 finding 1,
  // second half). Deriving the field set also covers a field added to PsqlSite
  // later, instead of silently omitting it.
  const summarise = (records: Array<Record<string, unknown>>): string =>
    JSON.stringify(
      records.map((r) =>
        Object.keys(r)
          .sort()
          .map((f) => (r[f] === undefined ? `${f}=<undefined>` : `${f}=${JSON.stringify(r[f])}`))
          .join("\t"),
      ),
    );
  const both = (ss: Array<Record<string, unknown>>, hs: Array<Record<string, unknown>>): string =>
    `${summarise(ss)}||${summarise(hs)}`;
  const baseSites = shipped.scanSource(source, "probe.sh");
  const baseHits = shipped.scanShellIndirection(source, "probe.sh");
  const unchanged = baselineIsCandidate ? null : both(sites, hits) === both(baseSites, baseHits);
  /** The BASE half of a recorded movement. Counts are enough here and only here:
   *  the merge-base scanner is immutable, so this half exists to pin WHICH
   *  movement the row records, not to detect drift in it. */
  const movementBaseHolds = (): boolean => {
    const r = row.rejectedByBash!;
    return baseSites.length === r.base[0] && baseHits.length === r.base[1];
  };
  /** The candidate side, for accept-set AND bash-rejected rows alike: sites,
   *  advisories AND attribution. Counts alone cannot discriminate a defect that
   *  moves only `nested` — measured, not assumed: an earlier cut of the
   *  bash-rejected class compared the movement as a COUNT PAIR, and both `w6`
   *  and `w7` passed the whole probe, because their defect flips `nested` while
   *  leaving 1 site / 0 advisories exactly where it was. Presence cannot see a
   *  boundary defect; that is this arc's own recurring lesson, and it bit the
   *  instrument built to teach it. */
  const afterHolds = (): boolean =>
    sites.length === row.after.sites &&
    hits.length === row.after.indirections &&
    (row.after.nested === undefined || (row.after.nested ? nestedAll : nestedNone)) &&
    (row.after.nestedInBacktick === undefined || (row.after.nestedInBacktick ? btAll : btNone));

  const ok = row.rejectedByBash
    ? movementBaseHolds() && afterHolds()
    : row.limit
      ? unchanged !== false
      : afterHolds();
  if (!ok) {
    if (row.rejectedByBash) movedRejected++;
    else if (row.limit) movedLimits++;
    else unmetAccept++;
  }
  console.log(
    `${pad(row.id, 36)} ${pad(String(ran), 5)} ${pad(String(sites.length), 6)} ${pad(nestedCol, 7)} ${pad(btCol, 6)} ${pad(String(hits.length), 5)} ${row.rejectedByBash ? (ok ? `RECORDED ${baseSites.length}s/${baseHits.length}a -> ${sites.length}s/${hits.length}a` : `MOVEMENT CHANGED (recorded ${row.rejectedByBash.base.join("s/")}a -> ${row.rejectedByBash.candidate.join("s/")}a, observed ${baseSites.length}s/${baseHits.length}a -> ${sites.length}s/${hits.length}a${movementBaseHolds() ? "; base half holds, so the CANDIDATE moved" : ""})`) : row.limit ? (unchanged === null ? "(limit; vacuous)" : unchanged ? "UNCHANGED" : "MOVED") : ok ? "MEETS after" : "UNMET"}  ${row.note}`,
  );
  if (hits.length > 0) for (const h of hits) console.log(`    hit: ${JSON.stringify(h.text)}`);
}
console.log(`\nbash oracle: ${bashMismatch === 0 ? "every row executed psql exactly as declared" : `${bashMismatch} row(s) DISAGREE with their declared bash column`}`);
if (bashMismatch > 0) {
  console.error("ABORT: the bash column is wrong for some row; the scanner comparison is unattributable there");
  process.exit(2);
}
const limits = ROWS.filter((r) => r.limit).length;
const rejectedRows = ROWS.filter((r) => r.rejectedByBash).length;
const accept = ROWS.length - limits - rejectedRows;
console.log(
  `ROWS: ${ROWS.length} total = ${accept} accept-set + ${limits} documented-limit + ${rejectedRows} bash-rejected`,
);
// Each population reconciles against its OWN denominator. Reported even when
// zero, so a run that observed nothing is distinguishable from one that
// observed nothing wrong.
console.log(`${accept - unmetAccept}/${accept} accept-set rows meet their post-repair expectation`);
console.log(
  `${limits - movedLimits}/${limits} documented-limit rows ${baselineIsCandidate ? "VACUOUS (candidate is byte-identical to the merge-base scanner)" : `UNCHANGED against ${TRACKED} at ${baseSha.slice(0, 12)}`}`,
);
console.log(
  `${rejectedRows - movedRejected}/${rejectedRows} bash-rejected rows hold their RECORDED base -> candidate movement`,
);

// `--expect-repaired` asserts that the repair HAS LANDED. A byte-identical
// candidate and baseline means it has not, so the documented-limit population
// certified nothing and the run must not exit 0 on the accept-set alone.
//
// Spec review round 2 finding 2: the round-1 repair added the VACUOUS LABEL but
// left the exit path, so a checkout where the repaired scanner is also the
// merge-base -- repaired `main`, most obviously -- printed VACUOUS and exited 0.
// A clearer message in front of the same false pass is not the repair.
//
// This makes the probe an ACCEPTANCE INSTRUMENT rather than a standing gate: it
// is run once, at the gate it certifies, against a tree whose merge-base still
// holds the pre-repair scanner. After the arc merges there is no pre-repair
// reference on main and the probe says so instead of passing.
if (expectRepaired && baselineIsCandidate) {
  console.error(
    "FAIL under --expect-repaired: candidate and merge-base are byte-identical, so the documented-limit population is VACUOUS and certifies nothing. This probe is an ACCEPTANCE INSTRUMENT: run it where the merge-base still holds the pre-repair scanner.",
  );
  process.exit(1);
}
if (expectRepaired && (unmetAccept > 0 || movedLimits > 0 || movedRejected > 0)) {
  console.error(
    `FAIL under --expect-repaired: ${unmetAccept} accept-set row(s) unmet, ${movedLimits} documented-limit row(s) MOVED, ${movedRejected} bash-rejected row(s) whose movement CHANGED`,
  );
  process.exit(1);
}
