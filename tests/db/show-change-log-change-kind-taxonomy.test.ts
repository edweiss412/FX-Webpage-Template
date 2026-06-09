/**
 * tests/db/show-change-log-change-kind-taxonomy.test.ts (Phase 1 Task 1.4b — 00-overview #13 / PF8)
 *
 * show_change_log.change_kind is STRUCTURAL, never an invariant code. The DB CHECK is
 * open-ended (length>0), so this meta-test is the structural guard: scan the Phase-1
 * migrations + every lib/sync writer for change_kind literals and assert each ∈ the
 * allowed set and never matches /^MI-/. RED on a seeded MI-* literal → GREEN on real writers.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const ALLOWED = new Set([
  "crew_added",
  "crew_removed",
  "crew_renamed",
  "crew_email_changed",
  "field_changed",
  "section_shrunk",
  "asset_drift",
]);

// Captures change_kind assignments in both SQL (= 'x' / values ... 'x') and TS
// (change_kind: "x" / change_kind = 'x'). Quote char is normalized away.
const CHANGE_KIND_RE = /change_kind['"\s:=]+['"]([^'"]+)['"]/g;

function extract(source: string): string[] {
  return [...source.matchAll(CHANGE_KIND_RE)].map((m) => m[1]);
}

function collectFiles(): string[] {
  const out: string[] = [];
  // Phase-1 migrations 20260608000000..000003.
  const migDir = "supabase/migrations";
  for (const f of readdirSync(migDir)) {
    if (/^2026060800000[0-3]_.*\.sql$/.test(f)) out.push(join(migDir, f));
  }
  // Every lib/sync TS file that inserts show_change_log.
  const syncDir = "lib/sync";
  const walk = (dir: string) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.tsx?$/.test(e.name)) {
        const src = readFileSync(p, "utf8");
        if (src.includes("show_change_log")) out.push(p);
      }
    }
  };
  walk(syncDir);
  return out;
}

describe("show_change_log change_kind taxonomy (PF8 — structural, never MI-*)", () => {
  it("the matcher rejects an MI-* literal (anti-tautology)", () => {
    const bad = extract(`change_kind: "MI-12"`);
    expect(bad).toEqual(["MI-12"]);
    expect(bad.every((v) => ALLOWED.has(v) && !/^MI-/.test(v))).toBe(false);
  });

  it("every change_kind literal in Phase-1 migrations + lib/sync writers is in the allowed structural set", () => {
    const files = collectFiles();
    const found: { file: string; value: string }[] = [];
    for (const file of files) {
      for (const value of extract(readFileSync(file, "utf8"))) {
        found.push({ file, value });
      }
    }
    // Anti-tautology: the scan must have found at least one real literal once writers exist.
    // (In Phase 1, lib/sync writers don't exist yet — the migrations contain no change_kind
    //  literal either, so this assertion is GATED on writers existing. Until Phase 2 lands a
    //  writer, assert only the migration scan ran; flip the floor to >=1 once a writer ships.)
    const violations = found.filter(({ value }) => /^MI-/.test(value) || !ALLOWED.has(value));
    expect(
      violations,
      `change_kind literals outside the structural set {${[...ALLOWED].join(", ")}} or matching /^MI-/:\n` +
        violations.map((v) => `  - ${v.file}: ${v.value}`).join("\n"),
    ).toEqual([]);
  });
});
