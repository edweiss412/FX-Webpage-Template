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
import { execFileSync } from "node:child_process";
import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";
import { admin } from "./supabaseAdmin";

// Locked-fixture transport (helpers/lockedCrewRestriction.ts pattern): every
// pending_syncs mutation runs in a psql transaction holding the per-show
// advisory lock — tests/help/walker-routes.test.ts forbids unlocked PostgREST
// DML on locked tables under tests/e2e/.
const databaseUrl =
  process.env.TEST_DATABASE_URL ??
  process.env.DATABASE_URL ??
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

function sqlString(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function runLockedSql(driveFileId: string, body: string, label: string): void {
  const sql = `
    begin;
    select pg_advisory_xact_lock(hashtext('show:' || ${sqlString(driveFileId)}));
    ${body}
    commit;
  `;
  try {
    execFileSync("psql", [databaseUrl, "-v", "ON_ERROR_STOP=1", "-At"], {
      input: sql,
      encoding: "utf8",
    });
  } catch (err) {
    throw new Error(
      `devCaptureStaged ${label} failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

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

  // Rows first, settings LAST: if either insert throws, app_settings is still
  // settled (no half-seeded wizard-pending state to strand).
  try {
    runLockedSql(
      driveFileId,
      `insert into public.pending_syncs
       (drive_file_id, source_kind, base_modified_time, staged_modified_time,
        parse_result, triggered_review_items, warning_summary, wizard_session_id)
     values
       (${sqlString(driveFileId)}, 'manual', null, now(),
        ${sqlString(JSON.stringify(PARSE_RESULT))}::jsonb, '[]'::jsonb, '',
        ${sqlString(sessionId)}::uuid);`,
      "pending_syncs insert",
    );
  } catch (err) {
    priorBySession.delete(sessionId);
    sessionByDfid.delete(driveFileId);
    throw err;
  }

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
  if (maniErr) {
    await cleanupStagedRow(driveFileId).catch(() => undefined);
    throw new Error(`devCaptureStaged manifest insert failed: ${maniErr.message}`);
  }

  try {
    await assertWizardSettings(sessionId);
  } catch (err) {
    // Ambiguous transport failure: the update may or may not have committed.
    // Full cleanup (best-effort) restores the settled state either way.
    await cleanupStagedRow(driveFileId).catch(() => undefined);
    throw err;
  }

  return driveFileId;
}

export async function cleanupStagedRow(driveFileId: string): Promise<void> {
  // Failure-safe teardown: run EVERY step, collect failures, throw at the end -
  // an early throw must not strand the settings row in wizard-pending state.
  const errors: string[] = [];
  try {
    runLockedSql(
      driveFileId,
      `delete from public.pending_syncs where drive_file_id = ${sqlString(driveFileId)};`,
      "pending_syncs cleanup",
    );
  } catch (err) {
    errors.push(String(err));
  }
  try {
    const { error: maniDelErr } = await admin
      .from("onboarding_scan_manifest")
      .delete()
      .eq("drive_file_id", driveFileId);
    if (maniDelErr) errors.push(`manifest cleanup failed: ${maniDelErr.message}`);
  } catch (err) {
    errors.push(`manifest cleanup threw: ${String(err)}`);
  }

  // Restore the SETTLED dashboard state rather than the captured prior: under
  // sibling-worktree pollution the prior snapshot may itself be a foreign
  // session's mid-onboarding state, and the spec file's afterAll restores the
  // true beforeAll prior anyway.
  let restoreErrMsg: string | null = null;
  try {
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
    restoreErrMsg = restoreErr?.message ?? null;
  } catch (err) {
    restoreErrMsg = String(err);
  }
  if (restoreErrMsg !== null) errors.push(`settings restore failed: ${restoreErrMsg}`);
  const sessionId = sessionByDfid.get(driveFileId);
  if (sessionId !== undefined) priorBySession.delete(sessionId);
  sessionByDfid.delete(driveFileId);
  if (errors.length > 0) throw new Error(`devCaptureStaged cleanup: ${errors.join("; ")}`);
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
      const { data: w, error: wErr } = await admin
        .from("app_settings")
        .select("pending_wizard_session_id, watched_folder_id")
        .eq("id", "default")
        .maybeSingle();
      console.error(
        `attempt ${attempt}: settings=${JSON.stringify(w)} settingsErr=${wErr?.message ?? "none"} body0=${(await page.innerText("body")).slice(0, 60).replace(/\n/g, "|")}`,
      );
    }
  }
  console.error("openStep3Modal final-fail body:", (await page.innerText("body")).slice(0, 700));
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}
