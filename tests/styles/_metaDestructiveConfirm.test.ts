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
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { walk, stripCommentsForFile, tokensOf } from "./_classScanUtils";

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
  R("components/admin/ReSyncButton.tsx", 0, "panel", "admin-resync-accept"),
  R(
    "components/admin/ShowRowActions.tsx",
    0,
    "panel",
    "row-actions-accept-shrink-* (dashboard row Re-sync shrink_held accept — the row-menu twin of admin-resync-accept)",
  ),
  R(
    "components/admin/ShowRowActions.tsx",
    1,
    "panel",
    "row-actions-archive-go-* (dashboard row Archive confirm-go — the row-menu twin of archive-show-confirm-button)",
  ),
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
      stripCommentsForFile(readFileSync(file, "utf8"), file)
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
 * T1 / T3 — the arm-revert timing contract, reduced to what is actually provable.
 *
 * WHAT THIS COVERS. `ARM_REVERT_MS` is declared exactly once, in the shared module,
 * and its value is the ratified 4s. That closes the problem this work started from:
 * eleven independently copy-pasted `4_000` literals with no shared definition, any
 * one of which could drift.
 *
 * WHAT IT DELIBERATELY DOES NOT COVER, and why. Earlier revisions added a per-file
 * scheduler census, an import-provenance check, a scheduler-alias ban, and three
 * meta-tests policing all of it. Six adversarial rounds found a new bypass in that
 * machinery every single round — and the last round found it producing FALSE
 * POSITIVES: `const copy = "ARM_REVERT_MS"` or a type-only import would fail it, so
 * it had begun blocking harmless changes. A guard that cries wolf gets deleted by
 * the next person who trips it, which is strictly worse than no guard.
 *
 * "Did someone point the arm timer at a different value, by any means?" needs to
 * know which call IS the arm timer. That is a semantic question; a regex over source
 * text cannot answer it, and six rounds of evidence say so. It is review-time
 * territory, and §5.3 of the spec says that plainly rather than implying otherwise.
 */
