#!/usr/bin/env tsx
// Regenerate (or --check) the committed DB-free classification lists
// (tests/probes/db-free-movable.txt + db-touching-serial.txt), the authority the
// vitest partition reads (spec 2026-07-20-serial-parallel-reclassification §3.4).
//
// Modes:
//   (default)  re-run the DB-touch probe on a fresh DB, sweep, REWRITE the lists.
//   --check    compute the fresh lists and FAIL (exit 1) if they differ from the
//              committed files — the nightly drift guard.
//
// REGEN_DB_FREE_STUB skips the (DB-bound) probe so the unit test needs no DB:
//   "committed"  fresh == the committed lists            (no diff  -> exit 0)
//   "drift"      fresh == the committed movable minus one, plus a fabricated
//                entry, loaded from the drift fixture     (diff     -> exit 1)
//
// Invoked via tsx (package.json `ci:regen-db-free`) so it can import the TS
// matcher + vitest.projects; never `npx tsx` (pinned by no-npx-tsx-spawn.test.ts).
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { hasDbBindingSignal } from "../lib/test/dbBindingSignals.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const MOVABLE = join(ROOT, "tests/probes/db-free-movable.txt");
const DBTOUCH = join(ROOT, "tests/probes/db-touching-serial.txt");
const FIXTURE = join(ROOT, "tests/probes/__fixtures__/drift-classification.json");

const readList = (p) =>
  readFileSync(p, "utf8").split("\n").map((l) => l.trim()).filter(Boolean);
const serialize = (arr) => [...new Set(arr)].sort().join("\n") + "\n";

/** Produce the fresh {movable, dbTouching} classification. */
function computeFresh() {
  const stub = process.env.REGEN_DB_FREE_STUB;
  if (stub === "committed") {
    return { movable: readList(MOVABLE), dbTouching: readList(DBTOUCH) };
  }
  if (stub === "drift") {
    const fx = JSON.parse(readFileSync(FIXTURE, "utf8"));
    return { movable: fx.movable, dbTouching: fx.dbTouching };
  }
  // Real path (nightly): re-run the instrumented suite on a fresh DB, then the
  // movable-serial classifier, then subtract any file that trips the static
  // DB-binding signal (the class the runtime probe under-counts).
  execFileSync("pnpm", ["exec", "vitest", "run"], {
    cwd: ROOT,
    stdio: "inherit",
    env: { ...process.env, DB_TOUCH_PROBE: "1", DB_TOUCH_PROBE_DIR: ".db-touch-probe" },
  });
  execFileSync("pnpm", ["exec", "tsx", "scripts/analyze-db-touch.mjs"], { cwd: ROOT, stdio: "inherit" });
  execFileSync("pnpm", ["exec", "tsx", "scripts/movable-serial.mjs"], { cwd: ROOT, stdio: "inherit" });
  const runtimeMovable = JSON.parse(
    readFileSync(join(ROOT, ".db-touch-probe/movable-serial.json"), "utf8"),
  );
  const dbTouching = new Set(readList(DBTOUCH));
  const movable = [];
  for (const f of runtimeMovable) {
    const p = join(ROOT, f);
    if (!existsSync(p)) continue;
    if (hasDbBindingSignal(f, readFileSync(p, "utf8"))) {
      dbTouching.add(f); // static-caught DB file the runtime probe missed
    } else {
      movable.push(f);
    }
  }
  return { movable, dbTouching: [...dbTouching] };
}

const check = process.argv.includes("--check");
const fresh = computeFresh();
const freshMovable = serialize(fresh.movable);
const freshDbTouch = serialize(fresh.dbTouching);

if (check) {
  const diffs = [];
  if (freshMovable !== readFileSync(MOVABLE, "utf8")) diffs.push("db-free-movable.txt");
  if (freshDbTouch !== readFileSync(DBTOUCH, "utf8")) diffs.push("db-touching-serial.txt");
  if (diffs.length > 0) {
    console.error(
      `DB-free classification DRIFT: ${diffs.join(", ")} differ from the freshly-measured lists.\n` +
        "Re-run `pnpm ci:regen-db-free` on a fresh DB and commit the updated lists.",
    );
    process.exit(1);
  }
  console.log("db-free classification: no drift.");
} else {
  writeFileSync(MOVABLE, freshMovable);
  writeFileSync(DBTOUCH, freshDbTouch);
  console.log(`Wrote ${fresh.movable.length} movable / ${fresh.dbTouching.length} db-touching.`);
}
