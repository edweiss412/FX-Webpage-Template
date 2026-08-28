#!/usr/bin/env node
// Census of line-keyed rows under tests/**. Produces every number in
// docs/superpowers/specs/2026-08-28-line-keyed-registry-durable-keys-design.md §1, §4.
// Walker-derived: the file set comes from disk, never a hand-written list.
import { readdirSync, readFileSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";

const TEST_ROOT = "tests";

function walk(dir, out = []) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx|mts)$/.test(p)) out.push(p);
  }
  return out;
}

const LINE_FIELD = /\blines?:\s*\[?\s*\d+/;
// `[` and `]` are in the class deliberately: Next.js dynamic routes
// (app/show/[slug]/...) are real targets, and omitting them silently dropped rows.
const PATH_LINE =
  /["'`]([\w./@\[\]-]+\.(?:tsx?|mjs|cjs|jsx|md|sql|css|ya?ml))\s*:\s*(\d+)(?::\d+)?["'`]/g;

/** Split a file's lines into code and comment, so a prose citation is never counted as a key. */
function classifyLines(src) {
  const out = [];
  let inBlock = false;
  for (const raw of src.split("\n")) {
    const t = raw.trim();
    let isComment = inBlock || t.startsWith("//") || t.startsWith("*");
    if (!inBlock && t.startsWith("/*")) {
      isComment = true;
      inBlock = !t.includes("*/");
    } else if (inBlock && t.includes("*/")) inBlock = false;
    out.push({ raw, isComment });
  }
  return out;
}

/** A target is synthetic when the path does not exist on disk. */
const isSynthetic = (target) => !existsSync(target);

/**
 * A row is CONSTRUCTED when it is a test-local input object rather than a registry row
 * joined against a recomputed line. Existing on disk is NOT sufficient: two rows in
 * _metaControlOutlineResidue build `ScanElement` literals naming real files, and they
 * cannot churn because nothing recomputes their line.
 *
 * The rule is deliberately narrow: an explicit `ScanElement` type annotation within the
 * three lines above the row. It does not try to recognise constructed inputs in general.
 * A shape it cannot classify stays COUNTED, so it is wrong loudly in the totals rather
 * than silently excluded.
 */
function isConstructed(lines, i) {
  for (let j = i; j >= Math.max(0, i - 3); j--) {
    if (/:\s*ScanElement\b/.test(lines[j].raw)) return true;
  }
  return false;
}

const files = walk(TEST_ROOT);
let synthetic = 0,
  comment = 0,
  bearing = 0,
  constructed = 0;
const perFile = new Map();

for (const f of files) {
  const lines = classifyLines(readFileSync(f, "utf8"));
  const src = lines.map((l) => l.raw).join("\n");

  // Shape A: a `line:` field, with its owning row's `file:` found by scanning back.
  // Brace-counting is deliberately avoided: rows carry nested braces in template
  // literals and prose, which is what made an earlier `[^{}]*` form undercount
  // tapTargetCensus by eight rows.
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].isComment || !LINE_FIELD.test(lines[i].raw)) continue;
    let target = null;
    for (let j = i; j >= Math.max(0, i - 8); j--) {
      const m = lines[j].raw.match(/\bfile:\s*"([^"]+)"/);
      if (m) {
        target = m[1];
        break;
      }
    }
    if (target === null) continue;
    const r = perFile.get(f) ?? {
      shapeA: 0,
      shapeB: 0,
      synthetic: 0,
      constructed: 0,
      targets: new Map(),
    };
    if (isSynthetic(target)) {
      synthetic++;
      r.synthetic++;
    } else if (isConstructed(lines, i)) {
      constructed++;
      r.constructed = (r.constructed ?? 0) + 1;
    } else {
      bearing++;
      r.shapeA++;
      r.targets.set(target, (r.targets.get(target) ?? 0) + 1);
    }
    perFile.set(f, r);
  }

  // Shape B: "path:line" string literals, split by code vs comment
  for (const l of lines) {
    for (const m of l.raw.matchAll(PATH_LINE)) {
      if (l.isComment) {
        comment++;
        continue;
      }
      const target = m[1];
      const r = perFile.get(f) ?? { shapeA: 0, shapeB: 0, synthetic: 0, targets: new Map() };
      if (isSynthetic(target)) {
        synthetic++;
        r.synthetic++;
      } else {
        bearing++;
        r.shapeB++;
        r.targets.set(target, (r.targets.get(target) ?? 0) + 1);
      }
      perFile.set(f, r);
    }
  }
}

