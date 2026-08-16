// M12.2 Phase A Task 1 — status-token contrast floors (DESIGN.md §1.3).
//
// Reads the LIVE runtime hex values out of app/globals.css and computes WCAG
// relative-luminance contrast (not a hardcoded snapshot), so the floors are
// pinned against the shipped tokens and any future drift fails here.
//
// Floors (DESIGN.md §1.2 / §1.3):
//   - status DOT (graphical object, WCAG 1.4.11): >= 3:1
//   - status -text (AA body text): >= 4.5:1
// asserted on BOTH --color-bg AND --color-surface, in BOTH light and dark.
//
// `live` reuses --color-accent and `idle` reuses --color-text-faint/-subtle
// (governed by the existing accent / neutral token rows, DESIGN.md §1.1/§1.2),
// so they are out of scope here — this test covers the NET-NEW positive /
// review / warn hues introduced by the amendment.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(join(process.cwd(), "app/globals.css"), "utf8");

function relLuminance(hex: string): number {
  const c = hex.replace("#", "");
  const ch = (i: number) => parseInt(c.slice(i, i + 2), 16) / 255;
  const lin = (v: number) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
  return 0.2126 * lin(ch(0)) + 0.7152 * lin(ch(2)) + 0.0722 * lin(ch(4));
}

function contrast(a: string, b: string): number {
  const l1 = relLuminance(a);
  const l2 = relLuminance(b);
  const hi = Math.max(l1, l2);
  const lo = Math.min(l1, l2);
  return (hi + 0.05) / (lo + 0.05);
}

// Extract a `--token-runtime: #hex;` value from a specific selector block so
// light and dark are read from their own scopes (not the first match).
function tokenIn(block: string, token: string): string {
  const re = new RegExp(`${token}\\s*:\\s*(#[0-9a-fA-F]{6})\\s*;`);
  const m = block.match(re);
  if (!m || !m[1]) throw new Error(`token ${token} not found in block`);
  return m[1];
}

function block(selectorStart: string): string {
  const idx = css.indexOf(selectorStart);
  if (idx === -1) throw new Error(`selector ${selectorStart} not found`);
  const open = css.indexOf("{", idx);
  // Walk to the matching close brace.
  let depth = 0;
  for (let i = open; i < css.length; i++) {
    if (css[i] === "{") depth++;
    else if (css[i] === "}") {
      depth--;
      if (depth === 0) return css.slice(open, i + 1);
    }
  }
  throw new Error(`unbalanced braces after ${selectorStart}`);
}

// Light values live in the top-level `:root {` block; dark values in the
// `[data-theme="dark"] {` block (the explicit-toggle scope mirrors the
// prefers-color-scheme media block verbatim).
const lightBlock = block(":root {");
const darkBlock = block('[data-theme="dark"] {');

const MODES = [
  {
    name: "light",
    bg: tokenIn(lightBlock, "--color-bg-runtime"),
    surface: tokenIn(lightBlock, "--color-surface-runtime"),
    src: lightBlock,
  },
  {
    name: "dark",
    bg: tokenIn(darkBlock, "--color-bg-runtime"),
    surface: tokenIn(darkBlock, "--color-surface-runtime"),
    src: darkBlock,
  },
];

const DOT_FLOOR = 3;
const TEXT_FLOOR = 4.5;

