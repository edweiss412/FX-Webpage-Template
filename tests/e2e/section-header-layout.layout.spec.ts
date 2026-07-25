/**
 * Section-header layout probe (plan T0 smoke; real cases land in T2/T4).
 *
 * Runs under tests/e2e/standalone.config.ts — no dev server, no database. The
 * config's `testMatch` is an explicit allow-list, so this file's name must appear
 * there or it runs nowhere and silently proves nothing.
 */
import { expect, test } from "@playwright/test";

test("T0 smoke: the section-header spec is discovered and executes", async () => {
  expect(true).toBe(true);
});
