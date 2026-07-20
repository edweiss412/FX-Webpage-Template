import { describe, expect, it } from "vitest";
import { checkCopy } from "../../lib/specLint/copyRules";
import { parseDoc } from "../../lib/specLint/parse";

const run = (docText: string) => checkCopy(parseDoc(docText));
const codes = (fs: { code: string }[]) => fs.map((f) => f.code);

const NON_RAW_SPELLINGS = ["&mdash;", "&#8212;", "&#x2014;", "&#X2014;", "\\u2014", "\\u{2014}"];

describe("checkCopy — em-dash class (spec §6)", () => {
  it("raw em-dash in straight prose quotes → hard COPY_EM_DASH", () => {
    const f = run('He said "a — b" ok\n');
    expect(codes(f)).toEqual(["COPY_EM_DASH"]);
    expect(f[0]!.severity).toBe("fail");
  });

  it("raw em-dash in curly prose quotes → hard COPY_EM_DASH", () => {
    expect(codes(run("He said “a — b” ok\n"))).toEqual(["COPY_EM_DASH"]);
  });

  it.each(NON_RAW_SPELLINGS)("spelling %s in a prose quote → COPY_EM_DASH", (sp) => {
    expect(codes(run(`say "x ${sp} y" done\n`))).toEqual(["COPY_EM_DASH"]);
  });

  it.each(NON_RAW_SPELLINGS)("spelling %s in a ts fence → COPY_EM_DASH", (sp) => {
    expect(codes(run(["```ts", `const s = "${sp}";`, "```"].join("\n")))).toEqual(["COPY_EM_DASH"]);
  });

  it.each(["tsx", "typescript", "js", "jsx", "javascript", "mjs", "cjs", "json"])(
    "raw em-dash in %s fence → COPY_EM_DASH",
    (tag) => {
      expect(codes(run(["```" + tag, "x — y", "```"].join("\n")))).toEqual(["COPY_EM_DASH"]);
    },
  );

  it("em-dash in a fence COMMENT still fails (whole-fence scan)", () => {
    expect(codes(run(["```ts", "// note — dash", "```"].join("\n")))).toEqual(["COPY_EM_DASH"]);
  });

  it("sql, sh, and bare fences are unscanned", () => {
    for (const tag of ["sql", "sh", ""]) {
      expect(run(["```" + tag, "x — y", "```"].join("\n"))).toEqual([]);
    }
  });

  it("em-dash in unquoted prose is NOT flagged", () => {
    expect(run("plain — prose here\n")).toEqual([]);
  });
});

describe("checkCopy — quote pairing (spec §6)", () => {
  it("3 straight quotes → 1 pair + 1 unpaired advisory", () => {
    const f = run('a "b" then " open\n');
    expect(codes(f)).toEqual(["COPY_UNPAIRED_QUOTE"]);
    expect(f[0]!.severity).toBe("advisory");
  });

  it("straight and curly never cross-pair — each style pairs with itself", () => {
    expect(run('say "hi" and “yo” fine\n')).toEqual([]);
  });

  it("em-dash after an unpaired STRAIGHT opener → unpaired advisory, NO em-dash finding", () => {
    expect(codes(run('bad " open then “x — y”\n'))).toEqual(["COPY_UNPAIRED_QUOTE"]);
  });

  it("em-dash after an unpaired CURLY opener → unpaired advisory, NO em-dash finding", () => {
    expect(codes(run('bad “ open then "x — y"\n'))).toEqual(["COPY_UNPAIRED_QUOTE"]);
  });

  it("unmatched curly closer alone → advisory", () => {
    expect(codes(run("stray ” here\n"))).toEqual(["COPY_UNPAIRED_QUOTE"]);
  });

  it("stray closer then straight-paired em-dash on the same line → COPY_EM_DASH still emits", () => {
    expect(codes(run('” then "a — b"\n')).sort()).toEqual(["COPY_EM_DASH", "COPY_UNPAIRED_QUOTE"]);
  });

  it("stray closer then curly-paired em-dash → COPY_EM_DASH still emits", () => {
    expect(codes(run("” then “a — b”\n")).sort()).toEqual(["COPY_EM_DASH", "COPY_UNPAIRED_QUOTE"]);
  });
});

describe("checkCopy — hyphen/apostrophe advisories (spec §6)", () => {
  it('"--json" in prose quotes → COPY_DOUBLE_HYPHEN advisory; fence --flag clean', () => {
    const f = run('pass "--json" here\n');
    expect(codes(f)).toEqual(["COPY_DOUBLE_HYPHEN"]);
    expect(f[0]!.severity).toBe("advisory");
    expect(run(["```sh", "cmd --flag", "```"].join("\n"))).toEqual([]);
  });

  it("\"it's\" in prose quotes → COPY_STRAIGHT_APOSTROPHE advisory; fence 'x' clean", () => {
    const f = run('say "it\'s fine" ok\n');
    expect(codes(f)).toEqual(["COPY_STRAIGHT_APOSTROPHE"]);
    expect(f[0]!.severity).toBe("advisory");
    expect(run(["```ts", "const a = 'x';", "```"].join("\n"))).toEqual([]);
  });
});
