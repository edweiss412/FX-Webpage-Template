// tests/styles/_metaDoublePrefixColorToken.test.ts
// Catches a SILENT visual bug: a color utility that Tailwind emits no rule for.
//
// The theme names its ink tokens `--color-text-*`, so the emitted utility is
// `text-text-subtle` — the `text-` of the utility plus the `text-` of the token name.
// Dropping one, `text-subtle`, is the natural thing to write and produces nothing at
// all: no rule, no build error, no lint warning. The element silently inherits its
// parent's color and the page still looks plausible, which is exactly why this survives
// review. It shipped in the destructive-confirm consequence line and was caught by
// whole-diff review R18, not by any gate.
//
// Scope: the double-prefix mistake specifically — a `<prop>-<name>` utility where
// `--color-<name>` does NOT exist but `--color-<prop>-<name>` DOES. That pairing is
// unambiguous evidence of the slip, and checking it needs only the theme block, not a
// full Tailwind compile.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { walk, stripComments, tokensOf } from "./_classScanUtils";

const REPO_ROOT = join(__dirname, "..", "..");
// Utilities whose Tailwind namespace is backed by --color-*.
const COLOR_PROPS = ["text", "bg", "border", "ring", "fill", "stroke", "decoration"];

function themeColorNames(): Set<string> {
  const css = readFileSync(join(REPO_ROOT, "app", "globals.css"), "utf8");
  const names = new Set<string>();
  for (const m of css.matchAll(/^\s*--color-([a-z0-9-]+)\s*:/gm)) {
    if (m[1]) names.add(m[1]);
  }
  return names;
}

describe("META no double-prefix color utility (silent dead class)", () => {
  const colors = themeColorNames();

  it("the theme really does define the token shape this guard depends on", () => {
    // Guard the guard: if the parse ever returns nothing, every assertion below
    // passes vacuously. `text-subtle` is the real case R18 found.
    expect(colors.size, "no --color-* tokens parsed from globals.css").toBeGreaterThan(10);
    expect(colors.has("text-subtle"), "expected the --color-text-subtle token").toBe(true);
    expect(colors.has("subtle"), "a bare --color-subtle would make text-subtle valid").toBe(false);
  });

  it("the scanner can still see code after a path that looks like a comment opener", () => {
    /* R19: the shared stripComments let ANY "/*" open a block span. A JSDoc line reading
     * "Wraps every route under /admin/*" therefore opened one that ran to the next "*\/"
     * far below, deleting all six live className sites in app/admin/layout.tsx — so this
     * guard reported nothing for that file while Tailwind emitted no rule for a dead
     * class in it. Pinned with the real shape, and with a JSX comment, which is the case
     * the first fix then got wrong in the other direction. */
    const sample = [
      "/**",
      " * Wraps every route under /admin/* (currently /admin/dev; future: more).",
      " */",
      'const a = <div className="text-text-strong" />;',
      "{/* a JSX comment mentioning text-subtle must NOT be scanned */}",
      'const b = <div className="bg-surface" />;',
    ].join("\n");
    const out = stripComments(sample);
    expect(out, "live code after the path was swallowed").toContain("text-text-strong");
    expect(out, "live code after a JSX comment was swallowed").toContain("bg-surface");
    expect(out, "a JSX comment body was scanned as code").not.toContain("text-subtle");

    /* R20 F1: a PROTOCOL-RELATIVE url has no colon before its "//", so the earlier
     * "not preceded by :" rule read it as a line comment and truncated the rest of the
     * line — hiding exactly the dead class this guard exists to find. */
    expect(
      stripComments('<a href="//cdn/x" className="text-subtle" />'),
      "a protocol-relative URL was mistaken for a line comment",
    ).toContain("text-subtle");
    expect(
      stripComments('const a = 1; // href="//cdn/x" text-subtle'),
      "a real line comment was not removed",
    ).not.toContain("text-subtle");
  });

  it("the scan reaches shipped MDX, not only TSX", () => {
    /* R20 F2: walk() matched only .ts/.tsx, so 13 shipped help pages under app/help
     * were never scanned and a dead class in one of them would reach production with
     * this guard green. */
    const scanned = walk(join(REPO_ROOT, "app"));
    expect(
      scanned.filter((f) => f.endsWith(".mdx")).length,
      "no .mdx files scanned — help pages are invisible to this guard",
    ).toBeGreaterThan(0);
  });

  it("no source file uses a color utility the theme cannot emit", () => {
    const offenders: string[] = [];
    for (const root of ["components", "app"]) {
      for (const file of walk(join(REPO_ROOT, root))) {
        const lines = stripComments(readFileSync(file, "utf8")).split("\n");
        lines.forEach((line, i) => {
          for (const raw of tokensOf(line)) {
            // Strip variants (hover:, md:) and any /opacity suffix.
            const token = (raw.split(":").pop() ?? "").split("/")[0] ?? "";
            const prop = COLOR_PROPS.find((p) => token.startsWith(`${p}-`));
            if (!prop) continue;
            const name = token.slice(prop.length + 1);
            if (!name || colors.has(name)) continue;
            // Only flag the unambiguous double-prefix slip: the bare name is not a
            // token, but prefixing the utility's own namespace makes it one.
            if (colors.has(`${prop}-${name}`)) {
              offenders.push(
                `${file.replace(`${REPO_ROOT}/`, "")}:${i + 1}  ${token}  ->  ${prop}-${prop}-${name}`,
              );
            }
          }
        });
      }
    }
    expect(offenders, "these emit no CSS rule and silently inherit the parent color").toEqual([]);
  });
});