describe("status-token contrast floors (DESIGN.md §1.3)", () => {
  for (const mode of MODES) {
    for (const hue of ["positive", "review", "warn"] as const) {
      const dot = tokenIn(mode.src, `--color-status-${hue}-runtime`);
      const text = tokenIn(mode.src, `--color-status-${hue}-text-runtime`);

      it(`${mode.name}: status-${hue} dot clears the >=3:1 graphical floor on bg and surface`, () => {
        expect(contrast(dot, mode.bg)).toBeGreaterThanOrEqual(DOT_FLOOR);
        expect(contrast(dot, mode.surface)).toBeGreaterThanOrEqual(DOT_FLOOR);
      });

      it(`${mode.name}: status-${hue}-text clears the >=4.5:1 AA body floor on bg and surface`, () => {
        expect(contrast(text, mode.bg)).toBeGreaterThanOrEqual(TEXT_FLOOR);
        expect(contrast(text, mode.surface)).toBeGreaterThanOrEqual(TEXT_FLOOR);
      });
    }
  }

  // status-degraded (alert-audience-split) has a DIFFERENT text contract than
  // positive/review/warn: the -text token is white/near-black rendered ON the
  // filled degraded pill (`bg-status-degraded text-status-degraded-text`, cf.
  // HealthAlertsPanel.tsx), NOT colored text on the page surface. So its dot
  // clears the >=3:1 graphical floor on bg/surface, but its text clears the
  // >=4.5:1 AA floor against the FILL, not the surface.
  for (const mode of MODES) {
    const dot = tokenIn(mode.src, "--color-status-degraded-runtime");
    const text = tokenIn(mode.src, "--color-status-degraded-text-runtime");

    it(`${mode.name}: status-degraded dot clears the >=3:1 graphical floor on bg and surface`, () => {
      expect(contrast(dot, mode.bg)).toBeGreaterThanOrEqual(DOT_FLOOR);
      expect(contrast(dot, mode.surface)).toBeGreaterThanOrEqual(DOT_FLOOR);
    });

    it(`${mode.name}: status-degraded-text clears the >=4.5:1 AA floor on the degraded fill`, () => {
      expect(contrast(text, dot)).toBeGreaterThanOrEqual(TEXT_FLOOR);
    });
  }

  // Bell notification redesign: the two new tint↔icon pairs are GRAPHICAL
  // objects (WCAG 1.4.11, ≥3:1) — the severity icon glyph drawn on its tinted
  // circle. The active-count pill NUMBER is body TEXT on `--color-accent-tint`
  // and uses `--color-text-strong` (NOT `accent-on-bg`, which only reaches
  // ~3.8:1 there), so it clears the ≥4.5:1 AA text floor. All on BOTH modes.
  for (const mode of MODES) {
    const dangerBg = tokenIn(mode.src, "--color-danger-bg-runtime");
    const degradedIcon = tokenIn(mode.src, "--color-status-degraded-runtime");
    const accentTint = tokenIn(mode.src, "--color-accent-tint-runtime");
    const accentOnBg = tokenIn(mode.src, "--color-accent-on-bg-runtime");
    const textStrong = tokenIn(mode.src, "--color-text-strong-runtime");

    it(`${mode.name}: bell critical icon (status-degraded on danger-bg) clears >=3:1 graphical`, () => {
      expect(contrast(degradedIcon, dangerBg)).toBeGreaterThanOrEqual(DOT_FLOOR);
    });

    it(`${mode.name}: bell info icon (accent-on-bg on accent-tint) clears >=3:1 graphical`, () => {
      expect(contrast(accentOnBg, accentTint)).toBeGreaterThanOrEqual(DOT_FLOOR);
    });

    it(`${mode.name}: active-count pill text (text-strong on accent-tint) clears >=4.5:1 AA`, () => {
      expect(contrast(textStrong, accentTint)).toBeGreaterThanOrEqual(TEXT_FLOOR);
    });
  }

  // Published-show attention banner (2026-07-19): body copy sits on the
  // `--color-warning-bg` wash, not bg/surface — a pairing the rows above never
  // audit. Pin every text token the banner draws on that fill: the title
  // (text-strong), body (text), detail/identity/raised-at lines (text-subtle),
  // and the "✓ Confirmed" swap (status-positive-text). All AA body >=4.5:1.
  for (const mode of MODES) {
    const warningBg = tokenIn(mode.src, "--color-warning-bg-runtime");
    for (const token of ["text", "text-strong", "text-subtle", "status-positive-text"] as const) {
      it(`${mode.name}: ${token} clears >=4.5:1 AA on warning-bg (attention banner)`, () => {
        const fg = tokenIn(mode.src, `--color-${token}-runtime`);
        expect(contrast(fg, warningBg)).toBeGreaterThanOrEqual(TEXT_FLOOR);
      });
    }
  }

  it("positive hue is NOT green (color-blind floor §1) — it is a teal (blue ≈ green)", () => {
    // A green (e.g. the prototype's #2F7D4F) has blue well below green
    // (b/g ≈ 0.63). The calm teal we ship has blue nearly level with green
    // (b/g ≈ 0.95). Require b ≥ 0.85·g so a green value fails this guard.
    for (const mode of MODES) {
      const hex = tokenIn(mode.src, "--color-status-positive-runtime").replace("#", "");
      const r = parseInt(hex.slice(0, 2), 16);
      const g = parseInt(hex.slice(2, 4), 16);
      const b = parseInt(hex.slice(4, 6), 16);
      expect(b).toBeGreaterThanOrEqual(g * 0.85); // teal, not green
      expect(g).toBeGreaterThan(r); // blue-green family, not a warm hue
    }
  });
});

