#!/usr/bin/env node
// scripts/pretest-gen.mjs — content-hash cache for the four pre*-hook generators
// (spec §4.3). Skips a generator when sha256(inputs + current output) matches the
// stamp; PRETEST_GEN_FORCE=1 bypasses. Output content is part of the hash, so a
// hand-edited or clobbered generated file always regenerates. Manifest coverage
// is pinned by tests/cross-cutting/pretest-gen-manifest.test.ts (import-closure +
// read-call + env-read arms) — extend the manifest BEFORE adding an input to any
// generator.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export const MANIFEST = [
  {
    name: "gen:admin-tables",
    script: "scripts/generate-admin-tables.ts",
    inputs: [
      "docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md",
      "scripts/generate-admin-tables.ts",
    ],
    output: "lib/audit/admin-tables.generated.ts",
  },
  {
    name: "gen:watermark-symbols",
    script: "scripts/extract-watermark-symbols.ts",
    inputs: [
      "docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md",
      "scripts/extract-watermark-symbols.ts",
    ],
    output: "lib/audit/watermark-symbols.generated.ts",
  },
  {
    name: "gen:email-boundaries",
    script: "scripts/extract-email-boundaries.ts",
    inputs: [
      "docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md",
      "docs/superpowers/plans/2026-04-30-fxav-crew-pages-v1/11-cross-cutting.md",
      "scripts/extract-email-boundaries.ts",
    ],
    output: "lib/audit/email-boundaries.generated.ts",
  },
  {
    name: "gen:traceability",
    script: "scripts/generate-traceability.ts",
    inputs: [
      "docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md",
      ".github/workflows/x-audits.yml",
      "scripts/generate-traceability.ts",
      "scripts/extract-watermark-symbols.ts",
    ],
    inputDirs: [
      { dir: "docs/superpowers/plans/2026-04-30-fxav-crew-pages-v1", pattern: "^\\d{2}-.+\\.md$" },
    ],
    output: "docs/superpowers/plans/coverage.md",
  },
];

const STAMP_DIR = "node_modules/.cache/fxav-pretest-gen";
const STAMP_PATH = join(STAMP_DIR, "stamps.json");

function hashTarget(target) {
  const hash = createHash("sha256");
  const files = [...target.inputs];
  for (const d of target.inputDirs ?? []) {
    const re = new RegExp(d.pattern);
    for (const entry of readdirSync(d.dir)
      .filter((e) => re.test(e))
      .sort()) {
      files.push(join(d.dir, entry));
    }
  }
  for (const file of [...files].sort()) {
    hash.update(file);
    hash.update("\0");
    // A manifest input that no longer exists is a manifest bug, not a cache
    // miss — say so by name instead of surfacing a bare ENOENT from a pre* hook.
    if (!existsSync(file)) {
      throw new Error(
        `[pretest-gen] ${target.name}: manifest input "${file}" does not exist — ` +
          `update MANIFEST in scripts/pretest-gen.mjs`,
      );
    }
    hash.update(readFileSync(file));
    hash.update("\0");
  }
  hash.update(existsSync(target.output) ? readFileSync(target.output) : "OUTPUT-MISSING");
  return hash.digest("hex");
}

function main() {
  mkdirSync(STAMP_DIR, { recursive: true });
  let stamps = {};
  try {
    stamps = JSON.parse(readFileSync(STAMP_PATH, "utf8"));
  } catch {
    stamps = {};
  }
  const force = process.env.PRETEST_GEN_FORCE === "1";
  let dirty = false;
  for (const target of MANIFEST) {
    if (!force && stamps[target.name] === hashTarget(target)) continue;
    console.log(`[pretest-gen] ${target.name}: regenerating`);
    execFileSync("pnpm", ["exec", "tsx", target.script], { stdio: "inherit" });
    stamps[target.name] = hashTarget(target);
    dirty = true;
  }
  if (dirty || !existsSync(STAMP_PATH)) {
    writeFileSync(STAMP_PATH, JSON.stringify(stamps, null, 2));
  }
}

// Import-safe (the meta-test imports MANIFEST): run only when invoked directly.
// Guard shape mirrors scripts/with-admin-dev-flag.mjs:281.
const invokedDirectly = process.argv[1]
  ? fileURLToPath(import.meta.url) === process.argv[1]
  : false;
if (invokedDirectly) main();
