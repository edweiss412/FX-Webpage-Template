import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

/**
 * The pin in playwright.config.ts works ONLY because an explicit value in the server's
 * environment survives Next's own load of `.env.local`. If that precedence ever inverts,
 * every pinned webServer silently resolves the validation pooler again while the config
 * still LOOKS correct, and nothing else in the repo would notice.
 *
 * Each arm runs in a FRESH CHILD PROCESS, which is load-bearing rather than tidiness:
 * @next/env snapshots the environment on its first call and a reload restores that
 * snapshot, so two arms in one process measure one load, not two, and the second arm reads
 * the fixture's value back and fails on correct code. A fresh process is also what a
 * booting Next server actually is.
 *
 * NODE_ENV is set explicitly per arm and never inherited. Vitest runs with NODE_ENV=test,
 * and in test mode @next/env does not read `.env.local` AT ALL, so an inheriting child
 * loads nothing and the negative control has no remote value to beat.
 */
const REMOTE = "postgresql://u:p@remote.sentinel.invalid:5432/postgres";
const LOOPBACK = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

const require_ = createRequire(import.meta.url);

// Resolve the loader the way Next does. The hoisted root @next/env is a DIFFERENT package
// from the one `next` ships, with different loader bytes, and only the second ever runs
// inside the server. A guard bound to the root one is green about code no server executes.
const NEXT_DIR = dirname(require_.resolve("next/package.json"));
const NEXT_ENV = require_.resolve("@next/env", { paths: [NEXT_DIR] });
const ROOT_ENV = require_.resolve("@next/env");

const ARM = `
const { loadEnvConfig } = require(process.env.ENV_PKG);
const r = loadEnvConfig(process.env.FIXTURE_DIR, process.env.LOAD_MODE === "development",
  { info() {}, error() {} });
process.stdout.write(JSON.stringify({
  value: process.env.TEST_DATABASE_URL ?? null,
  files: r.loadedEnvFiles.map((f) => f.path.slice(f.path.lastIndexOf("/") + 1)),
  // The child reports which loader it actually required. Comparing two constants in the
  // parent cannot observe this: ENV_PKG could point anywhere and the comparison would
  // still hold. This is the only value that witnesses the binding.
  pkg: require.resolve(process.env.ENV_PKG),
}));`;

const fixture = mkdtempSync(join(tmpdir(), "fx-next-env-precedence-"));
writeFileSync(join(fixture, ".env.local"), `TEST_DATABASE_URL=${REMOTE}\n`);
afterAll(() => rmSync(fixture, { recursive: true, force: true }));

type Arm = { value: string | null; files: string[]; pkg: string };

function loadInChild(
  mode: "development" | "production",
  preset: string | undefined,
  envPkg: string = NEXT_ENV,
): Arm {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    FIXTURE_DIR: fixture,
    ENV_PKG: envPkg,
    LOAD_MODE: mode,
    NODE_ENV: mode,
  };
  if (preset === undefined) delete env.TEST_DATABASE_URL;
  else env.TEST_DATABASE_URL = preset;
  return JSON.parse(execFileSync(process.execPath, ["-e", ARM], { env, encoding: "utf8" })) as Arm;
}

const MODES = ["development", "production"] as const;

describe("@next/env precedence: an explicit value beats .env.local", () => {
  it.each(MODES)("%s: the child loaded the loader Next runs, not the hoisted root", (mode) => {
    expect(NEXT_ENV, "the two resolutions are indistinguishable").not.toBe(ROOT_ENV);
    expect(loadInChild(mode, undefined).pkg, `${mode}: child loaded the wrong @next/env`).toBe(
      NEXT_ENV,
    );
  });

  it.each(MODES)("%s: reads the fixture's .env.local at all (premise)", (mode) => {
    expect(loadInChild(mode, undefined).files, `${mode}: no .env.local loaded`).toContain(
      ".env.local",
    );
  });

  // NEGATIVE CONTROL per mode: proves the positive arm below could have failed.
  it.each(MODES)("%s: lets .env.local win when nothing is pre-set", (mode) => {
    expect(loadInChild(mode, undefined).value).toBe(REMOTE);
  });

  it.each(MODES)("%s: keeps an explicitly pinned value through the load", (mode) => {
    expect(loadInChild(mode, LOOPBACK).value).toBe(LOOPBACK);
  });
});
