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
 * M1 / M3 — the structural defense for the two defect shapes that recurred across
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
  /* M2 (binding table) was WITHDRAWN with the reorder design: the harness now renders
   * armed panels from the component's own exported class + label, so there is no
   * transcription left to bind. The six holes review found in M2 ceased to exist
   * rather than being fixed — the clearest measure of what the simpler design bought. */

  /** Test titles and assertion messages ONLY — never raw source. Round 8 found M1
   *  scanning whole files, so a `D6` mentioned in a COMMENT counted as measured
   *  while nothing asserted it. A guard that accepts prose as proof is the very
   *  defect this contract exists to catch. */
  function assertionSurfaces(src: string): string {
    const titles = [...src.matchAll(/\b(?:test|it)\(\s*(["'`])([\s\S]*?)\1/g)].map((m) => m[2]!);
    // Second argument of expect(value, "message") — the only other place a name is
    // a real assertion label rather than commentary.
    const messages = [...src.matchAll(/expect\([\s\S]*?,\s*(["'`])([\s\S]*?)\1\s*\)/g)].map(
      (m) => m[2]!,
    );
    return [...titles, ...messages].join("\n");
  }

  it("M1: every D-invariant in the spec has a named assertion in a layout spec", () => {
    const doc = readFileSync(SPEC, "utf8");
    const declared = [...doc.matchAll(/^\|\s*(D\d+)\s*\|/gm)].map((m) => m[1]!);
    expect(
      declared.length,
      "no D-invariants parsed — did the table format change?",
    ).toBeGreaterThan(0);
    const haystack = [REAL_SPEC, TRANSCRIBED_SPEC]
      .map((f) => {
        try {
          return assertionSurfaces(readFileSync(f, "utf8"));
        } catch {
          return "";
        }
      })
      .join("\n");
    const unmeasured = declared.filter((d) => !new RegExp(`\\b${d}\\b`).test(haystack));
    expect(unmeasured, "invariants declared in the spec with no named assertion").toEqual([]);
  });

  it("M1 self-check: a D-name in a comment does NOT count as measured", () => {
    // The exact round-8 defect, pinned so it cannot regress.
    expect(assertionSurfaces("// D6 is fine\nconst x = 1;")).not.toMatch(/D6/);
    expect(assertionSurfaces('test("D6 — pinned edge", () => {});')).toMatch(/D6/);
    expect(assertionSurfaces('expect(a.x, "D6: left edge moved").toBe(b.x);')).toMatch(/D6/);
  });

  it("M1 self-check: a D-name in a comment does NOT count as measured", () => {
    // The exact round-8 defect, pinned so it cannot regress.
    expect(assertionSurfaces("// D6 is fine\nconst x = 1;")).not.toMatch(/D6/);
    expect(assertionSurfaces('test("D6 — pinned edge", () => {});')).toMatch(/D6/);
    expect(assertionSurfaces('expect(a.x, "D6: left edge moved").toBe(b.x);')).toMatch(/D6/);
  });

  it("M3: every jsdom test the spec cites by number exists in the jsdom suite", () => {
    // Third surface of the same class as M1/M2. The spec's transition inventory
    // cites "§6.2 test 9/10/11/12" as the coverage for specific reachable edges;
    // nothing previously guaranteed those tests were ever written. Task 3 writes
    // them, so this is RED until then — same posture as D4 and MEASURED_ELEMENTS.
    const doc = readFileSync(SPEC, "utf8");
    const cited = [
      ...new Set([...doc.matchAll(/§6\.2 test (\d+)/g)].map((m) => Number(m[1]))),
    ].sort((a, b) => a - b);
    expect(
      cited.length,
      "no §6.2 test citations parsed — did the reference format change?",
    ).toBeGreaterThan(0);

    let jsdom = "";
    try {
      jsdom = readFileSync("tests/components/admin/pendingIngestionActions.test.tsx", "utf8");
    } catch {
      /* handled below */
    }
    // Task 3 numbers each new test `[N]` in its title so the citation is checkable.
    const present = new Set(
      [...jsdom.matchAll(/\btest\(\s*["'`]\[(\d+)\]/g)].map((m) => Number(m[1])),
    );
    const missing = cited.filter((n) => !present.has(n));
    expect(missing, "spec cites §6.2 tests that do not exist in the jsdom suite").toEqual([]);
  });

  it("M1 self-check: the matcher actually parses invariants and detects a missing one", () => {
    const rows = [...`| D1 | a |\n| D9 | b |`.matchAll(/^\|\s*(D\d+)\s*\|/gm)].map((m) => m[1]!);
    expect(rows).toEqual(["D1", "D9"]);
    expect(/\bD9\b/.test("covers D1 only")).toBe(false);
  });
});

/**
 * T1 / T2 / T3 — the arm-revert timing contract (spec §5.2).
 *
 * Before the shared module, the 4s window was eleven copy-pasted literals with no
 * definition and no guard. These pin what is pinnable and §5.3 enumerates, honestly,
 * the six ways a determined edit still gets past them. The guard REDUCES re-drift;
 * it does not eliminate it, and it does not claim to.
 */
describe("META arm-revert timing contract (spec §5.2)", () => {
  const CONST_MODULE = "lib/admin/destructiveConfirm.ts";
  const DECL = /(?:^|\n)\s*(?:export\s+)?const\s+ARM_REVERT_MS\s*=/;
  /** Identifiers permitted as a scheduler delay in a destructive-confirm surface. */
  const ALLOWED = new Set(["ARM_REVERT_MS", "SUCCESS_DISMISS_MS", "WATCHDOG_MS"]);
  const SCHEDULERS = /\b(?:setTimeout|setInterval|requestIdleCallback)\s*\(/g;

  it("T1: exactly one file declares ARM_REVERT_MS, and it is the shared module", () => {
    const declaring: string[] = [];
    for (const root of ["components", "app", "lib"]) {
      for (const file of walk(root)) {
        if (DECL.test(stripComments(readFileSync(file, "utf8")))) declaring.push(file);
      }
    }
    // Equality, not "at most one": `<= 1` passes on zero, which would be vacuous.
    expect(declaring).toEqual([CONST_MODULE]);
  });

  it("T3: the shared value is the ratified 4s", async () => {
    const mod = await import("@/lib/admin/destructiveConfirm");
    expect(mod.ARM_REVERT_MS, "4s ratified 2026-07-17, DEFERRED-archive.md:1228").toBe(4_000);
  });

  it("T2: every scheduler delay in a registry file is an allowlisted identifier", () => {
    const files = [
      ...new Set(REGISTRY.filter((r) => r.kind !== "exempt-non-confirm").map((r) => r.file)),
    ];
    const problems: string[] = [];
    let detected = 0;
    for (const file of files) {
      const raw = readFileSync(file, "utf8");
      const src = stripComments(raw);
      SCHEDULERS.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = SCHEDULERS.exec(src)) !== null) {
        // Walk to the matching close paren so multiline and nested-callback calls
        // are handled — a regex for the whole call was the round-1 fragility.
        let depth = 1;
        let i = m.index + m[0].length;
        for (; i < src.length && depth > 0; i++) {
          if (src[i] === "(") depth++;
          else if (src[i] === ")") depth--;
        }
        const call = src.slice(m.index, i);
        const lastComma = call.lastIndexOf(",");
        if (lastComma === -1) continue; // no delay argument
        const delay = call
          .slice(lastComma + 1, -1)
          .trim()
          .replace(/\}\s*$/, "")
          .trim();
        const bare = delay.replace(/^\{[\s\S]*?timeout\s*:\s*/, "").replace(/[}\s]/g, "");
        if (!bare) continue;
        detected++;
        if (!ALLOWED.has(bare)) {
          const line = src.slice(0, m.index).split("\n").length;
          problems.push(`${file}:${line} delay \`${bare}\` is not an allowlisted identifier`);
        }
      }
    }
    expect(problems, "unapproved scheduler delays in destructive-confirm surfaces").toEqual([]);
    // Non-vacuity (spec B4). A detector that silently stops matching would pass the
    // assertion above forever. Eleven surfaces carry an arm timer, so anything below
    // that means the scan broke, not that the code got cleaner.
    expect(
      detected,
      "scheduler scan found too few calls — did the detector break?",
    ).toBeGreaterThanOrEqual(11);
  });

  it("T2 self-check: the matcher accepts allowlisted names and rejects everything else", () => {
    const probe = (src: string) => {
      SCHEDULERS.lastIndex = 0;
      const m = SCHEDULERS.exec(src);
      if (!m) return "no-match";
      let depth = 1;
      let i = m.index + m[0].length;
      for (; i < src.length && depth > 0; i++) {
        if (src[i] === "(") depth++;
        else if (src[i] === ")") depth--;
      }
      const call = src.slice(m.index, i);
      const delay = call.slice(call.lastIndexOf(",") + 1, -1).trim();
      return ALLOWED.has(delay) ? "allowed" : "rejected";
    };
    expect(probe("setTimeout(() => setArmed(false), ARM_REVERT_MS)")).toBe("allowed");
    expect(probe("setTimeout(() => setArmed(false), 3000)")).toBe("rejected");
    expect(probe("setTimeout(() => setArmed(false), 3_000)")).toBe("rejected");
    expect(probe("setTimeout(() => setArmed(false), CONFIRM_TIMEOUT)")).toBe("rejected");
    // multiline + nested callback — the shape a naive regex drops
    expect(probe("setTimeout(() => {\n  run(() => done());\n}, ARM_REVERT_MS)")).toBe("allowed");
  });
});
