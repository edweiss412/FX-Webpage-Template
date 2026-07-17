// @vitest-environment jsdom
/**
 * tests/components/RoleRecognizeControl.test.tsx
 *
 * The inline "Recognize this role" control (spec 2026-07-15 §8.1) and its
 * client boundary. Two concerns:
 *
 *   1. `RoleRecognizeControl` — presentational, driven by an injected `onSave`.
 *      Guard (no/blank roleToken → null), collapsed→idle expand, the four
 *      capability checkboxes + financial caution + none-checked helper, saving
 *      (disabled + "Recognizing…"), the saved card (applied vs apply_pending
 *      summaries), the two benign notices (stale / conflict — distinct from the
 *      error state), the error state (plain copy, selections kept, "Try again"),
 *      and revise-mode reopen (submits with mode "revise").
 *
 *   2. `RoleRecognizeControlBoundary` — action selection: show→mapRoleToken,
 *      wizard→mapRoleTokenStaged, revise→updateRoleTokenMapping (NOT the create
 *      action). Actions mocked at module level (use-raw boundary test pattern).
 *
 * Every asserted string comes from `roleRecognizeCopy` — never a retyped literal.
 */
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ParseWarning } from "@/lib/parser/types";
import type { GrantableFlag } from "@/lib/sync/roleMappingOverlay";
import {
  RoleRecognizeControl,
  type RoleRecognizeSaveOutcome,
} from "@/components/admin/RoleRecognizeControl";
import { RoleRecognizeControlBoundary } from "@/components/admin/RoleRecognizeControlBoundary";
import * as COPY from "@/components/admin/roleRecognizeCopy";
import { mapRoleToken } from "@/app/admin/show/[slug]/_actions/roleToken";
import { mapRoleTokenStaged } from "@/app/admin/onboarding/_actions/roleTokenStaged";
import { updateRoleTokenMapping } from "@/app/admin/settings/_actions/roleTokenMappings";

