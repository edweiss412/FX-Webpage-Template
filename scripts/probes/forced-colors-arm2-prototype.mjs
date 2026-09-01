import { readFileSync } from "node:fs";
const postcss = (await import("postcss")).default;
const out = "app/globals.css";

const root = postcss.parse(readFileSync(out, "utf8"));
const DROPPED = new Set(["box-shadow", "text-shadow"]);
const isGrad = (d) => d.prop === "background-image" && /gradient\(/.test(d.value);
const SURVIVES = (p) =>
  /^(outline|border)-(style|width)$/.test(p) ||
  p === "outline" ||
  p === "border" ||
  /^border-(top|right|bottom|left)-(style|width)$/.test(p) ||
  p === "outline-style" ||
  p === "outline-width";

console.log("=== A2a: rule declares a DROPPED carrier and no surviving carrier ===");
let a2a = 0;
root.walkRules((rule) => {
  if (rule.parent?.type === "atrule" && /keyframes/.test(rule.parent.name)) return;
  const decls = [];
  rule.walkDecls((d) => decls.push(d));
  const dropped = decls.filter((d) => DROPPED.has(d.prop) || isGrad(d));
  if (!dropped.length) return;
  const carrier = decls.filter((d) => SURVIVES(d.prop));
  if (carrier.length) return;
  a2a++;
  console.log(`  ${rule.selector.slice(0, 80)}  [${dropped.map((d) => d.prop).join(",")}]`);
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
