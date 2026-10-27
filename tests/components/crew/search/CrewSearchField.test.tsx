// @vitest-environment jsdom
/**
 * tests/components/crew/search/CrewSearchField.test.tsx (crew show search, Task 15)
 *
 * The search field and the shared search state (spec §6.2, §6.8, §10):
 * - focus enters Hint; blur keeps search active; 2+ characters enter Results
 *   or No match; clear empties and refocuses; Escape clears, then ends; Cancel
 *   clears and ends.
 * - Every user-visible string is typed here LITERALLY from spec §10. This file
 *   never imports lib/search/copy.ts, so a wrong constant fails.
 *
 * The Header slot and its unchanged-markup baseline live in
 * tests/components/layout/Header.search.test.tsx.
 */
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";

import { CrewSearchField, CrewSearchHint } from "@/components/crew/search/CrewSearchField";
import { CrewSearchProvider, useCrewSearch } from "@/components/crew/search/CrewSearchProvider";
import type { SearchIndex } from "@/lib/search/types";
import { FIXTURE_INDEX } from "../../../search/_fixtureIndex";

afterEach(() => {
  cleanup();
});

/** Renders the provider's phase so the state machine is observable on its own. */
function PhaseProbe() {
  const { phase, query, active } = useCrewSearch();
  return (
    <output data-testid="phase" data-active={String(active)} data-query={query}>
      {phase}
    </output>
  );
}

function renderField(index: SearchIndex = FIXTURE_INDEX) {
  render(
    <CrewSearchProvider index={index} missLogging={false}>
      <CrewSearchField />
      <CrewSearchHint />
      <PhaseProbe />
    </CrewSearchProvider>,
  );
  return screen.getByRole("searchbox", { name: "Search this show" });
}

const phase = () => screen.getByTestId("phase").textContent;
const cancel = () => screen.queryByRole("button", { name: "Cancel" });
const clear = () => screen.queryByRole("button", { name: "Clear search" });
const HINT = "Search Wi-Fi, the dock, rooms, gear, people and more.";

describe("CrewSearchField: states (spec §6.2)", () => {
  it("starts Idle: field only, no Cancel, no hint", () => {
    renderField();
    expect(phase()).toBe("idle");
    expect(cancel()).toBeNull();
    expect(screen.queryByText(HINT)).toBeNull();
  });

  it("focus enters Hint: Cancel appears and the hint text renders", () => {
    const input = renderField();
    fireEvent.focus(input);
    expect(phase()).toBe("hint");
    expect(cancel()).toBeInTheDocument();
    expect(screen.getByText(HINT)).toBeInTheDocument();
  });

  it("blur keeps search active", () => {
    const input = renderField();
    fireEvent.focus(input);
    fireEvent.blur(input);
    expect(phase()).toBe("hint");
    expect(cancel()).toBeInTheDocument();
  });

  it("one character stays in Hint; two characters enter Results when something matches", () => {
    const input = renderField();
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "w" } });
    expect(phase()).toBe("hint");
    fireEvent.change(input, { target: { value: "wi" } });
    expect(phase()).toBe("results");
    expect(screen.queryByText(HINT)).toBeNull();
  });

  it("two characters enter No match when nothing matches", () => {
    const input = renderField();
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "qz" } });
    expect(phase()).toBe("nomatch");
  });

  it("an empty index is valid: every query shows No match", () => {
    const input = renderField({ entries: [] });
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "wifi" } });
    expect(phase()).toBe("nomatch");
  });

  it("clear (x) renders only with a query, empties it, keeps search active and refocuses", () => {
    const input = renderField();
    fireEvent.focus(input);
    expect(clear()).toBeNull();
    fireEvent.change(input, { target: { value: "dock" } });
    const button = clear();
    expect(button).toBeInTheDocument();
    button!.focus();
    fireEvent.click(button!);
    expect(input).toHaveValue("");
    expect(phase()).toBe("hint");
    expect(document.activeElement).toBe(input);
    expect(clear()).toBeNull();
  });

  it("Escape with text clears and stays active; Escape when empty ends search", () => {
    const input = renderField();
    act(() => input.focus());
    fireEvent.change(input, { target: { value: "dock" } });
    fireEvent.keyDown(input, { key: "Escape" });
    expect(input).toHaveValue("");
    expect(phase()).toBe("hint");
    expect(document.activeElement).toBe(input);
    fireEvent.keyDown(input, { key: "Escape" });
    expect(phase()).toBe("idle");
    expect(cancel()).toBeNull();
  });

  it("Cancel clears the query and ends search", () => {
    const input = renderField();
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "dock" } });
    fireEvent.click(cancel()!);
    expect(input).toHaveValue("");
    expect(phase()).toBe("idle");
    expect(cancel()).toBeNull();
  });

  it("typing into a field that ended search while focused makes search active again", () => {
    const input = renderField();
    fireEvent.focus(input);
    fireEvent.keyDown(input, { key: "Escape" });
    expect(phase()).toBe("idle");
    fireEvent.change(input, { target: { value: "dock" } });
    expect(phase()).toBe("results");
  });
});

describe("CrewSearchField: markup and copy (spec §6.8, §10)", () => {
  it("is an input type=search named 'Search this show' inside role=search", () => {
    const input = renderField();
    expect(input).toHaveAttribute("type", "search");
    expect(input.closest('[role="search"]')).not.toBeNull();
  });

  it("uses the spec §10 placeholder, clear label and Cancel text verbatim", () => {
    const input = renderField();
    expect(input).toHaveAttribute("placeholder", "Find anything: Wi-Fi, dock, hotel…");
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "dock" } });
    expect(screen.getByRole("button", { name: "Clear search" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toHaveTextContent(/^Cancel$/);
  });

  it("the Hint state renders the spec §10 hint text verbatim", () => {
    const input = renderField();
    fireEvent.focus(input);
    expect(screen.getByText(HINT).textContent).toBe(
      "Search Wi-Fi, the dock, rooms, gear, people and more.",
    );
  });
});
