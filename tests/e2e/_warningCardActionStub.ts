/**
 * tests/e2e/_warningCardActionStub.ts (warning-card-fixes plan Task 15)
 *
 * Browser stand-in for the two staged server actions the Save flow calls, swapped in by
 * the bundler's alias map (tests/e2e/_step3ReviewModalBundle.mjs, fourth argument) for
 * `@/app/admin/onboarding/_actions/useRawStaged` and
 * `@/app/admin/onboarding/_actions/stagedWarningIgnore`. Each records its call on
 * `window.__warningCardCalls` and resolves `window.__warningCardActions[name]` when a
 * spec sets one, else success. Never imported by app code.
 */
declare global {
  interface Window {
    __warningCardActions?: Record<string, unknown>;
    __warningCardCalls?: Array<{ name: string; args: unknown[] }>;
  }
}

function record(name: string, args: unknown[]): void {
  (window.__warningCardCalls ??= []).push({ name, args });
}

export async function setStagedUseRawDecisionAction(...args: unknown[]): Promise<unknown> {
  record("setStagedUseRawDecisionAction", args);
  return window.__warningCardActions?.setStagedUseRawDecisionAction ?? { ok: true };
}

export async function setStagedWarningIgnore(...args: unknown[]): Promise<unknown> {
  record("setStagedWarningIgnore", args);
  return window.__warningCardActions?.setStagedWarningIgnore ?? { ok: true, state: "ignored" };
}
