#!/usr/bin/env node
// Census of line-keyed rows under tests/**. Produces every number in
// docs/superpowers/specs/2026-08-28-line-keyed-registry-durable-keys-design.md §1, §4.
// Walker-derived: the file set comes from disk, never a hand-written list.
import { readdirSync, readFileSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";

// `--root <dir>` exists so the census can be pointed at a fixture tree; the
// suite in tests/scripts/lineKeyCensus.test.ts is its only caller. Default is
// the repo's own tests/ tree.
const rootFlag = process.argv.indexOf("--root");
const TEST_ROOT =
  rootFlag !== -1 && process.argv[rootFlag + 1]
    ? join(process.argv[rootFlag + 1], "tests")
    : "tests";

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
/**
 * The opening-tag span of the JSX element at `ln`: from the tag line forward
 * until the tag closes at attribute-brace depth 0, or `maxLines` is reached.
 *
 * Truncating at the first ">" is WRONG and was wrong in this file: an inline
 * `onClick={() => ...}` contains one, so the window could end before the
 * element's own attributes and a present data-testid read as absent. That
 * defect put the JSX anchorability figure at 79% when it is 39%.
 */
function openingTagSpan(src, ln, maxLines = 14) {
  const L = src.split("\n");
  const out = [];
  let depth = 0;
  for (let i = ln - 1; i < Math.min(L.length, ln - 1 + maxLines); i++) {
    const line = L[i];
    out.push(line);
    for (let c = 0; c < line.length; c++) {
      const ch = line[c];
      if (ch === "{") depth++;
      else if (ch === "}") depth--;
      else if (ch === ">" && depth === 0) {
        if (c > 0 && line[c - 1] === "=") continue; // an arrow, not the tag close
        return out.join("\n");
      }
    }
  }
  return out.join("\n");
}

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

// --ambiguity: an anchor must EXIST and DISCRIMINATE. Recomputes the §4.3 split
// counting a row as anchored only when its anchor is unique in its target file.
if (process.argv.includes("--ambiguity")) {
  const esc = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  console.log("\nregistry\trows\ttestid-uniq\ttestid-dup\tlabel-uniq\tlabel-dup\temit\tno-anchor");
  let T = [0, 0, 0, 0, 0, 0, 0];
  for (const r of rows) {
    let tu = 0,
      td = 0,
      lu = 0,
      ld = 0,
      em = 0,
      na = 0;
    const regLines = classifyLines(readFileSync(r.f, "utf8"));
    for (let i = 0; i < regLines.length; i++) {
      if (regLines[i].isComment) continue;
      let target = null,
        ln = null;
      const sm = [...regLines[i].raw.matchAll(PATH_LINE)][0];
      if (sm) {
        target = sm[1];
        ln = +sm[2];
      } else {
        const lm = regLines[i].raw.match(/\blines?:\s*(\d+)/);
        if (!lm) continue;
        for (let j = i; j >= Math.max(0, i - 8); j--) {
          const fm = regLines[j].raw.match(/\bfile:\s*"([^"]+)"/);
          if (fm) {
            target = fm[1];
            ln = +lm[1];
            break;
          }
        }
      }
      if (target === null || !existsSync(target)) continue;
      if (isConstructed(regLines, i)) continue; // same exclusion the base census applies
      const src = readFileSync(target, "utf8");
      const open = openingTagSpan(src, ln);
      const tm = open.match(/data-testid=\{?["`]([^"`}]+)["`]\}?/);
      if (tm) {
        const n = [...src.matchAll(new RegExp(`data-testid=\\{?["\`]${esc(tm[1])}["\`]\\}?`, "g"))]
          .length;
        if (n > 1) td++;
        else tu++;
        continue;
      }
      const lb = open.match(/(?:aria-label|\bid)=\{?["`]([^"`}]+)["`]\}?/);
      if (lb) {
        const n = [
          ...src.matchAll(new RegExp(`(?:aria-label|\\bid)=\\{?["\`]${esc(lb[1])}["\`]\\}?`, "g")),
        ].length;
        if (n > 1) ld++;
        else lu++;
        continue;
      }
      if (/^(lib|app\/api)\//.test(target)) {
        em++;
        continue;
      }
      na++;
    }
    if (tu + td + lu + ld + em + na === 0) continue;
    console.log(`${r.f}\t${tu + td + lu + ld + em + na}\t${tu}\t${td}\t${lu}\t${ld}\t${em}\t${na}`);
    T = [
      T[0] + tu + td + lu + ld + em + na,
      T[1] + tu,
      T[2] + td,
      T[3] + lu,
      T[4] + ld,
      T[5] + em,
      T[6] + na,
    ];
  }
  console.log(`TOTAL\t${T[0]}\t${T[1]}\t${T[2]}\t${T[3]}\t${T[4]}\t${T[5]}\t${T[6]}`);
  console.log(`\nDECLINE = testid-dup + label-dup + no-anchor = ${T[2] + T[4] + T[6]}`);
  console.log(`ANCHORED = testid-uniq + label-uniq + emit = ${T[1] + T[3] + T[5]}`);
}

// --derivability: an emit anchor is only content-anchored if the SCANNER can
// derive its fields from the site. A row flagged `dynamic` has `code == null`
// at discovery, a row flagged `computedContext` has hand-authored context, and
// `scope` is registry-authored for every row. Comparing those against the
// registry compares the row to itself. This mode prints that split, which is
// the measurement the arc's scope decision turned on.
if (process.argv.includes("--derivability")) {
  const REG = "tests/adminAlerts/alertProducerScope.registry.ts";
  const regSrc = readFileSync(REG, "utf8");
  const blocks = [...regSrc.matchAll(/\{[^{}]*?site:\s*"([^"]+)"[^{}]*?\}/gs)].map((m) => m[0]);
  const rows = blocks.map((b) => ({
    site: (b.match(/site:\s*"([^"]+)"/) || [])[1],
    code: (b.match(/code:\s*"([^"]+)"/) || [])[1] ?? null,
    ctx: ((b.match(/contextKeys:\s*\[([^\]]*)\]/) || [])[1] || "")
      .replace(/["\s]/g, "")
      .split(",")
      .filter(Boolean)
      .sort()
      .join(","),
    dynamic: /dynamic:\s*true/.test(b),
    computed: /computedContext:\s*true/.test(b),
  }));
  const dyn = rows.filter((r) => r.dynamic).length;
  const comp = rows.filter((r) => r.computed).length;
  const both = rows.filter((r) => r.dynamic && r.computed).length;
  const derivable = rows.filter((r) => !r.dynamic && !r.computed);
  const g = new Map();
  for (const r of derivable) {
    const k = [r.site.replace(/:\d+$/, ""), r.code, r.ctx].join("  ");
    if (!g.has(k)) g.set(k, []);
    g.get(k).push(r);
  }
  let bound = 0,
    ambiguous = 0;
  for (const [, a] of g) a.length === 1 ? bound++ : (ambiguous += a.length);
  console.log(`\n${REG}`);
  console.log(`rows=${rows.length}  dynamic=${dyn}  computedContext=${comp}  both=${both}`);
  console.log(
    `site-derivable (neither flag) = ${derivable.length} of ${rows.length} = ${Math.round((100 * derivable.length) / rows.length)}%`,
  );
  console.log(
    `  of those: Bound=${bound}  Ambiguous=${ambiguous}   (anchor without the registry-authored scope)`,
  );
}
