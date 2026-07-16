// tests/styles/design-figure-parity.test.ts
// Pins every DESIGN.md contrast figure touched by the 2026-07-16 accent pass
// to the ratio computed from the live globals.css hexes (±0.05). The pass
// exists because these figures had drifted (gamma miscalculation class);
// this test closes that class for the touched rows. Any touched figure the
// parser cannot cover must be listed in KNOWN_UNPINNED with a reason.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(join(process.cwd(), "app/globals.css"), "utf8");
const design = readFileSync(join(process.cwd(), "DESIGN.md"), "utf8");

function relLuminance(hex: string): number {
  const c = hex.replace("#", "");
  const ch = (i: number) => parseInt(c.slice(i, i + 2), 16) / 255;
  const lin = (v: number) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
  return 0.2126 * lin(ch(0)) + 0.7152 * lin(ch(2)) + 0.0722 * lin(ch(4));
}
function contrast(a: string, b: string): number {
  const [hi, lo] = [relLuminance(a), relLuminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}
function token(scopeStart: string, name: string): string {
  const idx = css.indexOf(scopeStart);
  // runtime blocks are flat (no nested braces), so first-close slicing is safe
  const scope = css.slice(idx, css.indexOf("}", css.indexOf("{", idx) + 1) + 1);
  const m = scope.match(new RegExp(`${name}\\s*:\\s*(#[0-9a-fA-F]{6})`));
  if (!m) throw new Error(`${name} not in ${scopeStart}`);
  return m[1]!;
}
const L = (n: string) => token(":root {", n);
const D = (n: string) => token('[data-theme="dark"] {', n);
const TOL = 0.05;

// §1.2 table rows are pipe-delimited: | `pair` | light | dark | note |
// Parse a §1.2 row's light+dark figures by its pair-label prefix.
function tableFigures(labelRe: string): { light: number; dark: number } {
  const re = new RegExp(`\\|\\s*${labelRe}[^|]*\\|\\s*([\\d.]+):1\\s*\\|\\s*([\\d.]+):1\\s*\\|`);
  const m = design.match(re);
  if (!m) throw new Error(`§1.2 row not found: ${labelRe}`);
  return { light: parseFloat(m[1]!), dark: parseFloat(m[2]!) };
}

// Every documented figure touched by the pass: [label, documentedFigureRegex, computed].
// The regex must match DESIGN.md exactly once; the captured number is compared.
const ROWS: Array<[string, RegExp, number]> = [
  [
    "accent-text on accent (light §1.1 L33)",
    /near-black on orange in BOTH modes; ([\d.]+):1 in each/i,
    contrast(L("--color-accent-text-runtime"), L("--color-accent-runtime")),
  ],
  [
    "accent-on-bg on bg (light, §1.1 L34)",
    /contrast against `#FAFAF9` reaches ([\d.]+):1/,
    contrast(L("--color-accent-on-bg-runtime"), L("--color-bg-runtime")),
  ],
  [
    "accent raw on light bg (L34 corrected side-claim)",
    /The brand `#FF8C1A` itself only hits ([\d.]+):1 on light bg/,
    contrast(L("--color-accent-runtime"), L("--color-bg-runtime")),
  ],
  [
    "accent-on-bg dark (L34)",
    /Dark `#FFA047` on `#0F1014` = ([\d.]+):1/,
    contrast(D("--color-accent-on-bg-runtime"), D("--color-bg-runtime")),
  ],
  [
    "accent-tint icon (L47)",
    /icon on it uses `--color-accent-on-bg` \(graphical, ([\d.]+):1/,
    contrast(L("--color-accent-on-bg-runtime"), L("--color-accent-tint-runtime")),
  ],
  // Anchored to the exact accent-edge §1.1 row phrase — one regex per capture,
  // cannot match neighboring prose.
  [
    "accent-edge vs track (§1.1 new row)",
    /Light: accent-edge is ([\d.]+):1 vs the orange track and [\d.]+:1 vs bg/,
    contrast(L("--color-accent-edge-runtime"), L("--color-accent-runtime")),
  ],
  [
    "accent-edge vs bg (§1.1 new row)",
    /Light: accent-edge is [\d.]+:1 vs the orange track and ([\d.]+):1 vs bg/,
    contrast(L("--color-accent-edge-runtime"), L("--color-bg-runtime")),
  ],
  [
    "dark track boundary note (accent-edge §1.1 row)",
    /the track itself clears ([\d.]+):1 vs bg/,
    contrast(D("--color-accent-runtime"), D("--color-bg-runtime")),
  ],
];

// §1.2 TABLE cells — pinned directly (spec §6.1 row 8: EVERY touched figure in
// BOTH sections; "duplicate rendering" is not an exemption).
const TABLE_ROWS: Array<[string, string, number, number]> = [
  [
    "L57 accent on bg",
    "`--color-accent` on `--color-bg`",
    contrast(L("--color-accent-runtime"), L("--color-bg-runtime")),
    contrast(D("--color-accent-runtime"), D("--color-bg-runtime")),
  ],
  [
    "L58 accent-on-bg on bg",
    "`--color-accent-on-bg` on `--color-bg`",
    contrast(L("--color-accent-on-bg-runtime"), L("--color-bg-runtime")),
    contrast(D("--color-accent-on-bg-runtime"), D("--color-bg-runtime")),
  ],
  [
    "L59 accent-text on accent",
    "`--color-accent-text` on `--color-accent`",
    contrast(L("--color-accent-text-runtime"), L("--color-accent-runtime")),
    contrast(D("--color-accent-text-runtime"), D("--color-accent-runtime")),
  ],
  [
    "L70 accent-on-bg icon on tint",
    "`--color-accent-on-bg` icon on `--color-accent-tint`",
    contrast(L("--color-accent-on-bg-runtime"), L("--color-accent-tint-runtime")),
    contrast(D("--color-accent-on-bg-runtime"), D("--color-accent-tint-runtime")),
  ],
  [
    "accent-edge vs accent (new §1.2 row)",
    "`--color-accent-edge` vs `--color-accent`",
    contrast(L("--color-accent-edge-runtime"), L("--color-accent-runtime")),
    contrast(D("--color-accent-edge-runtime"), D("--color-accent-runtime")),
  ],
  [
    "accent-edge vs bg (new §1.2 row)",
    "`--color-accent-edge` vs `--color-bg`",
    contrast(L("--color-accent-edge-runtime"), L("--color-bg-runtime")),
    contrast(D("--color-accent-edge-runtime"), D("--color-bg-runtime")),
  ],
];

// Touched figures the row-parser deliberately does not pin, with reason.
const KNOWN_UNPINNED: Array<[string, string]> = [
  [
    "2.33:1 / 4.07:1 / 11.3:1 in L33 prose",
    "historical values quoted as documentation of the corrected miscalculation — not claims about live tokens",
  ],
  [
    "status-live-text ratio (L41)",
    "the row deliberately carries NO ratio figure — its documented contract is 'contrast governed by the accent rows above' (which ARE ratio-pinned); the touched value is the hex, pinned by the hex-parity assertion, and a no-numeric-claim assertion prevents an unpinned figure from ever appearing",
  ],
];

describe("DESIGN.md figure parity (touched rows)", () => {
  for (const [label, re, computed] of ROWS) {
    it(`${label}: documented figure equals computed ±${TOL}`, () => {
      const m = design.match(re);
      expect(m, `regex found no match for ${label}`).toBeTruthy();
      expect(Math.abs(parseFloat(m![1]!) - computed)).toBeLessThanOrEqual(TOL);
    });
  }
  for (const [name, label, light, dark] of TABLE_ROWS) {
    it(`§1.2 table ${name}: documented light+dark figures equal computed ±${TOL}`, () => {
      const fig = tableFigures(label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
      expect(Math.abs(fig.light - light)).toBeLessThanOrEqual(TOL);
      expect(Math.abs(fig.dark - dark)).toBeLessThanOrEqual(TOL);
    });
  }
  it("§1.1 L41 status-live-text documented hex equals live accent-on-bg (light)", () => {
    const m = design.match(/--color-status-live.*?`#FF8C1A` \/ `(#[0-9A-Fa-f]{6})`/);
    expect(m, "status-live row not found").toBeTruthy();
    expect(m![1]!.toLowerCase()).toBe(L("--color-accent-on-bg-runtime").toLowerCase());
  });
  it("§1.1 L41 status-live row carries NO numeric contrast claim (governed-by-alias contract)", () => {
    const row = design.split("\n").find((l) => l.includes("--color-status-live"));
    expect(row, "status-live row not found").toBeTruthy();
    expect(row!).not.toMatch(/[\d.]+:1/);
  });
  it("known-unpinned exceptions are exactly the declared historical set", () => {
    expect(KNOWN_UNPINNED.map(([label]) => label)).toEqual([
      "2.33:1 / 4.07:1 / 11.3:1 in L33 prose",
      "status-live-text ratio (L41)",
    ]);
  });
});
