import { describe, expect, it } from "vitest";
import {
  classifyIntent,
  enclosingName,
  idPatterns,
  relocationHints,
} from "../../lib/specLint/citationIntent";

/**
 * Task 1 of the intent arm (spec §3.2-§3.4). Every case here is about the
 * MATCHING DISCIPLINE and the tier order; the wiring into `checkCitations`
 * is Task 2's suite.
 *
 * The substring / metacharacter pairs exist per consumer (window, enclosing,
 * whole-file, relocation) because AC-3 requires each of the four to fail on
 * `includes` semantics or on an unescaped interpolation — a shared helper that
 * one consumer bypasses is exactly the drift these catch.
 */

const matchesAny = (patterns: RegExp[], text: string): boolean =>
  patterns.some((p) => p.test(text));

describe("idPatterns — boundary, segmentation, escaping (spec §3.2)", () => {
  it("a bare id yields exactly one boundary-anchored pattern", () => {
    const p = idPatterns("deps");
    expect(p).toHaveLength(1);
    expect(matchesAny(p, "const deps = {}")).toBe(true);
    expect(matchesAny(p, "const depsWithStart = {}")).toBe(false);
    expect(matchesAny(p, "const withDeps = {}")).toBe(false); // case-sensitive, and suffix-bounded
    expect(matchesAny(p, "const my_deps = {}")).toBe(false); // `_` is an id character
    expect(matchesAny(p, "const deps$x = {}")).toBe(false); // `$` is an id character
  });

  it("a dotted id yields the full id PLUS one pattern per segment of length >= 3", () => {
    const p = idPatterns("SyncLogDeps.logSync");
    expect(p).toHaveLength(3);
    expect(matchesAny(p, "  logSync(entry)")).toBe(true); // bare tail segment
    expect(matchesAny(p, "interface SyncLogDeps {")).toBe(true); // bare head segment
    expect(matchesAny(p, "deps.SyncLogDeps.logSync()")).toBe(true); // the full dotted text
    expect(matchesAny(p, "  logSyncEntry(entry)")).toBe(false);
  });

  it("a THREE-character segment is exactly at the floor and DOES contribute a pattern", () => {
    // The boundary in both directions: this is what a raised floor (>= 4) or a
    // `<=` comparison would silently drop, taking `foo`/`bar`-length segments —
    // the commonest identifier length in the corpus — out of the search.
    const p = idPatterns("foo.bar");
    expect(p).toHaveLength(3);
    expect(matchesAny(p, "  bar(value)")).toBe(true);
    expect(matchesAny(p, "const foo = 1")).toBe(true);
  });

  it("segments shorter than 3 characters contribute no pattern (the floor)", () => {
    const p = idPatterns("a.of");
    expect(p).toHaveLength(1); // full id only: `a` is 1 char, `of` is 2
    expect(matchesAny(p, "for (const x of xs) {")).toBe(false);
    expect(matchesAny(p, "call(a.of)")).toBe(true);
  });

  it("metacharacters are escaped: `.` and `$` match literally", () => {
    const dotted = idPatterns("foo.bar");
    expect(matchesAny(dotted, "value = fooXbar")).toBe(false); // unescaped `.` would match
    expect(matchesAny(dotted, "value = foo.bar")).toBe(true);
    const dollar = idPatterns("$var");
    expect(matchesAny(dollar, "const $var = 1")).toBe(true);
    expect(matchesAny(dollar, "const var = 1")).toBe(false); // `$` is literal, not an anchor
  });
});

