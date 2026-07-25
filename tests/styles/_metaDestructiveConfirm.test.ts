/**
 * Destructive-confirm recipe registry (spec 2026-07-16-destructive-confirm-pass §8).
 * A hit = one line (≈ one static class literal in this codebase) whose token
 * set contains BOTH unvarianted `bg-warning-text` AND `text-warning-bg`. One
 * registry row per hit, occurrence-indexed per file (same identity model as
 * _metaBgAccentInventory). Non-exempt hits must satisfy C1: include
 * font-semibold + hover:opacity-90; exclude bg-accent/bg-surface/bg-bg and any
 * hover-variant bg-* token. Fails by default for recipe-token growth without a
 * registry row. Exempt rows may violate C1 (they cover legitimate non-confirm
 * inverted-amber uses) and require a reason in `note`. Scope honesty: this
 * pins recipe-token GROWTH only — a destructive control that never adopts the
 * recipe is review-time territory (spec §3 + DESIGN.md destructive actions).
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { walk, stripComments, tokensOf } from "./_classScanUtils";

type Kind = "morph" | "panel" | "exempt-non-confirm";
type Row = { file: string; index: number; note: string; kind: Kind };
const R = (file: string, index: number, kind: Kind, note: string): Row => ({
  file,
  index,
  kind,
  note,
});

const REGISTRY: Row[] = [
  R(
    "components/admin/ArchiveShowButton.tsx",
    0,
    "morph",
    "archive-show-confirm-button (compact ternary branch)",
  ),
  R(
    "components/admin/ArchiveShowButton.tsx",
    1,
    "morph",
    "archive-show-confirm-button (full ternary branch)",
  ),
  R(
    "components/admin/ArchiveShowButton.tsx",
    2,
    "panel",
    "archive-show-confirm-button (ROW branch — the hub popover's Confirm/Cancel pair; owner-ratified 2026-07-20 amendment to §R7, mirroring the sibling rotate row)",
  ),
  R("components/admin/MaintenanceResetButtons.tsx", 0, "panel", "validation-reset-confirm"),
  R(
    "components/admin/PendingPanelDiscardButtons.tsx",
    0,
    "morph",
    "admin-pending-ignore-* armed branch (G1 two-tap guard)",
  ),
  R(
    "components/admin/StagedReviewCard.tsx",
    0,
    "morph",
    "staged-review-discard-ignore armed branch (G2 two-tap guard)",
  ),
  R(
    "components/admin/BulkIgnoreControls.tsx",
    0,
    "morph",
    "dq-bulk-ignore-* armed branch (G4 two-tap armed-state guard)",
  ),
  R(
    "components/admin/BlockedRowResolver.tsx",
    0,
    "morph",
    "blocked-row-resolver-* armed branch (two-tap arm/confirm, mirrors RescanSheetButton's idiom)",
  ),
  R(
    "components/admin/RecentAutoAppliedStrip.tsx",
    0,
    "panel",
    "auto-applied-undo-all-confirm-go-*",
  ),
  R(
    "components/admin/CleanupAbandonedFinalizeButton.tsx",
    0,
    "panel",
    "cleanup-abandoned-finalize-confirm-yes",
  ),
  R("components/admin/ReapStaleSessionsButton.tsx", 0, "panel", "reap-stale-sessions-confirm-yes"),
  R("components/admin/ResolveAlertButton.tsx", 0, "panel", "admin-alert-confirm-resolve-button"),
  R("components/admin/ReSyncButton.tsx", 0, "panel", "admin-resync-accept"),
  R(
    "components/admin/PreviewBanner.tsx",
    0,
    "exempt-non-confirm",
    "preview-banner CTA: inverted amber as banner emphasis, NOT a destructive confirm; predates spec; intentionally violates C1 (hover:bg-warning-text/90)",
  ),
  R(
    "components/admin/CompactAlertCard.tsx",
    0,
    "exempt-non-confirm",
    "compact alert card severity glyph: inverted amber on a 16px round marker, NOT a destructive confirm. The pair was adopted deliberately for contrast — the previous bg-status-review/text-warning-bg glyph measured 3.58:1 in light mode at 10px bold, under the 4.5:1 floor (impeccable audit); bg-warning-text/text-warning-bg is 8.79 light / 9.64 dark. aria-hidden, non-interactive, so C1's font-semibold + hover:opacity-90 are meaningless here",
  ),
  R(
    "app/admin/show/[slug]/RotateShareTokenButton.tsx",
    0,
    "panel",
    "admin-rotate-share-token-confirm-button",
  ),
  R(
    "app/admin/show/[slug]/ResetPickerEpochButton.tsx",
    0,
    "panel",
    "admin-reset-picker-epoch-confirm-button",
  ),
  R("app/admin/show/[slug]/PickerResetControl.tsx", 0, "panel", "picker-reset-confirm-button"),
  R("components/admin/wizard/CrewRowActions.tsx", 0, "panel", "crew-row-reset-confirm-go"),
  R(
    "app/admin/settings/admins/RevokeRowButton.tsx",
    0,
    "panel",
    "admin-allowlist-revoke-confirm-button",
  ),
];

function baseUtil(tok: string): string {
  const parts = tok.split(":");
  return parts[parts.length - 1]!.replace(/^!/, "");
}
// Recipe pair must be UNVARIANTED (a plain state fill, not a hover/checked variant).
const hasPlainToken = (tokens: string[], util: string) => tokens.includes(util);
const isHit = (tokens: string[]) =>
  hasPlainToken(tokens, "bg-warning-text") && hasPlainToken(tokens, "text-warning-bg");

describe("META destructive-confirm recipe registry (spec §8)", () => {
  const hits: Array<{ file: string; index: number; tokens: string[]; lineNo: number }> = [];
  for (const root of ["components", "app"]) {
    for (const file of walk(root)) {
      let n = 0;
      stripComments(readFileSync(file, "utf8"))
        .split("\n")
        .forEach((line, i) => {
          const tokens = tokensOf(line);
          if (isHit(tokens)) hits.push({ file, index: n++, tokens, lineNo: i + 1 });
        });
    }
  }

  it("matcher self-check", () => {
    expect(isHit(tokensOf('className="bg-warning-text text-warning-bg"'))).toBe(true);
    // variant/opacity forms alone never form the pair
    expect(isHit(tokensOf('className="hover:bg-warning-text/90 text-warning-bg"'))).toBe(false);
    expect(isHit(tokensOf('className="bg-warning-text"'))).toBe(false);
  });

  it("every recipe occurrence is registered; every registry row exists", () => {
    const problems: string[] = [];
    for (const h of hits) {
      if (!REGISTRY.find((r) => r.file === h.file && r.index === h.index)) {
        const fileKnown = REGISTRY.some((r) => r.file === h.file);
        problems.push(
          `${fileKnown ? "UNREGISTERED OCCURRENCE" : "UNREGISTERED DESTRUCTIVE CONFIRM"} ${h.file}:${h.lineNo} (occurrence ${h.index})`,
        );
      }
    }
    for (const r of REGISTRY) {
      if (!hits.find((h) => h.file === r.file && h.index === r.index)) {
        problems.push(`STALE ROW ${r.file} occurrence ${r.index}`);
      }
    }
    expect(problems).toEqual([]);
  });

  it("every non-exempt hit satisfies C1", () => {
    const problems: string[] = [];
    for (const h of hits) {
      const row = REGISTRY.find((r) => r.file === h.file && r.index === h.index);
      if (!row || row.kind === "exempt-non-confirm") continue;
      const t = h.tokens;
      if (!t.includes("font-semibold"))
        problems.push(`${h.file}:${h.lineNo} missing font-semibold`);
      if (!t.includes("hover:opacity-90"))
        problems.push(`${h.file}:${h.lineNo} missing hover:opacity-90`);
      for (const bad of ["bg-accent", "bg-surface", "bg-bg"]) {
        if (t.some((x) => baseUtil(x) === bad))
          problems.push(`${h.file}:${h.lineNo} forbidden ${bad}`);
      }
      // any token whose variant chain includes `hover` and whose base utility is bg-*
      for (const x of t) {
        const chain = x.split(":");
        if (
          chain.length > 1 &&
          chain.slice(0, -1).includes("hover") &&
          chain[chain.length - 1]!.replace(/^!/, "").startsWith("bg-")
        ) {
          problems.push(`${h.file}:${h.lineNo} forbidden hover-variant bg token: ${x}`);
        }
      }
    }
    expect(problems).toEqual([]);
  });

  it("exempt rows carry a reason", () => {
    for (const row of REGISTRY.filter((r) => r.kind === "exempt-non-confirm")) {
      expect(row.note.length).toBeGreaterThan(20);
    }
  });
});

/**
 * M1 / M2 — the structural defense for the two defect shapes that recurred across
 * adversarial rounds 5, 6 and 7 (spec 2026-07-25-destruct-thumb-order-drift-guard §6.6).
 *
 * Shape A: a documented D-invariant that is CLAIMED but never MEASURED (found for
 *          D1 in round 6, D3 in round 7).
 * Shape B: a geometry input missing from the armed binding table (found for Defer
 *          class+label in round 5, idle Ignore class in round 6, its label in round 7).
 *
 * Patching the named instance each round closed neither class — every repair added
 * one row and missed its sibling. These two tests close them mechanically.
 */
