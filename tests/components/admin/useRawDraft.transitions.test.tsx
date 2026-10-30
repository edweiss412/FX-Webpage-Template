// @vitest-environment jsdom
/**
 * Transition audit for the deferred reading choice (warning-card-fixes spec §6.3, §14,
 * §14.1; plan Task 14).
 *
 * States on the §6.3 model (P = persistedRaw): C clean, D dirty, S saving, V saved but
 * not reconciled, E error. Every reachable pair of the §14 table is reached here and every
 * unreachable one is attempted and shown to change nothing. The deferred-response probe
 * holds the reading request, the accept request and the prop update (a re-render with a
 * new `decision`) in test-controlled promises and settles them in a chosen order, asserting
 * the checked radio, the main button and `Not saved yet` after EACH step. `router.refresh`
 * is a plain spy: asserted called, never "completed" (it has no completion signal).
 *
 * Fixture (Probe P-T14): a resolvable ROOM_HEADER_SPLIT_AMBIGUOUS whose rawSnippet is
 * ignorable, so Save takes the accept leg on an active row. With no decision P is "ours"
 * (false), so r = the sheet's reading (true) and ¬r = ours.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh, push: vi.fn(), prefetch: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/admin",
  useSearchParams: () => new URLSearchParams(),
}));

type Held<T> = { args: unknown[]; resolve: (v: T) => void; reject: (e: unknown) => void };
const useRawCalls: Array<Held<unknown>> = [];
const ignoreCalls: Array<Held<unknown>> = [];
const hold =
  (into: Array<Held<unknown>>) =>
  (...args: unknown[]) =>
    new Promise((resolve, reject) => {
      into.push({ args, resolve, reject });
    });
vi.mock("@/app/admin/onboarding/_actions/useRawStaged", () => ({
  setStagedUseRawDecisionAction: (...a: unknown[]) => hold(useRawCalls)(...a),
}));
vi.mock("@/app/admin/show/[slug]/_actions/useRaw", () => ({
  setUseRawDecisionAction: (...a: unknown[]) => hold(useRawCalls)(...a),
}));
vi.mock("@/app/admin/onboarding/_actions/stagedWarningIgnore", () => ({
  setStagedWarningIgnore: (...a: unknown[]) => hold(ignoreCalls)(...a),
}));

import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { ParseWarning } from "@/lib/parser/types";
import type { UseRawDecision } from "@/lib/sync/useRawOverlay";
import { UseRawDraftProvider } from "@/components/admin/useRawDraft";
import { UseRawControlBoundary } from "@/components/admin/UseRawControlBoundary";
import { DataQualityWarningControls } from "@/components/admin/DataQualityWarningControls";
import { deriveUseRawControlState } from "@/components/admin/UseRawControl";
import { WarningAnnounceContext } from "@/components/admin/review/warningAnnounceContext";
import { hasIgnorableSnippet } from "@/lib/dataQuality/ignorableSnippet";
import { premiseHolds } from "@/tests/_shared/premise";
import {
  ARCHIVED_TAB_ERROR,
  ARCHIVED_TAB_INCLUDE_PENDING,
  ArchivedTabOffer,
} from "@/components/admin/wizard/archivedTabOffer";
import { step3Sections } from "@/components/admin/wizard/step3ReviewSections";
import {
  buildStagedSectionData,
  type StagedSectionData,
} from "@/components/admin/review/sectionData";
import type { ArchivedPullSheetTab } from "@/lib/drive/exportSheetToMarkdown";
import {
  buildParseResult,
  stagedRow,
  STEP3_FIXTURE_DFID as DFID,
  STEP3_FIXTURE_WSID as WSID,
} from "./wizard/_step3ReviewFixture";

const announce = vi.fn();
let errorSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  useRawCalls.length = 0;
  ignoreCalls.length = 0;
  refresh.mockClear();
  announce.mockClear();
  errorSpy = vi.spyOn(console, "error");
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const W: ParseWarning = {
  severity: "warn",
  code: "ROOM_HEADER_SPLIT_AMBIGUOUS",
  message: "Room header could be read two ways",
  blockRef: { kind: "rooms" },
  rawSnippet: "Ballroom A / B",
  resolution: {
    resolvable: true,
    contentHash: "h",
    parsed: { kind: "rooms", name: "Ballroom", dimensions: null, floor: null },
    replacement: { kind: "rooms", name: "Ballroom A / B", dimensions: null, floor: null },
  },
};
const RAW_APPLIED: UseRawDecision = { preference: "raw", applied: true } as UseRawDecision;
const RAW_PENDING: UseRawDecision = { preference: "raw", applied: false } as UseRawDecision;
const TRANSFORM: UseRawDecision = { preference: "transform", applied: false } as UseRawDecision;

premiseHolds("the fixture is ignorable, so Save takes the accept leg", hasIgnorableSnippet(W));
premiseHolds(
  "the fixture derives the four radio states",
  deriveUseRawControlState(W, undefined, false) === "transform-active" &&
    deriveUseRawControlState(W, RAW_PENDING, false) === "apply-pending" &&
    deriveUseRawControlState(W, RAW_APPLIED, false) === "raw-active" &&
    deriveUseRawControlState(W, TRANSFORM, false) === "clear-pending",
);

const SAVE_FAIL = /That didn.t save\. The cell may have changed\./;
const PARTIAL =
  /Your reading is saved, but we couldn.t accept the judgment call\. Refresh and try again\./;
const ACCEPT_FAIL = /Couldn.t accept that judgment call\. Refresh and try again\./;

function Tree(props: { decision: UseRawDecision | undefined; mode?: "active" | "ignored" }) {
  const mode = props.mode ?? "active";
  return (
    <WarningAnnounceContext.Provider value={{ announce }}>
      <UseRawDraftProvider
        surface="wizard"
        wizardSessionId={WSID}
        driveFileId={DFID}
        warning={W}
        decision={props.decision}
      >
        <UseRawControlBoundary
          surface="wizard"
          wizardSessionId={WSID}
          driveFileId={DFID}
          warning={W}
          decision={props.decision}
          site="list"
        />
        <DataQualityWarningControls
          target={{ kind: "staged", wizardSessionId: WSID, driveFileId: DFID }}
          warning={W}
          driveFileId={DFID}
          mode={mode}
          reportSurfaceId="sid"
          ground="surface"
        />
      </UseRawDraftProvider>
    </WarningAnnounceContext.Provider>
  );
}

function mount(decision: UseRawDecision | undefined = undefined, mode?: "active" | "ignored") {
  const r = render(<Tree decision={decision} {...(mode ? { mode } : {})} />);
  return {
    ...r,
    refreshWith: (next: UseRawDecision | undefined) =>
      r.rerender(<Tree decision={next} {...(mode ? { mode } : {})} />),
  };
}

const ours = () => screen.getByTestId("use-raw-toggle-off-list");
const sheet = () => screen.getByTestId("use-raw-toggle-on-list");
const main = () => screen.queryByTestId("dq-ignore-sid") ?? screen.getByTestId("dq-unignore-sid");

type Snap = {
  checked: "ours" | "sheet";
  label: string;
  mainDisabled: boolean;
  notSaved: boolean;
  cancel: "absent" | "enabled" | "disabled";
  alert: string | null;
  rowsDisabled: boolean;
};
function snap(): Snap {
  const cancel = screen.queryByRole("button", { name: "Cancel" });
  const alert = screen.queryByRole("alert");
  return {
    checked: sheet().getAttribute("aria-checked") === "true" ? "sheet" : "ours",
    label: main().textContent ?? "",
    mainDisabled: (main() as HTMLButtonElement).disabled,
    notSaved: screen.queryByText("Not saved yet") !== null,
    cancel:
      cancel === null ? "absent" : (cancel as HTMLButtonElement).disabled ? "disabled" : "enabled",
    alert: alert?.textContent ?? null,
    rowsDisabled:
      ours().getAttribute("aria-disabled") === "true" &&
      sheet().getAttribute("aria-disabled") === "true",
  };
}
const C = (checked: Snap["checked"], label = "Accept"): Partial<Snap> => ({
  checked,
  label,
  mainDisabled: false,
  notSaved: false,
  cancel: "absent",
  rowsDisabled: false,
});
const D = (checked: Snap["checked"]): Partial<Snap> => ({
  checked,
  label: "Save",
  mainDisabled: false,
  notSaved: true,
  cancel: "enabled",
  rowsDisabled: false,
});
const V = (checked: Snap["checked"], label = "Accept"): Partial<Snap> => ({
  checked,
  label,
  mainDisabled: false,
  notSaved: false,
  cancel: "absent",
  rowsDisabled: true,
});
const expectIn = (expected: Partial<Snap>, at: string) =>
  expect(snap(), at).toMatchObject(expected);

async function settle(h: Held<unknown> | undefined, value: unknown) {
  if (!h) throw new Error("no held request to settle");
  await act(async () => {
    h.resolve(value);
  });
}
const OK = { ok: true };
const FAIL = { ok: false, code: "STALE" };
const IGNORED = { ok: true, state: "ignored" };

/** C → D → S (reading held): the common prefix. */
function toSaving() {
  fireEvent.click(sheet());
  fireEvent.click(main());
}