// Accent-contrast token pass (spec 2026-07-16-accent-contrast-token-pass §6.1).
// Alpha-blend helper: composite fg over bg at alpha, return hex.
function blend(fg: string, alpha: number, bg: string): string {
  const c = (h: string) =>
    h
      .replace("#", "")
      .match(/../g)!
      .map((x) => parseInt(x, 16));
  const f = c(fg);
  const b = c(bg);
  const m = f.map((v, i) => Math.round(alpha * v + (1 - alpha) * b[i]!));
  return "#" + m.map((v) => v.toString(16).padStart(2, "0")).join("");
}

describe("accent token contrast floors (2026-07-16 token pass)", () => {
  const mediaDarkBlock = block("@media (prefers-color-scheme: dark)");

  for (const mode of MODES) {
    const accent = tokenIn(mode.src, "--color-accent-runtime");
    const accentHover = tokenIn(mode.src, "--color-accent-hover-runtime");
    const accentText = tokenIn(mode.src, "--color-accent-text-runtime");
    const accentOnBg = tokenIn(mode.src, "--color-accent-on-bg-runtime");
    const accentTint = tokenIn(mode.src, "--color-accent-tint-runtime");
    const staleTint = tokenIn(mode.src, "--color-stale-tint-runtime");

    it(`${mode.name}: accent-text on accent AND accent-hover clears >=4.5:1 (CTA text)`, () => {
      expect(contrast(accentText, accent)).toBeGreaterThanOrEqual(TEXT_FLOOR);
      expect(contrast(accentText, accentHover)).toBeGreaterThanOrEqual(TEXT_FLOOR);
    });

    it(`${mode.name}: accent-on-bg clears >=4.5:1 on bg and surface (links/emphasis)`, () => {
      expect(contrast(accentOnBg, mode.bg)).toBeGreaterThanOrEqual(TEXT_FLOOR);
      expect(contrast(accentOnBg, mode.surface)).toBeGreaterThanOrEqual(TEXT_FLOOR);
    });

    it(`${mode.name}: accent-on-bg AS TEXT clears >=4.5:1 on every audited tinted fill`, () => {
      expect(contrast(accentOnBg, blend(accent, 0.1, mode.bg))).toBeGreaterThanOrEqual(TEXT_FLOOR);
      expect(contrast(accentOnBg, blend(accent, 0.15, mode.bg))).toBeGreaterThanOrEqual(TEXT_FLOOR);
      expect(contrast(accentOnBg, accentTint)).toBeGreaterThanOrEqual(TEXT_FLOOR);
      expect(contrast(accentOnBg, staleTint)).toBeGreaterThanOrEqual(TEXT_FLOOR);
    });
  }

  it("light: accent-edge clears >=3:1 vs the accent track AND vs bg AND vs surface", () => {
    const light = MODES[0]!;
    const edge = tokenIn(light.src, "--color-accent-edge-runtime");
    const accent = tokenIn(light.src, "--color-accent-runtime");
    expect(contrast(edge, accent)).toBeGreaterThanOrEqual(DOT_FLOOR);
    expect(contrast(edge, light.bg)).toBeGreaterThanOrEqual(DOT_FLOOR);
    expect(contrast(edge, light.surface)).toBeGreaterThanOrEqual(DOT_FLOOR);
  });

  it("dark: the accent track itself is the >=3:1 toggle boundary (edge is decorative)", () => {
    const dark = MODES[1]!;
    const accent = tokenIn(dark.src, "--color-accent-runtime");
    expect(contrast(accent, dark.bg)).toBeGreaterThanOrEqual(DOT_FLOOR);
    expect(contrast(accent, dark.surface)).toBeGreaterThanOrEqual(DOT_FLOOR);
  });

  // ── Share-link cue ring (spec 2026-07-24-share-link-chrome-backlog-design
  //    §3.7 / §9.2 item 5) ────────────────────────────────────────────────────
  //
  // The cue draws a 2px accent-edge ring around the crew-URL block, so the edge
  // stops being decorative in dark: it IS the change signal, on both grounds it
  // touches. Five pairs were uncovered before this, and the spec draft
  // overstated the existing coverage — the dark row above reads
  // `--color-accent-runtime` and pins the accent TRACK, not the edge.
  //
  // These are regression PINS, green on arrival by construction. Their job is to
  // fail when a future retune of accent-edge, accent-tint or surface-sunken
  // drops the ring below the non-text floor at the cue's peak or at its rest.
  for (const mode of MODES) {
    it(`${mode.name}: accent-edge clears >=3:1 on every ground the flash ring touches`, () => {
      const edge = tokenIn(mode.src, "--color-accent-edge-runtime");
      const tint = tokenIn(mode.src, "--color-accent-tint-runtime");
      const sunken = tokenIn(mode.src, "--color-surface-sunken-runtime");
      // Peak of the cue: the block is washed with accent-tint.
      expect(contrast(edge, tint)).toBeGreaterThanOrEqual(DOT_FLOOR);
      // After the wash settles: the block is back to its resting fill.
      expect(contrast(edge, sunken)).toBeGreaterThanOrEqual(DOT_FLOOR);
      // Outward edge, against the popover ground.
      expect(contrast(edge, mode.surface)).toBeGreaterThanOrEqual(DOT_FLOOR);
    });
  }

  // ── Section freshness cue (spec 2026-08-03-modal-freshness-cue §11.4) ──────
  //
  // The cue is an OUTLINE around a section panel card, and nothing else. An
  // earlier draft of it also washed the card with accent-tint; design review cut
  // the wash before implementation, and this comment described that dead design
  // until round-6 review caught the prose still standing while the assertions
  // below had already moved to the outline. The card's own background is
  // unchanged by the cue, so the pairing measured here is the outline against
  // the two grounds it actually touches.
  //
  // The edge rows restate the share-link floors on THIS surface deliberately.
  // DESIGN.md records that the ring is not decorative in dark, where it is the
  // change signal itself; the same is true here, so this surface carries its own
  // floor rather than inheriting one that a future share-link retune could remove.
  for (const mode of MODES) {
    it(`${mode.name}: the freshness outline stays visible against both grounds it touches`, () => {
      const edge = tokenIn(mode.src, "--color-accent-edge-runtime");
      const sunken = tokenIn(mode.src, "--color-surface-sunken-runtime");
      // The cue is an OUTLINE only; the accent-tint wash was removed on design
      // review, so the text-on-tint rows this block once carried no longer
      // describe anything that ships. What remains is the outline against the two
      // grounds it can touch: `surface`, which is the card's fill AND the
      // sub-header band's, and `surface-sunken` as a defensive second ground so a
      // future band retune cannot drop the cue below floor unnoticed.
      expect(contrast(edge, mode.surface)).toBeGreaterThanOrEqual(DOT_FLOOR);
      expect(contrast(edge, sunken)).toBeGreaterThanOrEqual(DOT_FLOOR);
    });
  }

  it("accent-edge is wired: @theme alias present, runtime value in ALL three blocks, dark blocks identical", () => {
    expect(css).toMatch(/--color-accent-edge:\s*var\(--color-accent-edge-runtime\)\s*;/);
    const lightVal = tokenIn(block(":root {"), "--color-accent-edge-runtime");
    const mediaVal = tokenIn(mediaDarkBlock, "--color-accent-edge-runtime");
    const explicitVal = tokenIn(block('[data-theme="dark"] {'), "--color-accent-edge-runtime");
    expect(lightVal).toBe("#7a3d00");
    expect(mediaVal).toBe(explicitVal);
    expect(mediaVal).toBe("#ffa047");
  });

  it("status-live-text still aliases accent-on-bg (spec §6.1 row 10)", () => {
    expect(css).toMatch(/--color-status-live-text:\s*var\(--color-accent-on-bg\)\s*;/);
  });
});

