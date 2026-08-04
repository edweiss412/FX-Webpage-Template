// Static font guard, parsed by Lightning CSS -- the same parser @tailwindcss/cli
// and @tailwindcss/postcss use to compile app/globals.css and every harness
// entry via compileEntryCss. Runs in Node, so it stays in the merge-blocking
// unit suite; no browser required.
import { readFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { transform } = require(process.env.LCSS ?? "lightningcss");

const DIR = process.env.SPIKE_DIR ?? "/tmp/spike-fonts";
const cssText = readFileSync(join(DIR, "fonts.css"), "utf8");
const PINNED = { "cyrillic-ext":"U+460-52F,U+1C80-1C88,U+20B4,U+2DE0-2DFF,U+A640-A69F,U+FE2E-FE2F" };
const SUBSETS = ["cyrillic-ext","cyrillic","greek-ext","greek","vietnamese","latin-ext","latin"];
const RANGES = {
  "cyrillic-ext":[[1120,1327],[7296,7306],[8372,8372],[11744,11775],[42560,42655],[65070,65071]],
  "cyrillic":[[769,769],[1024,1119],[1168,1169],[1200,1201],[8470,8470]],
  "greek-ext":[[7936,8191]],
  "greek":[[880,887],[890,895],[900,906],[908,908],[910,929],[931,1023]],
  "vietnamese":[[258,259],[272,273],[296,297],[360,361],[416,417],[431,432],[768,769],[771,772],[776,777],[803,803],[809,809],[7840,7929],[8363,8363]],
  "latin-ext":[[256,698],[701,709],[711,716],[718,727],[733,767],[772,772],[776,776],[809,809],[7424,7615],[7680,7839],[7922,7935],[8224,8224],[8352,8363],[8365,8384],[8467,8467],[11360,11391],[42784,43007]],
  "latin":[[0,255],[305,305],[338,339],[699,700],[710,710],[730,730],[732,732],[772,772],[776,776],[809,809],[8192,8303],[8364,8364],[8482,8482],[8593,8593],[8595,8595],[8722,8722],[8725,8725],[65279,65279],[65533,65533]],
};
const INTER_DESC = ["font-display","font-family","font-style","font-weight","src","unicode-range"];
const FB_DESC = ["ascent-override","descent-override","font-family","line-gap-override","size-adjust","src"];
const FB_METRICS = {"ascent-override":0.9044,"descent-override":0.2252,"line-gap-override":0,"size-adjust":1.0712};
const pct = (v) => v?.[0]?.value?.type === "percentage" ? v[0].value.value : NaN;

// ---- parse with the real CSS grammar -------------------------------------
const faces = []; const vars = [];
transform({ filename: "fonts.css", code: Buffer.from(cssText), minify: false, visitor: {
  Rule: {
    "font-face"(r) {
      const d = {}; const order = [];
      for (const p of r.value.properties) {
        const name = p.type === "custom" ? p.value.name : (p.type === "source" ? "src" : p.type);
        order.push(name);
        d[name] = p.value;                       // LAST WINS, as CSS specifies
      }
      faces.push({ d, order });
    },
    style(r) {
      for (const p of r.value.declarations?.declarations ?? []) {
        if (p.property === "custom" && p.value?.name === "--font-inter") vars.push(p.value.value);
      }
    },
  },
}});

const DIGESTS = {"cyrillic-ext":"fccca918fea40089dacadc7045861314d1a6bc91f1f323cc1eeb22ebcdb321b5","cyrillic":"aebf2ab4a4ce6810d73c1ac7be7cafb4e5ec4cee2d6db5fb3e09691747ec4bd6","greek-ext":"a2e2c783ca6f9c20486e81e72a279203e86730bbf8f01ff6a5ee9dbd09e1c271","greek":"46dd4cdca58c26ae87cc6927657bf83b2e8abfc39ffd0ab176e301a8d28d22bf","vietnamese":"8db00ff46c67b22cda8bed865acf7077651cac8d2841d5b40980556b48961931","latin-ext":"a28eb6d3ccb534ae0c94ca999371df024aab60b08c3c8a5720ee9e32fa0faaa2","latin":"c940764593d0fe5d596be327ca7558855e018039fb78509aa21921fd3644c3e4",};
const results = []; const check = (n, pass, det = "") => results.push({ n, pass, det });
const famOf = (f) => (typeof f.d["font-family"] === "string" ? f.d["font-family"] : "");
const inter = faces.filter((f) => famOf(f) === "Inter");
const fbs   = faces.filter((f) => famOf(f) === "Inter Fallback");
const srcOf = (f) => f.d["src"] ?? [];
const urlOf = (f) => { const s = srcOf(f); return s.length === 1 && s[0].type === "url" ? s[0].value.url.url : null; };
const subsetOf = (f) => (urlOf(f) ?? "").match(/inter-([a-z-]+)\.woff2$/)?.[1] ?? null;

check("1  exactly seven Inter faces", inter.length === 7, `got ${inter.length}`);
check("2  exactly ONE Inter Fallback face", fbs.length === 1, `got ${fbs.length}`);
check("3  the seven subsets are exactly the expected set",
  JSON.stringify(inter.map(subsetOf).sort()) === JSON.stringify([...SUBSETS].sort()));
// structured: one source, it is a url, format is typed woff2, no tech, no local()
check("4  src is exactly one url() + format(woff2), no tech/local/extra",
  inter.every((f) => { const s = srcOf(f);
    return s.length === 1 && s[0].type === "url" && s[0].value.format?.type === "woff2"
        && (s[0].value.tech ?? []).length === 0; }));
check("5  each url RESOLVES to EXACTLY /fonts/<its own file>, no extra segments",
  inter.every((f) => { const u = urlOf(f); if (!u) return false;
    const r = new URL(u, "https://x.test/base/");
    const base = r.pathname.split("/").pop();
    return r.pathname === `/fonts/${base}` && /^inter-[a-z-]+\.woff2$/.test(base) && existsSync(join(DIR, base)); }));
check("6  filename PAIRS with that face's own unicode-range (map equality)",
  inter.every((f) => { const n = subsetOf(f); if (!n) return false;
    const got = (f.d["unicode-range"] ?? []).map((x) => [x.start, x.end]);
    return JSON.stringify(got) === JSON.stringify(RANGES[n]); }));
check("7  every Inter face declares font-display: swap",
  inter.every((f) => JSON.stringify(f.d["font-display"] ?? "").includes("swap")));
check("8  Inter descriptor inventory is EXACTLY the six expected",
  inter.every((f) => JSON.stringify([...new Set(f.order)].sort()) === JSON.stringify(INTER_DESC)));
check("9  no duplicate descriptor in any face",
  faces.every((f) => f.order.length === new Set(f.order).size));
const fb = fbs[0];
check("10 Fallback src is EXACTLY local(\"Arial\"), single source",
  !!fb && srcOf(fb).length === 1 && srcOf(fb)[0].type === "local" && srcOf(fb)[0].value === "Arial");
check("11 Fallback metric overrides equal the pinned values",
  !!fb && Object.entries(FB_METRICS).every(([k, v]) => Math.abs(pct(fb.d[k]?.value) - v) < 1e-6));
check("12 Fallback descriptor inventory is EXACTLY the six expected (no unicode-range)",
  !!fb && JSON.stringify([...new Set(fb.order)].sort()) === JSON.stringify(FB_DESC));
check("13 --font-inter declared exactly once", vars.length === 1, `got ${vars.length}`);
const tokens = (v) => (v ?? []).map((t) => t.value).filter((t) => t.type !== "white-space")
  .map((t) => `${t.type}:${t.value ?? ""}`);
check("14 --font-inter is EXACTLY the pinned two-family sequence",
  vars.length === 1 && JSON.stringify(tokens(vars[0])) ===
    JSON.stringify(["string:Inter", "comma:", "string:Inter Fallback"]),
  vars.length === 1 ? JSON.stringify(tokens(vars[0])) : "");
// Round 22: inventory equality proves a descriptor EXISTS; it never proved the
// VALUE. Collapsing 100 900 -> 400, or normal -> italic, passed all 15 rows and
// app/harness equality allowed both blocks to be wrong together.
// Round 29: the previous version registered a `media` visitor only, read only
// this stylesheet, and ignored custom-property indirection -- so @supports,
// @container, app/globals.css, and a conditionally-redefined --font-* token all
// walked through a row whose prose claimed "any conditional at-rule". The scan
// is now over the RULE TREE of every shipped stylesheet, and it treats a
// conditional redefinition of a font token as equivalent to font-family itself,
// because an unconditional font-family that reads it is exactly as conditional.
const CONDITIONAL = new Set(["media", "supports", "container"]);
const scanConditionals = (text, label) => {
  const hits = [];
  transform({ filename: label, code: Buffer.from(text), minify: false, visitor: {
    Rule(r) {
      if (!CONDITIONAL.has(r.type)) return;
      const walk = (rules) => { for (const x of rules ?? []) {
        for (const p of x.value?.declarations?.declarations ?? []) {
          const name = p.property === "custom" ? p.value?.name : p.property;
          if (name === "font-family" || name === "font" || /^--font/.test(name ?? ""))
            hits.push(`${label}: @${r.type} sets ${name}`);
        }
        walk(x.value?.rules);
      } };
      walk(r.value?.rules);
    },
  }});
  return hits;
};
const SHIPPED = [[cssText, "fonts.css"]];
if (process.env.APP_CSS && existsSync(process.env.APP_CSS))
  SHIPPED.push([readFileSync(process.env.APP_CSS, "utf8"), "globals.css"]);
const conditionalHits = SHIPPED.flatMap(([t, l]) => scanConditionals(t, l));
check("18 no font-family, font, or --font-* token set inside any conditional at-rule, in any shipped stylesheet",
  conditionalHits.length === 0, conditionalHits.join(" | "));
check("16 every Inter face declares font-weight EXACTLY 100 900",
  inter.every((f) => { const w = f.d["font-weight"];
    const vals = (Array.isArray(w) ? w : []).map((x) => x?.value?.value).filter((v) => typeof v === "number");
    return vals.length === 2 && vals[0] === 100 && vals[1] === 900; }),
  JSON.stringify(inter.map((f) => (Array.isArray(f.d["font-weight"]) ? f.d["font-weight"] : []).map((x) => x?.value?.value))));
check("17 every Inter face declares font-style EXACTLY normal",
  inter.every((f) => f.d["font-style"]?.type === "normal"),
  JSON.stringify(inter.map((f) => f.d["font-style"]?.type)));
check("15 every committed woff2 hash-matches its pinned digest",
  SUBSETS.every((n) => { const f = join(DIR, `inter-${n}.woff2`);
    return existsSync(f) && createHash("sha256").update(readFileSync(f)).digest("hex") === DIGESTS[n]; }));

const pass = results.filter((r) => r.pass).length;
for (const r of results) if (!r.pass) console.log("FAIL", r.n, r.det);
console.log(`${pass}/${results.length} rows passing`);
process.exit(pass === results.length ? 0 : 1);