vi.mock("@/app/admin/show/[slug]/_actions/roleToken", () => ({ mapRoleToken: vi.fn() }));
vi.mock("@/app/admin/onboarding/_actions/roleTokenStaged", () => ({
  mapRoleTokenStaged: vi.fn(),
}));
vi.mock("@/app/admin/settings/_actions/roleTokenMappings", () => ({
  updateRoleTokenMapping: vi.fn(),
  deleteRoleTokenMapping: vi.fn(),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const TOKEN = "DRONE OP";

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

function expand() {
  fireEvent.click(screen.getByTestId("role-recognize-trigger"));
}

describe("RoleRecognizeControl — guard", () => {
  it("renders nothing without a roleToken", () => {
    const { container } = render(<RoleRecognizeControl roleToken={undefined} onSave={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing for a blank/whitespace token", () => {
    const { container } = render(<RoleRecognizeControl roleToken="   " onSave={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("RoleRecognizeControl — expand + panel", () => {
  it("collapsed shows only the trigger", () => {
    render(<RoleRecognizeControl roleToken={TOKEN} onSave={vi.fn()} />);
    expect(screen.getByTestId("role-recognize-trigger")).toHaveTextContent(COPY.TRIGGER_LABEL);
    expect(screen.queryByTestId("role-recognize-panel")).toBeNull();
  });

  it("expands to heading + scope line + 4 checkboxes + financial caution + none helper", () => {
    render(<RoleRecognizeControl roleToken={TOKEN} onSave={vi.fn()} />);
    expand();
    expect(screen.getByText(COPY.PANEL_HEADING)).toBeInTheDocument();
    expect(screen.getByText(COPY.scopeLine(TOKEN))).toBeInTheDocument();
    for (const flag of ["A1", "V1", "L1", "FINANCIALS"] as const) {
      expect(screen.getByTestId(`role-recognize-check-${flag}`)).toBeInTheDocument();
    }
    expect(screen.getByText(COPY.FINANCIAL_CAUTION)).toBeInTheDocument();
    expect(screen.getByText(COPY.NONE_CHECKED_HELPER)).toBeInTheDocument();
  });

  it("hides the none-checked helper once a capability is checked", () => {
    render(<RoleRecognizeControl roleToken={TOKEN} onSave={vi.fn()} />);
    expand();
    fireEvent.click(screen.getByTestId("role-recognize-check-A1"));
    expect(screen.queryByText(COPY.NONE_CHECKED_HELPER)).toBeNull();
  });
});

describe("RoleRecognizeControl — saving + terminal states", () => {
  it("disables inputs and shows the saving label while the action is in flight", async () => {
    const d = deferred<RoleRecognizeSaveOutcome>();
    render(<RoleRecognizeControl roleToken={TOKEN} onSave={() => d.promise} />);
    expand();
    fireEvent.click(screen.getByTestId("role-recognize-check-A1"));
    fireEvent.click(screen.getByTestId("role-recognize-save"));
    await waitFor(() =>
      expect(screen.getByTestId("role-recognize-save")).toHaveTextContent(COPY.SAVING_LABEL),
    );
    expect(screen.getByTestId("role-recognize-check-A1")).toBeDisabled();
    expect(screen.getByTestId("role-recognize-save")).toBeDisabled();
    d.resolve({ kind: "saved", state: "applied", grants: ["A1"] });
    await waitFor(() => expect(screen.getByTestId("role-recognize-saved")).toBeInTheDocument());
  });

  it("applied → saved card with grant summary", async () => {
    const grants: GrantableFlag[] = ["A1", "V1"];
    const onSave = vi.fn(async () => ({ kind: "saved", state: "applied", grants }) as const);
    render(<RoleRecognizeControl roleToken={TOKEN} onSave={onSave} />);
    expand();
    fireEvent.click(screen.getByTestId("role-recognize-check-A1"));
    fireEvent.click(screen.getByTestId("role-recognize-check-V1"));
    fireEvent.click(screen.getByTestId("role-recognize-save"));
    await waitFor(() => expect(screen.getByTestId("role-recognize-saved")).toBeInTheDocument());
    expect(screen.getByText(COPY.SAVED_HEADING)).toBeInTheDocument();
    expect(screen.getByText(COPY.savedSummary(TOKEN, grants))).toBeInTheDocument();
  });

  it("applied with no grants summarizes as the standard show page", async () => {
    const onSave = vi.fn(async () => ({ kind: "saved", state: "applied", grants: [] }) as const);
    render(<RoleRecognizeControl roleToken={TOKEN} onSave={onSave} />);
    expand();
    fireEvent.click(screen.getByTestId("role-recognize-save"));
    await waitFor(() => expect(screen.getByTestId("role-recognize-saved")).toBeInTheDocument());
    expect(screen.getByText(COPY.savedSummary(TOKEN, []))).toHaveTextContent(
      COPY.STANDARD_PAGE_SUMMARY,
    );
  });

  it("apply_pending → same saved card, pending summary line", async () => {
    const onSave = vi.fn(
      async () => ({ kind: "saved", state: "apply_pending", grants: ["A1"] }) as const,
    );
    render(<RoleRecognizeControl roleToken={TOKEN} onSave={onSave} />);
    expand();
    fireEvent.click(screen.getByTestId("role-recognize-save"));
    await waitFor(() => expect(screen.getByTestId("role-recognize-saved")).toBeInTheDocument());
    expect(screen.getByText(COPY.APPLY_PENDING_SUMMARY)).toBeInTheDocument();
  });

  it("stale → its own benign notice, not the error box", async () => {
    const onSave = vi.fn(async () => ({ kind: "stale" }) as const);
    render(<RoleRecognizeControl roleToken={TOKEN} onSave={onSave} />);
    expand();
    fireEvent.click(screen.getByTestId("role-recognize-save"));
    await waitFor(() => expect(screen.getByTestId("role-recognize-stale")).toBeInTheDocument());
    expect(screen.getByText(COPY.STALE_COPY)).toBeInTheDocument();
    expect(screen.queryByTestId("role-recognize-error")).toBeNull();
  });

  it("conflict → its own benign notice, not the error box", async () => {
    const onSave = vi.fn(async () => ({ kind: "conflict" }) as const);
    render(<RoleRecognizeControl roleToken={TOKEN} onSave={onSave} />);
    expand();
    fireEvent.click(screen.getByTestId("role-recognize-save"));
    await waitFor(() => expect(screen.getByTestId("role-recognize-conflict")).toBeInTheDocument());
    expect(screen.getByText(COPY.CONFLICT_COPY)).toBeInTheDocument();
    expect(screen.queryByTestId("role-recognize-error")).toBeNull();
  });

  it("error → plain copy, selections kept, retry relabel", async () => {
    const onSave = vi.fn(async () => ({ kind: "error" }) as const);
    render(<RoleRecognizeControl roleToken={TOKEN} onSave={onSave} />);
    expand();
    fireEvent.click(screen.getByTestId("role-recognize-check-A1"));
    fireEvent.click(screen.getByTestId("role-recognize-save"));
    await waitFor(() => expect(screen.getByTestId("role-recognize-error")).toBeInTheDocument());
    expect(screen.getByTestId("role-recognize-error")).toHaveTextContent(COPY.ERROR_COPY);
    expect(screen.getByTestId("role-recognize-error")).toHaveAttribute("role", "alert");
    // selections kept
    expect(screen.getByTestId("role-recognize-check-A1")).toBeChecked();
    // button relabels to the retry copy
    expect(screen.getByTestId("role-recognize-save")).toHaveTextContent(COPY.RETRY_LABEL);
  });
});

describe("RoleRecognizeControl — revise", () => {
  it("saved → Change what they see reopens the panel prefilled and submits with mode revise", async () => {
    const outcomes: RoleRecognizeSaveOutcome[] = [
      { kind: "saved", state: "applied", grants: ["A1", "V1"] },
      { kind: "saved", state: "applied", grants: ["A1", "V1", "FINANCIALS"] },
    ];
    let call = 0;
    const onSave = vi.fn(async () => outcomes[call++]!);
    render(<RoleRecognizeControl roleToken={TOKEN} onSave={onSave} />);
    expand();
    fireEvent.click(screen.getByTestId("role-recognize-check-A1"));
    fireEvent.click(screen.getByTestId("role-recognize-check-V1"));
    fireEvent.click(screen.getByTestId("role-recognize-save"));
    await waitFor(() => expect(screen.getByTestId("role-recognize-saved")).toBeInTheDocument());

    fireEvent.click(screen.getByTestId("role-recognize-change"));
    // reopened, prefilled from the just-saved grants
    expect(screen.getByTestId("role-recognize-check-A1")).toBeChecked();
    expect(screen.getByTestId("role-recognize-check-V1")).toBeChecked();
    expect(screen.getByTestId("role-recognize-check-FINANCIALS")).not.toBeChecked();

    fireEvent.click(screen.getByTestId("role-recognize-check-FINANCIALS"));
    fireEvent.click(screen.getByTestId("role-recognize-save"));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(2));
    expect(onSave.mock.calls[1]).toEqual([["A1", "V1", "FINANCIALS"], "revise"]);
  });

  it("revised → saved card shows the next-sheet-check convergence copy, NOT the applied/pending summary", async () => {
    // updateRoleTokenMapping runs NO show refresh — convergence is the next sheet
    // check. The saved card must therefore carry EDIT_SAVED_CONFIRM, never the
    // "People with <TOKEN> now see …" applied summary nor the apply_pending line.
    const grants = ["A1", "V1"] as const;
    const onSave = vi.fn(
      async () => ({ kind: "saved", state: "revised", grants: [...grants] }) as const,
    );
    render(<RoleRecognizeControl roleToken={TOKEN} onSave={onSave} />);
    expand();
    fireEvent.click(screen.getByTestId("role-recognize-save"));
    await waitFor(() => expect(screen.getByTestId("role-recognize-saved")).toBeInTheDocument());
    expect(screen.getByText(COPY.EDIT_SAVED_CONFIRM)).toBeInTheDocument();
    expect(screen.queryByText(COPY.savedSummary(TOKEN, [...grants]))).toBeNull();
    expect(screen.queryByText(COPY.APPLY_PENDING_SUMMARY)).toBeNull();
    // Still the teal ✓ card with the reopen affordance.
    expect(screen.getByTestId("role-recognize-saved")).toHaveAttribute("data-state", "revised");
    expect(screen.getByTestId("role-recognize-change")).toBeInTheDocument();
  });
});

// ── Transition inventory audit (spec §8.1) ────────────────────────────────
// The ONLY two animated entrances are the panel expand (collapsed→idle) and the
// saved-card swap (saving→saved), both via the `role-recognize-pop` keyframe.
// Every other reachable state — error box, the stale/conflict benign notices — is
// instant (no animation class). The spinner is the third animation (saving), an
// in-place indicator, not a transition.
const POP = "role-recognize-pop";

describe("RoleRecognizeControl — transition inventory", () => {
  it("collapsed→idle: the expanded panel carries the pop entrance", () => {
    render(<RoleRecognizeControl roleToken={TOKEN} onSave={vi.fn()} />);
    expand();
    expect(screen.getByTestId("role-recognize-panel").className).toContain(POP);
  });

  it("saving→saved: the saved card carries the pop entrance", async () => {
    const onSave = vi.fn(
      async () => ({ kind: "saved", state: "applied", grants: ["A1"] }) as const,
    );
    render(<RoleRecognizeControl roleToken={TOKEN} onSave={onSave} />);
    expand();
    fireEvent.click(screen.getByTestId("role-recognize-save"));
    await waitFor(() => expect(screen.getByTestId("role-recognize-saved")).toBeInTheDocument());
    // outer container (data-phase="saved") is the animated entrance element
    const card = screen.getByTestId("role-recognize-control");
    expect(card).toHaveAttribute("data-phase", "saved");
    expect(card.className).toContain(POP);
  });

  it("saving→error is instant: the error box carries no animation class", async () => {
    const onSave = vi.fn(async () => ({ kind: "error" }) as const);
    render(<RoleRecognizeControl roleToken={TOKEN} onSave={onSave} />);
    expand();
    fireEvent.click(screen.getByTestId("role-recognize-save"));
    await waitFor(() => expect(screen.getByTestId("role-recognize-error")).toBeInTheDocument());
    expect(screen.getByTestId("role-recognize-error").className).not.toContain(POP);
  });

  it.each([
    ["stale", "role-recognize-stale"],
    ["conflict", "role-recognize-conflict"],
  ] as const)("%s notice is instant (no animation class)", async (kind, testid) => {
    const onSave = vi.fn(async () => ({ kind }) as RoleRecognizeSaveOutcome);
    render(<RoleRecognizeControl roleToken={TOKEN} onSave={onSave} />);
    expand();
    fireEvent.click(screen.getByTestId("role-recognize-save"));
    await waitFor(() => expect(screen.getByTestId(testid)).toBeInTheDocument());
    expect(screen.getByTestId(testid).className).not.toContain(POP);
  });
});

// ── Live regions + focus management (impeccable P2) ────────────────────────
describe("RoleRecognizeControl — live regions + focus", () => {
  it("expanding moves focus to the panel heading", async () => {
    render(<RoleRecognizeControl roleToken={TOKEN} onSave={vi.fn()} />);
    expand();
    await waitFor(() => expect(screen.getByText(COPY.PANEL_HEADING)).toHaveFocus());
  });

  it("saved card is a status live region and takes focus on save", async () => {
    const onSave = vi.fn(
      async () => ({ kind: "saved", state: "applied", grants: ["A1"] }) as const,
    );
    render(<RoleRecognizeControl roleToken={TOKEN} onSave={onSave} />);
    expand();
    fireEvent.click(screen.getByTestId("role-recognize-save"));
    await waitFor(() => expect(screen.getByTestId("role-recognize-saved")).toBeInTheDocument());
    expect(screen.getByTestId("role-recognize-control")).toHaveAttribute("role", "status");
    await waitFor(() => expect(screen.getByText(COPY.SAVED_HEADING)).toHaveFocus());
  });

  it("stale / conflict notices are status live regions", async () => {
    const onSave = vi.fn(async () => ({ kind: "stale" }) as const);
    render(<RoleRecognizeControl roleToken={TOKEN} onSave={onSave} />);
    expand();
    fireEvent.click(screen.getByTestId("role-recognize-save"));
    await waitFor(() => expect(screen.getByTestId("role-recognize-stale")).toBeInTheDocument());
    expect(screen.getByTestId("role-recognize-stale")).toHaveAttribute("role", "status");
  });
});

// ── Boundary: action selection ─────────────────────────────────────────────
function warn(over: Partial<ParseWarning> = {}): ParseWarning {
  return {
    severity: "warn",
    code: "UNKNOWN_ROLE_TOKEN",
    message: "role not recognized",
    roleToken: TOKEN,
    blockRef: { kind: "crew", index: 0, name: "Marcus Webb" },
    ...over,
  };
}

describe("RoleRecognizeControlBoundary — action selection", () => {
  it("renders nothing for a non-role warning / missing roleToken", () => {
    // A warning with NO roleToken key (exactOptionalPropertyTypes: omitted, not undefined).
    const legacy: ParseWarning = {
      severity: "warn",
      code: "UNKNOWN_ROLE_TOKEN",
      message: "role not recognized",
    };
    const { container } = render(
      <RoleRecognizeControlBoundary surface="show" showId="s1" warning={legacy} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("show surface → mapRoleToken(showId, token, grants)", async () => {
    vi.mocked(mapRoleToken).mockResolvedValue({ ok: true, state: "applied" });
    render(<RoleRecognizeControlBoundary surface="show" showId="show-1" warning={warn()} />);
    expand();
    fireEvent.click(screen.getByTestId("role-recognize-check-A1"));
    fireEvent.click(screen.getByTestId("role-recognize-save"));
    await waitFor(() => expect(mapRoleToken).toHaveBeenCalledTimes(1));
    expect(mapRoleToken).toHaveBeenCalledWith("show-1", TOKEN, ["A1"]);
  });

  it("wizard surface → mapRoleTokenStaged(sessionId, driveFileId, token, grants)", async () => {
    vi.mocked(mapRoleTokenStaged).mockResolvedValue({ ok: true, state: "apply_pending" });
    render(
      <RoleRecognizeControlBoundary
        surface="wizard"
        wizardSessionId="wiz-1"
        driveFileId="drive-1"
        warning={warn()}
      />,
    );
    expand();
    fireEvent.click(screen.getByTestId("role-recognize-check-V1"));
    fireEvent.click(screen.getByTestId("role-recognize-save"));
    await waitFor(() => expect(mapRoleTokenStaged).toHaveBeenCalledTimes(1));
    expect(mapRoleTokenStaged).toHaveBeenCalledWith("wiz-1", "drive-1", TOKEN, ["V1"]);
  });

  it("revise submits through updateRoleTokenMapping, never the create action", async () => {
    vi.mocked(mapRoleToken).mockResolvedValue({ ok: true, state: "applied" });
    vi.mocked(updateRoleTokenMapping).mockResolvedValue({ ok: true });
    render(<RoleRecognizeControlBoundary surface="show" showId="show-1" warning={warn()} />);
    expand();
    fireEvent.click(screen.getByTestId("role-recognize-check-A1"));
    fireEvent.click(screen.getByTestId("role-recognize-save"));
    await waitFor(() => expect(screen.getByTestId("role-recognize-saved")).toBeInTheDocument());

    fireEvent.click(screen.getByTestId("role-recognize-change"));
    fireEvent.click(screen.getByTestId("role-recognize-check-FINANCIALS"));
    fireEvent.click(screen.getByTestId("role-recognize-save"));
    await waitFor(() => expect(updateRoleTokenMapping).toHaveBeenCalledTimes(1));
    expect(updateRoleTokenMapping).toHaveBeenCalledWith(TOKEN, ["A1", "FINANCIALS"]);
    expect(mapRoleToken).toHaveBeenCalledTimes(1); // the create call only, not the revise
    // A revise runs no show refresh → the saved card shows the convergence copy, not
    // the "now see" applied summary (which would overclaim an immediate live effect).
    // waitFor: the action mock resolving does not mean the saving→saved state flip
    // has flushed yet (CI run 29510981605 caught the DOM still at data-phase="saving").
    await waitFor(() => expect(screen.getByText(COPY.EDIT_SAVED_CONFIRM)).toBeInTheDocument());
    expect(screen.queryByText(COPY.savedSummary(TOKEN, ["A1", "FINANCIALS"]))).toBeNull();
  });
});

// ── site scoping + token-qualified trigger accessible name (spec 2026-07-17) ──
function allTestidsSuffixed(root: ParentNode, suffix: string) {
  const nodes = Array.from(root.querySelectorAll("[data-testid]"));
  expect(nodes.length).toBeGreaterThan(0);
  for (const n of nodes) expect(n.getAttribute("data-testid")!.endsWith(`-${suffix}`)).toBe(true);
}

describe("RoleRecognizeControl — site scoping (spec 2026-07-17 §7.1)", () => {
  // Drive collapsed → save with a given onSave outcome, sweeping the suffix at
  // every phase the outcome exposes (terminal leaf differs per outcome).
  async function driveAndSweep(outcome: RoleRecognizeSaveOutcome) {
    const onSave = vi.fn().mockResolvedValue(outcome);
    const q = render(
      <RoleRecognizeControl roleToken="SLED DRIVER" site="showpage" onSave={onSave} />,
    );
    allTestidsSuffixed(q.container, "showpage"); // collapsed
    fireEvent.click(q.getByTestId("role-recognize-trigger-showpage"));
    allTestidsSuffixed(q.container, "showpage"); // panel/idle (none-helper, checks, save, cancel)
    fireEvent.click(q.getByTestId("role-recognize-check-A1-showpage"));
    fireEvent.click(q.getByTestId("role-recognize-save-showpage"));
    const terminal =
      outcome.kind === "saved"
        ? "role-recognize-saved-showpage"
        : outcome.kind === "stale"
          ? "role-recognize-stale-showpage"
          : outcome.kind === "conflict"
            ? "role-recognize-conflict-showpage"
            : "role-recognize-error-showpage";
    await waitFor(() => expect(q.getByTestId(terminal)).toBeTruthy());
    allTestidsSuffixed(q.container, "showpage"); // terminal phase
    cleanup();
  }

  it("every leaf suffixed across saved / stale / conflict / error phases", async () => {
    await driveAndSweep({ kind: "saved", state: "applied", grants: ["A1"] });
    await driveAndSweep({ kind: "stale" });
    await driveAndSweep({ kind: "conflict" });
    await driveAndSweep({ kind: "error" });
  });

  it("site absent: bare testids (byte-identical)", () => {
    const onSave = vi.fn();
    const q = render(<RoleRecognizeControl roleToken="SLED DRIVER" onSave={onSave} />);
    expect(q.getByTestId("role-recognize-control")).toBeTruthy();
    expect(q.getByTestId("role-recognize-trigger")).toBeTruthy();
  });
});

describe("RoleRecognizeControl — trigger accessible name (spec §7.2, WCAG 2.5.3)", () => {
  it("aria-label contains the token AND the rendered visible label", () => {
    const onSave = vi.fn();
    const q = render(<RoleRecognizeControl roleToken="SLED DRIVER" onSave={onSave} />);
    const trigger = q.getByTestId("role-recognize-trigger");
    // Rendered visible text with the aria-hidden chevron removed — derived from the
    // DOM (NOT COPY.TRIGGER_LABEL) so a future visible-text change without an
    // aria-label change is caught (label-in-name).
    const clone = trigger.cloneNode(true) as HTMLElement;
    clone.querySelectorAll("[aria-hidden='true']").forEach((el) => el.remove());
    const visible = clone.textContent!.trim();
    const aria = trigger.getAttribute("aria-label")!;
    expect(visible.length).toBeGreaterThan(0);
    expect(aria).toContain(visible);
    expect(aria).toContain("SLED DRIVER");
  });
});