// ── warning-card guidance copy pairs (spec 2026-07-20-warning-card-copy-restore §7) ──
// The 12px inline guidance line renders text-warning-text on warning-bg
// (warning tone) and text-text-subtle on surface-sunken (muted tone). AA body
// floor in BOTH themes; measured 6.09 / 6.94 / 8.79 / 9.64 at authoring.
describe("warning-card guidance contrast (AA 4.5:1, both themes)", () => {
  const PAIRS = [
    ["--color-text-subtle-runtime", "--color-surface-sunken-runtime"],
    ["--color-warning-text-runtime", "--color-warning-bg-runtime"],
    // Published archived-tab offer/note error line (spec 2026-07-23 §2.1): the P-err line
    // renders text-warning-text on the surface-sunken card (not warning-bg). Pin both themes.
    ["--color-warning-text-runtime", "--color-surface-sunken-runtime"],
  ] as const;
  for (const mode of MODES) {
    for (const [fg, bg] of PAIRS) {
      it(`${mode.name}: ${fg} on ${bg} >= 4.5`, () => {
        expect(contrast(tokenIn(mode.src, fg), tokenIn(mode.src, bg))).toBeGreaterThanOrEqual(
          TEXT_FLOOR,
        );
      });
    }
  }
});

// Stacked-band state pill (spec 2026-07-24-strip-mobile-stacked-band §3 R0):
// the Published/Draft arms render `text-text-subtle` ON `bg-surface-sunken` —
// a pairing DESIGN.md §1.2 did not previously pin (its subtle rows cover
// bg / surface / warning-bg). Pin it here so the pill can never silently drop
// below AA when either token shifts. The Live arm's pair (accent-on-bg on
// accent-tint) is already pinned in §1.2; the badge dots sit next to a text
// label (color-blind floor), and Published's positive dot is covered by the
// hue rows above.
describe("stacked-band state pill contrast (spec 2026-07-24 §3 R0)", () => {
  for (const mode of MODES) {
    it(`${mode.name}: text-subtle clears >=4.5:1 AA on surface-sunken (Published/Draft pill)`, () => {
      const subtle = tokenIn(mode.src, "--color-text-subtle-runtime");
      const sunken = tokenIn(mode.src, "--color-surface-sunken-runtime");
      expect(contrast(subtle, sunken)).toBeGreaterThanOrEqual(TEXT_FLOOR);
    });
  }
});

