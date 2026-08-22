#!/usr/bin/env node
// Census of stated figures in probe records, for BL-DERIVED-NUMBERS-IN-DOCS-ROT.
//
// WHAT THIS INSTRUMENT CAN AND CANNOT DO. It can size a population, print every
// line a proposed gate would fire on, and detect a record that names NO immutable
// anchor anywhere. It CANNOT decide whether a given figure is derived, and it
// CANNOT establish that an anchor present somewhere in a record binds any
// particular figure in it — one unrelated object id makes a whole document pass
// the screen. Both of those are per-figure judgments, and the record beside this
// script argues they are not mechanizable here.
//
// So every number below is a screen or a population, never a verdict. The three
// "derived" readings exist to show that a token-matching classifier disagrees
// with itself; they are three variants of ONE heuristic, and reading C changes
// the denominator, so they are not three answers to one question.
//
// Usage: node docs/superpowers/specs/ci/probes/scripts/2026-08-22-derived-number-census.mjs [root]

import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = process.argv[2] ?? 'docs/superpowers/specs/ci/probes';

// Structural exclusions. Every one removes a token class that is not a figure
// about an artifact, and each one's removal count is printed so the tokenizer's
// contribution to the population size is visible rather than asserted.
const EXCLUSIONS = [
  ['iso-date', /\b\d{4}-\d{2}-\d{2}\b/g],
  ['clock-time', /\b\d{1,2}:\d{2}(?::\d{2})?Z?\b/g],
  ['url', /https?:\/\/\S+/g],
  ['sha-hex', /\b(?=[0-9a-f]*\d)[0-9a-f]{7,40}\b/g],
  ['file-line-citation', /[\w./-]+\.\w+:\d+(?:-\d+)?/g],
  ['section-ref', /§\s?\d+(?:\.\d+)*/g],
  ['issue-or-pr-ref', /#\d+/g],
  ['md-list-ordinal', /^\s{0,6}\d+\.(?=\s)/gm],
  ['md-heading-ordinal', /^#{1,6}\s+\d+(?:\.\d+)*/gm],
  ['version-tag', /\bv\d+(?:\.\d+)*\b/gi],
];

const RUNNER =
  '(?:pnpm|npm|npx|node|git|rg|grep|python3?|bash|sh|gh|psql|tsx|vitest|playwright|for|while|awk|sed|find|comm|jq|cat|wc|sort|uniq|diff|curl)';
const COMMAND_LINE = new RegExp(`^\\s*(?:\\$\\s+\\S|${RUNNER}\\b)`);
const COMMAND_IN_PROSE = new RegExp('`[^`\\n]*\\b' + RUNNER + '\\b[^`\\n]*`');
const NUM = /(?<![\w.])\d+(?:[.,]\d+)*(?![\w.])/g;

// A figure bound to a tree cannot rot: it is permanently true of the revision
// it names. This is the only classification in this file that inspection did
// not overturn.
const TREE_BINDING = /\b(?:at|on|base|blob|sha|commit|revision|branch point)\b[^.\n]{0,40}`?\b[0-9a-f]{7,40}\b/i;

// A binding is only as good as the anchor it names. A hex object id is IMMUTABLE:
// the tree it names cannot change. A branch or remote ref is MUTABLE: it moves,
// and it can be deleted, at which point the record names nothing at all. Spec
// review round 1 found exactly that case, so the distinction is mechanized here
// rather than left to a reader.
// Recognizes remote-qualified refs only. A bare local branch name is not matched,
// so this UNDER-counts mutable refs — which matters only for a record naming no
// immutable anchor, since the mutable-only verdict is the conjunction of the two.
// Probed at b52481446: the one record with no immutable anchor and no detected
// mutable ref (2026-08-04-finding-format-probe.md) names no ref-shaped token at
// all, so the narrowness costs nothing on this corpus.
const MUTABLE_REF = /`?\b(?:origin|upstream)\/[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)*\b`?/g;
// A hex object id needs BOTH a digit and a hex letter. Requiring only a digit
// matches millisecond timestamps and CI run ids — 43 of one record's 87 reported
// anchors were epoch-ms values before this condition was added. Requiring only a
// letter matches ordinary words spelled from a-f. Documented limit: a genuinely
// all-digit short sha is not recognized; at 7 hex chars that is about 3.7% of ids
// and falls off fast with length, and the classification it costs is a record
// being called unbound when it is bound, which is the safe direction.
const IMMUTABLE_ANCHOR = /`?\b(?=[0-9a-f]*\d)(?=[0-9a-f]*[a-f])[0-9a-f]{7,40}\b`?/g;

const norm = (t) => t.replace(/,/g, '').replace(/\.$/, '');

function walk(dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name.endsWith('.md')) out.push(p);
  }
  return out;
}

// A block's PREAMBLE is the prose since the previous block. The boundary comes
// from document structure, not from a tunable line count.
function split(text) {
  const prose = [];
  const withCmdInside = [];
  const withCmdInPreamble = [];
  const bare = [];
  let fence = null;
  let buf = [];
  let preamble = [];
  const lines = text.split('\n');
  let lineNo = 0;
  for (const line of lines) {
    lineNo += 1;
    if (/^\s*```/.test(line)) {
      if (fence === null) {
        fence = line;
        buf = [];
      } else {
        const body = buf.join('\n');
        if (buf.some((l) => COMMAND_LINE.test(l))) withCmdInside.push(body);
        else if (COMMAND_IN_PROSE.test(preamble.join('\n'))) withCmdInPreamble.push(body);
        else bare.push(body);
        fence = null;
        buf = [];
        preamble = [];
      }
      continue;
    }
    if (fence === null) {
      prose.push({ text: line, lineNo });
      preamble.push(line);
    } else buf.push(line);
  }
  // An unterminated fence is content nobody fenced deliberately; it is prose,
  // and its lines keep the numbers they have in the file.
  if (fence !== null) {
    for (let k = 0; k < buf.length; k += 1) {
      prose.push({ text: buf[k], lineNo: lines.length - buf.length + k + 1 });
    }
  }
  return { prose, withCmdInside, withCmdInPreamble, bare };
}

