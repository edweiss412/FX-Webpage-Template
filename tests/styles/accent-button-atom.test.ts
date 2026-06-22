/**
 * tests/styles/accent-button-atom.test.ts (M5-D7)
 *
 * Structural anti-drift contract for the shared AccentButton atom.
 *
 * The accent-fill button chrome (`bg-accent` + `text-accent-text` +
 * `hover:bg-accent-hover` + focus-ring) had hand-copied itself across
 * ~8 admin call sites, accreting small per-site differences. M5-D7
 * extracted it into `components/shared/AccentButton.tsx`. This meta-test
 * pins the migration so the class can't silently re-drift back into the
 * migrated files:
 *
 *   sub-scan 1: none of the MIGRATED files contains a raw accent-button
 *               composition (bg-accent co-located with text-accent-text
 *               on a single className) — the atom is the only source.
 *   sub-scan 2: every migrated file imports AccentButton (sanity — the
 *               files actually route through the atom, not merely deleted
 *               the chrome).
 *   sub-scan 3: the atom file itself DOES contain the canonical
 *               composition (the single legitimate home).
 *
 * Mirrors the `tests/styles/_metaDesignTokenPairs.test.ts` pattern
 * (commit 7d2929ba): a scoped file list with a documented future
 * extension point.
 *
 * SCOPE (v1, M5-D7): only the 8 files this task migrated. The
 * accent-button pattern is drifted across ~17 OTHER sites (admin error
 * boundaries, settings forms, wizard steps, share/rotate buttons, crew
 * picker/gate, ReportModal/ReportButton). Migrating those is OUT OF
 * SCOPE for M5-D7; expanding MIGRATED_FILES here (after migrating each)
 * is the extension point. A repo-wide sweep is tracked in BACKLOG.md as
 * BL-ACCENT-BUTTON-ATOM-SWEEP.
 *
 * Note: the regex below is the only verbatim spelling of the banned
 * pair this file contains; comments avoid spelling `bg-accent` +
 * `text-accent-text` together so Tailwind's test-source scan can't emit
 * stray utilities (app/globals.css also carries `@source not "../tests"`).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ADMIN_DIR = "components/admin";
const ATOM_FILE = "components/shared/AccentButton.tsx";

// The 8 call sites migrated by M5-D7. ResolveAlertButton carries TWO
// accent buttons (idle Resolve + confirm) — one file, both swapped.
const MIGRATED_FILES = [
  "ResolveAlertButton.tsx",
  "PendingPanelRetryButton.tsx",
  "ReSyncButton.tsx",
  "PublishShowButton.tsx",
  "RunFinalCASButton.tsx",
  "ResumeFinalizeButton.tsx",
  "FinalizeButton.tsx",
  "StagedReviewCard.tsx",
].map((f) => join(ADMIN_DIR, f));

function readLines(path: string): string[] {
  return readFileSync(path, "utf8").split("\n");
}

// A raw accent-button composition = a single className string that pairs
// the accent background with its dedicated foreground. `bg-accent`
// followed by a non-word char (so `bg-accent-on-bg`, `bg-accent-hover`
// don't count as the fill) AND `text-accent-text` on the same line.
const ACCENT_FILL_RE = /\bbg-accent(?![\w-])/;
const ACCENT_TEXT = "text-accent-text";

describe("META AccentButton atom anti-drift contract (M5-D7)", () => {
  it("sub-scan 1: no migrated file pairs the accent fill with its foreground in a raw className", () => {
    const violations: string[] = [];
    for (const file of MIGRATED_FILES) {
      readLines(file).forEach((line, idx) => {
        if (line.includes(ACCENT_TEXT) && ACCENT_FILL_RE.test(line)) {
          violations.push(
            `${file}:${idx + 1} hand-rolls the accent-button chrome. M5-D7 routed this through <AccentButton> (components/shared/AccentButton.tsx). Use the atom + its variant props (size / fontWeight / ringOffset / inline / selfStart / shadow / minWidthTap) instead of re-inlining the composition.`,
          );
        }
      });
    }
    expect(violations, violations.join("\n")).toEqual([]);
  });

  it("sub-scan 2: every migrated file imports AccentButton", () => {
    const missing: string[] = [];
    for (const file of MIGRATED_FILES) {
      const source = readFileSync(file, "utf8");
      if (
        !/import\s*\{[^}]*\bAccentButton\b[^}]*\}\s*from\s*["']@\/components\/shared\/AccentButton["']/.test(
          source,
        )
      ) {
        missing.push(file);
      }
    }
    expect(
      missing,
      `These migrated files no longer import AccentButton (did the chrome get re-inlined?): ${missing.join(", ")}`,
    ).toEqual([]);
  });

  it("sub-scan 3: the atom file is the single legitimate home of the composition", () => {
    const source = readFileSync(ATOM_FILE, "utf8");
    expect(ACCENT_FILL_RE.test(source), `${ATOM_FILE} must contain the accent fill`).toBe(true);
    expect(source.includes(ACCENT_TEXT), `${ATOM_FILE} must contain the accent foreground`).toBe(
      true,
    );
  });
});
