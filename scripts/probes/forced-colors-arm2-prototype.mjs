import { readFileSync } from "node:fs";
const postcss = (await import("postcss")).default;
const out = "app/globals.css";

const root = postcss.parse(readFileSync(out, "utf8"));
// Dropped outright (probe M1, M1b, M11, M12).
const DROPPED = new Set(["box-shadow", "text-shadow"]);
// Forced onto the palette: still painted, no longer author-controlled (probe M2-M9).
// A2a needs this as well as A2b: a carrier set can be empty because its members are
// dropped, because they are forced, or because it is a mixture. Requiring a DROPPED
// member was the first draft's criterion and spec review R1 finding 2 refuted it,
// naming three of this pass's own repairs that it silently missed.
const FORCED = new Set([
  "color",
  "background-color",
  "border-color",
  "outline-color",
  "fill",
  "stroke",
  "border-top-color",
  "border-right-color",
  "border-bottom-color",
  "border-left-color",
  "column-rule-color",
  "text-decoration-color",
]);
const isGrad = (d) => d.prop === "background-image" && /gradient\(/.test(d.value);
const SURVIVES = (p) =>
  /^(outline|border)-(style|width)$/.test(p) ||
  p === "outline" ||
  p === "border" ||
  /^border-(top|right|bottom|left)-(style|width)$/.test(p) ||
  p === "outline-style" ||
  p === "outline-width";

console.log("=== A2a: surviving carrier set is empty (dropped OR forced OR mixed) ===");
let a2a = 0;
root.walkRules((rule) => {
  if (rule.parent?.type === "atrule" && /keyframes/.test(rule.parent.name)) return;
  const decls = [];
  rule.walkDecls((d) => decls.push(d));
  const carriers = decls.filter((d) => DROPPED.has(d.prop) || FORCED.has(d.prop) || isGrad(d));
  if (!carriers.length) return;
  if (decls.some((d) => SURVIVES(d.prop))) return;
  a2a++;
  const at = rule.parent?.type === "atrule" ? `@${rule.parent.name} ${rule.parent.params} > ` : "";
  console.log(
    `  ${at}${rule.selector.replace(/\s+/g, " ").slice(0, 70)}  [${carriers.map((d) => (isGrad(d) ? "gradient" : d.prop)).join(",")}]`,
  );
});
console.log(`A2a total: ${a2a}`);

console.log("\n=== A2b: keyframes whose animated properties all collapse ===");
let a2b = 0;
root.walkAtRules(/keyframes/, (at) => {
  const props = new Set();
  at.walkDecls((d) => props.add(isGrad(d) ? "background-image(gradient)" : d.prop));
  const all = [...props];
  const FORCED = new Set([
    "color",
    "background-color",
    "border-color",
    "outline-color",
    "fill",
    "stroke",
  ]);
  const allDropped = all.every((p) => DROPPED.has(p) || p === "background-image(gradient)");
  const allForced = all.every((p) => FORCED.has(p));
  if (all.length && (allDropped || allForced)) {
    a2b++;
    console.log(
      `  @keyframes ${at.params}  [${all.join(",")}]  ${allDropped ? "all-dropped" : "all-forced"}`,
    );
  }
});
console.log(`A2b total: ${a2b}`);
