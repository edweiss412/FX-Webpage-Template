/**
 * expect-N exit-status arms (spec docs/superpowers/specs/ci/2026-08-28-speclint-expect-n-exit-status.md).
 *
 * Arm A — `EXPECT_N_UNENFORCED` (§4): a `# expect N` comment beside a command
 * whose exit status does not encode N. Static, plan-kind only, advisory.
 *
 * Pure: no `node:` imports (pinned by tests/specLint/_metaPureCore.test.ts).
 */

import type { DocModel } from "./parse";
import type { Finding } from "./types";

/**
 * §4.1 rule 1 — end-anchored, and the anchoring IS the discriminator (§4.2):
 * a quoted `# expect 0` inside prose continues past the comment, so it never
 * matches. Removing the anchor fires the two measured prose sites (§4.2), and
 * the corpus suite pins that mutant dead.
 */
const EXPECT_LINE = /^(.*\S)[ \t]+#[ \t]*expect[ \t]+(\d+)(?:[ \t]*\([^()]*\))?[ \t]*$/;

/**
 * §4.1 rule 3 — the CLOSED assertion-opener set. A command already asserting
 * via `test`/`[`/`[[` encodes its expectation in its exit status; the comment
 * beside it is decoration, not the only enforcement.
 */
const ASSERTION_OPENERS = ["test ", "[ ", "[[ "] as const;

/** Arm A (§4.1): a `# expect N` comment beside a command whose exit status
 * does not encode N. Fence membership is deliberately not consulted (§4.3). */
export function checkExpectN(model: DocModel, kind: "spec" | "plan"): Finding[] {
  if (kind !== "plan") return [];
  const findings: Finding[] = [];
  for (let i = 0; i < model.lines.length; i++) {
    const line = model.lines[i]!;
    const m = EXPECT_LINE.exec(line);
    if (m === null) continue;
    const cmd = m[1]!;
    // Rule 2 — defense in depth: unreachable through the anchored pattern,
    // whose cmd group already requires a non-blank command (plan R1 F1).
    if (cmd.trim() === "") continue;
    const lead = cmd.replace(/^[ \t]+/, "");
    if (ASSERTION_OPENERS.some((opener) => lead.startsWith(opener))) continue;
    findings.push({
      check: "taskContract",
      code: "EXPECT_N_UNENFORCED",
      severity: "advisory",
      docLine: i + 1,
      column: line.indexOf("#", cmd.length) + 1,
      message: `expectation \`${m[2]!}\` is stated in a comment; the command's exit status does not encode it`,
      detail: `${cmd.trim()}: a reader must compare the printed value by eye; nothing fails when it differs`,
    });
  }
  return findings;
}

export interface PlaywrightCandidate {
  /** 1-based doc line the candidate text sits on. */
  line: number;
  /** EVERY §5.1 rule-2 token in the text, in order — never just the first. */
  files: string[];
  /** `--config`/`-c` value after the `playwright test` match, or `(default)`. */
  config: string;
}

/** §5.1 rule 1 — the invocation token pair. */
const PW_TEST = /\bplaywright\s+test\b/;
const PW_TEST_G = /\bplaywright\s+test\b/g;
/** §5.1 rule 2 — GLOBAL: a candidate's file set is every matching token. */
const SPEC_TOKEN_G = /(?:^|\s)(tests\/e2e\/[A-Za-z0-9._-]+\.spec\.ts)(?=\s|$)/g;
/** §5.1 rule 3 — a continued command is declined whole, never assembled. */
const CONTINUATION = /\\\s*$/;
/**
 * §5.2 — the CLOSED two-member flag set, own-token anchored. Searched only
 * FROM the `playwright test` match onward: `sh -c '…'` wrappers precede the
 * token pair, and reading their `-c` classifies three live corpus `red=`
 * markers under a garbage config (spec §5.2, measured).
 */
const CONFIG_FLAG = /(?:^|\s)(?:--config|-c)[=\s]+(\S+)/;

/**
 * Arm B extraction (§5.1): candidate texts are inline code spans and fenced
 * lines. Rule 1 is an AT-LEAST-ONE gate and rule 4 a MORE-THAN-ONE decline —
 * two separate checks, so each has its own discriminating fixture.
 */
export function playwrightCollectionPlan(
  model: DocModel,
  kind: "spec" | "plan",
): PlaywrightCandidate[] {
  if (kind !== "plan") return [];
  const texts: { line: number; text: string }[] = [];
  for (const span of model.spans) texts.push({ line: span.line, text: span.content });
  for (let i = 0; i < model.lines.length; i++) {
    if (typeof model.fencedInfo[i] === "string") texts.push({ line: i + 1, text: model.lines[i]! });
  }
  const out: PlaywrightCandidate[] = [];
  for (const { line, text } of texts) {
    const first = PW_TEST.exec(text);
    if (first === null) continue; // rule 1: at least one invocation
    const files = [...text.matchAll(SPEC_TOKEN_G)].map((m) => m[1]!);
    if (files.length === 0) continue; // rule 2: at least one file token
    if (CONTINUATION.test(text)) continue; // rule 3
    if ([...text.matchAll(PW_TEST_G)].length > 1) continue; // rule 4: more than one declines
    const config = CONFIG_FLAG.exec(text.slice(first.index))?.[1] ?? "(default)";
    out.push({ line, files, config });
  }
  return out;
}

/** Distinct config values of a plan, in first-seen order (§5.2). */
export function configsToProbe(plan: readonly PlaywrightCandidate[]): string[] {
  const seen = new Set<string>();
  for (const candidate of plan) seen.add(candidate.config);
  return [...seen];
}

/**
 * Arm B verdicts (§5.3), pure over injected collected sets. One fail PER
 * ABSENT TOKEN; an unavailable config draws the advisory and never the fail;
 * a config with no map entry draws nothing — absence of an observation is
 * never an observation of absence (spec §5.2).
 */
export function synthesizeCollectionVerdicts(
  plan: readonly PlaywrightCandidate[],
  collected: ReadonlyMap<string, ReadonlySet<string> | { unavailable: string }>,
): Finding[] {
  const findings: Finding[] = [];
  for (const candidate of plan) {
    const entry = collected.get(candidate.config);
    if (entry === undefined) continue;
    if ("unavailable" in entry) {
      findings.push({
        check: "taskContract",
        code: "PLAYWRIGHT_COLLECTION_UNVERIFIED",
        severity: "advisory",
        docLine: candidate.line,
        column: 1,
        message: `collection under \`${candidate.config}\` could not be observed; zero-collection is unverified for this command`,
        detail: entry.unavailable,
      });
      continue;
    }
    for (const file of candidate.files) {
      if (entry.has(file)) continue;
      findings.push({
        check: "taskContract",
        code: "PLAYWRIGHT_COLLECTS_NOTHING",
        severity: "fail",
        docLine: candidate.line,
        column: 1,
        message: `\`${file}\` is not collected under \`${candidate.config}\`; this gate cannot observe its subject`,
        detail:
          "zero collection exits non-zero for a COLLECTION reason, which a red-then-green cycle misreads as red observed; name the config that collects the file, or fix the path",
      });
    }
  }
  return findings;
}
