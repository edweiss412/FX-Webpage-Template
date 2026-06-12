import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

import {
  MESSAGE_CATALOG,
  messageFor,
  type MessageCatalogEntry,
  type MessageCode,
} from "@/lib/messages/lookup";

const REQUIRED_M5_CODES = [
  "SESSION_NOT_FOUND",
  "SESSION_ABSOLUTE_TIMEOUT",
  "SESSION_IDLE_TIMEOUT",
  "AMBIGUOUS_EMAIL_BINDING",
  "OAUTH_STATE_INVALID",
  "OAUTH_REDIRECT_INVALID",
  "ADMIN_SESSION_LOOKUP_FAILED",
  "GOOGLE_NO_CREW_MATCH",
  "WATCH_CHANNEL_ORPHANED",
  "WEBHOOK_TOKEN_INVALID",
  "IDEMPOTENCY_IN_FLIGHT",
  "REPORT_HORIZON_EXPIRED",
  "REPORT_ORPHANED_LOST_LEASE",
  "REPORT_LOOKUP_INCONCLUSIVE",
  "GITHUB_BOT_LOGIN_MISSING",
  "REPORT_DUPLICATE_LIVE_MATCHES",
  "REPORT_OPEN_ORPHAN_LABEL",
  "REPORT_RATE_LIMITED_ADMIN",
  "REPORT_RATE_LIMITED_CREW",
  "REPORT_LEASE_THRASHING",
  "STALE_ORPHAN_REPORT",
  "TILE_SERVER_RENDER_FAILED",
] as const satisfies readonly MessageCode[];

const REQUIRED_M7_WARNING_CODES = [
  "DIAGRAMS_TAB_MISSING",
  "DIAGRAMS_EMBEDDED_NONE_FOUND",
  "DIAGRAMS_EMBEDDED_CAP_EXCEEDED",
  "DIAGRAMS_EMBEDDED_REVISIONS_UNAVAILABLE",
  "DIAGRAMS_EMBEDDED_OBJECT_INACCESSIBLE",
  "LINKED_FOLDER_OVERFLOW_TRUNCATED",
  "EMBEDDED_ASSET_DRIFTED",
] as const satisfies readonly MessageCode[];

const REQUIRED_M10_ONBOARDING_SCAN_CODES = [
  "INVALID_FOLDER_URL",
  "FOLDER_NOT_SHARED",
  "FOLDER_NOT_FOUND",
  "OPERATOR_ERROR_NOT_FOLDER",
  "OPERATOR_ERROR_INCOMPLETE_FOLDER_METADATA",
] as const satisfies readonly MessageCode[];

function walkFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      return walkFiles(path);
    }
    return /\.(ts|tsx)$/.test(path) ? [path] : [];
  });
}

