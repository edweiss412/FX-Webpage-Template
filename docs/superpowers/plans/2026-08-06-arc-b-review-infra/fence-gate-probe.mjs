// Corpus-calibration probe for BL-PLAN-SNIPPET-FENCE-GATE (arc B spec spike).
// Rebuilds the five decidable shapes from the entry's rule list (the prototype is
// gone) at PROBE fidelity: the point is a hit/miss table over the live corpus so
// the spec's accept-set and blocking decision are calibrated, not guessed.
// Usage: node plan-fence-probe.mjs <repo-root>
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const root = process.argv[2];
const plansDir = join(root, "docs/superpowers/plans");

function walk(dir, out = []) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    const s = statSync(p);
    if (s.isDirectory()) walk(p, out);
    else if (e.endsWith(".md")) out.push(p);
  }
  return out;
}

// Fence extraction: CommonMark-lite (top-level ``` fences, 0-3 col indent).
function fences(text) {
  const lines = text.split("\n");
  const out = [];
  let open = null;
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
    if (!open) {
      if (m) open = { info: m[2].trim(), start: i + 1, char: m[1][0], len: m[1].length, body: [] };
    } else if (m && m[1][0] === open.char && m[1].length >= open.len && m[2].trim() === "") {
      out.push({ ...open, end: i + 1, body: open.body.join("\n") });
      open = null;
    } else open.body.push(lines[i]);
  }
  return out;
}

// Attribution: nearest preceding non-blank prose line containing exactly one
// backticked repo-path-shaped token (the prototype's heuristic, tightened).
function attribution(lines, fenceStartIdx) {
  for (let i = fenceStartIdx - 2; i >= 0 && i > fenceStartIdx - 8; i--) {
    const l = lines[i];
    if (l.trim() === "") continue;
    const paths = [...l.matchAll(/`([\w@./[\]-]+\.(?:ts|tsx|mjs|js|css|sql|yml|yaml|json))`/g)].map(m => m[1]);
    return paths.length === 1 ? paths[0] : null;
  }
  return null;
}

const KNOWN_APIS = ["describe", "it", "test", "expect", "vi", "beforeAll", "afterAll", "beforeEach", "render", "readFileSync", "join", "screen", "fireEvent", "waitFor", "useState", "useEffect"];
const CODE_INFO = /^(ts|tsx|typescript|js|jsx|mjs)?$/;

const perRule = { UNIMPORTED_IDENTIFIER: [], DUPLICATE_IMPORT: [], MANGLED_TEMPLATE: [], UNCHECKED_INDEX: [], FENCE_EM_DASH: [] };
let fileCount = 0, fenceCount = 0, codeFenceCount = 0;

for (const f of walk(plansDir)) {
  const text = readFileSync(f, "utf8");
  const rel = relative(root, f);
  const lines = text.split("\n");
  const fs = fences(text);
  if (fs.length) fileCount++;
  fenceCount += fs.length;
  const byTarget = new Map();
  for (const fence of fs) {
    const isCode = CODE_INFO.test(fence.info) && /[;{}=]|=>/.test(fence.body);
    if (!isCode) {
      // FENCE_EM_DASH applies to every fence (pasted snippet content).
      if (fence.body.includes("—")) perRule.FENCE_EM_DASH.push(`${rel}:${fence.start}`);
      continue;
    }
    codeFenceCount++;
    if (fence.body.includes("—")) perRule.FENCE_EM_DASH.push(`${rel}:${fence.start}`);
    // MANGLED_TEMPLATE: markdown-escape artifacts inside code.
    if (/\\`|\\\$\{/.test(fence.body)) perRule.MANGLED_TEMPLATE.push(`${rel}:${fence.start}`);
    // Module-shaped = has at least one import line.
    const imports = [...fence.body.matchAll(/^import\s+(?:type\s+)?(?:\{([^}]*)\}|(\w+)|\*\s+as\s+(\w+))/gm)];
    const declared = new Set();
    for (const im of imports) {
      if (im[1]) im[1].split(",").forEach(s => declared.add(s.trim().split(/\s+as\s+/).pop()));
      if (im[2]) declared.add(im[2]);
      if (im[3]) declared.add(im[3]);
    }
    for (const dm of fence.body.matchAll(/(?:const|let|function|class)\s+(\w+)/g)) declared.add(dm[1]);
    if (imports.length > 0) {
      const used = KNOWN_APIS.filter(a => new RegExp(`\\b${a}\\s*\\(`).test(fence.body) && !declared.has(a));
      if (used.length) perRule.UNIMPORTED_IDENTIFIER.push(`${rel}:${fence.start} [${used.join(",")}]`);
    }
    // UNCHECKED_INDEX candidate pattern (syntactic approximation, needs calibration):
    // numeric index followed by member access, no optional chain / non-null.
    for (const um of fence.body.matchAll(/\b\w+\[\d+\]\.(?!\.)\w+/g)) {
      perRule.UNCHECKED_INDEX.push(`${rel}:${fence.start} {${um[0]}}`);
    }
    // DUPLICATE_IMPORT across fences attributed to the same target file.
    const target = attribution(lines, fence.start);
    if (target) {
      const key = `${rel}::${target}`;
      if (!byTarget.has(key)) byTarget.set(key, new Map());
      const seen = byTarget.get(key);
      for (const b of declared) {
        if (imports.length && seen.has(b) && seen.get(b) !== fence.start) {
          perRule.DUPLICATE_IMPORT.push(`${rel}:${fence.start} {${b}} (also fence at :${seen.get(b)}, target ${target})`);
        } else if (imports.length) seen.set(b, fence.start);
      }
    }
  }
}

console.log(`corpus: ${fileCount} plan files with fences, ${fenceCount} fences, ${codeFenceCount} module-ish code fences`);
for (const [rule, hits] of Object.entries(perRule)) {
  console.log(`\n${rule}: ${hits.length} hits`);
  for (const h of hits.slice(0, 25)) console.log(`  ${h}`);
  if (hits.length > 25) console.log(`  ... ${hits.length - 25} more`);
}