describe("enclosingName — upward declaration scan (spec §3.3 step 2)", () => {
  const scan = (lines: string[], start: number) => enclosingName(lines, start);

  it.each(["function", "const", "let", "var", "class", "interface", "type", "enum"])(
    "recognises a bare `%s` declaration",
    (kw) => {
      expect(scan([`${kw} alpha = 1`, "body", "body"], 3)).toBe("alpha");
    },
  );

  it("recognises the independently-optional export / async modifiers on function", () => {
    expect(scan(["export function alpha() {", "body"], 2)).toBe("alpha");
    expect(scan(["async function alpha() {", "body"], 2)).toBe("alpha");
    expect(scan(["export async function alpha() {", "body"], 2)).toBe("alpha");
  });

  it.each([
    ["create function alpha()", "alpha"],
    ["create or replace function public.alpha(", "alpha"],
    ["create table alpha (", "alpha"],
    ["create trigger alpha before insert", "alpha"],
    ["create index alpha on t (c)", "alpha"],
    ["create policy alpha on t", "alpha"],
    ["create view alpha as select 1", "alpha"],
    ["CREATE TABLE alpha (", "alpha"], // case-insensitive
  ])("recognises the SQL shape %s", (line, expected) => {
    expect(scan([line, "  c int"], 2)).toBe(expected);
  });

  it("recognises an ATX heading, whose full text is the name", () => {
    expect(scan(["## Sync log emission", "prose"], 2)).toBe("Sync log emission");
  });

  it("scans upward INCLUSIVE of the start line and stops at the nearest declaration", () => {
    const lines = ["function outer() {", "  x();", "function inner() {", "  y();"];
    expect(scan(lines, 3)).toBe("inner"); // the start line itself is a declaration
    expect(scan(lines, 4)).toBe("inner"); // nearest above wins over `outer`
    expect(scan(lines, 2)).toBe("outer");
  });

  it("more than six hashes is not an ATX heading", () => {
    // CommonMark caps ATX at six. A seventh hash is paragraph text, and reading
    // it as a heading would invent an enclosing name out of ordinary prose.
    expect(scan(["####### seven hashes is prose", "body"], 2)).toBeNull();
    expect(scan(["###### six hashes is a heading", "body"], 2)).toBe("six hashes is a heading");
  });

  it("returns null when no shape matches by line 1", () => {
    expect(scan(["  const x = 1;", "  return x;"], 2)).toBeNull(); // indented: not a declaration line
    expect(scan(["plain prose", "more prose"], 2)).toBeNull();
  });
});

describe("classifyIntent — tier order and window bounds (spec §3.3)", () => {
  /** 30 filler lines; callers overwrite specific 1-based positions. */
  const blank = (n = 30): string[] => Array.from({ length: n }, () => "  // filler");
  const at = (lines: string[], line: number, text: string): string[] => {
    const copy = [...lines];
    copy[line - 1] = text;
    return copy;
  };

  it("window hit → clean, and the window reaches EXACTLY start-5 but not start-6", () => {
    // Cited 12; lo = 7. A hit at 7 is clean, the same hit at 6 is not. The hit
    // is an indented CALL rather than a declaration deliberately: a declaration
    // one line above the window would be rescued by the enclosing-name tier and
    // this case would stop pinning the window bound at all.
    expect(classifyIntent(at(blank(), 7, "  deps();"), 12, 12, ["deps"]).tier).toBe("clean");
    expect(classifyIntent(at(blank(), 6, "  deps();"), 12, 12, ["deps"]).tier).toBe("unmatched");
  });

  it("the window reaches EXACTLY end+5 but not end+6 (the bound is symmetric)", () => {
    // Cited range 12-14; hi = 19.
    expect(classifyIntent(at(blank(), 19, "  deps();"), 12, 14, ["deps"]).tier).toBe("clean");
    expect(classifyIntent(at(blank(), 20, "  deps();"), 12, 14, ["deps"]).tier).toBe("unmatched");
  });

  it("enclosing-declaration rescue: a hit only in the decl name far above is clean", () => {
    const lines = at(blank(), 1, "export function deps() {");
    const r = classifyIntent(lines, 25, 25, ["deps"]);
    expect(r.tier).toBe("clean");
    expect(r.enclosing).toBe("deps");
  });

  it("a hit elsewhere in the file, outside window and decl name → unmatched", () => {
    const r = classifyIntent(at(blank(), 30, "  deps.logSync();"), 12, 12, ["deps"]);
    expect(r.tier).toBe("unmatched");
    expect(r.enclosing).toBeNull();
  });

  it("no hit anywhere → absent, and the enclosing name still reports for the detail line", () => {
    const lines = at(blank(), 1, "export function unrelated() {");
    const r = classifyIntent(lines, 12, 12, ["deps"]);
    expect(r.tier).toBe("absent");
    expect(r.enclosing).toBe("unrelated");
  });

  it("any one of several identifiers hitting is enough for clean", () => {
    const lines = at(blank(), 12, "  logSync(entry);");
    expect(classifyIntent(lines, 12, 12, ["nowhere", "logSync"]).tier).toBe("clean");
  });

  it("the window reaches line 1 itself when the citation sits near the head", () => {
    // Cited 3 → lo = max(1, -2) = 1. A floor of 2 loses line 1 entirely, and the
    // hit here is a CALL rather than a declaration so the enclosing-name tier
    // cannot mask the loss.
    const lines = ["  deps();", "x", "y", "z"];
    expect(classifyIntent(lines, 3, 3, ["deps"]).tier).toBe("clean");
  });

  it("the window clamps at both ends of the file rather than throwing", () => {
    expect(classifyIntent(["const deps = 1;"], 1, 1, ["deps"]).tier).toBe("clean");
    expect(classifyIntent(["x", "y"], 2, 2, ["deps"]).tier).toBe("absent");
  });

  // ---- AC-3: each consumer independently fails on substring / unescaped semantics ----

  it("WINDOW consumer: a substring-only neighbour does not clear the citation", () => {
    // `deps` appears nowhere boundary-matched, so the correct tier is absent.
    // A consumer using `includes` reports clean.
    expect(classifyIntent(at(blank(), 12, "const depsWithStart = 1;"), 12, 12, ["deps"]).tier).toBe(
      "absent",
    );
    expect(classifyIntent(at(blank(), 12, "const fooXbar = 1;"), 12, 12, ["foo.bar"]).tier).toBe(
      "absent",
    );
  });

  it("ENCLOSING consumer: a substring-only declaration name does not rescue", () => {
    expect(
      classifyIntent(at(blank(), 1, "function depsWithStart() {"), 25, 25, ["deps"]).tier,
    ).toBe("absent");
    expect(classifyIntent(at(blank(), 1, "function fooXbar() {"), 25, 25, ["foo.bar"]).tier).toBe(
      "absent",
    );
  });

  it("WHOLE-FILE consumer: a substring-only occurrence keeps the tier at absent", () => {
    // The flip here is absent -> unmatched, which is why it pins the third
    // consumer specifically: only the file scan can produce `unmatched`.
    expect(classifyIntent(at(blank(), 30, "  depsWithStart();"), 12, 12, ["deps"]).tier).toBe(
      "absent",
    );
    expect(classifyIntent(at(blank(), 30, "  fooXbar();"), 12, 12, ["foo.bar"]).tier).toBe(
      "absent",
    );
  });
});

