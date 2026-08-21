// Population probe, TAKE 3 — census by EXECUTION SURFACE rather than by
// extension.
//
// Take 1 scanned raw file bytes (123865 "attached targets"): measured MENTIONS,
// retracted. Take 2 sliced by SHELL_EXTENSIONS (19 targets, 0 substitution-
// bearing): sound but UNDERCOUNTS, because shell text that reaches a shell also
// lives in workflow `run:` blocks and package.json scripts.
//
// This one enumerates three execution surfaces separately and prints witnesses
// for each, so a zero is attributable per surface rather than in aggregate.
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { parseDocument, visit, isPair, isScalar } from "yaml";

import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
/** Repo root, derived from this file so the probe runs in any checkout. */
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../../../../..");

const SCAN = `${ROOT}/tests/cross-cutting/psqlStartupFiles/scan.ts`;
const src = readFileSync(SCAN, "utf8");

function extractList(name: string): string[] {
  const m = src.match(new RegExp(`const ${name} = \\[([^\\]]*)\\]`, "s"));
  if (!m) {
    console.error(`ABORT: ${name} not found in shipped source`);
    process.exit(2);
  }
  return [...m[1]!.matchAll(/"([^"]+)"/g)].map((x) => x[1]!);
}

const SHELL_EXTENSIONS = extractList("SHELL_EXTENSIONS");
const YAML_EXTENSIONS = extractList("YAML_EXTENSIONS");
const OPS = extractList("REDIRECTION_OPERATORS");
const pat = src.match(/const attached = (\/\^\(\?:.*?\/)\.exec\(rest\)/);
if (!pat) {
  console.error("ABORT: attached-target pattern not found in shipped source");
  process.exit(2);
}
const ATTACHED = new RegExp(pat[1]!.slice(1, -1));
console.log("shipped attached pattern:", pat[1]);
console.log("shipped operators:", OPS.join(" "));
if (OPS.length < 3 || SHELL_EXTENSIONS.length < 1 || YAML_EXTENSIONS.length < 1) {
  console.error("ABORT: extractor floor");
  process.exit(2);
}

const SUBST = /\$\(|`|\$\{/;

type Chunk = { origin: string; text: string };

/** Every attached redirection target in one chunk of shell text. */
function attachedTargets(chunk: Chunk): Array<{ where: string; target: string }> {
  const out: Array<{ where: string; target: string }> = [];
  const lines = chunk.text.split("\n");
  for (let ln = 0; ln < lines.length; ln++) {
    const line = lines[ln]!;
    if (/^\s*#/.test(line)) continue;
    for (const op of OPS) {
      let at = 0;
      for (;;) {
        const idx = line.indexOf(op, at);
        if (idx === -1) break;
        at = idx + 1;
        const rest = line.slice(idx + op.length);
        if (rest === "" || /^\s/.test(rest)) continue;
        const hit = ATTACHED.exec(rest);
        if (!hit) continue;
        out.push({ where: `${chunk.origin}:${ln + 1}`, target: `${op}${hit[0]!}` });
      }
    }
  }
  return out;
}

const all = execFileSync(
  "git",
  ["-C", ROOT, "ls-files", "--cached", "--others", "--exclude-standard"],
  { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
)
  .split("\n")
  .filter(Boolean);

// ---- surface 1: whole-file shell -------------------------------------------
const shellChunks: Chunk[] = [];
for (const rel of all) {
  if (!SHELL_EXTENSIONS.some((e) => rel.endsWith(e))) continue;
  shellChunks.push({ origin: rel, text: readFileSync(`${ROOT}/${rel}`, "utf8") });
}

// ---- surface 2: workflow `run:` scalars -------------------------------------
const runChunks: Chunk[] = [];
for (const rel of all) {
  if (!YAML_EXTENSIONS.some((e) => rel.endsWith(e))) continue;
  let doc;
  try {
    doc = parseDocument(readFileSync(`${ROOT}/${rel}`, "utf8"));
  } catch {
    continue;
  }
  visit(doc, {
    Pair(_k, pair) {
      if (!isPair(pair)) return;
      const key = pair.key;
      if (!isScalar(key) || String(key.value) !== "run") return;
      const val = pair.value;
      if (!isScalar(val) || typeof val.value !== "string") return;
      runChunks.push({ origin: `${rel} run:`, text: val.value });
    },
  });
}

// ---- surface 3: package.json scripts ----------------------------------------
const scriptChunks: Chunk[] = [];
for (const rel of all) {
  if (!rel.endsWith("package.json")) continue;
  let pkg: any;
  try {
    pkg = JSON.parse(readFileSync(`${ROOT}/${rel}`, "utf8"));
  } catch {
    continue;
  }
  for (const [name, body] of Object.entries(pkg.scripts ?? {})) {
    if (typeof body === "string") scriptChunks.push({ origin: `${rel} scripts.${name}`, text: body });
  }
}

const SURFACES: Array<[string, Chunk[], number]> = [
  ["whole-file shell (.sh/.bash)", shellChunks, 1],
  ["workflow run: scalars", runChunks, 20],
  ["package.json scripts", scriptChunks, 20],
];

let grandSubst = 0;
for (const [name, chunks, floor] of SURFACES) {
  console.log(`\n=== ${name} — ${chunks.length} chunks`);
  if (chunks.length < floor) {
    console.error(`ABORT: population floor for ${name} (${chunks.length} < ${floor})`);
    process.exit(2);
  }
  const targets = chunks.flatMap((c) => attachedTargets(c));
  const withSubst = targets.filter((t) => SUBST.test(t.target));
  grandSubst += withSubst.length;
  console.log(`attached targets: ${targets.length}`);
  console.log(`  ...substitution-bearing: ${withSubst.length}`);
  if (targets.length === 0) {
    // A zero needs an attribution, and on a surface with no witnesses to print
    // the attribution has to come from an INDEPENDENT route: if the surface
    // contains no redirection CHARACTER at all, no attached target can exist
    // there and the zero is a fact about the surface rather than about the
    // probe. If it DOES contain one and we still found nothing, the probe is
    // broken and this aborts.
    const redirChars = chunks.filter((c) => /[<>]/.test(c.text)).length;
    console.log(`  chunks containing any < or > character: ${redirChars}`);
    if (redirChars > 0) {
      console.error(`ABORT: ${name} has ${redirChars} chunks with redirection characters and yielded zero attached targets — probe broken`);
      process.exit(2);
    }
    console.log("  zero ATTRIBUTABLE: no redirection character exists anywhere on this surface.");
    console.log("  SUBSTITUTION-BEARING witnesses: NONE (vacuously)");
    continue;
  }
  console.log(
    "  attached witnesses (proves the probe fires here):\n" +
      targets
        .slice(0, 8)
        .map((t) => `    ${t.where}  ${t.target.slice(0, 70)}`)
        .join("\n"),
  );
  if (withSubst.length) {
    console.log(
      "  SUBSTITUTION-BEARING witnesses:\n" +
        withSubst
          .slice(0, 25)
          .map((t) => `    ${t.where}  ${t.target.slice(0, 90)}`)
          .join("\n"),
    );
  } else {
    console.log("  SUBSTITUTION-BEARING witnesses: NONE");
  }
}

console.log(`\nTOTAL substitution-bearing attached targets across all three surfaces: ${grandSubst}`);
