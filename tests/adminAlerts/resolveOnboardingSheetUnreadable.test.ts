import { describe, expect, it, vi } from "vitest";
import {
  resolveOpenUnreadableAlertUnconditionally,
  resolveUnreadableAlertIfHealed,
  type HealInput,
  type ResolveSql,
} from "@/lib/adminAlerts/resolveOnboardingSheetUnreadable";

// Router-based fakeSql mirroring tests/notify/recovery-resolution.test.ts: a
// vi.fn implementing the tagged-template signature that routes each query to a
// handler (so a single test can seed distinct rows per query) and captures
// `calls[].text`/`.values`.
function fakeSql(handler: (text: string, values: unknown[]) => Array<Record<string, unknown>>) {
  const calls: Array<{ text: string; values: unknown[] }> = [];
  const sql = vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => {
    const text = String.raw(strings, ...values.map((_v, i) => `$${i + 1}`));
    calls.push({ text, values });
    return Promise.resolve(handler(text, values));
  }) as unknown as ResolveSql;
  return { sql, calls };
}

const isOpenSelect = (t: string) =>
  /select\s+id,\s*context,\s*last_seen_at[\s\S]*from\s+public\.admin_alerts/i.test(t);
const isCleanSelect = (t: string) =>
  /select\s+id,\s*last_seen_at[\s\S]*from\s+public\.admin_alerts/i.test(t) && !/context/i.test(t);
const isSettings = (t: string) =>
  /pending_wizard_session_id\s+from\s+public\.app_settings/i.test(t);
const isRegistered = (t: string) => /from\s+public\.shows\s+where\s+drive_file_id/i.test(t);
const isStaged = (t: string) => /from\s+public\.pending_syncs/i.test(t);
const isUpdate = (t: string) =>
  /update\s+public\.admin_alerts\s+set\s+resolved_at\s*=\s*now\(\)/i.test(t);

const FOLDER = "folder-x";
function healInput(over: Partial<HealInput> = {}): HealInput {
  return { activeFolderId: FOLDER, listedFiles: new Map(), ...over };
}

describe("resolveOpenUnreadableAlertUnconditionally", () => {
  it("reads the open row then issues a last_seen_at-CAS'd UPDATE and resolves", async () => {
    const { sql, calls } = fakeSql((t) => {
      if (isCleanSelect(t)) return [{ id: "a-1", last_seen_at: "2026-07-16 00:00:00.123456+00" }];
      if (isUpdate(t)) return [{ id: "a-1" }];
      return [];
    });
    await expect(resolveOpenUnreadableAlertUnconditionally(sql)).resolves.toEqual({
      kind: "ok",
      resolved: true,
    });
    expect(calls).toHaveLength(2);
    expect(calls[0]!.text).toMatch(/select\s+id,\s*last_seen_at/i);
    expect(calls[0]!.text).toMatch(/code\s*=\s*'ONBOARDING_SHEET_UNREADABLE'/i);
    expect(calls[0]!.text).toMatch(/show_id\s+is\s+null/i);
    expect(calls[1]!.text).toMatch(
      /update\s+public\.admin_alerts\s+set\s+resolved_at\s*=\s*now\(\)/i,
    );
    // CAS: the UPDATE binds the observed last_seen_at and guards on it.
    expect(calls[1]!.text).toMatch(/last_seen_at::text\s*=\s*\$/i);
    expect(calls[1]!.values).toContain("2026-07-16 00:00:00.123456+00");
  });

  it("resolves=false when no open row matched (no UPDATE issued)", async () => {
    const { sql, calls } = fakeSql(() => []);
    await expect(resolveOpenUnreadableAlertUnconditionally(sql)).resolves.toEqual({
      kind: "ok",
      resolved: false,
    });
    expect(calls).toHaveLength(1); // select only; no UPDATE
    expect(calls.some((c) => isUpdate(c.text))).toBe(false);
  });

  it("resolves=false when a concurrent re-emit bumped last_seen_at between read and UPDATE (CAS race, whole-diff R1)", async () => {
    const { sql, calls } = fakeSql((t) => {
      if (isCleanSelect(t)) return [{ id: "a-1", last_seen_at: "2026-07-16 00:00:00.111111+00" }];
      if (isUpdate(t)) return []; // CAS guard matched nothing — row was replaced/bumped
      return [];
    });
    await expect(resolveOpenUnreadableAlertUnconditionally(sql)).resolves.toEqual({
      kind: "ok",
      resolved: false,
    });
    expect(calls).toHaveLength(2); // select + attempted (no-op) UPDATE
  });

  it("returns infra_error (never throws) when the query throws", async () => {
    const sql = vi.fn(() => {
      throw new Error("boom");
    }) as unknown as ResolveSql;
    await expect(resolveOpenUnreadableAlertUnconditionally(sql)).resolves.toEqual({
      kind: "infra_error",
    });
  });
});

