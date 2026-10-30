"use client";

/**
 * components/crew/search/CrewSearchField.tsx — the crew search field and its
 * Hint line (spec §6.2, §6.8, §6.9, §10).
 *
 * `CrewSearchField` mounts in the page header (`Header`'s `search` slot).
 *
 * Focus alone changes nothing (WCAG 3.2.1 On Focus). Search hides the sub-nav
 * and the section body, which is a change of context, so it starts on the user's
 * input instead: the first typed character, or any edit that leaves the query
 * non-empty. Focus, and the click or tap that gives a text field focus, never
 * start it, and that holds for a query a result tap kept too: the next edit
 * brings its results back, or Enter (the phone keyboard's Search key), which is
 * an explicit submit. Blur does NOT end search, so dismissing a phone keyboard
 * keeps the results.
 *
 * Search ends on Cancel, on Escape with an empty query, and on a result tap (the
 * results own that one). Cancel unmounts itself, so it hands focus back to the
 * field, now Idle and empty; by the rule above that focus starts nothing.
 *
 * Dimensional invariants (spec §6.9): the field box is a fixed 52px (`h-13`);
 * the input fills it with `self-stretch`; the clear button is 44 by 44
 * (`size-tap-min`, `self-center`); Cancel is `min-h-tap-min`, `self-center`.
 *
 * `CrewSearchHint` renders the Hint state's line in the results area below the
 * header, and nothing in any other state.
 */

import { SearchIcon, XIcon } from "lucide-react";
import type { KeyboardEvent } from "react";

import { useCrewSearch } from "@/components/crew/search/CrewSearchProvider";
import { SEARCH_COPY } from "@/lib/search/copy";

export function CrewSearchField() {
  const { query, setQuery, active, setActive, endSearch, fieldRef } = useCrewSearch();

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      // Our own handling replaces the browser's native search-field clear.
      event.preventDefault();
      if (query !== "") setQuery("");
      else endSearch({ keepQuery: false });
    } else if (event.key === "Enter") {
      // The phone keyboard's Search key: a submit, so a kept query's results
      // come back; then put the keyboard away, keeping the results.
      if (query !== "") setActive(true);
      event.currentTarget.blur();
    }
  };

  const onClear = () => {
    setQuery("");
    fieldRef.current?.focus();
  };

  const onCancel = () => {
    endSearch({ keepQuery: false });
    // The Cancel button is about to unmount; without this, focus falls to the
    // document body (impeccable audit U2).
    fieldRef.current?.focus();
  };

  return (
    <div role="search" data-testid="crew-search-field" className="flex items-center gap-2">
      <div
        data-testid="crew-search-box"
        className="flex h-13 min-w-0 flex-1 items-center gap-2 rounded-md border border-text-faint bg-surface pl-4 pr-1 transition-colors duration-fast focus-within:border-text-subtle focus-within:ring-2 focus-within:ring-focus-ring"
      >
        <SearchIcon aria-hidden="true" className="size-5 shrink-0 text-text-subtle" />
        <input
          ref={fieldRef}
          type="search"
          data-testid="crew-search-input"
          aria-label={SEARCH_COPY.inputName}
          placeholder={SEARCH_COPY.placeholder}
          value={query}
          enterKeyHint="search"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          onChange={(event) => {
            const next = event.target.value;
            setQuery(next);
            if (next !== "") setActive(true);
          }}
          onKeyDown={onKeyDown}
          className="min-h-tap-min w-full min-w-0 self-stretch bg-transparent text-base text-text-strong placeholder:text-text-subtle focus:outline-none [&::-webkit-search-cancel-button]:appearance-none"
        />
        {query !== "" ? (
          <button
            type="button"
            data-testid="crew-search-clear"
            aria-label={SEARCH_COPY.clear}
            onClick={onClear}
            className="inline-flex size-tap-min shrink-0 items-center justify-center self-center rounded-sm text-text transition-colors duration-fast hover:bg-surface-sunken hover:text-text-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
          >
            <XIcon aria-hidden="true" className="size-5" />
          </button>
        ) : null}
      </div>
      {active ? (
        <button
          type="button"
          data-testid="crew-search-cancel"
          onClick={onCancel}
          className="inline-flex min-h-tap-min shrink-0 items-center self-center rounded-sm px-2 text-base font-semibold text-accent-on-bg underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
        >
          {SEARCH_COPY.cancel}
        </button>
      ) : null}
    </div>
  );
}

export function CrewSearchHint() {
  const { phase } = useCrewSearch();
  if (phase !== "hint") return null;
  return (
    <p data-testid="crew-search-hint" className="text-base text-text-subtle">
      {SEARCH_COPY.hint}
    </p>
  );
}