const rows = [...perFile.entries()]
  .map(([f, r]) => ({ f, ...r, total: r.shapeA + r.shapeB }))
  .filter((r) => r.total > 0)
  .sort((a, b) => b.total - a.total);

const treeOf = (targets) => {
  const trees = new Set();
  for (const t of targets.keys())
    trees.add(
      t
        .split("/")
        .slice(0, t.startsWith("app/api") ? 2 : 1)
        .join("/") + "/",
    );
  return [...trees].sort().join(", ");
};

console.log(`files scanned: ${files.length}`);
console.log(
  `POPULATIONS  synthetic=${synthetic}  comment-citation=${comment}  constructed-input=${constructed}  load-bearing=${bearing}`,
);
console.log("");
console.log("registry\trows\ttarget-tree");
for (const r of rows) console.log(`${r.f}\t${r.total}\t${treeOf(r.targets)}`);

// --anchors: resolve every load-bearing row to its site and report whether the
// closed anchor grammar (§3.2) can name it. Produces the §4.3 decline numbers.
if (process.argv.includes("--anchors")) {
  const OPEN_TAG = (win) => win.split(">")[0] + ">";
  console.log("\nregistry\trows\ttestid\tlabel\temit\tno-syntactic-anchor");
  let T = [0, 0, 0, 0, 0];
  for (const r of rows) {
    let testid = 0,
      label = 0,
      emit = 0,
      decline = 0;
    for (const [target, n] of r.targets) {
      const src = readFileSync(target, "utf8").split("\n");
      // Re-locate each keyed line in this registry for this target.
      const keyed = [];
      const regSrc = classifyLines(readFileSync(r.f, "utf8"));
      for (let i = 0; i < regSrc.length; i++) {
        if (regSrc[i].isComment) continue;
        const lm = regSrc[i].raw.match(/\blines?:\s*(\d+)/);
        const sm = regSrc[i].raw.match(
          new RegExp(`"${target.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*:\\s*(\\d+)"`),
        );
        if (sm) keyed.push(+sm[1]);
        else if (lm) {
          for (let j = i; j >= Math.max(0, i - 8); j--) {
            const fm = regSrc[j].raw.match(/\bfile:\s*"([^"]+)"/);
            if (fm) {
              if (fm[1] === target) keyed.push(+lm[1]);
              break;
            }
          }
        }
      }
      for (const ln of keyed.slice(0, n)) {
        const win = src.slice(ln - 1, ln + 7).join("\n");
        const open = OPEN_TAG(win);
        if (/data-testid=/.test(open)) testid++;
        else if (/\bid=|aria-label=/.test(open)) label++;
        else if (/^(lib|app\/api)\//.test(target)) emit++;
        else decline++;
      }
    }
    const tot = testid + label + emit + decline;
    if (tot === 0) continue;
    console.log(`${r.f}\t${tot}\t${testid}\t${label}\t${emit}\t${decline}`);
    T = [T[0] + tot, T[1] + testid, T[2] + label, T[3] + emit, T[4] + decline];
  }
  console.log(`TOTAL\t${T[0]}\t${T[1]}\t${T[2]}\t${T[3]}\t${T[4]}`);
}