describe("§14 states and pairs", () => {
  it("§14 pair C → D", () => {
    mount();
    expectIn({ ...C("ours"), alert: null }, "C");
    fireEvent.click(sheet());
    expectIn({ ...D("sheet"), alert: null }, "D");
    expect(useRawCalls).toHaveLength(0);
  });

  it("§14 pair D → C", () => {
    // Cancel; focus lands on the main button.
    const t = mount();
    fireEvent.click(sheet());
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expectIn(C("ours"), "C after Cancel");
    expect(document.activeElement).toBe(main());
    // Selecting the persisted reading.
    fireEvent.click(sheet());
    fireEvent.click(ours());
    expectIn(C("ours"), "C after selecting P");
    // Reconciliation with draft === P.
    fireEvent.click(sheet());
    t.refreshWith(RAW_APPLIED);
    expectIn(C("sheet"), "C after reconciliation");
    expect(useRawCalls).toHaveLength(0);
  });

  it("§14 pair C → S", () => {
    mount();
    fireEvent.click(main());
    expectIn({ checked: "ours", label: "Accepting…", mainDisabled: true, rowsDisabled: true }, "S");
    expect(ignoreCalls).toHaveLength(1);
  });

  it("§14 pair S → C", async () => {
    mount();
    fireEvent.click(main());
    await settle(ignoreCalls[0], IGNORED);
    expect(refresh).toHaveBeenCalledTimes(1);
    expectIn({ ...C("ours"), alert: null }, "C after the plain Accept, the row still here");
  });

  it("§14 pair D → S", () => {
    mount();
    toSaving();
    expectIn(
      {
        checked: "sheet",
        label: "Saving…",
        mainDisabled: true,
        cancel: "disabled",
        rowsDisabled: true,
      },
      "S",
    );
    expect(useRawCalls).toHaveLength(1);
    expect(useRawCalls[0]?.args[3]).toBe(true);
  });

  it("§14 pair S → D", async () => {
    // Unreachable directly: a select while busy changes nothing; a failed Save is E over D.
    mount();
    toSaving();
    fireEvent.click(ours());
    expectIn({ checked: "sheet", label: "Saving…", rowsDisabled: true }, "still S");
    await settle(useRawCalls[0], FAIL);
    expect(snap().alert).toMatch(SAVE_FAIL);
    expectIn(D("sheet"), "E over D");
  });

  it("§14 pair C → V", async () => {
    // Unreachable: `submitted` is only set from D, so a clean Accept never locks the rows.
    const t = mount();
    fireEvent.click(main());
    await settle(ignoreCalls[0], IGNORED);
    expect(snap().rowsDisabled).toBe(false);
    t.refreshWith(undefined);
    expect(snap().rowsDisabled).toBe(false);
    expect(useRawCalls).toHaveLength(0);
  });

  it("§14 pair V → C", async () => {
    const t = mount();
    toSaving();
    await settle(useRawCalls[0], OK);
    await settle(ignoreCalls[0], IGNORED);
    expectIn(V("sheet"), "V");
    t.refreshWith(RAW_APPLIED);
    expectIn(C("sheet"), "C after reconciliation");
  });

  it("§14 pair D → V", async () => {
    // Only through S: the label passes through Saving… and Accepting… before V.
    mount();
    fireEvent.click(sheet());
    fireEvent.click(main());
    expect(snap().label).toBe("Saving…");
    await settle(useRawCalls[0], OK);
    expect(snap().label).toBe("Saving…");
    expect(snap().mainDisabled).toBe(true);
    await settle(ignoreCalls[0], IGNORED);
    expectIn(V("sheet"), "V");
  });

  it("§14 pair V → D", async () => {
    // Unreachable: rows are soft-disabled while `submitted !== null`.
    mount();
    toSaving();
    await settle(useRawCalls[0], OK);
    await settle(ignoreCalls[0], IGNORED);
    fireEvent.click(ours());
    fireEvent.keyDown(sheet(), { key: "ArrowUp" });
    expectIn(V("sheet"), "still V");
  });

  it("§14 pair S → V", async () => {
    mount();
    toSaving();
    await settle(useRawCalls[0], OK);
    expect(snap().checked).toBe("sheet");
    await settle(ignoreCalls[0], IGNORED);
    expectIn(V("sheet"), "V: the acknowledged reading stays checked");
    expect(announce).toHaveBeenCalledWith("Reading saved. Judgment call accepted.");
  });

  it("§14 pair V → S", async () => {
    // Accept retry after a partial success retries the accept request only.
    mount();
    toSaving();
    await settle(useRawCalls[0], OK);
    await settle(ignoreCalls[0], FAIL);
    expect(snap().alert).toMatch(PARTIAL);
    expectIn(V("sheet"), "E over V");
    fireEvent.click(main());
    expectIn({ label: "Accepting…", mainDisabled: true, rowsDisabled: true }, "S again");
    expect(useRawCalls).toHaveLength(1);
    expect(ignoreCalls).toHaveLength(2);
  });

  it("§14 pair C/D/V → E", async () => {
    // Only through S: no transition that sends no request shows an alert.
    mount();
    expect(snap().alert).toBeNull();
    fireEvent.click(sheet());
    expect(snap().alert).toBeNull();
    fireEvent.click(main());
    await settle(useRawCalls[0], OK);
    await settle(ignoreCalls[0], IGNORED);
    expect(snap().alert).toBeNull();
  });

  it("§14 pair S → E", async () => {
    // A failed Save.
    const first = mount();
    toSaving();
    await settle(useRawCalls[0], FAIL);
    expect(snap().alert).toMatch(SAVE_FAIL);
    expect(screen.queryByTestId("use-raw-error-list")).toBeNull();
    expect(refresh).not.toHaveBeenCalled();
    first.unmount();
    // A failed plain Accept.
    mount();
    fireEvent.click(main());
    await settle(ignoreCalls[0], FAIL);
    expect(snap().alert).toMatch(ACCEPT_FAIL);
    expectIn(C("ours"), "E over C");
  });

  it("§14 pair E → C", async () => {
    // Cancel from E over D.
    let t = mount();
    toSaving();
    await settle(useRawCalls[0], FAIL);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expectIn({ ...C("ours"), alert: null }, "Cancel from E over D");
    t.unmount();
    // Selecting the persisted reading from E over D.
    useRawCalls.length = 0;
    t = mount();
    toSaving();
    await settle(useRawCalls[0], FAIL);
    fireEvent.click(ours());
    expectIn({ ...C("ours"), alert: null }, "select P from E over D");
    t.unmount();
    // Reconciliation from E over V: C, the copy stays until the next action.
    useRawCalls.length = 0;
    ignoreCalls.length = 0;
    t = mount();
    toSaving();
    await settle(useRawCalls[0], OK);
    await settle(ignoreCalls[0], FAIL);
    t.refreshWith(RAW_APPLIED);
    expectIn(C("sheet"), "reconciled from E over V");
    expect(snap().alert).toMatch(PARTIAL);
    fireEvent.click(ours());
    expect(snap().alert).toBeNull();
  });

  it("§14 pair E → D", async () => {
    // From E over C only: a failed plain Accept, then select the other reading.
    mount();
    fireEvent.click(main());
    await settle(ignoreCalls[0], FAIL);
    fireEvent.click(sheet());
    expectIn({ ...D("sheet"), alert: null }, "D");
  });

  it("§14 pair E → S", async () => {
    // Retry Save from E over D.
    const t = mount();
    toSaving();
    await settle(useRawCalls[0], FAIL);
    fireEvent.click(main());
    expectIn({ label: "Saving…", mainDisabled: true }, "retry Save");
    expect(useRawCalls).toHaveLength(2);
    t.unmount();
    // Retry Accept from E over C.
    ignoreCalls.length = 0;
    mount();
    fireEvent.click(main());
    await settle(ignoreCalls[0], FAIL);
    fireEvent.click(main());
    expectIn({ label: "Accepting…", mainDisabled: true }, "retry Accept");
    expect(ignoreCalls).toHaveLength(2);
  });

  it("§14 pair E → V", async () => {
    // Unreachable directly: from E over D the rows stay live and nothing locks them.
    mount();
    toSaving();
    await settle(useRawCalls[0], FAIL);
    expect(snap().rowsDisabled).toBe(false);
    expect(snap().label).toBe("Save");
  });
});

