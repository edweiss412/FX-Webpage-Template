import { emit, checkHarness } from "./harness-guard.mjs";
import { copyFileSync, unlinkSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
const SRC = "/tmp/spike-fonts";

// each mutant: [name, cssMutator, dirMutator]
const M = [
  ["H-a  subdirectory url, files copied correctly",
    (c) => c.replace('url("inter-greek.woff2")', 'url("./fonts/inter-greek.woff2")'), null],
  ["H-b  latin bytes copied under all seven names", (c) => c,
    (d) => { for (const n of ["cyrillic-ext","cyrillic","greek-ext","greek","vietnamese","latin-ext"])
      copyFileSync(join(SRC, "inter-latin.woff2"), join(d, `inter-${n}.woff2`)); }],
  ["H-c  harness collapses font-display to swap",
    (c) => c.replace(/font-display:\s*block/g, "font-display: swap"), null],
  ["H-d  impostor face: family Inter, src local(Arial)",
    (c) => c.replace('src: url("inter-greek.woff2") format("woff2")', 'src: local("Arial")'), null],
  ["H-e  a copied sibling is missing", (c) => c,
    (d) => unlinkSync(join(d, "inter-vietnamese.woff2"))],
  ["H-f  absolute /fonts/ url leaks into the harness block",
    (c) => c.replace('url("inter-greek.woff2")', 'url("/fonts/inter-greek.woff2")'), null],
  ["H-g  rogue descriptor added to the emitted block only",
    (c) => c.replace("  unicode-range: U+1F00-1FFF;", "  size-adjust: 200%;\n  unicode-range: U+1F00-1FFF;"), null],
  ["H-h  one copied file corrupted (byte-level)", (c) => c,
    (d) => writeFileSync(join(d, "inter-greek.woff2"),
      Buffer.concat([readFileSync(join(d, "inter-greek.woff2")), Buffer.from([0])]))],
];

let killed = 0;
for (const [name, cssMut, dirMut] of M) {
  const dir = emit(cssMut);
  if (dirMut) dirMut(dir);
  const rows = checkHarness(dir);
  const fired = rows.filter((r) => !r.ok);
  if (fired.length) killed++;
  console.log(`${fired.length ? "KILLED " : "ESCAPED"} ${name.padEnd(48)} ${fired.length} row(s)`);
}
console.log(`\n${killed}/${M.length} harness-side mutants killed`);
process.exit(killed === M.length ? 0 : 1);
