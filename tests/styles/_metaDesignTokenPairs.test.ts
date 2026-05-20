// Phase D close-out — 3+ rounds of same-vector findings across Phase A R2
// (Sidebar side-stripe) + D.1 (Callout side-stripe + Tip-variant contrast) +
// D.6 (TipFromSheets side-stripe + eyebrow contrast) triggered this
// structural defense per memory
// `feedback_same_vector_recurrence_triggers_comprehensive_reanalysis.md`.
//
// Three sub-scans on the Phase A-D component surface
// (app/help/_components/*.tsx):
//   1. Side-stripe ban (DESIGN.md L242): no directional border > 1px.
//   2. text-accent-text only paired with bg-accent (DESIGN.md L33).
//   3. text-text-subtle not on action targets (DESIGN.md L27).
//
// TODO (v1 scope note): pre-existing violations in other directories
// (e.g., `components/`, other `app/` routes) are out of scope for this
// meta-test. A project-wide sweep is tracked in BACKLOG.md as a separate
// cross-cutting item; expanding the file list here is the future
// extension point.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const COMPONENT_DIR = "app/help/_components";
const COMPONENT_FILES = [
  "Breadcrumb.tsx",
  "Header.tsx",
  "Sidebar.tsx",
  "Callout.tsx",
  "Step.tsx",
  "ScreenshotPlaceholder.tsx",
  "Screenshot.tsx",
  "RefAnchor.tsx",
  "TipFromSheets.tsx",
].map((f) => join(COMPONENT_DIR, f));

function readLines(path: string): string[] {
  return readFileSync(path, "utf8").split("\n");
}

describe("META DESIGN.md token-pair contract (Phase D close-out)", () => {
  it("sub-scan 1: no side-stripe borders > 1px (DESIGN.md L242)", () => {
    // Matches border-l-2, border-l-4, border-l-[..], border-r-[…], etc.
    // Allows bare `border-l` (1px form, still ≤1px).
    const SIDE_STRIPE_RE = /border-(?:l|r|t|b)-(?:[2-9]|\d{2,}|\[)/;
    const violations: string[] = [];
    for (const file of COMPONENT_FILES) {
      const lines = readLines(file);
      lines.forEach((line, idx) => {
        if (SIDE_STRIPE_RE.test(line)) {
          violations.push(
            `${file}:${idx + 1} has a side-stripe border > 1px (DESIGN.md L242 ban). Phase A R2 / D.1 / D.6 precedent: drop the directional border or reduce to ≤1px.`,
          );
        }
      });
    }
    expect(violations, violations.join("\n")).toEqual([]);
  });

  it("sub-scan 2: text-accent-text only appears alongside bg-accent in the same className (DESIGN.md L33)", () => {
    const violations: string[] = [];
    for (const file of COMPONENT_FILES) {
      const lines = readLines(file);
      lines.forEach((line, idx) => {
        if (!line.includes("text-accent-text")) return;
        // The same line must also include the literal `bg-accent` (NOT
        // bg-accent-on-bg, bg-info-bg, bg-stale-tint, etc.). Use a
        // word-boundary check that accepts `bg-accent` followed by
        // whitespace, quote, backtick, or end-of-string only — not
        // `bg-accent-on-bg` or similar suffixed tokens.
        if (!/\bbg-accent(?![\w-])/.test(line)) {
          violations.push(
            `${file}:${idx + 1} uses text-accent-text without bg-accent in the same className. DESIGN.md L33: text-accent-text is the foreground designed for bg-accent surfaces only. D.1 Tip-variant + D.6 eyebrow precedent: swap to text-text-strong.`,
          );
        }
      });
    }
    expect(violations, violations.join("\n")).toEqual([]);
  });

  it("sub-scan 3: text-text-subtle not on action-target elements (DESIGN.md L27)", () => {
    // The banned pattern is text-text-subtle ON the action target's own
    // className. A container element styled with text-text-subtle that
    // wraps a child link/button (which overrides with its own color) is
    // a legitimate pattern — Breadcrumb.tsx is the canonical example
    // (nav has text-text-subtle, <Link> child has text-text /
    // hover:text-text-strong). Same-line check catches the banned
    // pattern (text-subtle co-located with the action-target opener)
    // without flagging the legitimate container pattern. A wider window
    // produced a false positive on Breadcrumb during the v1 dry-run.
    const ACTION_TARGET_RE = /href=|onClick|<a |<button|<Link/;
    const violations: string[] = [];
    for (const file of COMPONENT_FILES) {
      const lines = readLines(file);
      lines.forEach((line, idx) => {
        if (!line.includes("text-text-subtle")) return;
        if (ACTION_TARGET_RE.test(line)) {
          violations.push(
            `${file}:${idx + 1} uses text-text-subtle on an action-target element (href/onClick/<a/<button/<Link on the same line). DESIGN.md L27: text-text-subtle is body-foreground, not action target. Phase A R1 + D.5 precedent: swap to text-text or text-text-strong + paired hover state.`,
          );
        }
      });
    }
    expect(violations, violations.join("\n")).toEqual([]);
  });
});
