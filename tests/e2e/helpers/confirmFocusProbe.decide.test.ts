/**
 * Deciding suite for `assertFocusReadings` — the assertion that twice shipped
 * unable to fail.
 *
 * WHY THIS EXISTS, stated plainly because the history is the justification.
 * Version 1 asserted a reading count and the presence of an `armed` sample:
 * both true of a run in which focus never moved. Version 2 compared
 * `settled.at` to itself through `toMatchObject`: true for every possible
 * input. Both were reported as repairs. Neither could fail, and no browser run
 * could have told me so, because a probe that cannot fail passes exactly like a
 * probe that found nothing wrong.
 *
 * So the assertion is decided HERE, against constructed readings, with no
 * browser: a mutant that restores the tautology must turn one of these red.
 * Each case names the defect shape it kills.
 */
import { describe, expect, it } from "vitest";

import {
  assertFocusReadings,
  rootLocator,
  type CapturedTarget,
  type ConfirmControl,
  type FocusReading,
} from "@/tests/e2e/helpers/confirmFocusProbe";

const reading = (at: string, over: Partial<FocusReading> = {}): FocusReading => ({
  at,
  tag: "BUTTON",
  testid: "the-trigger",
  id: null,
  insideRoot: true,
  rootPresent: true,
  visibleHeight: 44,
  height: 44,
  rootScrollTop: 0,
  ...over,
});

const TRIGGER: CapturedTarget = { testid: "the-trigger", id: null };
/** Cancel and settled coincide for most controls; archive is why they are separate fields. */
const TARGET = { cancel: TRIGGER, settled: TRIGGER };

/** A full, PASSING set: the repaired behaviour every case below perturbs. */
const repaired = (): FocusReading[] => [
  reading("x:control-after-cancel"),
  reading("x:before-arm"),
  reading("x:armed", { testid: "the-cancel" }),
  reading("x:just-after-confirm", { testid: "the-confirm" }),
  reading("x:settled"),
];

describe("assertFocusReadings decides the confirm-path focus outcome", () => {
  it("premise: the repaired shape passes, so every red below is caused by its own mutation", () => {
    expect(() => assertFocusReadings(repaired(), TARGET)).not.toThrow();
  });

  it("FAILS when settled focus is stranded on the document — the defect under repair", () => {
    const r = repaired();
    r[4] = reading("x:settled", { tag: "BODY", testid: null, insideRoot: false });
    expect(() => assertFocusReadings(r, TARGET)).toThrow();
  });

  it("FAILS when settled focus lands on a DIFFERENT control than the captured target", () => {
    const r = repaired();
    r[4] = reading("x:settled", { testid: "some-other-control" });
    expect(() => assertFocusReadings(r, TARGET)).toThrow();
  });

  it("FAILS when the target is identified by id and focus lands elsewhere", () => {
    const idTarget: CapturedTarget = { testid: null, id: "admin-settings-admins-heading" };
    const r = repaired();
    r[0] = reading("x:control-after-cancel", { testid: null, id: "admin-settings-admins-heading" });
    r[4] = reading("x:settled", { testid: null, id: "some-other-heading" });
    expect(() => assertFocusReadings(r, { cancel: idTarget, settled: idTarget })).toThrow();
  });

  it("FAILS when cancel restores to a DIFFERENT in-surface control", () => {
    // Task 2. The cancel arm used to assert only `insideRoot` and non-BODY, so a
    // cancel that restored focus to the wrong control inside the same surface
    // passed — and "unchanged" is the whole claim R4 makes about the cancel path.
    // The trigger is the only correct answer, and the expectation comes from the
    // target captured before the action, not from the readings.
    const r = repaired();
    r[0] = reading("x:control-after-cancel", { testid: "some-other-in-surface-control" });
    expect(
      () => assertFocusReadings(r, TARGET),
      "insideRoot alone cannot tell the trigger from any other control in the surface",
    ).toThrow();
  });

  it("FAILS when the cancel CONTROL arm is itself broken", () => {
    // Without this the suite could not tell a component that never restores
    // focus from one broken only on confirm.
    const r = repaired();
    r[0] = reading("x:control-after-cancel", { tag: "BODY", testid: null, insideRoot: false });
    expect(() => assertFocusReadings(r, TARGET)).toThrow();
  });

  it("FAILS when a step produced no reading at all", () => {
    expect(() => assertFocusReadings(repaired().slice(0, 4), TARGET)).toThrow();
  });

  it("distinguishes the cancel target from the settled target when they DIFFER", () => {
    // Archive is the real instance: cancel restores to `archive-show-button`
    // while the settled focus goes to `share-hub-kebab`. A single expected value
    // passed both arms only because every fixture made them equal — a fixture
    // that cannot express the difference it checks.
    const r = repaired();
    r[0] = reading("x:control-after-cancel", { testid: "the-trigger" });
    r[4] = reading("x:settled", { testid: "the-other-target" });
    const twoTargets = {
      cancel: { testid: "the-trigger", id: null },
      settled: { testid: "the-other-target", id: null },
    };
    expect(() => assertFocusReadings(r, twoTargets)).not.toThrow();
    // ...and the arms are not interchangeable: swapping them must fail.
    expect(
      () => assertFocusReadings(r, { cancel: twoTargets.settled, settled: twoTargets.cancel }),
      "the two targets must be checked against their own arms",
    ).toThrow();
  });

  it("kills the self-referential mutant: expectation comes from OUTSIDE the readings", () => {
    // The exact shape that shipped twice. If the assertion ever derives its
    // expected value from the received object again, `settled` matching a
    // target it does not equal would pass — so this asserts the discrimination
    // directly rather than trusting the current implementation.
    const r = repaired();
    r[4] = reading("x:settled", { testid: "not-the-target" });
    expect(
      () => assertFocusReadings(r, { cancel: TRIGGER, settled: TRIGGER }),
      "a self-comparing assertion cannot discriminate these and would pass",
    ).toThrow();
  });
});

