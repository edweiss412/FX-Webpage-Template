import { it } from "vitest";

/**
 * The NEGATIVE control for the ceiling: a healthy child that completes far
 * inside it.
 *
 * Without this case the timeout proof is satisfied by a runner that throws
 * `MutantRunInfraError` for EVERY child — one that scores nothing at all and
 * still passes every assertion about the hanging case.
 *
 * A `.fixture.ts` name keeps it out of every default project's include set.
 */
it("completes immediately", () => {});
