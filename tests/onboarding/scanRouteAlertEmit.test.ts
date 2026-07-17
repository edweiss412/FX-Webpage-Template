// Flow-1 §1.3: the onboarding scan route emits ONBOARDING_SHEET_UNREADABLE when a
// completed scan contains ≥1 hard_failed file. Post-commit, own try/catch, one
// alert per scan, last-write-wins context (folder_id, wizard_session_id,
// failed_drive_file_ids). Harness copied from tests/onboarding/scanRoute.test.ts
// (its FakeScanDb/deps/request/readNdjson helpers are local, not exported).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/adminAlerts/upsertAdminAlert", () => ({
  upsertAdminAlert: vi.fn().mockResolvedValue("alert-id"),
}));
vi.mock("@/lib/log/logAdminOutcome", () => ({
  logAdminOutcome: vi.fn().mockResolvedValue(undefined),
}));

import type { OnboardingScanResult } from "@/lib/sync/runOnboardingScan";
import { WIZARD_SESSION_SUPERSEDED_DURING_SCAN } from "@/lib/sync/runOnboardingScan";
import type {
  FolderVerificationResult,
  OnboardingScanRouteTx,
  ScanRouteDeps,
} from "@/app/api/admin/onboarding/scan/route";
import { handleOnboardingScan } from "@/app/api/admin/onboarding/scan/route";
import { upsertAdminAlert } from "@/lib/adminAlerts/upsertAdminAlert";
import { logAdminOutcome } from "@/lib/log/logAdminOutcome";

const W1 = "11111111-1111-4111-8111-111111111111";
const RUN_FOLDER = "folder-1";

function request(folderUrl: string): Request {
  return new Request("https://crew.fxav.test/api/admin/onboarding/scan", {
    method: "POST",
    body: JSON.stringify({ folderUrl }),
    headers: { "content-type": "application/json" },
  });
}

function okFolder(id = RUN_FOLDER): FolderVerificationResult {
  return { ok: true, folderId: id, folderName: "FXAV Onboarding" };
}

class FakeScanDb implements OnboardingScanRouteTx {
  settings = {
    pending_wizard_session_id: null as string | null,
    pending_wizard_session_at: null as string | null,
    pending_folder_id: null as string | null,
  };

  async query<T>(sql: string, params: readonly unknown[] = []) {
    const normalized = sql.replace(/\s+/g, " ").trim();
    if (normalized.startsWith("select pending_wizard_session_id")) {
      return { rows: [this.settings as T], rowCount: 1 };
    }
    if (normalized.startsWith("update public.app_settings")) {
      this.settings = {
        pending_wizard_session_id: params[0] as string,
        pending_wizard_session_at: "DB_NOW",
        pending_folder_id: params[1] as string,
      };
      return { rows: [this.settings as T], rowCount: 1 };
    }
    if (normalized.startsWith("delete from public.")) {
      return { rows: [], rowCount: 0 };
    }
    throw new Error(`Unhandled SQL in fake scan route tx: ${normalized}`);
  }

  clone(): FakeScanDb {
    const next = new FakeScanDb();
    next.settings = { ...this.settings };
    return next;
  }
  restore(snapshot: FakeScanDb): void {
    this.settings = { ...snapshot.settings };
  }
}

function deps(db: FakeScanDb, overrides: Partial<ScanRouteDeps> = {}): ScanRouteDeps {
  const emptyCompleted: OnboardingScanResult = { outcome: "completed", processed: [] };
  return {
    requireAdminIdentity: vi.fn(async () => ({ email: "doug@example.com" })),
    randomUUID: () => W1,
    verifyFolder: vi.fn(async () => okFolder()),
    withTx: async (fn) => {
      const snapshot = db.clone();
      try {
        return await fn(db);
      } catch (error) {
        db.restore(snapshot);
        throw error;
      }
    },
    runOnboardingScan: vi.fn(async () => emptyCompleted),
    ...overrides,
  };
}

async function readNdjson(response: Response): Promise<unknown[]> {
  const text = await response.text();
  return text
    .split("\n")
    .filter((l) => l.trim().length > 0)
    .map((l) => JSON.parse(l));
}

const FOLDER_URL = `https://drive.google.com/drive/folders/${RUN_FOLDER}`;

function driveResult(processed: OnboardingScanResult): ScanRouteDeps {
  return deps(new FakeScanDb(), { runOnboardingScan: vi.fn(async () => processed) });
}