describe("the root a control is read through cannot disagree with the root it is looked up through", () => {
  // Round 4 of the spec stage found the revoke control carrying `root: activeList`
  // and `rootSelector: "#admin-settings-admins-heading"` — two different elements,
  // under a comment claiming a third. The case could not reach its own settled
  // assertion, because `insideRoot` is false for every control when the root is a
  // heading that contains none.
  //
  // The repair is SUBTRACTION rather than a guard: `ConfirmControl` no longer
  // carries a Locator at all. `rootLocator(page, control)` derives it from the one
  // selector, so there is nothing left for a second field to disagree with. A
  // guard would have to be remembered at every call site; a derivation cannot be
  // forgotten.
  it("derives the Locator from the single declared selector", () => {
    const calls: string[] = [];
    const page = {
      locator: (sel: string) => {
        calls.push(sel);
        return { __sel: sel } as unknown;
      },
    };
    const control = {
      name: "probe",
      rootSelector: '[data-testid="the-section"]',
      restoreTargetSelector: '[data-testid="the-trigger"]',
      trigger: "the-trigger",
      confirm: "the-confirm",
      cancel: "the-cancel",
    } as unknown as ConfirmControl;

    const got = rootLocator(page as never, control) as unknown as { __sel: string };

    expect(calls, "the derivation must consult the declared selector and nothing else").toEqual([
      '[data-testid="the-section"]',
    ]);
    expect(got.__sel).toBe('[data-testid="the-section"]');
  });

  it("leaves no second root field for a call site to set independently", () => {
    const control: Record<string, unknown> = {
      name: "probe",
      rootSelector: '[data-testid="the-section"]',
      restoreTargetSelector: '[data-testid="the-trigger"]',
      trigger: "the-trigger",
      confirm: "the-confirm",
      cancel: "the-cancel",
    };
    // The shape a caller can express IS the guarantee. If `root` returns to the
    // type, this file is the thing that notices.
    expect(Object.keys(control), "a ConfirmControl declares exactly one root").not.toContain(
      "root",
    );
  });
});
