/**
 * The condition under which the assertion below has discriminating power.
 *
 * A guard whose fixture or environment cannot reach the boundary it asserts
 * passes unconditionally, and would pass forever. Stating that condition
 * executably turns the silence into a loud failure.
 *
 * The message says PREMISE deliberately, because a premise failure and an
 * ordinary assertion failure call for opposite responses: the first means the
 * environment is wrong for this test, the second means the code under test is.
 * Conflating them is not hypothetical -- it is exactly how PR #701 turned a
 * legitimately red test into a vacuous one, by "fixing" it to derive its
 * expected value from the same environment that made it red.
 *
 * Where the environment CAN be constructed, construct it (a throwaway
 * repository, a 101-row fixture) rather than writing a premise that reds.
 *
 * Rule: docs/agents/writing-plans.md
 * Rationale: docs/superpowers/specs/2026-08-04-guard-premise-reachability-design.md
 */
const NOT_ABOUT_THE_CODE =
  "The assertion below this line proves nothing in this environment; " +
  "this is not a claim that the code under test is wrong.";

/** `actual` must be STRICTLY past `mustExceed`. Equal is not past. */
export function premise(description: string, actual: number, mustExceed: number): void {
  if (!(actual > mustExceed)) {
    throw new Error(
      `premise not met: ${description}. Got ${actual}, which does not exceed ${mustExceed}. ` +
        NOT_ABOUT_THE_CODE,
    );
  }
}

/** The non-numeric form. Same contract, same message shape. */
export function premiseHolds(description: string, condition: boolean): void {
  if (!condition) {
    throw new Error(`premise not met: ${description}. ${NOT_ABOUT_THE_CODE}`);
  }
}
