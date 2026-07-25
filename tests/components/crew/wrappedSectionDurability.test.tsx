// @vitest-environment jsdom
//
// INVERTED PREMISE (was: "the upsert is registered via after()").
//
// WrappedSection no longer owns the alert write. Both the upsert and the durable
// log moved to lib/crew/sweepTileRenderAlerts.ts, which _CrewShell schedules via
// next/server after(). Two reasons, and the second is why the old placement was
// actively unsound: resolution is keyed on the (tile, observer) pair and only the
// shell knows the observer; and this component is SYNCHRONOUS, so it could not
// await lib/log's asynchronous app_events persist — a serverless freeze could
// drop the very evidence that makes a spurious auto-resolve survivable.
//
// So the contract this file now pins is the negative one: WrappedSection
// schedules NO post-response work on either path. The durability guarantee it
// used to protect lives in tests/components/crew/crewShellSweep.test.tsx, which
// asserts the shell's callback RETURNS its promise rather than voiding it.
import { describe, expect, test, vi } from "vitest";
import { render } from "@testing-library/react";

const { afterMock } = vi.hoisted(() => ({ afterMock: vi.fn() }));
vi.mock("next/server", () => ({ after: afterMock }));

import { WrappedSection } from "@/components/crew/WrappedSection";
import { createTileRenderLedger } from "@/lib/crew/tileRenderLedger";

describe("WrappedSection schedules no post-response work", () => {
  test("a throwing render registers no after() work", () => {
    const ledger = createTileRenderLedger();
    render(
      <WrappedSection
        tileId="crew:gear:scope"
        showId="show-xyz"
        sheetName="RPAS Central 2026"
        ledger={ledger}
        render={() => {
          throw new Error("scope projection blew up");
        }}
      />,
    );
    expect(afterMock).not.toHaveBeenCalled();
    // The failure is still captured, just in the ledger rather than in a write.
    expect(ledger.failed.get("crew:gear:scope")?.message).toBe("scope projection blew up");
  });

  test("a successful render registers no after() work", () => {
    const ledger = createTileRenderLedger();
    render(
      <WrappedSection
        tileId="crew:gear:scope"
        showId="show-xyz"
        sheetName="RPAS Central 2026"
        ledger={ledger}
        render={() => <p>ok</p>}
      />,
    );
    expect(afterMock).not.toHaveBeenCalled();
    expect(ledger.failed.size).toBe(0);
  });
});
