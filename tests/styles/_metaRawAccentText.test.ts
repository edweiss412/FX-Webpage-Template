// tests/styles/_metaRawAccentText.test.ts
// Bans raw accent TEXT classes (2.23:1 light) and the sub-AA hover shifts
// (spec 2026-07-16-accent-contrast-token-pass §4.4a). Also scans the wizard
// for the 10px-faint eyebrow pattern (spec §4.2). Filesystem-walked: NEW
// files fail by default.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { stripComments, tokensOf, walk } from "./_classScanUtils";

const ROOTS = ["components", "app"];
// file:reason rows; EMPTY at ship (spec §4.4a).
const ALLOWLIST: Array<{ file: string; reason: string }> = [];

// A token is banned iff, after stripping its variant chain, the final utility
// is EXACTLY `text-accent` (raw accent as text — banned in EVERY chain, hover
// or not) OR EXACTLY `text-accent-hover` (the hover-shift hue, #e67a0e light
// ≈ 2.9:1 — sub-AA wherever it colors text; no legitimate use in any chain).
// `text-accent-on-bg` / `text-accent-text` never match (suffixed utilities
// are different tokens).
function bannedToken(tok: string): boolean {
  const parts = tok.split(":");
  const util = parts[parts.length - 1]!.replace(/^!/, "");
  return util === "text-accent" || util === "text-accent-hover";
}

describe("META raw accent text ban (spec 2026-07-16 §4.4a)", () => {
  it("matcher self-check: safe tokens accepted, banned tokens rejected", () => {
    expect(bannedToken("text-accent")).toBe(true);
    expect(bannedToken("hover:text-accent")).toBe(true);
    expect(bannedToken("hover:text-accent-hover")).toBe(true);
    expect(bannedToken("md:hover:text-accent")).toBe(true);
    expect(bannedToken("focus:text-accent-hover")).toBe(true);
    expect(bannedToken("text-accent-hover")).toBe(true);
    // Bracketed arbitrary variants — naive ":"-split is SOUND for exact
    // final-utility equality: a colon inside a variant bracket only splits
    // PREFIX segments; the final segment still equals the utility. A colon
    // inside a bracketed VALUE leaves "]" in the segment, which can never
    // equal the exact banned strings.
    expect(bannedToken("data-[state=open]:text-accent")).toBe(true);
    expect(bannedToken("[&:hover]:text-accent")).toBe(true);
    expect(bannedToken("data-[a:b]:text-accent")).toBe(true);
    expect(bannedToken("text-[color:red]")).toBe(false);
    expect(bannedToken("text-accent-on-bg")).toBe(false);
    expect(bannedToken("hover:text-accent-on-bg")).toBe(false);
    expect(bannedToken("text-accent-text")).toBe(false);
    expect(bannedToken("bg-accent-hover")).toBe(false);
    // Splitter self-check: JSX punctuation never welds onto a token, and the
    // opacity slash is preserved (no fabricated bare tokens).
    expect(tokensOf('cn(active && "text-accent")').includes("text-accent")).toBe(true);
    expect(tokensOf("a ? `x text-accent` : y").includes("text-accent")).toBe(true);
    expect(tokensOf('"bg-accent/10"').includes("bg-accent")).toBe(false);
  });

  it("no raw accent text classes in components/ or app/", () => {
    const violations: string[] = [];
    for (const root of ROOTS) {
      for (const file of walk(root)) {
        if (ALLOWLIST.some((a) => a.file === file)) continue;
        const lines = stripComments(readFileSync(file, "utf8")).split("\n");
        lines.forEach((line, i) => {
          for (const tok of tokensOf(line)) {
            if (bannedToken(tok)) violations.push(`${file}:${i + 1} ${tok}`);
          }
        });
      }
    }
    expect(violations, violations.join("\n")).toEqual([]);
  });

  it("wizard: no 10px + text-text-faint pairing (spec §4.2 eyebrow class)", () => {
    const violations: string[] = [];
    for (const file of walk("components/admin/wizard")) {
      stripComments(readFileSync(file, "utf8"))
        .split("\n")
        .forEach((line, i) => {
          if (line.includes("text-text-faint") && line.includes("text-[10px]")) {
            violations.push(`${file}:${i + 1}`);
          }
        });
    }
    expect(violations, violations.join("\n")).toEqual([]);
  });
});
