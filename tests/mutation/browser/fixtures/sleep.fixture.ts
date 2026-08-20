import { it } from "vitest";

/**
 * A child that outlives a small injected ceiling, by SLEEPING rather than by
 * looping forever.
 *
 * The distinction is what makes the RED honest. A genuinely non-terminating
 * child makes the pre-swap case HANG — indistinguishable from an infra stall,
 * and it would have to be killed by hand. This one terminates on its own well
 * inside the child's own 30 s `testTimeout`, so before the swap `runChild`
 * returns normally and the assertion FAILS, which is a red that names its
 * reason. After the swap the 2 s ceiling kills it first.
 *
 * A `.fixture.ts` name keeps it out of every default project's include set; it
 * is executed only as a child of tests/mutation/browser/childLifetime.test.ts.
 */
it("outlives a small ceiling", async () => {
  await new Promise((resolve) => setTimeout(resolve, 6_000));
});
