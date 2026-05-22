import { test } from "@playwright/test";
import { captureAll } from "@/scripts/help-screenshots";

test("capture help screenshots from manifest", async () => {
  await captureAll();
});