describe("onboarding scan route — ONBOARDING_SHEET_UNREADABLE emit", () => {
  beforeEach(() => {
    vi.mocked(upsertAdminAlert).mockClear().mockResolvedValue("alert-id");
    vi.mocked(logAdminOutcome).mockClear().mockResolvedValue(undefined);
  });
  afterEach(() => vi.restoreAllMocks());

  it("emits exactly one alert when the completed scan has ≥1 hard_failed", async () => {
    const result: OnboardingScanResult = {
      outcome: "completed",
      processed: [
        { driveFileId: "d-b", name: "d-b.xlsx", outcome: "hard_failed" },
        { driveFileId: "d-a", name: "d-a.xlsx", outcome: "hard_failed" },
        { driveFileId: "d-ok", name: "d-ok.xlsx", outcome: "staged" },
      ],
    };
    await readNdjson(await handleOnboardingScan(request(FOLDER_URL), driveResult(result)));

    expect(vi.mocked(upsertAdminAlert)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(upsertAdminAlert)).toHaveBeenCalledWith({
      showId: null,
      code: "ONBOARDING_SHEET_UNREADABLE",
      context: {
        folder_id: RUN_FOLDER,
        wizard_session_id: W1,
        failed_drive_file_ids: ["d-a", "d-b"],
        failed_sheet_names: ["d-a.xlsx", "d-b.xlsx"],
      },
    });
  });

  it("emits failed_sheet_names index-aligned to failed_drive_file_ids (both id-sorted)", async () => {
    // Names given in an order deliberately different from sorted id order, so a
    // naive parallel-array emit would misalign. Expected pairs are derived from
    // the fixture (anti-tautology): d-a→Alpha, d-b→Bravo, d-c→Charlie.
    const result: OnboardingScanResult = {
      outcome: "completed",
      processed: [
        { driveFileId: "d-b", name: "Bravo", outcome: "hard_failed" },
        { driveFileId: "d-c", name: "Charlie", outcome: "hard_failed" },
        { driveFileId: "d-a", name: "Alpha", outcome: "hard_failed" },
        { driveFileId: "d-ok", name: "OK Sheet", outcome: "staged" },
      ],
    };
    await readNdjson(await handleOnboardingScan(request(FOLDER_URL), driveResult(result)));

    expect(vi.mocked(upsertAdminAlert)).toHaveBeenCalledWith(
      expect.objectContaining({
        code: "ONBOARDING_SHEET_UNREADABLE",
        context: expect.objectContaining({
          failed_drive_file_ids: ["d-a", "d-b", "d-c"],
          failed_sheet_names: ["Alpha", "Bravo", "Charlie"],
        }),
      }),
    );
  });

  it("does NOT emit when no file hard_failed (incl. live_row_conflict only)", async () => {
    const result: OnboardingScanResult = {
      outcome: "completed",
      processed: [
        { driveFileId: "d-ok", name: "d-ok.xlsx", outcome: "staged" },
        { driveFileId: "d-lrc", name: "d-lrc.xlsx", outcome: "live_row_conflict" },
      ],
    };
    await readNdjson(await handleOnboardingScan(request(FOLDER_URL), driveResult(result)));
    expect(vi.mocked(upsertAdminAlert)).not.toHaveBeenCalledWith(
      expect.objectContaining({ code: "ONBOARDING_SHEET_UNREADABLE" }),
    );
  });

  it("does NOT emit on a non-completed outcome even if it carried hard_failed", async () => {
    const result: OnboardingScanResult = {
      outcome: "superseded",
      code: WIZARD_SESSION_SUPERSEDED_DURING_SCAN,
      processed: [{ driveFileId: "d-a", name: "d-a.xlsx", outcome: "hard_failed" }],
    };
    await readNdjson(await handleOnboardingScan(request(FOLDER_URL), driveResult(result)));
    expect(vi.mocked(upsertAdminAlert)).not.toHaveBeenCalledWith(
      expect.objectContaining({ code: "ONBOARDING_SHEET_UNREADABLE" }),
    );
  });

  it("logAdminOutcome throw does NOT suppress the alert (direction 1)", async () => {
    vi.mocked(logAdminOutcome).mockRejectedValue(new Error("log boom"));
    const result: OnboardingScanResult = {
      outcome: "completed",
      processed: [{ driveFileId: "d-a", name: "d-a.xlsx", outcome: "hard_failed" }],
    };
    await readNdjson(await handleOnboardingScan(request(FOLDER_URL), driveResult(result)));
    expect(vi.mocked(upsertAdminAlert)).toHaveBeenCalledWith(
      expect.objectContaining({ code: "ONBOARDING_SHEET_UNREADABLE" }),
    );
  });

  it("alert throw does NOT 500 or suppress logAdminOutcome (direction 2)", async () => {
    vi.mocked(upsertAdminAlert).mockRejectedValue(new Error("alert boom"));
    const result: OnboardingScanResult = {
      outcome: "completed",
      processed: [{ driveFileId: "d-a", name: "d-a.xlsx", outcome: "hard_failed" }],
    };
    const messages = await readNdjson(
      await handleOnboardingScan(request(FOLDER_URL), driveResult(result)),
    );
    const last = messages.at(-1) as { type?: string };
    expect(last?.type).toBe("result");
    expect(vi.mocked(logAdminOutcome)).toHaveBeenCalled();
  });
});