describe("resolveUnreadableAlertIfHealed", () => {
  it("no open row -> resolved:false and NO query beyond the open-alert fetch", async () => {
    const { sql, calls } = fakeSql((t) => {
      if (isOpenSelect(t)) return [];
      throw new Error("no further query expected");
    });
    await expect(resolveUnreadableAlertIfHealed(healInput(), sql)).resolves.toEqual({
      kind: "ok",
      resolved: false,
    });
    expect(calls).toHaveLength(1);
    expect(isOpenSelect(calls[0]!.text)).toBe(true);
  });

  it("pending wizard session -> no UPDATE, resolved:false (open precedes settings)", async () => {
    const { sql, calls } = fakeSql((t) => {
      if (isOpenSelect(t))
        return [
          {
            id: "a-1",
            context: { folder_id: FOLDER, failed_drive_file_ids: ["d-a"] },
            last_seen_at: "T0",
          },
        ];
      if (isSettings(t)) return [{ pending_wizard_session_id: "wiz-1" }];
      throw new Error("no query expected after settings when wizard pending");
    });
    await expect(resolveUnreadableAlertIfHealed(healInput(), sql)).resolves.toEqual({
      kind: "ok",
      resolved: false,
    });
    expect(calls).toHaveLength(2);
    expect(isOpenSelect(calls[0]!.text)).toBe(true);
    expect(isSettings(calls[1]!.text)).toBe(true);
    expect(calls.some((c) => isUpdate(c.text))).toBe(false);
  });

  it("folder mismatch -> stale, resolves without inspecting ids", async () => {
    const { sql, calls } = fakeSql((t) => {
      if (isOpenSelect(t))
        return [
          {
            id: "a-1",
            context: { folder_id: "other-folder", failed_drive_file_ids: ["d-a"] },
            last_seen_at: "T0",
          },
        ];
      if (isSettings(t)) return [{ pending_wizard_session_id: null }];
      if (isUpdate(t)) return [{ id: "a-1" }];
      throw new Error(`unexpected query: ${t}`);
    });
    await expect(resolveUnreadableAlertIfHealed(healInput(), sql)).resolves.toEqual({
      kind: "ok",
      resolved: true,
    });
    // No per-id healing queries fired (folder mismatch short-circuits).
    expect(calls.some((c) => isRegistered(c.text) || isStaged(c.text))).toBe(false);
    expect(calls.some((c) => isUpdate(c.text))).toBe(true);
  });

  it("empty failed_drive_file_ids -> keep open (resolved:false), no UPDATE", async () => {
    const { sql, calls } = fakeSql((t) => {
      if (isOpenSelect(t))
        return [
          {
            id: "a-1",
            context: { folder_id: FOLDER, failed_drive_file_ids: [] },
            last_seen_at: "T0",
          },
        ];
      if (isSettings(t)) return [{ pending_wizard_session_id: null }];
      throw new Error(`unexpected query: ${t}`);
    });
    await expect(resolveUnreadableAlertIfHealed(healInput(), sql)).resolves.toEqual({
      kind: "ok",
      resolved: false,
    });
    expect(calls.some((c) => isUpdate(c.text))).toBe(false);
  });

  it("malformed failed_drive_file_ids element (non-string) -> keep open, no heal/UPDATE (whole-diff R2)", async () => {
    // A malformed element (e.g. a number) must NOT be treated as absent-from-folder
    // (which would read as 'healed') and must NOT auto-resolve a still-failing alert.
    const { sql, calls } = fakeSql((t) => {
      if (isOpenSelect(t))
        return [
          {
            id: "a-1",
            context: { folder_id: FOLDER, failed_drive_file_ids: ["d-a", 123] },
            last_seen_at: "T0",
          },
        ];
      if (isSettings(t)) return [{ pending_wizard_session_id: null }];
      throw new Error(`unexpected query on malformed ids: ${t}`);
    });
    await expect(resolveUnreadableAlertIfHealed(healInput(), sql)).resolves.toEqual({
      kind: "ok",
      resolved: false,
    });
    // No per-id healing queries, no UPDATE — we bail before inspecting ids.
    expect(calls.some((c) => isRegistered(c.text) || isStaged(c.text) || isUpdate(c.text))).toBe(
      false,
    );
  });

  it("all ids healed (removed / registered / current-revision-staged) -> resolve", async () => {
    // d-removed: absent from listedFiles -> healed. d-reg: registered show ->
    // healed. d-staged: current-revision staged (staged_modified_time matches).
    const listed = new Map<string, string>([
      ["d-reg", "2026-06-11T00:00:00.000Z"],
      ["d-staged", "2026-06-11T00:00:00.000Z"],
    ]);
    const { sql, calls } = fakeSql((t, values) => {
      if (isOpenSelect(t))
        return [
          {
            id: "a-1",
            context: {
              folder_id: FOLDER,
              failed_drive_file_ids: ["d-removed", "d-reg", "d-staged"],
            },
            last_seen_at: "T0",
          },
        ];
      if (isSettings(t)) return [{ pending_wizard_session_id: null }];
      if (isRegistered(t)) return values[0] === "d-reg" ? [{ one: 1 }] : [];
      if (isStaged(t)) return values[0] === "d-staged" ? [{ one: 1 }] : [];
      if (isUpdate(t)) return [{ id: "a-1" }];
      return [];
    });
    await expect(
      resolveUnreadableAlertIfHealed(healInput({ listedFiles: listed }), sql),
    ).resolves.toEqual({ kind: "ok", resolved: true });
    // Assert staged predicate shape (R1-1) + CAS on last_seen_at (R1-2).
    const stagedCall = calls.find((c) => isStaged(c.text))!;
    expect(stagedCall.text).toMatch(/wizard_session_id\s+is\s+null/i);
    expect(stagedCall.text).toMatch(/staged_modified_time\s*=\s*\$\d/i);
    expect(stagedCall.values).toContain("2026-06-11T00:00:00.000Z");
    const updateCall = calls.find((c) => isUpdate(c.text))!;
    expect(updateCall.text).toMatch(/last_seen_at::text\s*=\s*\$\d/i);
    expect(updateCall.values).toContain("T0");
  });

  it("one id still failing (listed, unregistered, no current-revision staged) -> no resolve", async () => {
    const listed = new Map<string, string>([["d-fail", "2026-06-11T00:00:00.000Z"]]);
    const { sql, calls } = fakeSql((t, values) => {
      if (isOpenSelect(t))
        return [
          {
            id: "a-1",
            context: { folder_id: FOLDER, failed_drive_file_ids: ["d-fail"] },
            last_seen_at: "T0",
          },
        ];
      if (isSettings(t)) return [{ pending_wizard_session_id: null }];
      if (isRegistered(t)) return [];
      if (isStaged(t)) {
        void values;
        return []; // no current-revision staged row -> still failing
      }
      return [];
    });
    await expect(
      resolveUnreadableAlertIfHealed(healInput({ listedFiles: listed }), sql),
    ).resolves.toEqual({
      kind: "ok",
      resolved: false,
    });
    expect(calls.some((c) => isUpdate(c.text))).toBe(false);
  });

  it("CAS-race: intervening upsert bumped last_seen_at so the guarded UPDATE hits 0 rows -> resolved:false", async () => {
    const listed = new Map<string, string>(); // no ids listed -> all healed
    const { sql, calls } = fakeSql((t) => {
      if (isOpenSelect(t))
        return [
          {
            id: "a-1",
            context: { folder_id: FOLDER, failed_drive_file_ids: ["d-a"] },
            last_seen_at: "T0",
          },
        ];
      if (isSettings(t)) return [{ pending_wizard_session_id: null }];
      if (isUpdate(t)) return []; // guarded on last_seen_at = T0, but row moved -> 0 rows
      return [];
    });
    await expect(
      resolveUnreadableAlertIfHealed(healInput({ listedFiles: listed }), sql),
    ).resolves.toEqual({
      kind: "ok",
      resolved: false,
    });
    const updateCall = calls.find((c) => isUpdate(c.text))!;
    expect(updateCall.values).toContain("T0");
  });

  it("returns infra_error (never throws) when a query throws", async () => {
    const sql = vi.fn(() => {
      throw new Error("boom");
    }) as unknown as ResolveSql;
    await expect(resolveUnreadableAlertIfHealed(healInput(), sql)).resolves.toEqual({
      kind: "infra_error",
    });
  });
});