describe("META destructive-confirm dimensional contract (spec §6.6)", () => {
  const SPEC = "docs/superpowers/specs/admin/2026-07-25-destruct-thumb-order-drift-guard.md";
  const REAL_SPEC = "tests/e2e/pendingDiscardReal.layout.spec.ts";
  const TRANSCRIBED_SPEC = "tests/e2e/pendingDiscardReflow.layout.spec.ts";

  it("M1: every D-invariant in the spec has a named assertion in a layout spec", () => {
    const doc = readFileSync(SPEC, "utf8");
    // The Dimensional Invariants table rows start `| D<n> |`.
    const declared = [...doc.matchAll(/^\|\s*(D\d+)\s*\|/gm)].map((m) => m[1]!);
    expect(declared.length, "no D-invariants parsed — did the table format change?").toBeGreaterThan(
      0,
    );
    const haystack = [REAL_SPEC, TRANSCRIBED_SPEC]
      .map((f) => {
        try {
          return readFileSync(f, "utf8");
        } catch {
          return "";
        }
      })
      .join("\n");
    const unmeasured = declared.filter((d) => !new RegExp(`\\b${d}\\b`).test(haystack));
    expect(unmeasured, "invariants declared in the spec with no named assertion").toEqual([]);
  });

  it("M2: the transcribed spec's measured elements equal the binding table's element set", () => {
    // Task 4 rewrites the transcribed spec and is what exports MEASURED_ELEMENTS.
    // Until then this is RED BY DESIGN — the same posture as D4 under M1. Do not
    // soften it to go green: a spec section (§6.6) that claims a guard which is
    // only a comment is the exact "claimed but not implemented" defect this whole
    // contract exists to prevent, and it nearly shipped that way.
    let transcribed = "";
    try {
      transcribed = readFileSync(TRANSCRIBED_SPEC, "utf8");
    } catch {
      /* handled by the assertion below */
    }
    const exported = /export const MEASURED_ELEMENTS\s*=\s*\[([\s\S]*?)\]/.exec(transcribed);
    expect(
      exported,
      "transcribed spec must export MEASURED_ELEMENTS (Task 4) so the binding set is checkable",
    ).not.toBeNull();

    const measured = [...exported![1]!.matchAll(/"([^"]+)"/g)].map((m) => m[1]!).sort();
    const doc = readFileSync(SPEC, "utf8");
    const tableStart = doc.indexOf("| Bound | Why it matters to armed geometry |");
    expect(tableStart, "binding table not found in the spec").toBeGreaterThan(-1);
    const table = doc.slice(tableStart, doc.indexOf("\n\n", tableStart));
    const bound = [...table.matchAll(/^\|\s*(?:\*\*)?([^|*]+?)(?:\*\*)?\s*\|/gm)]
      .map((m) => m[1]!.trim())
      .filter((x) => x !== "Bound" && !/^-+$/.test(x))
      .sort();
    expect(measured, `bound: ${bound.join(", ")}`).toEqual(bound);
  });

  it("M1 self-check: the matcher actually parses invariants and detects a missing one", () => {
    const rows = [...`| D1 | a |\n| D9 | b |`.matchAll(/^\|\s*(D\d+)\s*\|/gm)].map((m) => m[1]!);
    expect(rows).toEqual(["D1", "D9"]);
    expect(/\bD9\b/.test("covers D1 only")).toBe(false);
  });
});
