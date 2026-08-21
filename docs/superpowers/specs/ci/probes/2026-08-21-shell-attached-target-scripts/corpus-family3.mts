// Live population of the ATTACHED-target-bearing-a-substitution family, by
// EXECUTION SURFACE.
//
// History, so the superseded numbers are not re-derived. Take 1 scanned raw file
// bytes and reported 123865 attached targets: it measured MENTIONS, and is
// retracted. Take 2 sliced by SHELL_EXTENSIONS and reported 19 with 0
// substitution-bearing: sound but UNDERCOUNTING, because shell text also lives
// in workflow `run:` blocks and package.json scripts.
//
// ROUND 3 finding 1 changed the SCAN SHAPE: it reads the whole chunk rather
// than physical lines, so quote state and backslash continuations survive a
// newline as they do in bash. Three multiline controls pin it.
//
// THREE THINGS CHANGED AT SPEC ROUND 2, all from finding 1:
//
//  1. The detector no longer extracts the lexer's attached-target REGEX. That
//     regex is the thing section 3 REPLACES, so a census keyed on it measures
//     the corpus with the instrument under repair and stops meaning anything the
//     moment the repair lands.
//  2. That regex also consumes `>$(psql)` as only `>$` — proven by the committed
//     slice probe — so the old census classified an IN-DOMAIN spelling as
//     non-substitution-bearing. The scan below is quote-aware and independent.
//  3. `grandSubst` was PRINTED and never ASSERTED, so the census could not fail.
//     It now exits 1 on any substitution-bearing target.
//
// The scan is deliberately GENEROUS. For a claim of ZERO, an over-approximation
// that returns zero is STRONGER than an exact measure: it cannot under-count.
// The POSITIVE CONTROL is what stops the generosity from hiding a broken scan —
// the spellings the spec's acceptance set names must all be detected, or the
// corpus zero is void and this aborts.
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { parseDocument, visit, isPair, isScalar } from "yaml";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../../../../..");
const SCAN = `${ROOT}/tests/cross-cutting/psqlStartupFiles/scan.ts`;
const src = readFileSync(SCAN, "utf8");

function extractList(name: string): string[] {
  const m = src.match(new RegExp(`const ${name} = \\[([^\\]]*)\\]`, "s"));
  if (!m) {
    console.error(`ABORT: ${name} not found in shipped source`);
    process.exit(2);
  }
  return [...m[1]!.matchAll(/"([^"]+)"/g)].map((x) => x[1]!);
}

// Operators and extensions are DECLARATIONS the repair does not change; the
// attached-target regex is an IMPLEMENTATION the repair does change, and is
// deliberately not read here.
const SHELL_EXTENSIONS = extractList("SHELL_EXTENSIONS");
const YAML_EXTENSIONS = extractList("YAML_EXTENSIONS");
const OPS = extractList("REDIRECTION_OPERATORS");
if (OPS.length < 3 || SHELL_EXTENSIONS.length < 1 || YAML_EXTENSIONS.length < 1) {
  console.error("ABORT: extractor floor");
  process.exit(2);
}

/**
 * The attached target region following an operator at `idx`, read with a
 * quote-aware forward scan to the first UNQUOTED whitespace or metacharacter.
 * Returns null when the operator is DETACHED (whitespace follows it).
 */
function attachedRegion(line: string, idx: number, op: string): string | null {
  let i = idx + op.length;
  if (i >= line.length || /\s/.test(line[i]!)) return null;
  const out: string[] = [];
  let quote: string | null = null;
  for (; i < line.length; i++) {
    const c = line[i]!;
    if (quote) {
      out.push(c);
      if (c === "\\" && quote === '"') {
        if (i + 1 < line.length) out.push(line[++i]!);
        continue;
      }
      if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'") {
      quote = c;
      out.push(c);
      continue;
    }
    if (c === "\\") {
      out.push(c);
      if (i + 1 < line.length) out.push(line[++i]!);
      continue;
    }
    if (/\s/.test(c) || c === ";" || c === "|" || c === "&") break; // includes an UNQUOTED newline
    out.push(c);
  }
  return out.join("");
}

