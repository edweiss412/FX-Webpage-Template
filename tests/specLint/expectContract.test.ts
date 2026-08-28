import { describe, expect, it } from "vitest";
import { parseDoc } from "../../lib/specLint/parse";
import { checkExpectN } from "../../lib/specLint/expectContract";
import type { Finding } from "../../lib/specLint/types";

/**
 * Arm A — `EXPECT_N_UNENFORCED` (spec
 * `docs/superpowers/specs/ci/2026-08-28-speclint-expect-n-exit-status.md` §4).
 *
 * Each rejection fixture names the single §4.1 rule it exercises, so deleting
 * that rule fails exactly its fixture — with the documented exception for rule
 * 2, which is unreachable through the anchored rule-1 pattern (plan review R1
 * F1: the `(?<cmd>.*\S)` group already requires a non-blank command; a
 * comment-only line fails rule 1 outright). Failure mode caught by this suite:
 * the advisory firing on prose ABOUT commands (the §4.2 false-positive class),
 * failing to fire on the incident shapes, or emitting a finding whose anchor,
 * message, or §4.5 detail payload is wrong or silently absent.
 */

const CODE = "EXPECT_N_UNENFORCED";

/** One-code filter — a fixture can never pass because a different arm fired on
 * the same line (anti-tautology; the `numerics.test.ts` idiom). */
const only = (findings: Finding[], code: string): Finding[] =>
  findings.filter((f) => f.code === code);

function findings(docText: string, kind: "spec" | "plan" = "plan"): Finding[] {
  return only(checkExpectN(parseDoc(docText), kind), CODE);
}

describe("rule 1 — the end-anchored pattern", () => {
  it("fires on a bare-integer expectation beside a piped count (the incident shape)", () => {
    const line = "git status --porcelain | wc -l   # expect 0";
    const out = findings(`# Plan\n\n${line}\n`);
    expect(out).toHaveLength(1);
    expect(out[0]!.docLine).toBe(3);
    expect(out[0]!.severity).toBe("advisory");
    expect(out[0]!.check).toBe("taskContract");
    // Anchored at the `#` column (1-based UTF-16 offset).
    expect(out[0]!.column).toBe(line.indexOf("#") + 1);
  });

  it("fires on a command sitting on the DOCUMENT'S FIRST LINE — the scan starts at line 1", () => {
    // Kills the loop-start mutant (integer-literal 0>1): a doc whose first
    // line is the firing command has no heading above it, and a scan that
    // skips index 0 misses it entirely.
    const out = findings("git status --porcelain | wc -l   # expect 0\n");
    expect(out).toHaveLength(1);
    expect(out[0]!.docLine).toBe(1);
  });

  it("fires on the parenthetical form", () => {
    const out = findings("# P\n\ngrep -c thing file | head -1  # expect 2 (Step 1 adds 2)\n");
    expect(out).toHaveLength(1);
  });

  it("does not fire on a comment-only line — no command precedes the `#` (rules 1-2 taxonomy)", () => {
    expect(findings("# P\n\n# expect 72\n")).toHaveLength(0);
    expect(findings("# P\n\n   # expect 72\n")).toHaveLength(0);
  });

  it("does not fire on an integer followed by unparenthesised prose", () => {
    expect(findings("# P\n\nlsof -nP -iTCP:3000 | wc -l   # expect 0 before a run\n")).toHaveLength(
      0,
    );
  });

  it("does not fire on a non-integer expectation", () => {
    expect(findings("# P\n\npnpm exec vitest run t.test.ts   # expect green\n")).toHaveLength(0);
    expect(findings("# P\n\nrg -n X lib | rg -v Y   # expect empty\n")).toHaveLength(0);
  });
});

describe("§4.2 — end-anchoring excludes prose ABOUT commands", () => {
  it("does not fire when the expectation sits inside an inline code span with trailing prose", () => {
    const line =
      "`grep -c … # expect 0`, which prints its result and moves on — an expectation stated beside a command.";
    expect(findings(`# P\n\n${line}\n`)).toHaveLength(0);
  });

  it("does not fire on a table cell quoting a command mid-sentence", () => {
    const line = "| R19 | quoted `wc -l # expect 56` mid-cell | _pending_ |";
    expect(findings(`# P\n\n${line}\n`)).toHaveLength(0);
  });
});

describe("rule 3 — assertion openers", () => {
  it("declines `test `, `[ ` and `[[ ` commands (rule 3 alone rejects these)", () => {
    expect(findings('# P\n\ntest "$(wc -l < f)" -eq 0   # expect 0\n')).toHaveLength(0);
    expect(findings('# P\n\n[ "$(wc -l < f)" -eq 0 ]   # expect 0\n')).toHaveLength(0);
    expect(findings("# P\n\n[[ $(wc -l < f) -eq 0 ]]   # expect 0\n")).toHaveLength(0);
  });

  it("still fires when an opener appears mid-command rather than at its head", () => {
    const out = findings("# P\n\necho test | grep -c test   # expect 1\n");
    expect(out).toHaveLength(1);
  });
});

describe("§4.5 — finding payload", () => {
  it("carries the message, and a PRESENT detail with the trimmed command and the explanatory sentence", () => {
    const cmd = "  sed -n '36,45p' components/layout/ThemeToggle.tsx | grep -c 'border-border'";
    const line = `${cmd}          # expect 0`;
    const out = findings(`# P\n\n${line}\n`);
    expect(out).toHaveLength(1);
    const f = out[0]!;
    expect(f.message).toBe(
      "expectation `0` is stated in a comment; the command's exit status does not encode it",
    );
    // `detail` is OPTIONAL on Finding and the renderer omits it silently when
    // absent (plan review R3 probe) — so presence is asserted first, then the
    // WHOLE payload by equality: containment lets a suffixed sentence and an
    // untrimmed command survive (pre-dispatch mutants b2/d4), equality kills
    // both. The command is derived from the fixture line itself.
    expect(f.detail).toBeDefined();
    expect(f.detail).toBe(
      `${cmd.trim()} — a reader must compare the printed value by eye; nothing fails when it differs`,
    );
  });
});

describe("kind gate", () => {
  it("returns nothing for spec-kind documents", () => {
    expect(findings("# S\n\ngit status --porcelain | wc -l   # expect 0\n", "spec")).toHaveLength(
      0,
    );
  });
});

describe("fence independence (§4.3)", () => {
  it("fires identically inside and outside a fence — fence membership is not consulted", () => {
    const line = "supabase status 2>&1 | grep -c 'is running'         # expect 1";
    expect(findings(`# P\n\n${line}\n`)).toHaveLength(1);
    expect(findings(`# P\n\n\`\`\`bash\n${line}\n\`\`\`\n`)).toHaveLength(1);
  });
});