describe("§14 deferred-response probe", () => {
  it("§14 seq 1: full success, delayed refresh", async () => {
    const t = mount();
    fireEvent.click(sheet());
    expectIn(D("sheet"), "D");
    fireEvent.click(main());
    expectIn({ checked: "sheet", label: "Saving…", notSaved: false }, "S");
    await settle(useRawCalls[0], OK);
    expectIn({ checked: "sheet", label: "Saving…", notSaved: false }, "reading ok, accept running");
    await settle(ignoreCalls[0], IGNORED);
    expect(refresh).toHaveBeenCalledTimes(1);
    expectIn(V("sheet"), "accept ok");
    // The refresh is delayed: an unrelated re-render keeps V, never ¬r.
    t.refreshWith(undefined);
    expectIn(V("sheet"), "refresh delayed");
    t.refreshWith(RAW_APPLIED);
    expectIn(C("sheet"), "refresh landed, row kept in place");
  });

  it("§14 seq 2: accept fails after the reading saved", async () => {
    const t = mount();
    toSaving();
    await settle(useRawCalls[0], OK);
    await settle(ignoreCalls[0], FAIL);
    expect(refresh).toHaveBeenCalledTimes(1);
    expectIn(V("sheet"), "E over V");
    expect(snap().alert).toMatch(PARTIAL);
    t.refreshWith(RAW_APPLIED);
    expectIn(C("sheet"), "reconciled");
    expect(snap().alert).toMatch(PARTIAL);
    fireEvent.click(main());
    expect(useRawCalls).toHaveLength(1);
    expect(ignoreCalls).toHaveLength(2);
  });

  it("§14 seq 3: retained rows", async () => {
    // An Accepted-list row: no accept request; `Reading saved.`
    const t = mount(undefined, "ignored");
    expectIn(C("ours", "Undo accept"), "C");
    fireEvent.click(sheet());
    expectIn(D("sheet"), "D");
    fireEvent.click(main());
    expectIn({ label: "Saving…", notSaved: false }, "S");
    await settle(useRawCalls[0], OK);
    expect(ignoreCalls).toHaveLength(0);
    expect(announce).toHaveBeenCalledWith("Reading saved.");
    expect(refresh).toHaveBeenCalledTimes(1);
    expectIn(V("sheet", "Undo accept"), "V");
    t.refreshWith(RAW_APPLIED);
    expectIn(C("sheet", "Undo accept"), "C");
  });

  it("§14 seq 4: select back, then an external save", () => {
    const t = mount();
    fireEvent.click(sheet());
    expectIn(D("sheet"), "D");
    fireEvent.click(ours());
    expectIn(C("ours"), "C");
    t.refreshWith(RAW_APPLIED);
    expectIn(C("sheet"), "C showing r, not D");
    expect(snap().label).not.toBe("Save");
  });

  it("§14 seq 5: failed save, refresh equals the draft, then an external revert", async () => {
    const t = mount();
    toSaving();
    await settle(useRawCalls[0], FAIL);
    expectIn(D("sheet"), "E over D");
    t.refreshWith(RAW_APPLIED);
    expectIn(C("sheet"), "draft === P");
    t.refreshWith(undefined);
    expectIn(C("ours"), "C showing ¬r, not D");
    expect(snap().label).not.toBe("Save");
  });

  it("§14 seq 6: refresh during D with no change to P", () => {
    const t = mount();
    fireEvent.click(sheet());
    t.refreshWith(TRANSFORM);
    expectIn(D("sheet"), "still D");
  });

  it("§14 seq 7: select attempted during V", async () => {
    const t = mount();
    toSaving();
    await settle(useRawCalls[0], OK);
    await settle(ignoreCalls[0], FAIL);
    fireEvent.click(ours());
    expectIn(V("sheet"), "blocked");
    t.refreshWith(RAW_APPLIED);
    expectIn(C("sheet"), "C after reconciliation");
  });

  it("§14 seq 13: refresh lands without moving P", async () => {
    const t = mount();
    toSaving();
    await settle(useRawCalls[0], OK);
    await settle(ignoreCalls[0], IGNORED);
    t.refreshWith(TRANSFORM);
    expectIn(V("sheet"), "still V, locked on submitted");
    t.refreshWith(RAW_PENDING);
    expectIn(C("sheet"), "C on the next change of P");
  });

  it("§14 seq 8: the row unmounting during D or V writes nothing more", async () => {
    let t = mount();
    fireEvent.click(sheet());
    t.unmount();
    await act(async () => {
      await Promise.resolve();
    });
    expect(useRawCalls).toHaveLength(0);
    expect(ignoreCalls).toHaveLength(0);
    t = mount();
    toSaving();
    await settle(useRawCalls[0], OK);
    await settle(ignoreCalls[0], IGNORED);
    t.unmount();
    await act(async () => {
      await Promise.resolve();
    });
    expect(useRawCalls).toHaveLength(1);
    expect(ignoreCalls).toHaveLength(1);
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("§14 seq 9: opening Report during D keeps the draft", () => {
    mount();
    fireEvent.click(sheet());
    fireEvent.click(screen.getByTestId("report-button-trigger"));
    expect(screen.getByTestId("report-modal-textarea")).toBeTruthy();
    expectIn(D("sheet"), "D with Report open");
    fireEvent.keyDown(screen.getByTestId("report-modal-textarea"), { key: "Escape" });
    expectIn(D("sheet"), "still D");
  });

  it("§14 seq 10: closing the modal during S lets the in-flight request complete", async () => {
    const t = mount();
    toSaving();
    t.unmount();
    await settle(useRawCalls[0], OK);
    expect(useRawCalls).toHaveLength(1);
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("§14 seq 12: the pending-apply note follows persisted state only", async () => {
    // D half: apply-pending -> raw-active keeps P, so the row stays D; the note goes.
    let t = mount(RAW_PENDING);
    const note = () => screen.queryByTestId("use-raw-pending-note-list");
    const applyPending = note()?.textContent ?? "";
    expect(applyPending).toMatch(/^Saved\./);
    fireEvent.click(ours());
    expectIn(D("ours"), "D");
    expect(note()?.textContent).toBe(applyPending);
    t.refreshWith(RAW_APPLIED);
    expectIn(D("ours"), "still D");
    expect(note()).toBeNull();
    t.unmount();
    // V half, on an Accepted-list row.
    t = mount(RAW_PENDING, "ignored");
    fireEvent.click(ours());
    fireEvent.click(main());
    // Review R1 C1: the reading sent is the one picked (ours = useRaw false), on the
    // wizard's staged action (args: session, sheet, warningRef, useRaw).
    expect(useRawCalls).toHaveLength(1);
    expect(useRawCalls[0]!.args[3]).toBe(false);
    await settle(useRawCalls[0], OK);
    expectIn(V("ours", "Undo accept"), "V");
    expect(note()?.textContent).toBe(applyPending);
    t.refreshWith(TRANSFORM);
    expectIn(C("ours", "Undo accept"), "C");
    expect(note()?.textContent).toMatch(/^Reverting\./);
  });
});

describe("§16.1 deferred choice rules", () => {
  it("select calls no action; arrow keys move focus and select without calling", () => {
    mount();
    fireEvent.click(sheet());
    expect(useRawCalls).toHaveLength(0);
    fireEvent.click(ours());
    fireEvent.keyDown(ours(), { key: "ArrowDown" });
    expect(document.activeElement).toBe(sheet());
    expectIn(D("sheet"), "arrow selects");
    expect(useRawCalls).toHaveLength(0);
  });

  it("Save sends the picked reading, both directions (review R1 C1)", async () => {
    // The sheet's reading (useRaw true) from the clean `ours` state...
    let t = mount();
    toSaving();
    expect(useRawCalls).toHaveLength(1);
    expect(useRawCalls[0]!.args[3]).toBe(true);
    await settle(useRawCalls[0], FAIL);
    t.unmount();
    // ...and ours (useRaw false) from a persisted sheet reading.
    useRawCalls.length = 0;
    t = mount(RAW_APPLIED);
    fireEvent.click(ours());
    fireEvent.click(main());
    expect(useRawCalls).toHaveLength(1);
    expect(useRawCalls[0]!.args[3]).toBe(false);
    await settle(useRawCalls[0], FAIL);
    t.unmount();
  });

  it("Save failure restores the draft and shows the save error", async () => {
    mount();
    toSaving();
    await settle(useRawCalls[0], FAIL);
    expect(snap().alert).toMatch(SAVE_FAIL);
    expectIn(D("sheet"), "draft restored");
  });

  it("the hint's id is the main button's aria-describedby", () => {
    mount();
    expect(main().getAttribute("aria-describedby")).toBeNull();
    fireEvent.click(sheet());
    const hint = screen.getByText("Not saved yet");
    expect(hint.id).not.toBe("");
    expect(main().getAttribute("aria-describedby")).toBe(hint.id);
  });

  it("Report stays enabled while busy; in-control progress and errors do not render", () => {
    mount();
    toSaving();
    expect(screen.getByTestId("report-button-trigger")).toBeEnabled();
    expect(screen.queryByText("Saving…", { selector: "p" })).toBeNull();
    expect(screen.queryByTestId("use-raw-retry-list")).toBeNull();
  });

  it("provider absent: the boundary alone still saves on tap", () => {
    render(
      <UseRawControlBoundary
        surface="wizard"
        wizardSessionId={WSID}
        driveFileId={DFID}
        warning={W}
        decision={undefined}
        site="list"
      />,
    );
    fireEvent.click(sheet());
    expect(useRawCalls).toHaveLength(1);
  });
});

// ── §14.1 re-asserted over the Task 13 card row ────────────────────────────────
type Post = { url: string; body: unknown } & Held<Response>;
const posts: Post[] = [];
const STAGED_ROUTE = "/api/admin/onboarding/pull-sheet-override";
const TAB: ArchivedPullSheetTab = {
  tabName: "OLD GEAR",
  headerPreviews: ["AUDIO 1", "VIDEO RACK"],
  fingerprint: "fp-old-gear",
  included: false,
  contentChangedSinceAccept: false,
};
const ARCHIVED: ParseWarning = {
  severity: "warn",
  code: "PULL_SHEET_ON_ARCHIVED_TAB",
  message: 'Pull sheet found on archived tab "OLD GEAR"; left out of the parse.',
  blockRef: { kind: "pull_sheet_archived_tab", name: "OLD GEAR" },
  rawSnippet: TAB.headerPreviews.join(" | "),
};
const INCLUDE = "Use this pull sheet from tab OLD GEAR";

function archivedCard() {
  posts.length = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(
      (url: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((resolve, reject) => {
          posts.push({ url: String(url), body: init?.body, args: [], resolve, reject });
        }),
    ),
  );
  const pr = buildParseResult({ warnings: [ARCHIVED] });
  const d: StagedSectionData = {
    ...buildStagedSectionData({
      pr,
      row: stagedRow(pr),
      dfid: DFID,
      wizardSessionId: WSID,
      crewMembers: pr.crewMembers,
      rooms: pr.rooms,
      hotels: pr.hotelReservations,
      pullSheet: [],
      archivedPullSheetTabs: [TAB],
      pullSheetOverride: null,
      ros: {},
      warnings: [ARCHIVED],
      agendaBaseline: [],
      useRawDecisions: [],
    }),
    dq: {
      target: { kind: "staged", wizardSessionId: WSID, driveFileId: DFID },
      model: { active: [{ index: 0, reportSurfaceId: "sid-0" }], ignored: [] },
    },
  };
  const def = step3Sections(d).find((s) => s.id === "warnings");
  if (!def) throw new Error("no warnings section");
  return render(<>{def.render(d)}</>);
}
const row = () => screen.getByTestId(`wizard-step3-card-${DFID}-warning-0`);
const include = () => within(row()).getByRole("button", { name: INCLUDE });
const includePending = () =>
  within(row()).getByRole("button", { name: ARCHIVED_TAB_INCLUDE_PENDING });
const ignore = () => screen.getByTestId("dq-ignore-sid-0");
const okPost = () =>
  new Response(JSON.stringify({ ok: true, status: "override_set" }), { status: 200 });
const failPost = () => new Response(JSON.stringify({ ok: false }), { status: 500 });

async function settlePost(p: Post | undefined, r: Response) {
  if (!p) throw new Error("no held POST");
  await act(async () => {
    p.resolve(r);
  });
}

describe("§14.1 the archived card row", () => {
  it("§14.1 pair I → N", () => {
    archivedCard();
    fireEvent.click(include());
    expect(includePending()).toBeDisabled();
    expect(ignore()).toBeDisabled();
    expect(within(row()).getByTestId("report-button-trigger")).toBeEnabled();
  });

  it("§14.1 pair N → I", async () => {
    // Failure: the include's own status region.
    archivedCard();
    fireEvent.click(include());
    await settlePost(posts[0], failPost());
    expect(include()).toBeEnabled();
    expect(ignore()).toBeEnabled();
    expect(within(row()).getByText(ARCHIVED_TAB_ERROR)).toBeTruthy();
    cleanup();
    // Success: re-enabled before the refresh lands.
    archivedCard();
    fireEvent.click(include());
    await settlePost(posts[0], okPost());
    expect(refresh).toHaveBeenCalled();
    expect(include()).toBeEnabled();
    expect(ignore()).toBeEnabled();
  });

  it("§14.1 pair I → G", () => {
    archivedCard();
    fireEvent.click(ignore());
    expect(ignore().textContent).toBe("Ignoring…");
    expect(include()).toBeDisabled();
    expect(within(row()).getByTestId("report-button-trigger")).toBeEnabled();
  });

  it("§14.1 pair G → I", async () => {
    archivedCard();
    fireEvent.click(ignore());
    await settle(ignoreCalls[0], FAIL);
    expect(screen.getByTestId("dq-error-sid-0")).toBeTruthy();
    expect(include()).toBeEnabled();
    expect(ignore()).toBeEnabled();
    fireEvent.click(ignore());
    await settle(ignoreCalls[1], IGNORED);
    expect(include()).toBeEnabled();
    expect(ignore()).toBeEnabled();
  });

  it("§14.1 pair N → G", () => {
    archivedCard();
    fireEvent.click(include());
    fireEvent.click(ignore());
    expect(ignoreCalls).toHaveLength(0);
    expect(includePending()).toBeDisabled();
  });

  it("§14.1 pair G → N", () => {
    archivedCard();
    fireEvent.click(ignore());
    fireEvent.click(include());
    expect(posts).toHaveLength(0);
    expect(ignore().textContent).toBe("Ignoring…");
  });

  it("§14.1 c1: include succeeds, the refresh has not landed", async () => {
    archivedCard();
    fireEvent.click(include());
    await settlePost(posts[0], okPost());
    expect(include()).toBeEnabled();
    expect(ignore()).toBeEnabled();
  });

  it("§14.1 c3: a second placement's include is its own request", () => {
    archivedCard();
    fireEvent.click(include());
    render(
      <ArchivedTabOffer dfid={DFID} wizardSessionId={WSID} tab={TAB} onDismissFocus={() => {}} />,
    );
    const packList = screen.getByTestId(`pack-list-archived-offer-${DFID}-${TAB.tabName}`);
    fireEvent.click(within(packList).getByRole("button", { name: INCLUDE }));
    expect(posts.map((p) => p.url)).toEqual([STAGED_ROUTE, STAGED_ROUTE]);
    expect(posts[0]).not.toBe(posts[1]);
  });
});