const files = walk(ROOT).sort();
const excised = new Map(EXCLUSIONS.map(([n]) => [n, 0]));
const rows = [];
let rawTokens = 0;

for (const file of files) {
  const text = readFileSync(file, 'utf8');
  const { prose, withCmdInside, withCmdInPreamble, bare } = split(text);
  const proseText = prose.map((l) => l.text).join('\n');
  rawTokens += (proseText.match(NUM) ?? []).length;

  // Removal is measured as the DROP IN THE POPULATION after each exclusion is
  // applied, cumulatively, so the column sums to raw-minus-surviving. Counting
  // numeric matches inside each excised span does not: replacing a span with a
  // space also re-tokenizes its neighbours, and round 2 caught that column
  // failing to reconcile by 45 tokens.
  let stripped = proseText;
  let running = (stripped.match(NUM) ?? []).length;
  for (const [name, re] of EXCLUSIONS) {
    stripped = stripped.replace(re, ' ');
    const after = (stripped.match(NUM) ?? []).length;
    excised.set(name, excised.get(name) + (running - after));
    running = after;
  }

  const tokensOf = (blocks) =>
    new Set(blocks.flatMap((b) => (b.match(NUM) ?? []).map(norm)));
  const setA = tokensOf(withCmdInside);
  const setB = tokensOf([...withCmdInside, ...withCmdInPreamble]);

  const figures = (stripped.match(NUM) ?? []).map(norm);
  const big = figures.filter((n) => Number(n) >= 100);

  rows.push({
    file: relative(ROOT, file),
    figures: figures.length,
    derivedA: figures.filter((n) => setA.has(n)).length,
    derivedB: figures.filter((n) => setB.has(n)).length,
    bigFigures: big.length,
    bigDerivedB: big.filter((n) => setB.has(n)).length,
    blocks: withCmdInside.length + withCmdInPreamble.length + bare.length,
    commandedBlocks: withCmdInside.length + withCmdInPreamble.length,
    treeBound: (text.match(TREE_BINDING) ?? []).length,
    immutableAnchors: new Set(text.match(IMMUTABLE_ANCHOR) ?? []).size,
    mutableRefs: new Set(text.match(MUTABLE_REF) ?? []).size,
  });
}

const sum = (k) => rows.reduce((a, r) => a + r[k], 0);
const pct = (n, d) => (d ? `${((100 * n) / d).toFixed(1)}%` : '-');

