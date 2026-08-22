#!/usr/bin/env node
// Census of stated figures in probe records, for BL-DERIVED-NUMBERS-IN-DOCS-ROT.
//
// The ledger row's first scheduled step is "grep the probe records for stated
// figures and classify each as derived or hand-carried". This script is that
// step. Its headline result is that the classification IS NOT STABLE: three
// defensible readings of "derived" give three different answers over the same
// corpus, so the size of the hand-carried set is not a measurement.
//
// It therefore reports every reading rather than picking one, and separately
// reports the discriminator that IS stable — whether a figure is bound to the
// tree it was measured on.
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
  for (const line of text.split('\n')) {
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
      prose.push(line);
      preamble.push(line);
    } else buf.push(line);
  }
  if (fence !== null) prose.push(...buf);
  return { prose, withCmdInside, withCmdInPreamble, bare };
}

const files = walk(ROOT).sort();
const excised = new Map(EXCLUSIONS.map(([n]) => [n, 0]));
const rows = [];
let rawTokens = 0;

for (const file of files) {
  const text = readFileSync(file, 'utf8');
  const { prose, withCmdInside, withCmdInPreamble, bare } = split(text);
  const proseText = prose.join('\n');
  rawTokens += (proseText.match(NUM) ?? []).length;

  let stripped = proseText;
  for (const [name, re] of EXCLUSIONS) {
    stripped = stripped.replace(re, (m) => {
      excised.set(name, excised.get(name) + (m.match(NUM) ?? []).length);
      return ' ';
    });
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
  });
}

const sum = (k) => rows.reduce((a, r) => a + r[k], 0);
const pct = (n, d) => (d ? `${((100 * n) / d).toFixed(1)}%` : '-');

console.log(`# derived-number census — ${ROOT}`);
console.log(`# records walked: ${files.length}`);
console.log('');
console.log('## Three readings of "derived", same corpus');
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
  `single-digit share of reading B's derived set: ${sum('derivedB') - sum('bigDerivedB') - 0} of ${sum('derivedB')} are below 100`,
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
console.log('## Tree binding — the stable discriminator');
console.log('');
console.log('A figure that names the revision it was measured on is permanently true of that');
console.log('revision and cannot rot. Records carrying at least one such binding:');
console.log('');
console.log('| record | tree-binding phrases |');
console.log('| --- | ---: |');
for (const r of rows) console.log(`| \`${r.file}\` | ${r.treeBound} |`);
console.log('');
console.log(
  `records with at least one tree binding: ${rows.filter((r) => r.treeBound > 0).length} of ${rows.length}`,
);

// The population the ledger row's sketched test would range over.
const ARTIFACT_PATH = /[\w./-]*\b\w+\.(?:json|jsonl|ts|mts|tsx|mjs|py|md|txt|webp|sql|ya?ml)\b/;
const BARE_COUNT = /(?<![\w.$])\d+(?![\w.%])/;
const anchored = [];
for (const file of files) {
  const { prose } = split(readFileSync(file, 'utf8'));
  prose.forEach((line, i) => {
    let s = line;
    for (const [, re] of EXCLUSIONS) s = s.replace(re, ' ');
    if (!ARTIFACT_PATH.test(line) || !BARE_COUNT.test(s)) return;
    anchored.push({
      loc: `${relative(ROOT, file)}:${i + 1}`,
      named: COMMAND_IN_PROSE.test(line),
      text: line.trim(),
    });
  });
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
