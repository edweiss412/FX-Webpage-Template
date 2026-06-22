import { describe, it, expect } from "vitest";
import { extractAdminLogOnlyCodes } from "@/scripts/extract-admin-log-only-codes";

describe("extractAdminLogOnlyCodes — null-cell normalization (Doug AND Crew)", () => {
  it("classifies literal em-dash in both Doug and Crew as admin-log-only", () => {
    const src = "| `X` | sync race | — | — | none |";
    expect(extractAdminLogOnlyCodes(src)).toEqual(["X"]);
  });

  it("classifies empty Doug + Crew cells as admin-log-only", () => {
    const src = "| `X` | sync race |  |  | none |";
    expect(extractAdminLogOnlyCodes(src)).toEqual(["X"]);
  });

  it("classifies '(admin log only — hint)' parenthetical in Doug + em-dash Crew as admin-log-only", () => {
    const src = "| `X` | sync race | (admin log only — transient) | — | none |";
    expect(extractAdminLogOnlyCodes(src)).toEqual(["X"]);
  });

  it("does NOT classify a real Doug-facing message as admin-log-only", () => {
    const src = "| `X` | sync race | Refresh the admin page. | — | Doug -> refresh |";
    expect(extractAdminLogOnlyCodes(src)).toEqual([]);
  });

  it("does NOT classify codes with non-null Crew copy (Doug-only operator hint, Crew sees something)", () => {
    const src = "| `X` | login | (operator log only — debug) | Try again. | Crew -> retry |";
    expect(extractAdminLogOnlyCodes(src)).toEqual([]);
  });

  it("does NOT classify pseudo-null sentinels (null / none / n/a) in Doug", () => {
    expect(extractAdminLogOnlyCodes("| `X` | s | null | — | none |")).toEqual([]);
    expect(extractAdminLogOnlyCodes("| `X` | s | none | — | none |")).toEqual([]);
    expect(extractAdminLogOnlyCodes("| `X` | s | n/a | — | none |")).toEqual([]);
  });

  it("does NOT classify retired (strikethrough) rows like ~~`CODE`~~", () => {
    const src = "| ~~`X`~~ | sync race | — | — | — |";
    expect(extractAdminLogOnlyCodes(src)).toEqual([]);
  });

  it("does NOT classify rows outside §12.4 (e.g., DDL or RPC tables) when section slicing is on", () => {
    const src = [
      "## 4. Database",
      "",
      "| `Y` | some surface | — | — | none |",
      "",
      "### 12.4 User-facing message catalog",
      "",
      "| `X` | sync race | — | — | none |",
      "",
      "## 13. Bug reporting",
    ].join("\n");
    expect(extractAdminLogOnlyCodes(src)).toEqual(["X"]);
  });

  it("respects escaped pipes (\\|) inside cells — Doug stays at cells[2] (r6 regression fixture)", () => {
    const src =
      "| `X` | http_status: number \\| null, last_auth: timestamptz \\| null | (admin log only — operator) | — | Eric -> rotate creds |";
    expect(extractAdminLogOnlyCodes(src)).toEqual(["X"]);
  });
});

describe("extractAdminLogOnlyCodes — live master spec", () => {
  it("derives a non-empty set from docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const masterSpec = readFileSync(
      join(process.cwd(), "docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md"),
      "utf8",
    );
    const codes = extractAdminLogOnlyCodes(masterSpec);
    expect(codes.length).toBeGreaterThan(10);
    expect(codes).toContain("STALE_WRITE_ABORTED");
    expect(codes).toContain("CONCURRENT_SYNC_SKIPPED");
    expect(codes).toContain("DIAGRAMS_EMBEDDED_CAP_EXCEEDED");
    expect(codes).not.toContain("STALE_MANUAL_REPLAY_ABORTED");
    // Master-spec lines 2829-2830 carry real Doug-facing copy for both
    // pending-snapshot stuck rows, so they are not admin-log-only.
    expect(codes).not.toContain("PENDING_SNAPSHOT_PROMOTE_STUCK");
    expect(codes).not.toContain("PENDING_SNAPSHOT_ROLLBACK_STUCK");
    // X.6 branch-protection alerts carry real Doug-facing copy, so they are
    // operator alerts but not admin-log-only §12.4 rows.
    expect(codes).not.toContain("BRANCH_PROTECTION_DRIFT");
    expect(codes).not.toContain("BRANCH_PROTECTION_MONITOR_AUTH_FAILED");
  });
});
