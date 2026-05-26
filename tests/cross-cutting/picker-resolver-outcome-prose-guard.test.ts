import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, test } from "vitest";

const ROOT = process.cwd();
const SELF = "tests/cross-cutting/picker-resolver-outcome-prose-guard.test.ts";

// Scan limited to the M12 spec + M12 plan tree. The structural defense is scoped
// to the artifacts where R6 + R7 same-vector recurrence appeared; future
// milestones can extend SCAN_ROOTS when their spec/plan trees land.
const SCAN_ROOTS = [
  "docs/superpowers/specs/v1-pre-deployment-amendments/2026-05-19-solo-dev-ux-validation-design.md",
  "docs/superpowers/plans/v1-pre-deployment-amendments/2026-05-19-solo-dev-ux-validation",
];

const F5_PROXIMITY = 5;

type SubClass = "F3" | "F4" | "F5" | "paranoia";

type Finding = {
  file: string;
  line: number;
  subclass: SubClass;
  pattern: string;
  suggestion: string;
};

// Same-line co-occurrence patterns (character-window-bounded, NOT ±5 lines).
// The ±5-line proximity check creates false positives in surface-inventory rows
// where multiple destructive admin actions are enumerated alongside the
// wire-arm union enumeration that lists both identity_invalidated reasons.
//
// F3 — iPhone post-claim mis-attribution: iPhone + claimed_after_pick within 400
// chars on the same line. Acceptable qualifier on same line: needs_picker_bootstrap,
// resolveShowPageAccess.ts:20X, or explicit "no Google session" precondition.
const F3_VIOLATION_RX = /(?:iPhone[^\n]{0,400}claimed_after_pick|claimed_after_pick[^\n]{0,400}iPhone)/i;
const F3_ACCEPTABLE_RX = /needs_picker_bootstrap|resolveShowPageAccess\.ts:20[0-9]|no (?:active )?Google session/i;

// F4 — Reset action + session_mismatch within 200 chars on same line.
// Acceptable: explicit "NOT ... session_mismatch" disambiguation or epoch_stale
// / epoch arm / epoch check qualifier in the same line.
const F4_TRIGGER_RX = /\bResetPickerEpoch(?:Button)?\b|\breset_picker_epoch_atomic\b|\bepoch[\s-]reset(?:s|ting)?\b/i;
const F4_VIOLATION_RX = /(?:\bResetPickerEpoch(?:Button)?\b|\breset_picker_epoch_atomic\b|\bepoch[\s-]reset(?:s|ting)?\b)[^\n]{0,200}session_mismatch|session_mismatch[^\n]{0,200}(?:\bResetPickerEpoch(?:Button)?\b|\breset_picker_epoch_atomic\b|\bepoch[\s-]reset(?:s|ting)?\b)/i;
const F4_ACCEPTABLE_RX = /\bNOT\b[^\n]{0,80}session_mismatch|session_mismatch[^\n]{0,40}\bNOT\b|epoch_stale|epoch arm|epoch check/i;

// F5 — bare session_mismatch without API-route qualifier in ±5-line proximity.
// Wider window because the closing-paragraph framing for API-route reachability
// can legitimately live a few lines away from the session_mismatch mention.
// Acceptable qualifiers include the API-route reachability disclaimers AND
// explicit "NOT session_mismatch" disambiguation (the prose contrasts the
// correct outcome with what it is NOT — same shape as F4's NOT qualifier).
const F5_ACCEPTABLE_RX = /API[\s-]route|\/api\/|auth_email_canonical|resolvePickerSelection\.ts:122-143|API-route-only|not from (?:the )?page-route|page-route forecloses|reachable only via|unreachable from (?:the )?page-route|documentation contract|\bNOT\b[^\n]{0,80}session_mismatch|session_mismatch[^\n]{0,40}\bNOT\b/i;

// Paranoia — Rotate action + claimed_after_pick within 200 chars on same line.
// No acceptable qualifier (flat-forbidden). Word boundaries prevent matching
// the past-participle "rotated" in casual prose.
const PARANOIA_VIOLATION_RX = /(?:\bRotate(?:ShareToken)?(?:Button)?\b|\brotate_show_share_token\b)[^\n]{0,200}claimed_after_pick|claimed_after_pick[^\n]{0,200}(?:\bRotate(?:ShareToken)?(?:Button)?\b|\brotate_show_share_token\b)/i;

function collectMarkdown(target: string): string[] {
  const full = join(ROOT, target);
  let stat;
  try {
    stat = statSync(full);
  } catch {
    return [];
  }
  if (stat.isFile()) {
    return target.endsWith(".md") ? [target] : [];
  }
  const out: string[] = [];
  for (const ent of readdirSync(full)) {
    const rel = join(target, ent);
    const entStat = statSync(join(ROOT, rel));
    if (entStat.isDirectory()) {
      if (ent === "node_modules" || ent === ".next" || ent === "handoffs") continue;
      out.push(...collectMarkdown(rel));
    } else if (rel.endsWith(".md")) {
      out.push(rel);
    }
  }
  return out;
}

