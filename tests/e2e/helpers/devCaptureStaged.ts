/**
 * tests/e2e/helpers/devCaptureStaged.ts — dev-capture staged e2e setup.
 *
 * Puts the shared local DB into the ONBOARDING WIZARD state (app_settings
 * `pending_wizard_session_id` non-null → app/admin/page.tsx precedence 1
 * renders the wizard) with one staged `pending_syncs` row bound to that
 * session, so the REAL Step3 grid renders the sheet card whose "More" opens
 * the real Step3ReviewModal. Insert pattern from
 * tests/e2e/admin-parse-panel.spec.ts:76-93; state capture/restore pattern
 * from helpers/dashboardState.ts (single-worker suite — no concurrent
 * writers). AGENTS invariant 9: every call destructures { data, error }.
 */
import { randomUUID } from "node:crypto";
import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";
import { admin } from "./supabaseAdmin";

const SETTINGS_FIELDS = [
  "watched_folder_id",
  "watched_folder_name",
  "watched_folder_set_by_email",
  "watched_folder_set_at",
  "pending_folder_id",
  "pending_folder_name",
  "pending_folder_set_by_email",
  "pending_folder_set_at",
  "pending_wizard_session_id",
  "pending_wizard_session_at",
] as const;

const priorBySession = new Map<string, Record<string, unknown> | null>();
const sessionByDfid = new Map<string, string>();

/** Write the wizard-pending state. Exposed separately so openStep3Modal can
 *  RE-assert it: the shared local DB has sibling-worktree writers (parallel
 *  agent sessions run onboarding e2e whose Start Over wipes app_settings —
 *  observed live: ONBOARDING_STARTED_OVER landing mid-render). Bursty, so a
 *  re-assert + reload retry rides it out; CI runs are isolated and never hit
 *  this. */
async function assertWizardSettings(sessionId: string): Promise<void> {
  const { error: upErr } = await admin
    .from("app_settings")
    .update({
      pending_folder_id: "seed-fixture-folder",
      pending_folder_name: "Seed fixture folder",
      pending_folder_set_by_email: "seed-mode@fxav.local",
      pending_folder_set_at: new Date().toISOString(),
      pending_wizard_session_id: sessionId,
      pending_wizard_session_at: new Date().toISOString(),
    })
    .eq("id", "default");
  if (upErr) throw new Error(`devCaptureStaged settings update failed: ${upErr.message}`);
}

/** Minimal-but-renderable parse_result: the Step3 card + modal guard every
 *  missing section (spec guard conditions), so title/client suffice. */
const PARSE_RESULT = {
  show: { title: "Dev Capture Staged Show", client_label: "Dev Capture Client" },
} as unknown;

export async function seedStagedRow(): Promise<string> {
  const sessionId = randomUUID();
  const driveFileId = `e2e-devcapture:${randomUUID()}`;

  const { data, error } = await admin
    .from("app_settings")
    .select(SETTINGS_FIELDS.join(", "))
    .eq("id", "default")
    .maybeSingle();
  if (error) throw new Error(`devCaptureStaged settings read failed: ${error.message}`);
  priorBySession.set(sessionId, (data ?? null) as Record<string, unknown> | null);
  sessionByDfid.set(driveFileId, sessionId);

  await assertWizardSettings(sessionId);

  const { error: insErr } = await admin.from("pending_syncs").insert({
    drive_file_id: driveFileId,
    source_kind: "manual",
    base_modified_time: null,
    staged_modified_time: new Date().toISOString(),
    parse_result: PARSE_RESULT,
    triggered_review_items: [],
    warning_summary: "",
    wizard_session_id: sessionId,
  });
  if (insErr) throw new Error(`devCaptureStaged pending_syncs insert failed: ${insErr.message}`);

  // Step3 rows derive from onboarding_scan_manifest (status staged/applied)
  // joined to the session's pending_syncs rows — without the manifest row the
  // wizard renders no card (OnboardingWizard fetchStep3Data contract).
  const { error: maniErr } = await admin.from("onboarding_scan_manifest").insert({
    folder_id: "seed-fixture-folder",
    wizard_session_id: sessionId,
    drive_file_id: driveFileId,
    mime_type: "application/vnd.google-apps.spreadsheet",
    name: "Dev Capture Staged Show",
    status: "staged",
  });
  if (maniErr) throw new Error(`devCaptureStaged manifest insert failed: ${maniErr.message}`);

  return driveFileId;
}

export async function cleanupStagedRow(driveFileId: string): Promise<void> {
  const { error } = await admin.from("pending_syncs").delete().eq("drive_file_id", driveFileId);
  if (error) throw new Error(`devCaptureStaged cleanup delete failed: ${error.message}`);
  const { error: maniDelErr } = await admin
    .from("onboarding_scan_manifest")
    .delete()
    .eq("drive_file_id", driveFileId);
  if (maniDelErr)
    throw new Error(`devCaptureStaged manifest cleanup failed: ${maniDelErr.message}`);

  // Restore the SETTLED dashboard state rather than the captured prior: under
  // sibling-worktree pollution the prior snapshot may itself be a foreign
  // session's mid-onboarding state, and the spec file's afterAll restores the
  // true beforeAll prior anyway.
  const { error: restoreErr } = await admin
    .from("app_settings")
    .update({
      watched_folder_id: "seed-fixture-folder",
      watched_folder_name: "Seed fixture folder",
      watched_folder_set_by_email: "seed-mode@fxav.local",
      watched_folder_set_at: "2026-01-01T12:00:00.000Z",
      pending_folder_id: null,
      pending_folder_name: null,
      pending_folder_set_by_email: null,
      pending_folder_set_at: null,
      pending_wizard_session_id: null,
      pending_wizard_session_at: null,
    })
    .eq("id", "default");
  if (restoreErr)
    throw new Error(`devCaptureStaged settings restore failed: ${restoreErr.message}`);
}

export async function openStep3Modal(page: Page, driveFileId: string): Promise<void> {
  const sessionId = sessionByDfid.get(driveFileId);
  if (sessionId === undefined) throw new Error("openStep3Modal: unknown driveFileId");
  const more = page.getByTestId(`wizard-step3-card-${driveFileId}-more`);
  let lastErr: unknown = null;
  // 10 short attempts beat 4 long ones: the observed local wipe cadence is
  // ~30-60 s (external admin actors on the shared DB), so each assert+goto
  // must land inside a wipe-free window. CI is isolated and passes first try.
  for (let attempt = 0; attempt < 10; attempt += 1) {
    await assertWizardSettings(sessionId); // re-assert against sibling wipes
    await page.goto("/admin?step=3");
    try {
      await expect(more).toBeVisible({ timeout: 3_000 });
      await more.click();
      await page.waitForSelector("[data-step3-review-panel]");
      return;
    } catch (err) {
      lastErr = err;
      const { data: w } = await admin
        .from("app_settings")
        .select("pending_wizard_session_id, watched_folder_id")
        .eq("id", "default")
        .maybeSingle();
      console.error(
        `attempt ${attempt}: settings=${JSON.stringify(w)} body0=${(await page.innerText("body")).slice(0, 60).replace(/\n/g, "|")}`,
      );
    }
  }
  console.error("openStep3Modal final-fail body:", (await page.innerText("body")).slice(0, 700));
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}
