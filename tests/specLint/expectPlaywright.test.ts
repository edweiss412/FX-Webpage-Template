import { describe, expect, it } from "vitest";
import { parseDoc } from "../../lib/specLint/parse";
import {
  configsToProbe,
  playwrightCollectionPlan,
  synthesizeCollectionVerdicts,
  type PlaywrightCandidate,
} from "../../lib/specLint/expectContract";
import type { Finding } from "../../lib/specLint/types";

/**
 * Arm B — extraction (§5.1), config resolution (§5.2) and verdicts (§5.3) of
 * `docs/superpowers/specs/ci/2026-08-28-speclint-expect-n-exit-status.md`.
 *
 * Rule-isolation contract (plan review R1 F2): rule 1 is an AT-LEAST-ONE gate
 * and rule 4 a MORE-THAN-ONE decline — two separate checks — so the
 * zero-invocation fixture isolates rule 1 (deleting rule 1 admits it; a `>1`
 * rule 4 passes count 0) and the `&&` fixture isolates rule 4. Failure modes
 * caught: a candidate minted from prose with no invocation, a first-match
 * extraction dropping later file tokens, a config read from a `sh -c` wrapper,
 * the `-c` alias ignored, a fail verdict minted from an unobserved config.
 */

function candidates(docText: string, kind: "spec" | "plan" = "plan"): PlaywrightCandidate[] {
  return playwrightCollectionPlan(parseDoc(docText), kind);
}

const fenced = (line: string): string => `# P\n\n\`\`\`bash\n${line}\n\`\`\`\n`;

describe("§5.1 extraction", () => {
  it("rule 1 (at-least-one gate): a file token with NO playwright test invocation is not a candidate", () => {
    expect(candidates(fenced("pnpm vitest run tests/e2e/sample.spec.ts"))).toHaveLength(0);
  });

  it("rule 2 (global): a multi-file candidate carries ALL its tokens, in order", () => {
    const out = candidates(
      fenced(
        "pnpm playwright test tests/e2e/published-review-modal.layout.spec.ts tests/e2e/step3-review-modal.layout.spec.ts",
      ),
    );
    expect(out).toHaveLength(1);
    expect(out[0]!.files).toEqual([
      "tests/e2e/published-review-modal.layout.spec.ts",
      "tests/e2e/step3-review-modal.layout.spec.ts",
    ]);
  });

  it("rule 2 (rejection): an invocation naming NO spec-file token is not a candidate", () => {
    expect(candidates(fenced("pnpm exec playwright test --project=desktop-chromium"))).toHaveLength(
      0,
    );
  });

  it("rule 3: a line ending in a shell continuation is declined whole", () => {
    expect(
      candidates(fenced("pnpm exec playwright test tests/e2e/sample.spec.ts \\")),
    ).toHaveLength(0);
  });

  it("rule 4 (more-than-one decline): two invocations joined by && are declined whole", () => {
    const line =
      "sh -c 'pnpm exec playwright test tests/e2e/warning-panel-polish.spec.ts && pnpm exec playwright test tests/e2e/step3-review-modal.interactions.spec.ts'";
    expect(candidates(fenced(line))).toHaveLength(0);
  });

  it("reads inline code spans as well as fenced lines", () => {
    const out = candidates(
      "# P\n\nRun `pnpm exec playwright test tests/e2e/bell-panel-layout.spec.ts` before closing.\n",
    );
    expect(out).toHaveLength(1);
    expect(out[0]!.files).toEqual(["tests/e2e/bell-panel-layout.spec.ts"]);
    expect(out[0]!.config).toBe("(default)");
  });

  it("returns nothing for spec-kind documents", () => {
    expect(
      candidates(fenced("pnpm exec playwright test tests/e2e/sample.spec.ts"), "spec"),
    ).toHaveLength(0);
  });
});

describe("§5.1 config resolution — the closed {--config, -c} set, positioned after the match", () => {
  it("resolves --config", () => {
    const out = candidates(
      fenced(
        "pnpm exec playwright test --config tests/e2e/standalone.config.ts tests/e2e/popover-clip-fit.spec.ts",
      ),
    );
    expect(out[0]!.config).toBe("tests/e2e/standalone.config.ts");
  });

  it("resolves the --config= equals form", () => {
    const out = candidates(
      fenced(
        "pnpm exec playwright test --config=tests/e2e/standalone.config.ts tests/e2e/popover-clip-fit.spec.ts",
      ),
    );
    expect(out[0]!.config).toBe("tests/e2e/standalone.config.ts");
  });

  it("resolves the -c alias (the 01-tasks.md:1003 shape)", () => {
    const out = candidates(
      fenced(
        "pnpm exec playwright test -c tests/e2e/standalone.config.ts tests/e2e/step3-review-modal.interactions.spec.ts",
      ),
    );
    expect(out[0]!.config).toBe("tests/e2e/standalone.config.ts");
  });

  it("does NOT read a sh -c wrapper flag as the config (position rule)", () => {
    const out = candidates(
      fenced(
        "sh -c 'BASELINE_SERVER_ONLY=1 pnpm exec playwright test tests/e2e/crew-layout-dimensions.spec.ts -g \"T-DIAGRAM\" --project=mobile-safari'",
      ),
    );
    expect(out).toHaveLength(1);
    expect(out[0]!.config).toBe("(default)");
  });

  it("defaults to the sentinel when neither flag is present", () => {
    const out = candidates(fenced("pnpm exec playwright test tests/e2e/sample.spec.ts"));
    expect(out[0]!.config).toBe("(default)");
  });
});