function stripFifteen(lines: string[]): string[] {
  // §15 is the spec's last top-level section ("## 15. Adversarial-review audit
  // trail"). Plan files have no §15-equivalent. Once we enter §15, blank the
  // rest (historical Codex findings quote forbidden patterns by design).
  let in15 = false;
  return lines.map((ln) => {
    if (!in15 && /^##\s+15\.\s/.test(ln)) in15 = true;
    return in15 ? "" : ln;
  });
}

function f5Window(lines: string[], i: number): string {
  return lines
    .slice(Math.max(0, i - F5_PROXIMITY), Math.min(lines.length, i + F5_PROXIMITY + 1))
    .join("\n");
}

function scan(file: string, source: string): Finding[] {
  const findings: Finding[] = [];
  const rawLines = source.split("\n");
  const lines = stripFifteen(rawLines);

  for (let i = 0; i < lines.length; i++) {
    const ln = lines[i];
    if (!ln) continue;

    // F3 — iPhone post-claim mis-attribution.
    if (F3_VIOLATION_RX.test(ln) && !F3_ACCEPTABLE_RX.test(ln)) {
      findings.push({
        file,
        line: i + 1,
        subclass: "F3",
        pattern: "iPhone + claimed_after_pick (no needs_picker_bootstrap / resolveShowPageAccess.ts:204 / 'no Google session' qualifier on same line)",
        suggestion:
          "iPhone post-claim from the page-route returns `needs_picker_bootstrap` (resolveShowPageAccess.ts:204-208 — validateGoogleSession-success branch fires before resolvePickerSelection), NOT `claimed_after_pick`. The latter is reachable from the page-route only when there is no active Google session for this show.",
      });
    }

    // Paranoia — Rotate action + claimed_after_pick (flat-forbidden).
    if (PARANOIA_VIOLATION_RX.test(ln)) {
      findings.push({
        file,
        line: i + 1,
        subclass: "paranoia",
        pattern: "Rotate action + claimed_after_pick within 200 chars (flat-forbidden)",
        suggestion:
          "Share-token rotation surfaces `PICKER_SHOW_UNAVAILABLE` on the old URL + `epoch_stale + PICKER_EPOCH_STALE_BANNER` on the new URL (rotation atomically bumps picker_epoch); it never produces `claimed_after_pick`.",
      });
    }

    if (/session_mismatch/i.test(ln)) {
      // F4 — Reset action + session_mismatch (no NOT/epoch_stale qualifier).
      if (F4_VIOLATION_RX.test(ln) && !F4_ACCEPTABLE_RX.test(ln)) {
        findings.push({
          file,
          line: i + 1,
          subclass: "F4",
          pattern: "Reset action + session_mismatch within 200 chars (no NOT/epoch_stale qualifier on same line)",
          suggestion:
            "Picker-epoch reset returns `epoch_stale + PICKER_EPOCH_STALE_BANNER` per resolvePickerSelection.ts:88-90 (epoch arm fires before the claim and session-email arms); the cookie's stale `e` short-circuits the resolver. Never `session_mismatch`.",
        });
        continue;
      }

      // F5 — bare session_mismatch without API-route qualifier in ±5-line proximity.
      const win = f5Window(lines, i);
      if (!F5_ACCEPTABLE_RX.test(win)) {
        findings.push({
          file,
          line: i + 1,
          subclass: "F5",
          pattern: "session_mismatch without API-route qualifier within ±5 lines",
          suggestion:
            "`session_mismatch` (resolvePickerSelection.ts:122-143) is structurally unreachable from the page-route (resolveShowPageAccess.ts:174-212 forecloses both preconditions: GOOGLE_NO_CREW_MATCH short-circuits or the success branch returns needs_picker_bootstrap). Reachable only via API-route callers: app/api/show/[slug]/version/route.ts:82, app/api/realtime/subscriber-token/route.ts:97, app/api/report/route.ts:118, lib/auth/picker/validatePickerAssetSession.ts:37. Add an explicit API-route qualifier within ±5 lines.",
        });
      }
    }
  }

  return findings;
}

describe("picker-resolver-outcome prose guard", () => {
  test("M12 spec + plan tree resolver-outcome citations match live `lib/auth/picker/*.ts` ordering", () => {
    const files = SCAN_ROOTS.flatMap(collectMarkdown).filter((f) => relative(".", f) !== SELF);
    const findings: Finding[] = [];
    for (const file of files) {
      const source = readFileSync(join(ROOT, file), "utf8");
      findings.push(...scan(file, source));
    }
    if (findings.length > 0) {
      const formatted = findings
        .map((f) => `\n  [${f.subclass}] ${f.file}:${f.line}\n      pattern: ${f.pattern}\n      fix: ${f.suggestion}`)
        .join("\n");
      expect.fail(
        `picker-resolver-outcome prose guard found ${findings.length} violation(s):${formatted}\n\n` +
          `See spec §5.3 J3 leg (c) for the canonical resolver-arm-ordering preamble + closing paragraph that satisfies the F5 qualifier. ` +
          `§15 audit-trail sections are stripped before scanning (historical Codex findings quote forbidden patterns by design).`,
      );
    }
    expect(findings).toEqual([]);
  });
});
