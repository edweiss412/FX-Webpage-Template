import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

const ROOT = process.cwd();
const SELF = "tests/cross-cutting/identity-invalidated-two-reasons-doc-guard.test.ts";
const SCAN_ROOTS = ["docs", "app", "lib", "components", "tests"];

const FORBIDDEN_PATTERNS: Array<{ id: string; regex: RegExp }> = [
  { id: "single-stale-reason", regex: /identity_invalidated\.reason\s*:\s*["']stale["']/i },
  { id: "identity-invalidated-401", regex: /identity_invalidated[\s\S]{0,120}\bstatus:\s*401\b/i },
  {
    id: "case-identity-invalidated-401",
    regex: /case\s+["']identity_invalidated["'][\s\S]{0,160}\bstatus:\s*401\b/i,
  },
  {
    id: "session-mismatch-401",
    regex: /session_mismatch\s*(?:maps|->|=>|returns|status)\s*(?:to)?\s*401/i,
  },
  {
    id: "claimed-after-pick-only",
    regex: /reason:\s*["']claimed_after_pick["'][\s\S]{0,120}\/\*\s*only/i,
  },
  {
    id: "google-no-crew-renders-picker",
    regex: /GOOGLE_NO_CREW_MATCH[\s\S]{0,400}renders (?:either )?the picker/i,
  },
  { id: "google-mismatch-cookie-read", regex: /google_mismatch[\s\S]{0,100}decodePickerCookie/i },
  {
    id: "mode-b-clearidentity",
    regex: /google_mismatch(?:(?!Mode-A)[\s\S]){0,240}\bclearIdentity\b(?!AndSkip)(?!["'])/i,
  },
  {
    id: "mode-b-form-clearidentity",
    regex: /google_mismatch(?:(?!Mode-A)[\s\S]){0,400}form action=\{clearIdentity\}[^A]/i,
  },
];

function filesUnder(dir: string): string[] {
  const out: string[] = [];
  for (const ent of readdirSync(join(ROOT, dir))) {
    const rel = join(dir, ent);
    if (rel === SELF) continue;
    const stat = statSync(join(ROOT, rel));
    if (stat.isDirectory()) {
      if (ent === "node_modules" || ent === ".next") continue;
      out.push(...filesUnder(rel));
    } else if (/\.(ts|tsx|md|mdx)$/.test(rel)) {
      out.push(rel);
    }
  }
  return out;
}

describe("identity_invalidated two-reason structural guard", () => {
  test("forbidden stale single-reason and 401 fallthrough patterns do not recur", () => {
    const offenders: string[] = [];
    for (const file of SCAN_ROOTS.flatMap(filesUnder)) {
      const source = readFileSync(join(ROOT, file), "utf8").replace(/```[\s\S]*?```/g, "");
      for (const pattern of FORBIDDEN_PATTERNS) {
        if (pattern.regex.test(source)) offenders.push(`${file}: ${pattern.id}`);
      }
    }
    expect(offenders.sort()).toEqual([]);
  });
});
