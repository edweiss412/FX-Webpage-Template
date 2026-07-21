// @vitest-environment node
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import { DB_FREE_MOVABLE } from "@/vitest.projects";
import { hasDbBindingSignal } from "@/lib/test/dbBindingSignals";

// PRIMARY criterion-4/5 guard (reclassification spec §3.2). The runtime DB-touch
// probe under-counts (async/subprocess DB access), so this deterministic source
// scan is the standing tripwire: if any allowlisted file is later edited to add
// DB access, it fails here — in the always-present serial legs — even though the
// no-DB CI job would stay green (a caught/skipped DB access looks clean there).
const ROOT = process.cwd();

describe("db-free-movable static DB-binding guard", () => {
  it("no movable file matches a DB-binding signal", () => {
    const offenders = DB_FREE_MOVABLE.filter((f) => {
      const p = join(ROOT, f);
      return existsSync(p) && hasDbBindingSignal(f, readFileSync(p, "utf8"));
    });
    expect(offenders, `these movable files now show a DB-binding signal:\n${offenders.join("\n")}`).toEqual([]);
  });
});
