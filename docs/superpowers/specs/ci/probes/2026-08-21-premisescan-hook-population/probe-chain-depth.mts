import * as vitest from "vitest";
const d = vitest.describe as unknown as Record<string, unknown>;
const chain = (segs: string[]): unknown => segs.reduce<unknown>((c, s) => (c as Record<string, unknown>)?.[s], d);
for (const depth of [1, 2, 3, 4, 6]) {
  const segs = Array.from({ length: depth }, () => "concurrent");
  console.log(`describe.${segs.join(".")}  -> ${typeof chain(segs)}`);
}
console.log(`describe.skip.only.each -> ${typeof chain(["skip", "only", "each"])}`);
console.log(`describe.each.each      -> ${typeof chain(["each", "each"])}`);