describe("META arm-revert timing contract (spec §5.2)", () => {
  const CONST_MODULE = "lib/admin/destructiveConfirm.ts";
  /* Declaration detection is AST-based (whole-diff A R1/B R2): the regex
   * lineage (R17 F1 direct/object forms, then A1's array-destructure escape,
   * then B2's nested-binding escape AND a default-value false positive
   * `const [x = ARM_REVERT_MS] = v`) is the same open-ended-grammar wall the
   * ledger guard hit — grammar questions go to the parser, not to regexes.
   * A "declaration" is the identifier appearing as a BINDING NAME in any
   * VariableDeclaration (direct, object/array destructure, arbitrarily
   * nested); an initializer or default-value reference is NOT a binding.
   * Comments fall out of the AST for free. Files without the identifier
   * substring are skipped before parsing (cheap pre-filter). */
  const declaresBinding = (source: string, filePath: string, name: string): boolean => {
    if (!source.includes(name)) return false;
    const sf = ts.createSourceFile(
      filePath,
      source,
      ts.ScriptTarget.Latest,
      false,
      ts.ScriptKind.TSX,
    );
    let found = false;
    const visitBindingName = (n: ts.BindingName): void => {
      if (found) return;
      if (ts.isIdentifier(n)) {
        if (n.text === name) found = true;
        return;
      }
      for (const el of n.elements) {
        if (ts.isBindingElement(el)) visitBindingName(el.name);
      }
    };
    const visit = (node: ts.Node): void => {
      if (found) return;
      if (ts.isVariableDeclaration(node)) visitBindingName(node.name);
      ts.forEachChild(node, visit);
    };
    visit(sf);
    return found;
  };

  it("T1: exactly one file declares ARM_REVERT_MS, and it is the shared module", () => {
    const declaring: string[] = [];
    for (const root of ["components", "app", "lib"]) {
      for (const file of walk(root)) {
        if (declaresBinding(readFileSync(file, "utf8"), file, "ARM_REVERT_MS")) {
          declaring.push(file);
        }
      }
    }
    // Equality, not "at most one": `<= 1` would pass on zero, proving nothing.
    expect(declaring).toEqual([CONST_MODULE]);
  });

  it("T1 self-check: binding forms are declarations; references and defaults are not", () => {
    const d = (src: string) => declaresBinding(src, "a.tsx", "ARM_REVERT_MS");
    expect(d("const ARM_REVERT_MS = 4_000;")).toBe(true);
    expect(d("export const ARM_REVERT_MS = 4_000;")).toBe(true);
    expect(d("let ARM_REVERT_MS;")).toBe(true);
    expect(d("const { ARM_REVERT_MS } = mod;")).toBe(true);
    // Whole-diff A1 mutant: array-destructured binding.
    expect(d("const [ARM_REVERT_MS] = [1];")).toBe(true);
    // Whole-diff B2 mutant: NESTED binding.
    expect(d("const [[ARM_REVERT_MS]] = [[1]];")).toBe(true);
    expect(d("const { a: { ARM_REVERT_MS } } = mod;")).toBe(true);
    // References are NOT declarations (B2's false-positive class).
    expect(d("setTimeout(cb, ARM_REVERT_MS);")).toBe(false);
    expect(d("const [timeout = ARM_REVERT_MS] = values;")).toBe(false);
    expect(d("// ARM_REVERT_MS in a comment only")).toBe(false);
  });

  it("T3: the shared value is the ratified 4s", async () => {
    const mod = await import("@/lib/admin/destructiveConfirm");
    expect(mod.ARM_REVERT_MS, "4s ratified 2026-07-17, DEFERRED-archive.md:1228").toBe(4_000);
  });

  /* T4a — same uniqueness contract for the expiry copy constant (spec
   * 2026-08-01-announce-a11y-pass §3.1/§5.2): declared exactly once, in the
   * shared module, so no surface can drift the announced copy locally. Shares
   * the AST binding detector above (same closure over binding grammar). */
  it("T4a: exactly one file declares ARM_EXPIRED_ANNOUNCEMENT, and it is the shared module", () => {
    const declaring: string[] = [];
    for (const root of ["components", "app", "lib"]) {
      for (const file of walk(root)) {
        if (declaresBinding(readFileSync(file, "utf8"), file, "ARM_EXPIRED_ANNOUNCEMENT")) {
          declaring.push(file);
        }
      }
    }
    expect(declaring).toEqual([CONST_MODULE]);
  });

  it("T4a self-check: binding forms are declarations; references are not", () => {
    const d = (src: string) => declaresBinding(src, "a.tsx", "ARM_EXPIRED_ANNOUNCEMENT");
    expect(d('const ARM_EXPIRED_ANNOUNCEMENT = "x";')).toBe(true);
    expect(d("region.textContent = ARM_EXPIRED_ANNOUNCEMENT;")).toBe(false);
    // Whole-diff A1 + B2 mutants: array and NESTED bindings.
    expect(d('const [ARM_EXPIRED_ANNOUNCEMENT] = ["wrong"];')).toBe(true);
    expect(d('const [[ARM_EXPIRED_ANNOUNCEMENT]] = [["wrong"]];')).toBe(true);
    expect(d("const [msg = ARM_EXPIRED_ANNOUNCEMENT] = v;")).toBe(false);
  });

  /* T4 — expiry-wiring co-presence (spec 2026-08-01-announce-a11y-pass §5.2):
   * every file referencing ARM_REVERT_MS must also reference
   * ARM_EXPIRED_ANNOUNCEMENT, or hold an exemption row with a real reason.
   * Lexical presence only — "no known spelling is absent" honesty posture;
   * whether the announcement fires on the timer path is proven by the
   * per-surface behavioral tests, not here (spec §1.1). */
  const REF_REVERT = /\bARM_REVERT_MS\b/;
  const REF_EXPIRY = /\bARM_EXPIRED_ANNOUNCEMENT\b/;
  type T4Exemption = { file: string; reason: string };
  const T4_EXEMPTIONS: T4Exemption[] = [];
  const isValidExemption = (row: T4Exemption): boolean => row.reason.length >= 20;
  const referencesRevert = (source: string, filePath: string): boolean =>
    REF_REVERT.test(stripCommentsForFile(source, filePath));
  const wiresExpiry = (source: string, filePath: string): boolean =>
    REF_EXPIRY.test(stripCommentsForFile(source, filePath));

  it("T4: every ARM_REVERT_MS referencer wires the expiry announcement (or is exempt)", () => {
    const problems: string[] = [];
    const exemptFiles = new Set(T4_EXEMPTIONS.map((r) => r.file));
    const seen = new Set<string>();
    for (const root of ["components", "app", "lib"]) {
      for (const file of walk(root)) {
        const source = readFileSync(file, "utf8");
        if (!referencesRevert(source, file)) continue;
        seen.add(file);
        if (file === CONST_MODULE) continue; // declares both, trivially wired
        if (wiresExpiry(source, file)) continue;
        if (exemptFiles.has(file)) continue;
        problems.push(`UNWIRED: ${file} references ARM_REVERT_MS without ARM_EXPIRED_ANNOUNCEMENT`);
      }
    }
    for (const row of T4_EXEMPTIONS) {
      if (!isValidExemption(row))
        problems.push(`INVALID EXEMPTION (reason too short): ${row.file}`);
      if (!seen.has(row.file)) problems.push(`STALE EXEMPTION: ${row.file}`);
    }
    expect(problems).toEqual([]);
  });

  it("T4 self-checks: bare import fails, comment-only reference fails, wired passes, short exemption reason rejected", () => {
    const bare = 'import { ARM_REVERT_MS } from "@/lib/admin/destructiveConfirm";';
    expect(referencesRevert(bare, "a.tsx")).toBe(true);
    expect(wiresExpiry(bare, "a.tsx")).toBe(false); // -> would be UNWIRED
    expect(wiresExpiry("// mentions ARM_EXPIRED_ANNOUNCEMENT only in a comment", "a.tsx")).toBe(
      false,
    );
    expect(wiresExpiry("region.textContent = ARM_EXPIRED_ANNOUNCEMENT;", "a.tsx")).toBe(true);
    expect(isValidExemption({ file: "a.tsx", reason: "short" })).toBe(false);
    expect(
      isValidExemption({ file: "a.tsx", reason: "timer lives in a shared hook, wired there" }),
    ).toBe(true);
  });

  it("T5: the expiry copy is the ratified string", async () => {
    const mod = await import("@/lib/admin/destructiveConfirm");
    expect(mod.ARM_EXPIRED_ANNOUNCEMENT, "spec 2026-08-01-announce-a11y-pass §3.1").toBe(
      "Confirm window closed. Nothing was changed.",
    );
  });
});

