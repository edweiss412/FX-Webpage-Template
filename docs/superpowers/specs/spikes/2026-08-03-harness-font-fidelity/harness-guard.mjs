// Simulates the target-state compileEntryCss post-step, then exercises the
// HARNESS-SIDE guard rows -- the four §4.1 rows that were NOT among the 30
// app-side mutants.
import { mkdtempSync, copyFileSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { transform } = require(process.env.LCSS);
const SUBSETS = ["cyrillic-ext","cyrillic","greek-ext","greek","vietnamese","latin-ext","latin"];
const SRC = "/tmp/spike-fonts";
const APP = readFileSync(join(SRC, "fonts.css"), "utf8");

// --- the post-step under test: bare siblings + font-display: block + copies ---
export function emit(mutate = (s) => s) {
  const dir = mkdtempSync(join(tmpdir(), "harness-"));
  let css = APP.replace(/url\("\/fonts\//g, 'url("').replace(/font-display:\s*swap/g, "font-display: block");
  writeFileSync(join(dir, "entry.css"), mutate(css));
  for (const n of SUBSETS) copyFileSync(join(SRC, `inter-${n}.woff2`), join(dir, `inter-${n}.woff2`));
  return dir;
}

const parse = (text) => {
  const faces = [];
  transform({ filename: "e.css", code: Buffer.from(text), minify: false, visitor: { Rule: { "font-face"(r) {
    const d = {}, order = [];
    for (const p of r.value.properties) {
      const name = p.type === "custom" ? p.value.name : (p.type === "source" ? "src" : p.type);
      order.push(name); d[name] = p.value;
    }
    faces.push({ d, order });
  }}}});
  return faces;
};
const fam = (f) => typeof f.d["font-family"] === "string" ? f.d["font-family"] : "";
const urlOf = (f) => { const s = f.d["src"] ?? []; return s.length === 1 && s[0].type === "url" ? s[0].value.url.url : null; };

export function checkHarness(dir) {
  const out = [];
  const emitted = parse(readFileSync(join(dir, "entry.css"), "utf8"));
  const app = parse(APP);
  const eInter = emitted.filter((f) => fam(f) === "Inter");
  const aInter = app.filter((f) => fam(f) === "Inter");
  const add = (n, ok) => out.push({ n, ok });

  add("H1 seven Inter faces emitted", eInter.length === 7);
  // H2: every emitted src is a BARE sibling filename -- no path segment at all
  add("H2 every src is a bare sibling filename", eInter.every((f) => {
    const u = urlOf(f); return !!u && /^inter-[a-z-]+\.woff2$/.test(u) && !u.includes("/");
  }));
  // H3: resolved against the emitted stylesheet, each URL lands on a copied file
  add("H3 each url resolves to a copied sibling", eInter.every((f) => {
    const u = urlOf(f); if (!u) return false;
    const r = new URL(u, "https://x.test/harness/entry.css");
    const base = r.pathname.split("/").pop();
    return r.pathname === `/harness/${base}` && existsSync(join(dir, base));
  }));
  // H4: copied bytes hash-match the committed originals
  add("H4 copied woff2 hash-match the originals", SUBSETS.every((n) => {
    const a = createHash("sha256").update(readFileSync(join(SRC, `inter-${n}.woff2`))).digest("hex");
    const b = existsSync(join(dir, `inter-${n}.woff2`))
      ? createHash("sha256").update(readFileSync(join(dir, `inter-${n}.woff2`))).digest("hex") : "";
    return a === b;
  }));
  // H5: harness declares block, app declares swap -- the deliberate divergence
  add("H5 emitted font-display is block", eInter.every((f) => JSON.stringify(f.d["font-display"] ?? "").includes("block")));
  add("H5b app font-display is swap", aInter.every((f) => JSON.stringify(f.d["font-display"] ?? "").includes("swap")));
  // H6 (round 23): this was EXISTENTIAL -- it found some app face with a matching
  // range and compared inventory/weight/style, never the source. A permuted
  // filename, latin's bytes under greek's name, or an unsupported format all
  // escaped. It is now MAP EQUALITY keyed on the subset name in the filename,
  // mirroring the app-side row rather than approximating it.
  const bySubset = new Map();
  for (const a of aInter) {
    const u = urlOf(a) ?? "";
    const n = u.match(/inter-([a-z-]+)\.woff2$/)?.[1];
    if (n) bySubset.set(n, a);
  }
  add("H6 emitted faces map 1:1 onto the app faces by subset", (() => {
    const names = eInter.map((e) => (urlOf(e) ?? "").match(/inter-([a-z-]+)\.woff2$/)?.[1]);
    if (names.some((n) => !n)) return false;
    return new Set(names).size === 7 && names.every((n) => bySubset.has(n));
  })());
  add("H7 each emitted face's range equals ITS OWN subset's app range", eInter.every((e) => {
    const n = (urlOf(e) ?? "").match(/inter-([a-z-]+)\.woff2$/)?.[1];
    const a = n && bySubset.get(n);
    return !!a && JSON.stringify(e.d["unicode-range"]) === JSON.stringify(a.d["unicode-range"]);
  }));
  add("H8 descriptors equal to that same face except font-display and src", eInter.every((e) => {
    const n = (urlOf(e) ?? "").match(/inter-([a-z-]+)\.woff2$/)?.[1];
    const a = n && bySubset.get(n);
    if (!a) return false;
    return [...new Set(e.order)].sort().join() === [...new Set(a.order)].sort().join()
      && JSON.stringify(e.d["font-weight"]) === JSON.stringify(a.d["font-weight"])
      && JSON.stringify(e.d["font-style"]) === JSON.stringify(a.d["font-style"])
      && fam(e) === fam(a);
  }));
  add("H9 every emitted src is one url with a typed woff2 format and no tech", eInter.every((e) => {
    const src = e.d["src"] ?? [];
    return src.length === 1 && src[0].type === "url"
      && src[0].value.format?.type === "woff2" && (src[0].value.tech ?? []).length === 0;
  }));
  return out;
}

if (process.argv[2] === "--self") {
  const r = checkHarness(emit());
  for (const x of r) if (!x.ok) console.log("FAIL", x.n);
  console.log(`${r.filter((x) => x.ok).length}/${r.length} harness rows passing`);
}