const SUBST = /\$\(|`|\$\{/;

type Chunk = { origin: string; text: string };
type Hit = { where: string; target: string; subst: boolean };

function attachedTargets(chunk: Chunk): Hit[] {
  const out: Hit[] = [];
  const text = chunk.text;

  // SCANNED OVER THE WHOLE CHUNK, not per physical line. Spec round 3 finding 1:
  // splitting first ended quote state at every newline, so a backslash
  // continuation inside a quoted target —
  //
  //     cat >"/dev/null\
  //     $(psql)"
  //
  // — which bash executes (oracle: 1 execution) read as the region
  // `"/dev/null\` with subst false. Every control was single-line, so none of
  // them could see it. The escape-pair branch consumes a backslash-newline and
  // the quote branch consumes newlines inside quotes, so scanning the whole text
  // is what makes both behave as bash does.
  const lineOf = (i: number) => {
    let n = 1;
    for (let k = 0; k < i && k < text.length; k++) if (text[k] === "\n") n++;
    return n;
  };

  // A whole-line comment still suppresses, but it is decided per line START.
  const commentLines = new Set<number>();
  text.split("\n").forEach((l, i) => {
    if (/^\s*#/.test(l)) commentLines.add(i + 1);
  });

  for (const op of OPS) {
    let at = 0;
    for (;;) {
      const idx = text.indexOf(op, at);
      if (idx === -1) break;
      at = idx + 1;
      const ln = lineOf(idx);
      if (commentLines.has(ln)) continue;
      const region = attachedRegion(text, idx, op);
      if (region === null || region === "") continue;
      out.push({
        where: `${chunk.origin}:${ln}`,
        target: `${op}${region}`,
        subst: SUBST.test(region),
      });
    }
  }
  return out;
}

// ---- POSITIVE CONTROL: the spec's own acceptance set must be detected --------
const CONTROL: Array<[id: string, line: string, wantSubst: boolean]> = [
  ["A bare backtick", "cat >`psql -c 'select 1'`", true],
  ["B $() in double quotes", `cat >"$(psql -c 'select 1')"`, true],
  ["C backtick in double quotes", "cat >\"`psql -c 'select 1'`\"", true],
  ["D locale-quoted", `cat >$"$(psql -c 'select 1')"`, true],
  ["E brace operand", "cat >${OUT:-$(psql -c 'select 1')}", true],
  ["G brace inside double quotes", `cat >"\${OUT:-$(psql -c 'select 1')}"`, true],
  ["bare $( ) — the spelling the OLD census missed", "cat >$(command -v psql)", true],
  ["a plain path must NOT count", "cat >/dev/null", false],
  ["a DETACHED substitution must NOT count as attached", "cat > $(command -v psql)", false],
  // Round 3 finding 1: every control above is single-line, which is exactly why
  // none of them saw the continuation case. These two cross a newline.
  ['MULTILINE: continuation inside a quoted target', 'cat >"/dev/null\\\n$(psql)"', true],
  ['MULTILINE: substitution spanning a newline inside quotes', 'cat >"\n$(psql)"', true],
  ["an UNQUOTED newline must END the region", "cat >out\n$(psql)\n", false],
];
let controlFailures = 0;
console.log("POSITIVE CONTROL — the acceptance set must be detected:");
for (const [id, line, wantSubst] of CONTROL) {
  const hits = attachedTargets({ origin: "control", text: line });
  const got = hits.some((h) => h.subst);
  const ok = got === wantSubst;
  if (!ok) controlFailures++;
  console.log(`  ${ok ? "ok   " : "FAIL "} ${id}`);
}
if (controlFailures > 0) {
  console.error(
    `\nABORT: ${controlFailures} control(s) failed — the scan cannot see the family, so a corpus zero would mean nothing.`,
  );
  process.exit(2);
}

// ---- the corpus, by execution surface ---------------------------------------
const all = execFileSync(
  "git",
  ["-C", ROOT, "ls-files", "--cached", "--others", "--exclude-standard"],
  { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
)
  .split("\n")
  .filter(Boolean);

const shellChunks: Chunk[] = [];
for (const rel of all) {
  if (!SHELL_EXTENSIONS.some((e) => rel.endsWith(e))) continue;
  shellChunks.push({ origin: rel, text: readFileSync(`${ROOT}/${rel}`, "utf8") });
}

const runChunks: Chunk[] = [];
for (const rel of all) {
  if (!YAML_EXTENSIONS.some((e) => rel.endsWith(e))) continue;
  let doc;
  try {
    doc = parseDocument(readFileSync(`${ROOT}/${rel}`, "utf8"));
  } catch {
    continue;
  }
  visit(doc, {
    Pair(_k, pair) {
      if (!isPair(pair)) return;
      const key = pair.key;
      if (!isScalar(key) || String(key.value) !== "run") return;
      const val = pair.value;
      if (!isScalar(val) || typeof val.value !== "string") return;
      runChunks.push({ origin: `${rel} run:`, text: val.value });
    },
  });
}

const scriptChunks: Chunk[] = [];
for (const rel of all) {
  if (!rel.endsWith("package.json")) continue;
  let pkg: { scripts?: Record<string, unknown> };
  try {
    pkg = JSON.parse(readFileSync(`${ROOT}/${rel}`, "utf8"));
  } catch {
    continue;
  }
  for (const [name, body] of Object.entries(pkg.scripts ?? {})) {
    if (typeof body === "string") {
      scriptChunks.push({ origin: `${rel} scripts.${name}`, text: body });
    }
  }
}

const SURFACES: Array<[string, Chunk[], number]> = [
  ["whole-file shell (.sh/.bash)", shellChunks, 1],
  ["workflow run: scalars", runChunks, 20],
  ["package.json scripts", scriptChunks, 20],
];

let grandSubst = 0;
const substWitnesses: string[] = [];
for (const [name, chunks, floor] of SURFACES) {
  console.log(`\n=== ${name} — ${chunks.length} chunks`);
  if (chunks.length < floor) {
    console.error(`ABORT: population floor for ${name} (${chunks.length} < ${floor})`);
    process.exit(2);
  }
  const targets = chunks.flatMap((c) => attachedTargets(c));
  const withSubst = targets.filter((t) => t.subst);
  grandSubst += withSubst.length;
  substWitnesses.push(...withSubst.map((t) => `${t.where}  ${t.target.slice(0, 90)}`));
  console.log(`attached targets: ${targets.length}`);
  console.log(`  ...substitution-bearing: ${withSubst.length}`);
  if (targets.length === 0) {
    const redirChars = chunks.filter((c) => /[<>]/.test(c.text)).length;
    console.log(`  chunks containing any < or > character: ${redirChars}`);
    if (redirChars > 0) {
      console.error(
        `ABORT: ${name} has ${redirChars} chunks with redirection characters and yielded none`,
      );
      process.exit(2);
    }
    console.log("  zero ATTRIBUTABLE: no redirection character exists on this surface.");
    continue;
  }
  console.log(
    "  witnesses (proves the scan fires here):\n" +
      targets
        .slice(0, 6)
        .map((t) => `    ${t.where}  ${t.target.slice(0, 70)}`)
        .join("\n"),
  );
}

console.log(`\nTOTAL substitution-bearing attached targets: ${grandSubst}`);
if (grandSubst > 0) {
  console.error("\nFAIL: the live population is NOT zero:");
  for (const w of substWitnesses.slice(0, 25)) console.error(`  ${w}`);
  process.exit(1);
}
console.log("PASS: zero substitution-bearing attached targets across all three surfaces.");
