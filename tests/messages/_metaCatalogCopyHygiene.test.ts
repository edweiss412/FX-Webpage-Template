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

import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import { MESSAGE_CATALOG } from "@/lib/messages/catalog";
import * as roleRecognizeCopy from "@/components/admin/roleRecognizeCopy";

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

  // Flow-7 error-copy polish (e2e-real-world-variation-preparedness-2026-07-07,
  // Flow 7 + class sweep): Doug-visible copy must never point at an internal
  // parser code by name ("the MI-N code") or name an internal sync mechanism
  // ("sync-suppression rule"). Both were the ONLY live instances of their shape
  // (dougFacing jargon sweep found a single hit); this pin closes the class so a
  // future edit can't reintroduce either. Scoped to the two exact phrases so it
  // never false-positives on legitimately developer/Eric-audience helpfulContext
  // that references RPCs, advisory locks, or table names.
  const JARGON_LEAK_PATTERNS: ReadonlyArray<readonly [RegExp, string]> = [
    [/sync-suppression/i, 'internal mechanism name "sync-suppression"'],
    [/\bMI-[0-9N][0-9a-z]*\s+code\b/i, 'internal parser code pointer ("MI-N code")'],
  ];

  it("no Doug-visible copy names an internal parser code or sync mechanism", () => {
    const violations: string[] = [];
    for (const [code, entry] of Object.entries(MESSAGE_CATALOG)) {
      for (const field of ["dougFacing", "crewFacing", "helpfulContext"] as const) {
        const value = entry[field];
        if (typeof value !== "string") continue;
        for (const [pattern, name] of JARGON_LEAK_PATTERNS) {
          if (pattern.test(value)) {
            violations.push(
              `${code}.${field}: internal jargon leaked — ${name}\n  Value: ${value.slice(0, 200)}${value.length > 200 ? "…" : ""}`,
            );
            break;
          }
        }
      }
    }
    expect(violations, violations.join("\n\n")).toEqual([]);
  });

  // D7 banned vocabulary for the role-recognition feature (spec §9/§10):
  // standalone words only; placeholders excluded; "role"/"refresh" allowed.
  const D7_CODES = ["ROLE_TOKEN_MAPPED", "UNKNOWN_ROLE_TOKEN"] as const;
  const D7_BANNED = /\b(scope|flag|token|mapping|capability|sync|overlay|parse)\b/i;
  const D7_FIELDS = [
    "dougFacing",
    "crewFacing",
    "helpfulContext",
    "followUp",
    "title",
    "longExplanation",
  ] as const;

  it("role-recognition Doug-facing copy avoids D7 banned vocabulary", () => {
    for (const code of D7_CODES) {
      const row = MESSAGE_CATALOG[code] as Record<string, unknown>;
      for (const field of D7_FIELDS) {
        const v = row[field];
        if (typeof v !== "string") continue;
        const stripped = v.replace(/_<[^>]+>_|<[^>]+>/g, ""); // placeholder spans excluded
        expect(D7_BANNED.test(stripped), `${code}.${field}: "${v}"`).toBe(false);
      }
    }
  });

  // Step 0 / plan-R1 F6: the SAME D7 sweep over every string constant exported by
  // the component copy module — the single source for the recognize-control and
  // settings-page strings. Placeholder spans (<TOKEN>/<SUMMARY>) are stripped
  // before the banned-word check; formatter exports (functions) are skipped.
  it("roleRecognizeCopy string constants avoid D7 banned vocabulary", () => {
    const violations: string[] = [];
    for (const [name, value] of Object.entries(roleRecognizeCopy)) {
      if (typeof value !== "string") continue;
      const stripped = value.replace(/_<[^>]+>_|<[^>]+>/g, "");
      if (D7_BANNED.test(stripped)) violations.push(`roleRecognizeCopy.${name}: "${value}"`);
    }
    expect(violations, violations.join("\n")).toEqual([]);
  });

  // Step 0 / plan-R2 F7: the inline-copy convention guard. Every user-visible string
  // in the recognize-role component files MUST flow through `roleRecognizeCopy`, so
  // the sweep above can never be bypassed by an inline JSX literal ("sync failed").
  // We read each component source, strip comments + string/template literals
  // (classNames, testids, ids — never user copy), then forbid any remaining raw JSX
  // text node: `>…<` on one line containing a 3+ letter word. Single-glyph
  // decorative nodes (✓ ⌄ ·) carry no letters and never match.
  const ROLE_COMPONENT_FILES = [
    "components/admin/RoleRecognizeControl.tsx",
    "components/admin/RoleRecognizeControlBoundary.tsx",
    "app/admin/settings/roles/page.tsx",
    "app/admin/settings/roles/RolesSettingsView.tsx",
    "app/admin/settings/roles/RoleMappingRow.tsx",
  ] as const;
  const RAW_JSX_TEXT = />[^<>{}\n]*[A-Za-z]{3,}[^<>{}\n]*</g;

  function stripCodeNoise(src: string): string {
    return src
      .replace(/\/\*[\s\S]*?\*\//g, "") // block comments
      .replace(/\/\/[^\n]*/g, "") // line comments
      .replace(/"(?:[^"\\]|\\.)*"/g, '""') // double-quoted strings
      .replace(/'(?:[^'\\]|\\.)*'/g, "''") // single-quoted strings
      .replace(/`(?:[^`\\]|\\.)*`/g, "``") // template strings
      .replace(/=>/g, "= "); // arrows — otherwise `=> Promise<T>` reads as a `> … <` text node
  }

  it("recognize-role components hold no raw JSX text nodes (all copy via roleRecognizeCopy)", () => {
    const violations: string[] = [];
    for (const file of ROLE_COMPONENT_FILES) {
      const src = stripCodeNoise(readFileSync(file, "utf8"));
      for (const match of src.matchAll(RAW_JSX_TEXT)) {
        violations.push(`${file}: raw JSX text node ${JSON.stringify(match[0])}`);
      }
    }
    expect(violations, violations.join("\n")).toEqual([]);
  });
});