describe("relocationHints — doc-ordered peer search (spec §3.4)", () => {
  const peer = (path: string, ...lines: string[]) => ({ path, lines });

  it("names peers whose content matches, in the order given, and skips non-matching peers", () => {
    const hints = relocationHints(
      ["runOnboardingScan"],
      [
        peer("lib/sync/other.ts", "const x = 1;"),
        peer("lib/sync/runOnboardingScan.ts", "export function runOnboardingScan() {"),
      ],
      3,
    );
    expect(hints).toEqual(["lib/sync/runOnboardingScan.ts"]);
  });

  it("caps the list at the requested count, keeping the first matches in order", () => {
    const peers = ["a", "b", "c", "d", "e"].map((n) => peer(`lib/${n}.ts`, "  deps();"));
    expect(relocationHints(["deps"], peers, 3)).toEqual(["lib/a.ts", "lib/b.ts", "lib/c.ts"]);
  });

  it("skips a peer whose lines are null (unreadable or a tracked symlink)", () => {
    const hints = relocationHints(
      ["deps"],
      [{ path: "lib/unreadable.ts", lines: null }, peer("lib/real.ts", "  deps();")],
      3,
    );
    expect(hints).toEqual(["lib/real.ts"]);
  });

  it("no peers, or no matching peer, yields an empty list", () => {
    expect(relocationHints(["deps"], [], 3)).toEqual([]);
    expect(relocationHints(["deps"], [peer("lib/a.ts", "nothing here")], 3)).toEqual([]);
  });

  it("RELOCATION consumer: substring and unescaped-metacharacter peers do not match", () => {
    expect(relocationHints(["deps"], [peer("lib/a.ts", "  depsWithStart();")], 3)).toEqual([]);
    expect(relocationHints(["foo.bar"], [peer("lib/a.ts", "  fooXbar();")], 3)).toEqual([]);
  });
});
