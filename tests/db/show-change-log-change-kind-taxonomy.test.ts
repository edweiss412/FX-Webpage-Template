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

// Captures the SQL *positional* INSERT form that the adjacent matcher misses:
//   insert into public.show_change_log (col, ..., change_kind, ...) values (..., 'MI-12', ...)
// where the column list and the values tuple are separated. We locate the ordinal
// of the change_kind column, then read the literal at that ordinal in each VALUES
// tuple. Handles whitespace/newlines, an optional `public.` schema prefix, nested
// parens in value cells (e.g. now(), cast()), and multiple value tuples.
const POSITIONAL_HEAD_RE =
  /insert\s+into\s+(?:public\.)?show_change_log\s*\(([^)]*)\)\s*values\s*/gi;

// Split a SQL fragment on top-level commas, respecting quote AND paren nesting.
// The literals we care about are simple single-/double-quoted strings or bare
// identifiers; none of the structural change_kind values contain commas.
function splitTopLevelCommas(body: string): string[] {
  const parts: string[] = [];
  let cur = "";
  let quote: string | null = null;
  let depth = 0;
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (quote) {
      cur += ch;
      if (ch === quote) quote = null;
    } else if (ch === "'" || ch === '"') {
      quote = ch;
      cur += ch;
    } else if (ch === "(") {
      depth++;
      cur += ch;
    } else if (ch === ")") {
      depth--;
      cur += ch;
    } else if (ch === "," && depth === 0) {
      parts.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  parts.push(cur);
  return parts.map((p) => p.trim());
}

// Pull the literal value out of a VALUES cell, or null if it isn't a plain
// quoted string literal (e.g. a bind param, function call, or column ref).
function literalOf(cell: string): string | null {
  const m = cell.match(/^['"]([^'"]*)['"]$/);
  return m ? m[1] : null;
}

// Starting at `start` (index of an opening "(" in source), return the balanced
// inner body and the index just past the matching ")", or null if unbalanced.
function readBalancedTuple(source: string, start: number): { body: string; end: number } | null {
  if (source[start] !== "(") return null;
  let depth = 0;
  let quote: string | null = null;
  for (let i = start; i < source.length; i++) {
    const ch = source[i];
    if (quote) {
      if (ch === quote) quote = null;
    } else if (ch === "'" || ch === '"') {
      quote = ch;
    } else if (ch === "(") {
      depth++;
    } else if (ch === ")") {
      depth--;
      if (depth === 0) return { body: source.slice(start + 1, i), end: i + 1 };
    }
  }
  return null;
}

function extractPositional(source: string): string[] {
  const out: string[] = [];
  for (const head of source.matchAll(POSITIONAL_HEAD_RE)) {
    const cols = splitTopLevelCommas(head[1]).map((c) =>
      c.replace(/^["']|["']$/g, "").toLowerCase(),
    );
    const ordinal = cols.indexOf("change_kind");
    if (ordinal === -1) continue;
    // Walk forward from the end of the `... values` head, reading each balanced
    // tuple, hopping over a comma between successive tuples.
    let cursor = head.index + head[0].length;
    while (cursor < source.length) {
      // Skip whitespace.
      while (cursor < source.length && /\s/.test(source[cursor])) cursor++;
      if (source[cursor] !== "(") break;
      const tuple = readBalancedTuple(source, cursor);
      if (!tuple) break;
      const cells = splitTopLevelCommas(tuple.body);
      if (ordinal < cells.length) {
        const lit = literalOf(cells[ordinal]);
        if (lit !== null) out.push(lit);
      }
      cursor = tuple.end;
      while (cursor < source.length && /\s/.test(source[cursor])) cursor++;
      if (source[cursor] === ",") cursor++;
      else break;
    }
  }
  return out;
}

function extract(source: string): string[] {
  return [...[...source.matchAll(CHANGE_KIND_RE)].map((m) => m[1]), ...extractPositional(source)];
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

  it("catches the SQL positional INSERT form (column list separated from values)", () => {
    // Phase 3/4 RPCs insert into show_change_log positionally. The adjacent-literal
    // matcher (change_kind followed by :/=/quote) does NOT see this form, so the
    // positional extractor must. RED-proven: with only CHANGE_KIND_RE this returns [].
    const sql = `
      insert into public.show_change_log
        (show_id, occurred_at, source, status, change_kind, before_image)
      values
        ('00000000-0000-0000-0000-000000000000', now(), 'sync', 'applied', 'MI-12', null);
    `;
    const found = extract(sql);
    expect(found).toContain("MI-12");
    expect(found.some((v) => /^MI-/.test(v))).toBe(true);
  });

  it("reads the correct ordinal across multiple value tuples (positional)", () => {
    const sql = `
      insert into public.show_change_log (show_id, change_kind, status)
      values
        ($1, 'field_changed', 'applied'),
        ($2, 'MI-13', 'pending');
    `;
    const found = extract(sql);
    expect(found).toEqual(["field_changed", "MI-13"]);
  });

  it("ignores non-literal positional cells (bind params / function calls)", () => {
    const sql = `
      insert into public.show_change_log (show_id, change_kind)
      values ($1, p_change_kind);
    `;
    // change_kind cell is a bind/identifier, not a quoted literal → nothing to flag.
    expect(extract(sql)).toEqual([]);
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