// --collisions: test whether the `emit` anchor (§3.2) is unique across the
// alert-producer registry. Produces every number in §5.
if (process.argv.includes("--collisions")) {
  const REG = "tests/adminAlerts/alertProducerScope.registry.ts";
  const src = readFileSync(REG, "utf8");
  const blocks = [...src.matchAll(/\{[^{}]*?site:\s*"([^"]+)"[^{}]*?\}/gs)].map((m) => m[0]);
  const parsed = blocks.map((b) => ({
    site: (b.match(/site:\s*"([^"]+)"/) || [])[1],
    code: (b.match(/code:\s*"([^"]+)"/) || [])[1] ?? null,
    ctx: ((b.match(/contextKeys:\s*\[([^\]]*)\]/) || [])[1] || "").replace(/["\s]/g, ""),
    scope: (b.match(/scope:\s*"([^"]+)"/) || [])[1] ?? "",
  }));
  const real = parsed.filter((r) => existsSync(r.site.replace(/:\d+$/, "")));
  console.log(
    `\nrows parsed=${parsed.length}  target-exists=${real.length}  with-code=${real.filter((r) => r.code).length}`,
  );
  const groups = new Map();
  for (const r of real) {
    const id = r.site.replace(/:\d+$/, "") + "::" + r.code;
    if (!groups.has(id)) groups.set(id, []);
    groups.get(id).push(r);
  }
  const collided = [...groups].filter(([, a]) => a.length > 1);
  const extra = collided.reduce((n, [, a]) => n + a.length - 1, 0);
  let resolved = 0,
    unresolved = 0,
    declineRows = 0;
  for (const [id, arr] of collided) {
    const sig = new Set(arr.map((a) => a.ctx + "|" + a.scope));
    if (sig.size === arr.length) {
      resolved++;
      continue;
    }
    unresolved++;
    declineRows += arr.length;
    console.log(`UNRESOLVED ${id}  n=${arr.length}`);
    for (const a of arr) console.log(`    ${a.site}  ctx=[${a.ctx}] scope=${a.scope}`);
  }
  console.log(
    `(file,code) distinct=${groups.size}  colliding-groups=${collided.length}  surplus-rows=${extra}`,
  );
  console.log(
    `resolved-by-content=${resolved}  unresolved=${unresolved}  declining-rows=${declineRows}`,
  );
}

// --proximity: lower-bound probe for the silent-misbind path described in §2.
// Counts keyed-row pairs close enough that an ordinary insert can land one
// row's line on another's. A lower bound: the scanner's element set is denser
// than the keyed subset, so real exposure is larger.
if (process.argv.includes("--proximity")) {
  const WINDOW = 20;
  console.log(`\nregistry\tkeyed-lines\tadjacent-pairs\tpairs-within-${WINDOW}`);
  for (const r of rows) {
    const lines = classifyLines(readFileSync(r.f, "utf8"));
    const byTarget = new Map();
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].isComment) continue;
      const lm = lines[i].raw.match(/\blines?:\s*(\d+)/);
      const sm = [...lines[i].raw.matchAll(PATH_LINE)];
      if (sm.length) {
        for (const m of sm) {
          if (!byTarget.has(m[1])) byTarget.set(m[1], []);
          byTarget.get(m[1]).push(+m[2]);
        }
        continue;
      }
      if (!lm) continue;
      for (let j = i; j >= Math.max(0, i - 8); j--) {
        const fm = lines[j].raw.match(/\bfile:\s*"([^"]+)"/);
        if (fm) {
          if (!byTarget.has(fm[1])) byTarget.set(fm[1], []);
          byTarget.get(fm[1]).push(+lm[1]);
          break;
        }
      }
    }
    let tot = 0,
      pairs = 0,
      atRisk = 0;
    for (const ls of byTarget.values()) {
      const s = [...new Set(ls)].sort((a, b) => a - b);
      tot += s.length;
      for (let i = 0; i + 1 < s.length; i++) {
        pairs++;
        if (s[i + 1] - s[i] <= WINDOW) atRisk++;
      }
    }
    if (tot > 1) console.log(`${r.f}\t${tot}\t${pairs}\t${atRisk}`);
  }
}