// Theme persist-failure note (spec 2026-08-15-theme-persistence-note §2.2,
// impeccable audit P2): the bubble renders `text-text-subtle` ON
// `bg-surface-raised`, a ground DESIGN.md §1.2's subtle rows did not cover
// (bg / surface / warning-bg / surface-sunken). The note reports a failure, so
// it is the last copy that should be hard to read; pin it in both themes so a
// retune of either token fails here rather than in a hallway at 6am.
describe("theme persist-failure note contrast (theme-persistence-note §2.2)", () => {
  for (const mode of MODES) {
    it(`${mode.name}: text-subtle clears >=4.5:1 AA on surface-raised (persist-failure bubble)`, () => {
      const subtle = tokenIn(mode.src, "--color-text-subtle-runtime");
      const raised = tokenIn(mode.src, "--color-surface-raised-runtime");
      expect(contrast(subtle, raised)).toBeGreaterThanOrEqual(TEXT_FLOOR);
    });
  }
});

// SheetIconLink press/hover washes (sheet-icon-link spec §3, impeccable audit
// P3): the glyph renders `text-text-strong` ON its wash — `bg-surface-sunken`
// at the surface-backed modal titles, `bg-surface` at the bg-backed section
// header. Neither pair existed in DESIGN.md §1.2 before this change; pinned
// here so a token shift can never silently sink the pressed glyph below AA.
describe("SheetIconLink wash contrast (sheet-icon-link spec §3)", () => {
  for (const mode of MODES) {
    for (const wash of ["--color-surface-sunken-runtime", "--color-surface-runtime"] as const) {
      it(`${mode.name}: text-strong clears >=4.5:1 AA on ${wash}`, () => {
        const strong = tokenIn(mode.src, "--color-text-strong-runtime");
        expect(contrast(strong, tokenIn(mode.src, wash))).toBeGreaterThanOrEqual(TEXT_FLOOR);
      });
    }
  }
});
