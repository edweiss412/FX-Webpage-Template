// tests/messages/_metaCatalogCopyHygiene.test.ts
//
// Structural meta-test that user-facing catalog copy never leaks internal
// implementation detail (raw catalog code names, regex fragments, etc.) into
// `dougFacing` or `crewFacing` strings.
//
// Codex R10 (job `review-mpe9xhaw-d73td5`, fresh-eyes against base `3eb73ad`)
// caught a real instance: `OAUTH_REDIRECT_INVALID` had `dougFacing` =
// `"admin(\\/.*)?"` (regex fragment) and `crewFacing` = a long block of
// internal regex/spec text. The bug pre-dated Phase E but E.13's catalog
// backfill (adding title/longExplanation/helpHref) promoted the entry into
// the renderable help/catalog contract, making the broken copy newly visible
// on `/help/errors` and in `messageFor()` rendering pipelines.
//
// This test pins the no-leak contract going forward:
//  1. Non-null `dougFacing` / `crewFacing` MUST NOT contain the entry's own
//     `code` string (no `OAUTH_REDIRECT_INVALID` in the body of its own copy).
//  2. Non-null `dougFacing` / `crewFacing` MUST NOT contain regex-leak
//     fingerprints: `\/`, `\\/`, double-escaped backslashes, anchor metachars
//     (`^...$`), or character classes (`[a-z]`, `(?:`, etc.). Note that some
//     legitimate prose may include parentheses or backticks; the regex check
//     is intentionally narrow.

import { describe, it, expect } from "vitest";
import { MESSAGE_CATALOG } from "@/lib/messages/catalog";

const REGEX_LEAK_PATTERNS: ReadonlyArray<readonly [RegExp, string]> = [
  // Escaped forward slash (regex literal escape; not natural prose).
  [/\\\//, "escaped forward slash (\\/)"],
  // Doubly-escaped backslash sequences common in regex string literals.
  [/\\\\/, "double-escaped backslash (\\\\)"],
  // Non-capturing group (?:...) — vanishingly rare in natural prose.
  [/\(\?:/, "non-capturing group (?:"],
  // Common regex token classes — `(\.*)` or `(\w+)` or `[a-z0-9]`.
  [/\([\\^][a-zA-Z*+?.|\\/-]+\)/, "regex group with metachars, e.g. (\\.*)"],
  [/\[[a-z0-9-]+\]\??\$/, "character class anchored at end, e.g. [a-z0-9-]+$"],
  // Anchor + group + question mark — `(...)?` next to start/end anchors.
  [/[\^$]\([^)]*\)[*+?]/, "anchored group with quantifier"],
];

describe("Catalog copy hygiene (Phase E meta-test after Codex R10)", () => {
  it("no entry's user-facing copy contains its own SCREAMING_SNAKE code name", () => {
    const violations: string[] = [];
    for (const [code, entry] of Object.entries(MESSAGE_CATALOG)) {
      for (const field of ["dougFacing", "crewFacing"] as const) {
        const value = entry[field];
        if (typeof value !== "string") continue;
        if (value.includes(code)) {
          violations.push(`${code}.${field} contains its own code name`);
        }
      }
    }
    expect(violations, violations.join("\n")).toEqual([]);
  });

  it("no entry's user-facing copy contains regex-leak fingerprints", () => {
    const violations: string[] = [];
    for (const [code, entry] of Object.entries(MESSAGE_CATALOG)) {
      for (const field of ["dougFacing", "crewFacing"] as const) {
        const value = entry[field];
        if (typeof value !== "string") continue;
        for (const [pattern, name] of REGEX_LEAK_PATTERNS) {
          if (pattern.test(value)) {
            violations.push(
              `${code}.${field}: regex-leak fingerprint matched — ${name}\n  Value: ${value.slice(0, 200)}${value.length > 200 ? "…" : ""}`,
            );
            break;
          }
        }
      }
    }
    expect(violations, violations.join("\n\n")).toEqual([]);
  });
});
