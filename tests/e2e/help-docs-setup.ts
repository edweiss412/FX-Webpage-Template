// Help-docs setup deliberately diverges from screenshots-help setup.
// Screenshot capture needs dashboard state; the deep-link affordance walker
// also needs /admin to be wizard-renderable so the onboarding matrix rows
// materialize in the browser.
import { expect, test } from "@playwright/test";
import { spawnSync } from "node:child_process";
import { admin } from "./helpers/supabaseAdmin";

const HELP_DOCS_WIZARD_SESSION_ID = "22222222-2222-4222-8222-222222222222";

test("seed help-docs DB with wizard-active /admin state", async () => {
  expect(process.env.ENABLE_TEST_AUTH).toBe("true");
  expect(process.env.TEST_AUTH_SECRET).toBe("test-secret-fixture");

  const result = spawnSync("pnpm", ["db:seed"], {
    stdio: "inherit",
    shell: false,
  });
  expect(result.status, `pnpm db:seed exited with status ${result.status}`).toBe(0);

  const { data, error } = await admin
    .from("app_settings")
    .update({
      watched_folder_id: null,
      watched_folder_name: null,
      watched_folder_set_by_email: null,
      watched_folder_set_at: null,
      pending_folder_id: null,
      pending_folder_name: null,
      pending_folder_set_by_email: null,
      pending_folder_set_at: null,
      pending_wizard_session_id: HELP_DOCS_WIZARD_SESSION_ID,
      pending_wizard_session_at: new Date().toISOString(),
    })
    .eq("id", "default")
    .select("watched_folder_id, pending_wizard_session_id")
    .single();

  expect(error, `help-docs wizard-state seed failed: ${error?.message ?? ""}`).toBeNull();
  expect(data?.watched_folder_id).toBeNull();
  expect(data?.pending_wizard_session_id).toBe(HELP_DOCS_WIZARD_SESSION_ID);
});