describe("configsToProbe (§5.2)", () => {
  it("returns distinct configs only, in first-seen order", () => {
    const plan: PlaywrightCandidate[] = [
      { line: 1, files: ["tests/e2e/a.spec.ts"], config: "(default)" },
      { line: 2, files: ["tests/e2e/b.spec.ts"], config: "tests/e2e/standalone.config.ts" },
      { line: 3, files: ["tests/e2e/c.spec.ts"], config: "(default)" },
    ];
    expect(configsToProbe(plan)).toEqual(["(default)", "tests/e2e/standalone.config.ts"]);
  });
});

describe("synthesizeCollectionVerdicts (§5.3)", () => {
  const only = (out: Finding[], code: string): Finding[] => out.filter((f) => f.code === code);

  it("draws one fail PER ABSENT TOKEN — first-present-later-absent draws exactly one, naming the absent file", () => {
    const plan: PlaywrightCandidate[] = [
      {
        line: 171,
        files: [
          "tests/e2e/published-review-modal.layout.spec.ts",
          "tests/e2e/step3-review-modal.layout.spec.ts",
        ],
        config: "(default)",
      },
    ];
    const collected = new Map<string, ReadonlySet<string> | { unavailable: string }>([
      ["(default)", new Set(["tests/e2e/published-review-modal.layout.spec.ts"])],
    ]);
    const out = synthesizeCollectionVerdicts(plan, collected);
    const fails = only(out, "PLAYWRIGHT_COLLECTS_NOTHING");
    expect(fails).toHaveLength(1);
    expect(fails[0]!.severity).toBe("fail");
    expect(fails[0]!.docLine).toBe(171);
    expect(fails[0]!.column).toBe(1);
    // Whole-message equality: containment lets a suffixed message and a
    // file/config transposition survive (pre-dispatch mutants b/d1).
    expect(fails[0]!.message).toBe(
      "`tests/e2e/step3-review-modal.layout.spec.ts` is not collected under `(default)` — this gate observes nothing and exits 0",
    );
  });

  it("draws nothing when every named file is present", () => {
    const plan: PlaywrightCandidate[] = [
      { line: 5, files: ["tests/e2e/a.spec.ts"], config: "(default)" },
    ];
    const collected = new Map<string, ReadonlySet<string> | { unavailable: string }>([
      ["(default)", new Set(["tests/e2e/a.spec.ts"])],
    ]);
    expect(synthesizeCollectionVerdicts(plan, collected)).toHaveLength(0);
  });

  it("an unavailable config yields the advisory carrying the reason, and NEVER the fail", () => {
    const plan: PlaywrightCandidate[] = [
      { line: 9, files: ["tests/e2e/a.spec.ts"], config: "(default)" },
    ];
    const collected = new Map<string, ReadonlySet<string> | { unavailable: string }>([
      ["(default)", { unavailable: "spawn timed out after 120s; stderr: boom" }],
    ]);
    const out = synthesizeCollectionVerdicts(plan, collected);
    expect(only(out, "PLAYWRIGHT_COLLECTS_NOTHING")).toHaveLength(0);
    const advisories = only(out, "PLAYWRIGHT_COLLECTION_UNVERIFIED");
    expect(advisories).toHaveLength(1);
    expect(advisories[0]!.severity).toBe("advisory");
    expect(advisories[0]!.docLine).toBe(9);
    expect(advisories[0]!.column).toBe(1);
    expect(advisories[0]!.detail).toContain("spawn timed out after 120s; stderr: boom");
  });

  it("emits nothing for a candidate whose config has no entry in the map", () => {
    const plan: PlaywrightCandidate[] = [
      { line: 3, files: ["tests/e2e/a.spec.ts"], config: "tests/e2e/standalone.config.ts" },
    ];
    expect(synthesizeCollectionVerdicts(plan, new Map<string, ReadonlySet<string>>())).toHaveLength(
      0,
    );
  });
});
