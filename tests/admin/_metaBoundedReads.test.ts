// tests/admin/_metaBoundedReads.test.ts (M12.2 Phase A Task 3 — §3.4 structural
// defense, cardinality-aware).
//
// THE CLASS: rounds R13→R17 of the spec review each surfaced the SAME PostgREST
// row-cap truncation vector on a different read (existence, pending, active
// shows, then the parent-vs-child distinction). Per the project's "same-vector
// recurrence → structural defense in the same commit" discipline, this CI-time
// guard walks the Phase-A admin read surface and asserts every Supabase read on
// an unbounded table carries a bound appropriate to its cardinality, so the
// vector cannot reappear in a future edit.
//
// RULES (per `.from("<unbounded table>")` statement, split on `;`):
//   - bounded iff it has one of: `.limit(`, `.range(`, `count: "exact"`
//     (head/exact count — returns a number, never rows), OR an `.in(...)` on a
//     PARENT/existence key (drive_file_id / id — a bounded "do these N ids
//     exist" lookup).
//   - a child one-to-many `.in("show_id", …)` row fetch is NOT a valid bound on
//     its own (R17): it must ALSO carry `.range(` (paginate-until-complete) OR
//     `count: "exact"` (head count, no rows). A bare `.in("show_id")` row fetch
//     fails — it truncates at the cap and undercounts.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Phase-A admin read modules whose multi-row Supabase reads must be bounded.
// lib/admin/loadNeedsAttention.ts added with the Task-1 extraction (mobile
// needs-attention, spec §4.1): the pending-stream .limit(cap+1) reads, the
// head:true exact counts, and the existence .in("drive_file_id") lookup moved
// there from Dashboard.tsx; Dashboard keeps its shows/crew reads.
const READ_MODULES = ["components/admin/Dashboard.tsx", "lib/admin/loadNeedsAttention.ts"];

const UNBOUNDED_TABLES = ["shows", "crew_members", "pending_ingestions", "pending_syncs"];

function statements(src: string): string[] {
  // One Supabase query chain == one statement (terminated by `;`).
  return src.split(";");
}

function tableOf(stmt: string): string | null {
  const m = stmt.match(/\.from\(\s*["'`]([a-z_]+)["'`]\s*\)/);
  return m ? m[1]! : null;
}

describe("META bounded-read enumeration (§3.4 row-cap truncation class)", () => {
  for (const rel of READ_MODULES) {
    const src = readFileSync(join(process.cwd(), rel), "utf8");
    const chunks = statements(src).filter((s) => /\.from\(/.test(s) && /\.select\(/.test(s));

    it(`${rel}: every unbounded-table read carries an explicit bound`, () => {
      const violations: string[] = [];
      for (const stmt of chunks) {
        const table = tableOf(stmt);
        if (!table || !UNBOUNDED_TABLES.includes(table)) continue;

        const hasLimit = /\.limit\(/.test(stmt);
        const hasRange = /\.range\(/.test(stmt);
        const hasCount = /count:\s*["']exact["']/.test(stmt);
        const hasParentIn = /\.in\(\s*["'`](?:drive_file_id|id)["'`]/.test(stmt);
        const bounded = hasLimit || hasRange || hasCount || hasParentIn;
        if (!bounded) {
          violations.push(
            `from("${table}") read has no bound (.limit/.range/count:'exact'/parent .in): ${stmt.trim().slice(0, 120)}…`,
          );
        }
      }
      expect(violations, violations.join("\n")).toEqual([]);
    });

    it(`${rel}: no child one-to-many .in("show_id") row fetch without pagination or head count`, () => {
      const violations: string[] = [];
      for (const stmt of chunks) {
        const table = tableOf(stmt);
        if (!table || !UNBOUNDED_TABLES.includes(table)) continue;
        const hasChildIn = /\.in\(\s*["'`]show_id["'`]/.test(stmt);
        if (!hasChildIn) continue;
        const hasRange = /\.range\(/.test(stmt);
        const hasCount = /count:\s*["']exact["']/.test(stmt);
        if (!hasRange && !hasCount) {
          violations.push(
            `from("${table}") uses a bare .in("show_id") child row fetch (truncates at the row cap, R17). Use .range() paginate-until-complete or a head:true exact count: ${stmt.trim().slice(0, 120)}…`,
          );
        }
      }
      expect(violations, violations.join("\n")).toEqual([]);
    });
  }

  it("the scan actually found Supabase reads to check (guards against a no-op scan)", () => {
    // PER-MODULE floor: after the Task-1 extraction, BOTH Dashboard (shows +
    // crew reads stay) AND the loader (pending streams + counts + existence)
    // must each still match — a module whose scan silently matches nothing
    // is a no-op guard, not a passing one.
    let total = 0;
    for (const rel of READ_MODULES) {
      const src = readFileSync(join(process.cwd(), rel), "utf8");
      const count = statements(src).filter(
        (s) => /\.from\(/.test(s) && /\.select\(/.test(s),
      ).length;
      expect(
        count,
        `${rel}: bounded-read scan matched no Supabase reads (no-op scan)`,
      ).toBeGreaterThanOrEqual(1);
      total += count;
    }
    expect(total).toBeGreaterThanOrEqual(5);
  });
});