function producedCodes(): string[] {
  const files = [
    ...walkFiles("lib/auth"),
    ...walkFiles("lib/data"),
    ...walkFiles("app/api"),
    ...walkFiles("app/auth"),
    // middleware.ts removed 2026-05-27 (Phase 0.A finding 5 / commit b5999c8).
    // Vestigial-middleware structural defense at
    // tests/cross-cutting/no-vestigial-middleware.test.ts prevents
    // reintroducing a no-op middleware.ts/proxy.ts. If a real proxy.ts
    // is added with auth-chain code-emission, append it here.
  ];
  const codes = new Set<string>();
  const patterns = [
    /\bcode:\s*["'`]([A-Z][A-Z_]+)["'`]/g,
    /\berror:\s*["'`]([A-Z][A-Z_]+)["'`]/g,
    /\bjsonError\([^,\n]+,\s*["'`]([A-Z][A-Z_]+)["'`]/g,
    /\bsignInRedirect\([^,\n]+,\s*["'`]([A-Z][A-Z_]+)["'`]/g,
  ];

  for (const file of files) {
    const source = readFileSync(file, "utf8");
    for (const pattern of patterns) {
      for (const match of source.matchAll(pattern)) {
        const code = match[1];
        if (code) {
          codes.add(code);
        }
      }
    }
  }

  return [...codes].sort();
}

describe("message catalog", () => {
  test("contains every required M5 auth/admin-alert code", () => {
    expect(Object.keys(MESSAGE_CATALOG).sort()).toEqual(
      expect.arrayContaining([...REQUIRED_M5_CODES].sort()),
    );
  });

  test("contains every M7 linked-asset warning producer code", () => {
    expect(Object.keys(MESSAGE_CATALOG).sort()).toEqual(
      expect.arrayContaining([...REQUIRED_M7_WARNING_CODES].sort()),
    );
  });

  test("contains every Pin-1 onboarding scan route code", () => {
    expect(Object.keys(MESSAGE_CATALOG).sort()).toEqual(
      expect.arrayContaining([...REQUIRED_M10_ONBOARDING_SCAN_CODES].sort()),
    );
  });

  test("returns immutable catalog entries by code", () => {
    expect(messageFor("OAUTH_STATE_INVALID")).toMatchObject({
      code: "OAUTH_STATE_INVALID",
      crewFacing:
        "Something interrupted your sign-in. Please click the original link from Doug again to start over.",
    });
  });

  test("covers every code producer in auth/data/API routes", () => {
    const missing = producedCodes().filter((code) => !(code in MESSAGE_CATALOG));
    expect(missing).toEqual([]);
  });

  test("AGENDA_GONE_FOR_CREW carries the ratified §12.4 amendment copy", () => {
    expect(messageFor("AGENDA_GONE_FOR_CREW")).toMatchObject({
      code: "AGENDA_GONE_FOR_CREW",
      dougFacing: null,
      crewFacing: "This agenda isn't available anymore. Ask Doug for a fresh link.",
      followUp: "Crew → message Doug",
      helpfulContext: null,
    });
  });

  // 2026-06-11 bug-audit sweep: spec-authoring annotations ("(admin_alerts
  // banner)") and stray outer quotes leaked from §12.4 cells into rendered
  // copy on two rows, and three rows carried mismatched placeholder wrappers
  // (`*<minutes>_`, `_<sheet-name>*`, `_<sheet-name>\*`). ErrorExplainer and
  // AlertBanner render copy verbatim (plain text, no markdown), so any of
  // these reach the user literally. Sweep every code, both surfaces.
  //
  // Allowed wrapper styles are SYMMETRIC pairs only — `_<x>_`, `*<x>*`,
  // `` `<x>` `` all ship today as deliberate (if literal) emphasis styles;
  // this test does not relitigate style, it pins out typos.
  //
  // DIAGRAMS_EMBEDDED_NONE_FOUND is allowlisted: its §12.4 cell documents two
  // scenario variants with "(first-seen)"/"(existing show...)" annotations,
  // and its dougFacing is never rendered — the UI surface for that code is
  // StagedReviewCard's own copy (components/admin/StagedReviewCard.tsx:178)
  // and the parser warning text (lib/sync/enrichWithDrivePins.ts:134). If a
  // renderer ever consumes this dougFacing, split the variants first.
  test("no rendered copy carries spec-authoring annotations, wrapping quotes, or mismatched placeholder wrappers", () => {
    const UNRENDERED_SCENARIO_VARIANT_ROWS = new Set(["DIAGRAMS_EMBEDDED_NONE_FOUND"]);
    const SYMMETRIC_WRAPPERS = new Set(["_", "*", "`"]);
    const offenders: string[] = [];
    for (const [code, entry] of Object.entries(MESSAGE_CATALOG)) {
      if (UNRENDERED_SCENARIO_VARIANT_ROWS.has(code)) continue;
      for (const surface of ["dougFacing", "crewFacing"] as const) {
        const copy = entry[surface];
        if (copy === null) continue;
        if (/\(admin_alerts[^)]*\)/.test(copy)) {
          offenders.push(`${code}.${surface}: spec-authoring annotation in copy`);
        }
        if (copy.startsWith('"') && copy.endsWith('"')) {
          offenders.push(`${code}.${surface}: literal wrapping quotes around entire copy`);
        }
        // Placeholder wrappers must be a symmetric pair from the allowed set;
        // anything else abutting `<token>` is a typo (e.g. `*<minutes>_`).
        for (const match of copy.matchAll(/(.)?<([a-zA-Z][a-zA-Z0-9_-]*)>(.)?/g)) {
          const [, before, token, after] = match;
          const symmetric =
            before !== undefined &&
            before === after &&
            SYMMETRIC_WRAPPERS.has(before);
          if (!symmetric) {
            offenders.push(`${code}.${surface}: mismatched placeholder wrapper around <${token}>`);
          }
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  test("AGENDA_UNAUTHENTICATED carries the ratified §12.4 amendment copy", () => {
    expect(messageFor("AGENDA_UNAUTHENTICATED")).toMatchObject({
      code: "AGENDA_UNAUTHENTICATED",
      dougFacing: null,
      crewFacing: "Your link to this agenda expired. Reopen Doug's latest message to view it.",
      followUp: "Crew → reopen signed link",
      helpfulContext: null,
    });
  });
});

describe("helpfulContext × dougFacing coverage", () => {
  const entries = Object.values(MESSAGE_CATALOG) as readonly MessageCatalogEntry[];

  test("every dougFacing-non-null code has non-null helpfulContext", () => {
    const violations = entries
      .filter((entry) => entry.dougFacing !== null && entry.helpfulContext === null)
      .map((entry) => entry.code);
    expect(violations).toEqual([]);
  });

  test("every dougFacing-null code has null helpfulContext (admin-log-only invariant)", () => {
    const violations = entries
      .filter((entry) => entry.dougFacing === null && entry.helpfulContext !== null)
      .map((entry) => entry.code);
    expect(violations).toEqual([]);
  });
});

describe("messageFor interpolation", () => {
  test("returns the catalog entry unchanged when no params", () => {
    const entry = messageFor("OAUTH_STATE_INVALID");
    expect(entry.crewFacing).toBe(
      "Something interrupted your sign-in. Please click the original link from Doug again to start over.",
    );
  });

  test("interpolates <placeholder> tokens with matching params", () => {
    const entry = messageFor("AGENDA_GONE_FOR_CREW", { name: "Doug" });
    expect(entry.crewFacing).toBe(
      "This agenda isn't available anymore. Ask Doug for a fresh link.",
    );
  });

  test("leaves unmatched placeholders intact and skips null/undefined values", () => {
    const params = { foo: "bar", missing: null, also_missing: undefined };
    expect(
      // The template has no <foo>/<missing> placeholders, so all stay verbatim.
      messageFor("AGENDA_UNAUTHENTICATED", params).crewFacing,
    ).toBe("Your link to this agenda expired. Reopen Doug's latest message to view it.");
  });

  // C0 round-6 M1: pin the renderer-plumbing fix from R5. The R5 plumbing
  // adds hyphen↔underscore key normalization so producers with snake_case
  // context (sheet_name) satisfy hyphenated catalog placeholders
  // (<sheet-name>). These three tests use real placeholder-bearing codes
  // so the assertions would fail if interpolation were removed.
  test("TILE_SERVER_RENDER_FAILED substitutes <sheet-name> from snake_case sheet_name param", () => {
    const entry = messageFor("TILE_SERVER_RENDER_FAILED", { sheet_name: "Demo Show" });
    expect(entry.dougFacing).toContain("*Demo Show*");
    expect(entry.dougFacing).not.toContain("<sheet-name>");
  });

  test("TILE_SERVER_RENDER_FAILED leaves <sheet-name> intact when sheet_name is null", () => {
    const entry = messageFor("TILE_SERVER_RENDER_FAILED", { sheet_name: null });
    expect(entry.dougFacing).toContain("<sheet-name>");
  });

  test("SHOW_FIRST_PUBLISHED substitutes all three placeholders from snake_case context", () => {
    const entry = messageFor("SHOW_FIRST_PUBLISHED", {
      sheet_name: "Spring Conference",
      crew_count: 12,
      show_date: "Apr 6",
    });
    expect(entry.dougFacing).toContain("Spring Conference");
    expect(entry.dougFacing).toContain("_12_");
    expect(entry.dougFacing).toContain("Apr 6");
    expect(entry.dougFacing).not.toContain("<sheet-name>");
    expect(entry.dougFacing).not.toContain("<crew-count>");
    expect(entry.dougFacing).not.toContain("<show-date>");
  });

  test("hyphen-form key (sheet-name) ALSO satisfies the placeholder", () => {
    // Symmetry check: the normalization works either direction.
    const entry = messageFor("SHOW_UNPUBLISHED", { "sheet-name": "Q4 Recap" });
    expect(entry.dougFacing).toContain("Q4 Recap");
    expect(entry.dougFacing).not.toContain("<sheet-name>");
  });
});