/**
 * C5-SCROLL. A close-focus restore must not move the viewport.
 *
 * `HTMLElement.focus()` scrolls the nearest scrollable ancestor to reveal its
 * target unless `preventScroll` is set. That was harmless while these restores
 * only ran on Cancel, and stopped being harmless the moment the 2026-08-31
 * confirm-focus arc extended them to the CONFIRM path: the rotate trigger sits
 * BELOW the share-URL row, so the restore dragged the popover back down and
 * undid the `scrollIntoView(url row)` the rotation performs — silently breaking
 * SHARELINK-CUE-VISIBILITY-1, a contract the PREVIOUS arc had ratified.
 *
 * Three component suites covering these controls stayed green through it,
 * because jsdom's `focus()` neither scrolls nor records how it was called. Only
 * the real-browser spec caught it, and only after three CI runs, one of which
 * recovered on retry and reported "1 flaky" — a green job hiding the same
 * failure.
 *
 * DERIVED, not enumerated: the population is every file carrying the
 * `restoreFocusRef` recipe, walked from disk, so a fourth control adopting the
 * pattern is covered on the day it lands. The arming focus is deliberately
 * exempt — `cancelRef.focus()` runs when the confirm row APPEARS, where
 * scrolling the operator to the thing they must now decide about is the point.
 */
describe("META C5-SCROLL: close-focus restores never move the viewport", () => {
  const offenders: string[] = [];
  const covered: string[] = [];
  for (const root of ["components", "app"]) {
    for (const file of walk(root)) {
      const src = stripCommentsForFile(readFileSync(file, "utf8"), file);
      if (!src.includes("restoreFocusRef")) continue;
      covered.push(file);
      src.split("\n").forEach((line, i) => {
        if (!/\.focus\(/.test(line)) return;
        if (/cancelRef/.test(line)) return; // arming focus: scrolling is intended
        if (/preventScroll:\s*true/.test(line)) return;
        offenders.push(`${file}:${i + 1} ${line.trim()}`);
      });
    }
  }

  it("premise: the walk found the controls carrying the recipe", () => {
    // Without this the case passes vacuously the day the recipe is renamed.
    expect(covered.length, `files carrying restoreFocusRef: ${covered.join(", ")}`).toBeGreaterThan(
      2,
    );
  });

  it("every restore-path focus passes preventScroll", () => {
    expect(offenders).toEqual([]);
  });
});
