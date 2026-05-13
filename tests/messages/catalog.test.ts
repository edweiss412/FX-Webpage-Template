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
  "LINK_NO_CREW_MATCH",
  "LINK_VERSION_MISMATCH",
  "LINK_REVOKED_FLOOR",
  "LINK_REVOKED_SURGICAL",
  "SESSION_NOT_FOUND",
  "SESSION_ABSOLUTE_TIMEOUT",
  "SESSION_IDLE_TIMEOUT",
  "LINK_SESSION_KEY_ROTATED",
  "LINK_REDEEM_KEY_ROTATED",
  "AMBIGUOUS_EMAIL_BINDING",
  "LEAKED_LINK_DETECTED",
  "CSRF_DENIED",
  "CSRF_NONCE_EXPIRED",
  "CSRF_KEY_ROTATED",
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
    "middleware.ts",
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
      followUp: "Crew -> message Doug",
      helpfulContext: null,
    });
  });

  test("AGENDA_UNAUTHENTICATED carries the ratified §12.4 amendment copy", () => {
    expect(messageFor("AGENDA_UNAUTHENTICATED")).toMatchObject({
      code: "AGENDA_UNAUTHENTICATED",
      dougFacing: null,
      crewFacing: "Your link to this agenda expired. Reopen Doug's latest message to view it.",
      followUp: "Crew -> reopen signed link",
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
});