console.log(`# derived-number census — ${ROOT}`);
console.log(`# records walked: ${files.length}`);
console.log('');
console.log('## Three readings of "derived" — three variants of ONE heuristic');
console.log('');
console.log('- **A** — the figure appears in a fenced block that PRINTS its command as a transcript line.');
console.log('- **B** — A, plus blocks whose producing command is named in the prose above them.');
console.log('- **C** — B, restricted to figures >= 100, where token collision is negligible.');
console.log('');
console.log('| record | figures | derived A | derived B | figures >=100 | derived C | blocks | commanded |');
console.log('| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |');
for (const r of rows) {
  console.log(
    `| \`${r.file}\` | ${r.figures} | ${r.derivedA} | ${r.derivedB} | ${r.bigFigures} | ${r.bigDerivedB} | ${r.blocks} | ${r.commandedBlocks} |`,
  );
}
console.log(
  `| **total** | **${sum('figures')}** | **${sum('derivedA')}** | **${sum('derivedB')}** | **${sum('bigFigures')}** | **${sum('bigDerivedB')}** | **${sum('blocks')}** | **${sum('commandedBlocks')}** |`,
);
console.log('');
console.log(`derived rate, reading A: ${sum('derivedA')}/${sum('figures')} = ${pct(sum('derivedA'), sum('figures'))}`);
console.log(`derived rate, reading B: ${sum('derivedB')}/${sum('figures')} = ${pct(sum('derivedB'), sum('figures'))}`);
console.log(`derived rate, reading C: ${sum('bigDerivedB')}/${sum('bigFigures')} = ${pct(sum('bigDerivedB'), sum('bigFigures'))}`);
console.log('');
console.log(
  `reading B's derived set below 100: ${sum('derivedB') - sum('bigDerivedB')} of ${sum('derivedB')}` +
    ` (the range where token collision is expected — this counts magnitude, it does not prove collision)`,
);

console.log('');
console.log('## Tokenizer sensitivity');
console.log('');
console.log(`raw prose numeric tokens before exclusions: ${rawTokens}`);
console.log('');
console.log('| exclusion | tokens removed |');
console.log('| --- | ---: |');
for (const [name] of EXCLUSIONS) console.log(`| ${name} | ${excised.get(name)} |`);
console.log(`| **surviving population** | **${sum('figures')}** |`);

console.log('');
console.log('## Anchor screen — NOT a binding verdict');
console.log('');
console.log('This detects a record that names no immutable anchor ANYWHERE. It cannot show that');
console.log('an anchor it does find binds any particular figure: one unrelated object id makes a');
console.log('whole document pass. Read a record before calling it bound.');
console.log('');
console.log('| record | tree-binding phrases | immutable anchors | mutable refs |');
console.log('| --- | ---: | ---: | ---: |');
for (const r of rows)
  console.log(`| \`${r.file}\` | ${r.treeBound} | ${r.immutableAnchors} | ${r.mutableRefs} |`);
console.log('');
console.log(
  `records with at least one tree-binding phrase: ${rows.filter((r) => r.treeBound > 0).length} of ${rows.length}`,
);
console.log(
  `records naming at least one immutable anchor SOMEWHERE: ${rows.filter((r) => r.immutableAnchors > 0).length} of ${rows.length}` +
    ' (passes the screen; says nothing about which figure it binds)',
);
const mutableOnly = rows.filter((r) => r.mutableRefs > 0 && r.immutableAnchors === 0);
console.log(
  `records naming a mutable ref and NO immutable anchor — the screen's only positive finding: ${mutableOnly.length}` +
    (mutableOnly.length ? ` — ${mutableOnly.map((r) => r.file).join(', ')}` : ''),
);

// The population the ledger row's sketched test would range over.
const ARTIFACT_PATH = /[\w./-]*\b\w+\.(?:json|jsonl|ts|mts|tsx|mjs|py|md|txt|webp|sql|ya?ml)\b/;
const BARE_COUNT = /(?<![\w.$])\d+(?![\w.%])/;
const anchored = [];
for (const file of files) {
  const { prose } = split(readFileSync(file, 'utf8'));
  for (const { text: line, lineNo } of prose) {
    let stripped = line;
    for (const [, re] of EXCLUSIONS) stripped = stripped.replace(re, ' ');
    if (!ARTIFACT_PATH.test(line) || !BARE_COUNT.test(stripped)) continue;
    anchored.push({
      loc: `${relative(ROOT, file)}:${lineNo}`,
      named: COMMAND_IN_PROSE.test(line),
      text: line.trim(),
    });
  }
}
console.log('');
console.log("## The row's sketched test, sized against the live corpus");
console.log('');
console.log('Shape: a prose line stating a bare count AND naming an artifact path.');
console.log('');
console.log(`lines matching: ${anchored.length}`);
console.log(`naming a producing command on the same line: ${anchored.filter((a) => a.named).length}`);
console.log(`not naming one (the gate would fire on these): ${anchored.filter((a) => !a.named).length}`);
console.log('');
console.log('Every line the gate would fire on, so its precision can be judged by reading:');
console.log('');
for (const a of anchored.filter((x) => !x.named)) {
  console.log(`- \`${a.loc}\` — ${a.text.slice(0, 180)}`);
}
