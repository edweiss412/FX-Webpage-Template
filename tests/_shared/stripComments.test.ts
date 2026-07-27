import { describe, expect, it } from "vitest";
import ts from "typescript";

import {
  commentRanges,
  stripCommentsForFile,
  stripCssComments,
  stripMdxComments,
  stripCommentsSafely,
  stripSqlComments,
} from "./stripComments";

const TS = ts.ScriptKind.TS;
const TSX = ts.ScriptKind.TSX;

describe("stripCommentsSafely — TS/TSX", () => {
  it("does not let a path-like /* inside a JSDoc open a runaway span (BL-904 measured case)", () => {
    const src = [
      "/**",
      " * Wraps every route under /admin/*",
      " */",
      'const a = "text-subtle";',
      "/* real */",
      'const b = "bg-accent";',
    ].join("\n");
    const out = stripCommentsSafely(src, TSX);
    expect(out).toContain('const a = "text-subtle";');
    expect(out).toContain('const b = "bg-accent";');
    expect(out).not.toContain("real");
  });

  it("protects /* inside a string literal", () => {
    const src = 'const g = "/* not a comment */"; const live = 1;';
    const out = stripCommentsSafely(src, TS);
    expect(out).toContain('"/* not a comment */"');
    expect(out).toContain("const live = 1;");
  });

  it("protects protocol-relative and scheme URLs and regex literals", () => {
    const src = [
      'const a = "//cdn/x";',
      'const b = "https://cdn/y";',
      "const re = /https:\\/\\/z/; // trailing",
    ].join("\n");
    const out = stripCommentsSafely(src, TS);
    expect(out).toContain('"//cdn/x"');
    expect(out).toContain('"https://cdn/y"');
    expect(out).toContain("/https:\\/\\/z/");
    expect(out).not.toContain("trailing");
  });

  it("parses .ts generic arrows as TS, not JSX (R1 F2 — lib/sync/attachWarningAnchors.ts:40 shape)", () => {
    const src = "const f = <T>(x: T) => x; // gone";
    const out = stripCommentsSafely(src, TS);
    expect(out).toContain("const f = <T>(x: T) => x;");
    expect(out).not.toContain("gone");
    expect(commentRanges(src, TS).length).toBe(1);
  });

  it("preserves offsets and line numbers (blanking, not deletion)", () => {
    const src = "/* one\ntwo */\nconst z = 3;";
    const out = stripCommentsSafely(src, TS);
    expect(out.length).toBe(src.length);
    expect(out.split("\n").length).toBe(src.split("\n").length);
    expect(out.indexOf("const z")).toBe(src.indexOf("const z"));
  });

  it("keeps a shebang", () => {
    const src = "#!/usr/bin/env node // https://x\nconst a = 1; // c";
    const out = stripCommentsSafely(src, TS);
    expect(out).toContain("#!/usr/bin/env node // https://x");
    expect(out).not.toContain("// c");
  });
});

describe("stripCommentsForFile — routing", () => {
  it("routes every declared extension", () => {
    expect(stripCommentsForFile("const a = 1; // c", "x.ts")).not.toContain("// c");
    expect(stripCommentsForFile("const a = 1; // c", "x.mts")).not.toContain("// c");
    expect(stripCommentsForFile("const a = 1; // c", "x.cts")).not.toContain("// c");
    expect(stripCommentsForFile("const a = <div/>; // c", "x.tsx")).not.toContain("// c");
    expect(stripCommentsForFile("const a = 1; // c", "x.js")).not.toContain("// c");
    expect(stripCommentsForFile("const a = 1; // c", "x.mjs")).not.toContain("// c");
    expect(stripCommentsForFile("const a = 1; // c", "x.cjs")).not.toContain("// c");
    expect(stripCommentsForFile("const a = <div/>; // c", "x.jsx")).not.toContain("// c");
    expect(stripCommentsForFile("select 1; -- c", "m.sql")).not.toContain("-- c");
    expect(stripCommentsForFile("a { } /* c */", "s.css")).not.toContain("c ");
    expect(stripCommentsForFile("text // keep", "p.mdx")).toContain("// keep");
  });

  it("throws on an unknown extension (fail-closed)", () => {
    expect(() => stripCommentsForFile("x", "notes.yaml")).toThrow(/unknown/i);
  });
});

describe("stripMdxComments", () => {
  it("keeps MDX prose line comments and URLs, strips JSX block comments", () => {
    const src = "[CDN](https://cdn/x)\n{/* gone */}\nplain // keep";
    const out = stripMdxComments(src);
    expect(out).toContain("[CDN](https://cdn/x)");
    expect(out).toContain("// keep");
    expect(out).not.toContain("gone");
  });
});

describe("stripSqlComments", () => {
  it("strips line and block comments, honors '' escaping and quoted markers", () => {
    const src = [
      "select 1; -- gone",
      "select 'a -- b';",
      "select 'it''s -- still data';",
      "select '/* data */';",
      "/* gone2 */ select 2;",
    ].join("\n");
    const out = stripSqlComments(src);
    expect(out).not.toContain("gone");
    expect(out).toContain("'a -- b'");
    expect(out).toContain("'it''s -- still data'");
    expect(out).toContain("'/* data */'");
    expect(out).toContain("select 2;");
  });

  it("handles nested block comments (Postgres nests them)", () => {
    const out = stripSqlComments("/* a /* b */ c */ select 3;");
    expect(out).toContain("select 3;");
    expect(out).not.toContain("c */");
  });

  it("treats dollar-quoted spans as SQL code — tagged and untagged (spec §1.1 contract)", () => {
    const src = [
      "create function f() returns void as $$",
      "  -- gone-in-untagged",
      "  select 1;",
      "$$ language sql;",
      "create function g() returns void as $function$",
      "begin -- gone-in-tagged",
      "  perform 1; -- also gone",
      "end $function$;",
    ].join("\n");
    const out = stripSqlComments(src);
    expect(out).not.toContain("gone-in-untagged");
    expect(out).not.toContain("gone-in-tagged");
    expect(out).not.toContain("also gone");
    expect(out).toContain("select 1;");
    expect(out).toContain("perform 1;");
  });

  it("still protects single-quoted strings INSIDE dollar spans", () => {
    const out = stripSqlComments("do $$ begin perform log('x -- data'); end $$;");
    expect(out).toContain("'x -- data'");
  });

  it("documented limitation: comment markers in dollar-quoted NON-SQL data are stripped", () => {
    // Spec §1.1 — pinned so the contract is visible, not accidental.
    const out = stripSqlComments("select $d$ text -- looks like data $d$;");
    expect(out).not.toContain("looks like data");
  });
});

describe("stripCssComments", () => {
  it("strips block comments, protects quoted strings", () => {
    const out = stripCssComments('a::before { content: "/*"; } /* gone */ b { color: red; }');
    expect(out).toContain('content: "/*";');
    expect(out).not.toContain("gone");
    expect(out).toContain("b { color: red; }");
  });
});
