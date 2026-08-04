import { readFileSync, writeFileSync, copyFileSync, mkdtempSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
const SRC = "/tmp/spike-fonts";
const base = readFileSync(join(SRC,"fonts.css"),"utf8");
const SUBS = ["cyrillic-ext","cyrillic","greek-ext","greek","vietnamese","latin-ext","latin"];
const MUTANTS = {
  "M1  permute subset URLs": c => c.replace('url("/fonts/inter-greek.woff2")','url("/fonts/inter-cyrillic.woff2")'),
  "M2  --font-inter drops fallback": c => c.replace('--font-inter: "Inter", "Inter Fallback"','--font-inter: "Inter"'),
  "M4  repoint fallback src": c => c.replace('src: local("Arial")','src: local("Verdana")'),
  "M5  impostor aliased as Inter": c => c.replace('src: url("/fonts/inter-latin.woff2") format("woff2")','src: local("Arial")'),
  "M8  corrupted copy (byte-level)": c => c,
  "M11 local() prepended to greek": c => c.replace('src: url("/fonts/inter-greek.woff2") format("woff2")','src: local("Arial"), url("/fonts/inter-greek.woff2") format("woff2")'),
  "M12 url into nonexistent subdir": c => c.replace('url("/fonts/inter-greek.woff2")','url("/fonts/sub/inter-greek.woff2")'),
  "R10 size-adjust on a face": c => c.replace('  unicode-range: U+1F00-1FFF;','  size-adjust: 200%;\n  unicode-range: U+1F00-1FFF;'),
  "X1  drop font-display": c => c.replace('  font-display: swap;\n  src: url("/fonts/inter-greek.woff2")','  src: url("/fonts/inter-greek.woff2")'),
  "X2  delete a subset": c => c.split("@font-face").filter(b=>!b.includes("inter-vietnamese")).join("@font-face"),
  "X3  drop a metric override": c => c.replace('  size-adjust: 107.12%;\n',''),
  "R13a unsupported format() hint": c => c.replace('url("/fonts/inter-greek.woff2") format("woff2")','url("/fonts/inter-greek.woff2") format("definitely-unsupported")'),
  "R13b tech() added": c => c.replace('url("/fonts/inter-greek.woff2") format("woff2")','url("/fonts/inter-greek.woff2") format("woff2") tech(definitely-unsupported)'),
  "R13c extra comma source": c => c.replace('url("/fonts/inter-greek.woff2") format("woff2")','url("/fonts/inter-greek.woff2") format("definitely-unsupported"), url("/fonts/inter-latin.woff2") format("woff2")'),
  "R14a duplicate latin face replaces greek": c => {
      const greek = c.match(/@font-face \{[^}]*inter-greek\.woff2[^}]*\}/)[0];
      const latin = c.match(/@font-face \{[^}]*inter-latin\.woff2[^}]*\}/)[0];
      return c.replace(greek, latin); },
  "R14b duplicate src, last one wins": c => c.replace('src: url("/fonts/inter-greek.woff2") format("woff2");','src: url("/fonts/inter-greek.woff2") format("woff2");\n  src: url("/fonts/inter-latin.woff2") format("woff2");'),
  "R14c duplicate size-adjust on fallback": c => c.replace('size-adjust: 107.12%;','size-adjust: 107.12%;\n  size-adjust: 200%;'),
  "R14d duplicate font-display, block wins": c => c.replace('font-display: swap;\n  src: url("/fonts/inter-latin.woff2")','font-display: swap;\n  font-display: block;\n  src: url("/fonts/inter-latin.woff2")'),
  "R17a fallback src prepends Times": c => c.replace('src: local("Arial");','src: local("Times New Roman"), local("Arial");'),
  "R17b fallback metrics wrong, right ones in comment": c => c
      .replace('ascent-override: 90.44%;','ascent-override: 12.00%; /* was ascent-override: 90.44% */')
      .replace('descent-override: 22.52%;','descent-override: 99.00%; /* descent-override: 22.52% */')
      .replace('line-gap-override: 0%;','line-gap-override: 50%; /* line-gap-override: 0% */')
      .replace('size-adjust: 107.12%;','size-adjust: 300%; /* size-adjust: 107.12% */'),
  "R18a --font-inter redeclared, last wins": c => c.replace('--font-inter: "Inter", "Inter Fallback";','--font-inter: "Inter", "Inter Fallback";\n  --font-inter: "Inter";'),
  "R18b --font-inter value has trailing junk": c => c.replace('--font-inter: "Inter", "Inter Fallback";','--font-inter: "Inter", "Inter Fallback", Arial;'),
  "R18a uppercase duplicate SRC": c => c.replace('src: url("/fonts/inter-greek.woff2") format("woff2");','src: url("/fonts/inter-greek.woff2") format("woff2");\n  SRC: local("Arial");'),
  "R18b reverse-solidus escapes /fonts/": c => c.replace('url("/fonts/inter-greek.woff2")','url("/fonts/..\\\\inter-greek.woff2")'),
  "R18c fallback gains unicode-range": c => c.replace('  src: local("Arial");','  src: local("Arial");\n  unicode-range: U+0370-03FF;'),
  "R19a escaped duplicate s\\72 c": c => c.replace('src: url("/fonts/inter-greek.woff2") format("woff2");','src: url("/fonts/inter-greek.woff2") format("woff2");\n  s\\72 c: local("Times New Roman");'),
  "R19b second Inter Fallback, bold Times": c => c + '\n@font-face { font-family: "Inter Fallback"; src: local("Times New Roman"); font-weight: 700; }\n',
  "R19c uppercase @FONT-FACE impostor": c => c + '\n@FONT-FACE { font-family: "Inter"; src: local("Arial"); unicode-range: U+0370-03FF; }\n',
  "R28a mobile-only family override via @media": c => c + "\n@media (max-width: 639px) { html { font-family: Arial; } }\n",
  "R28b dark-mode family override via @media": c => c + "\n@media (prefers-color-scheme: dark) { body { font-family: Arial; } }\n",
  "R22a font-weight range collapsed to 400": c => c.replace(/font-weight: 100 900;/g,"font-weight: 400;"),
  "R22b font-style reclassified italic": c => c.replace(/font-style: normal;/g,"font-style: italic;"),
  "R12 REPLACE font-style with size-adjust": c => c.replace(/  font-style: normal;/g,'  size-adjust: 200%;'),
  "R12b REPLACE font-weight with size-adjust": c => c.replace(/  font-weight: 100 900;/g,'  size-adjust: 200%;'),
};
let caught=0,total=0;
for (const [name, fn] of Object.entries(MUTANTS)) {
  const dir = mkdtempSync(join(tmpdir(),"mut-"));
  for (const n of SUBS) copyFileSync(join(SRC,`inter-${n}.woff2`), join(dir,`inter-${n}.woff2`));
  if (name.startsWith("M8")) copyFileSync(join(SRC,"inter-latin.woff2"), join(dir,"inter-greek.woff2"));
  writeFileSync(join(dir,"fonts.css"), fn(base));
  let out; try { out = execFileSync("node",[new URL("./static-guard.mjs", import.meta.url).pathname],{encoding:"utf8",cwd:"/Users/ericweiss/FX-worktrees/load-inter-app-wide",env:{...process.env,SPIKE_DIR:dir}}); } catch (e) { out = e.stdout ?? ""; }
  const fired = (out.match(/^FAIL/gm)||[]).length;
  total++; if (fired) caught++;
  console.log(`${fired?"KILLED ":"ESCAPED"} ${name.padEnd(32)} ${fired} row(s) fired`);
}
console.log(`\n${caught}/${total} mutants killed by the Kind A static guard`);
