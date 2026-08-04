// Round 31 added row 19 and round 32 pointed out its foreign inputs were never
// exercised: EXTRA_CSS is optional, and neither the README command nor
// mutants.mjs supplied it, so the row was advertised but untested. These are the
// dependency-stylesheet mutants, run against the SAME tracked guard.
import { execFileSync } from "node:child_process";
import { writeFileSync, mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const GUARD = new URL("./static-guard.mjs", import.meta.url).pathname;
const dir = mkdtempSync(join(tmpdir(), "depmut-"));
const run = (css) => {
  const f = join(dir, `dep-${Math.abs(css.length)}.css`);
  writeFileSync(f, css);
  try {
    return execFileSync("node", [GUARD], { encoding: "utf8",
      env: { ...process.env, EXTRA_CSS: f } });
  } catch (e) { return e.stdout ?? ""; }
};

const M = [
  ["D1 dependency declares an impostor Inter face",
   '@font-face{font-family:"Inter";src:local("Arial");font-weight:1000}html{font-family:"Inter"}'],
  ["D2 dependency redefines a font token under dark mode",
   '@media (prefers-color-scheme: dark){:root{--font-inter:Arial}}'],
  ["D3 dependency redefines a font token under a theme attribute",
   '[data-theme="dark"]{--font-inter:Arial}'],
  ["D4 dependency sets a literal family with !important",
   '.rpv{font-family:Arial!important}'],
];
let killed = 0;
for (const [name, css] of M) {
  const out = run(css);
  const fired = (out.match(/^FAIL/gm) || []).length;
  if (fired) killed++;
  console.log(`${fired ? "KILLED " : "ESCAPED"} ${name.padEnd(52)} ${fired} row(s)`);
}
console.log(`\n${killed}/${M.length} dependency-stylesheet mutants killed`);
process.exit(killed === M.length ? 0 : 1);
