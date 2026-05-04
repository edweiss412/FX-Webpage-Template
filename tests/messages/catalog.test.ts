import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

import { MESSAGE_CATALOG, messageFor, type MessageCode } from "@/lib/messages/lookup";

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
  "REPORT_ORPHANED_LOST_LEASE",
  "GITHUB_BOT_LOGIN_MISSING",
  "REPORT_LEASE_THRASHING",
  "TILE_SERVER_RENDER_FAILED",
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

  test("returns immutable catalog entries by code", () => {
    expect(messageFor("OAUTH_STATE_INVALID")).toMatchObject({
      code: "OAUTH_STATE_INVALID",
      crewFacing: "Something interrupted your sign-in. Please click the original link from Doug again to start over.",
    });
  });

  test("covers every code producer in auth/data/API routes", () => {
    const missing = producedCodes().filter((code) => !(code in MESSAGE_CATALOG));
    expect(missing).toEqual([]);
  });
});
