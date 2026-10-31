// @vitest-environment jsdom
/**
 * tests/components/crew/search/CrewSearchField.test.tsx (crew show search, Task 15)
 *
 * The search field and the shared search state (spec §6.2, §6.8, §10):
 * - focus alone changes nothing (WCAG 3.2.1 On Focus): search starts on the
 *   first typed character, which enters Hint; 2+ characters enter Results or
 *   No match; blur keeps search active; clear empties and refocuses; Escape
 *   clears, then ends; Cancel clears, ends, and puts focus back on the field.
 * - a query kept by a result tap does not come back on refocus; the next edit,
 *   or Enter, brings its results back.
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

/** Stands in for a result tap: ends search keeping the query (spec §6.2). */
function ResultTapProbe() {
  const { endSearch } = useCrewSearch();
  return (
    <button type="button" data-testid="result-tap" onClick={() => endSearch({ keepQuery: true })}>
      open a result
    </button>
  );
}

function renderField(index: SearchIndex = FIXTURE_INDEX) {
  render(
    <CrewSearchProvider
      slug="spring-gala"
      index={index}
      missLogging={false}
      showId="show-1"
      cardReport={null}
    >
      <CrewSearchField />
      <CrewSearchHint />
      <PhaseProbe />
      <ResultTapProbe />
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

  // WCAG 3.2.1 On Focus (impeccable audit U1): receiving focus must not change
  // the page. Search hides the wide nav and the page body, so focus, and the
  // click or tap that gives a text field focus, leave it Idle.
  it("focus alone changes nothing: still Idle, no Cancel, no hint", () => {
    const input = renderField();
    act(() => input.focus());
    fireEvent.focus(input);
    expect(document.activeElement).toBe(input);
    expect(phase()).toBe("idle");
    expect(cancel()).toBeNull();
    expect(screen.queryByText(HINT)).toBeNull();
  });

  it("a click or tap into the field changes nothing either", () => {
    const input = renderField();
    fireEvent.click(input);
    expect(phase()).toBe("idle");
    expect(cancel()).toBeNull();
  });

  it("the first typed character starts search: Hint, Cancel and the hint text", () => {
    const input = renderField();
    act(() => input.focus());
    fireEvent.change(input, { target: { value: "w" } });
    expect(phase()).toBe("hint");
    expect(cancel()).toBeInTheDocument();
    expect(screen.getByText(HINT)).toBeInTheDocument();
  });

  it("blur keeps search active", () => {
    const input = renderField();
    fireEvent.change(input, { target: { value: "w" } });
    fireEvent.blur(input);
    expect(phase()).toBe("hint");
    expect(cancel()).toBeInTheDocument();
  });

  it("one character stays in Hint; two characters enter Results when something matches", () => {
    const input = renderField();
    fireEvent.change(input, { target: { value: "w" } });
    expect(phase()).toBe("hint");
    fireEvent.change(input, { target: { value: "wi" } });
    expect(phase()).toBe("results");
    expect(screen.queryByText(HINT)).toBeNull();
  });

  it("two characters enter No match when nothing matches", () => {
    const input = renderField();
    fireEvent.change(input, { target: { value: "qz" } });
    expect(phase()).toBe("nomatch");
  });

  it("an empty index is valid: every query shows No match", () => {
    const input = renderField({ entries: [] });
    fireEvent.change(input, { target: { value: "wifi" } });
    expect(phase()).toBe("nomatch");
  });

  it("clear (x) renders only with a query, empties it, keeps search active and refocuses", () => {
    const input = renderField();
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

  // Impeccable audit U2: Cancel unmounts itself, so without a target focus fell
  // to the document body. It goes back to the field, which is then Idle and
  // empty; under the focus rule above, that focus starts nothing.
  it("Cancel clears the query, ends search and puts focus back on the field", () => {
    const input = renderField();
    fireEvent.change(input, { target: { value: "dock" } });
    const button = cancel()!;
    act(() => button.focus());
    expect(document.activeElement).toBe(button);
    fireEvent.click(button);
    expect(input).toHaveValue("");
    expect(phase()).toBe("idle");
    expect(cancel()).toBeNull();
    expect(document.activeElement).toBe(input);
  });

  it("typing into a field that ended search while focused makes search active again", () => {
    const input = renderField();
    act(() => input.focus());
    fireEvent.change(input, { target: { value: "dock" } });
    fireEvent.keyDown(input, { key: "Escape" });
    fireEvent.keyDown(input, { key: "Escape" });
    expect(phase()).toBe("idle");
    expect(document.activeElement).toBe(input);
    fireEvent.change(input, { target: { value: "dock" } });
    expect(phase()).toBe("results");
  });
});

describe("CrewSearchField: a query kept by a result tap (spec §6.2)", () => {
  function endByResultTap() {
    const input = renderField();
    fireEvent.change(input, { target: { value: "dock" } });
    expect(phase()).toBe("results");
    fireEvent.click(screen.getByTestId("result-tap"));
    expect(phase()).toBe("idle");
    expect(input).toHaveValue("dock");
    return input;
  }

  it("refocusing the field keeps the page: still Idle, query kept, no Cancel", () => {
    const input = endByResultTap();
    act(() => input.focus());
    fireEvent.focus(input);
    fireEvent.click(input);
    expect(phase()).toBe("idle");
    expect(input).toHaveValue("dock");
    expect(cancel()).toBeNull();
  });

  it("the next edit brings the results back", () => {
    const input = endByResultTap();
    act(() => input.focus());
    fireEvent.change(input, { target: { value: "dock " } });
    expect(phase()).toBe("results");
    expect(cancel()).toBeInTheDocument();
  });

  it("Enter (the phone keyboard's Search key) brings the kept results back", () => {
    const input = endByResultTap();
    act(() => input.focus());
    fireEvent.keyDown(input, { key: "Enter" });
    expect(phase()).toBe("results");
    expect(input).toHaveValue("dock");
  });

  it("an edit that empties the kept query does not start search", () => {
    const input = endByResultTap();
    act(() => input.focus());
    fireEvent.change(input, { target: { value: "" } });
    expect(phase()).toBe("idle");
    expect(cancel()).toBeNull();
  });

  it("Enter on an empty field starts nothing", () => {
    const input = renderField();
    act(() => input.focus());
    fireEvent.keyDown(input, { key: "Enter" });
    expect(phase()).toBe("idle");
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
    // Spec §10, amended 2026-10-31 (crew redesign gate re-run P3-4 / N8): the old
    // "Find anything: Wi-Fi, dock, hotel…" was cut mid-word in the 1024px header.
    expect(input).toHaveAttribute("placeholder", "Try Wi-Fi, dock, hotel…");
    // A field narrower than the copy ends it with an ellipsis, never mid-word.
    expect(input).toHaveClass("text-ellipsis");
    fireEvent.change(input, { target: { value: "dock" } });
    expect(screen.getByRole("button", { name: "Clear search" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toHaveTextContent(/^Cancel$/);
  });

  it("the Hint state renders the spec §10 hint text verbatim", () => {
    const input = renderField();
    fireEvent.change(input, { target: { value: "w" } });
    expect(screen.getByText(HINT).textContent).toBe(
      "Search Wi-Fi, the dock, rooms, gear, people and more.",
    );
  });
});
