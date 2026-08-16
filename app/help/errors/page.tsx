// app/help/errors/page.tsx
// M11 Phase E.13: catalog-iterating reference page. Server component — its
// only client islands are RefAnchor and the trailing HelpReportCta.
//
// Audit Chunk 4 (help-readability): the flat, alphabetical, dozens-long index
// is grouped by code family under plain `<h2 id="kebab">` section headings with
// a top jump-list, each code shows its CODE (the thing Doug copies from /admin),
// and the report CTA renders ONCE at the bottom instead of under every
// entry. The h2 group level also fixes the prior h1 -> h3 outline skip
// (DEFERRED.md D7) without widening RefAnchor's catalog-code-only VALID_ID
// (D.5 contract): catalog codes keep RefAnchor + copy-link; the family headings
// are plain chapter-style `<h2 id="...">` anchors (the jump-list targets).
import { Fragment } from "react";
import { MESSAGE_CATALOG, type MessageCatalogEntry } from "@/lib/messages/catalog";
import { RefAnchor } from "@/app/help/_components/RefAnchor";
import { Callout } from "@/app/help/_components/Callout";
import { HelpReportCta } from "@/app/help/errors/_components/HelpReportCta";
import { FAMILIES, OTHER, familyFor } from "@/app/help/errors/_families";
// Full-sweep copy plan (Task 9): the page's own renderability filter is now
// the shared catalogDocsValidator predicate (single source with the T2-4
// catalog-fill work and the live-catalog meta-test in
// tests/messages/_metaErrorCatalogDocs.test.ts) instead of a locally
// redefined `severity !== "info"` check. This drops the blanket info-severity
// exclusion, so audience-gated info codes (ROLE_FLAGS_NOTICE,
// SHOW_FIRST_PUBLISHED) render here like any other Doug-facing code, while
// non-admin-alert info copy (audience undefined) stays excluded. The
// live-catalog meta-test guarantees every predicate-true entry already has
// non-null title/longExplanation/helpHref, so no separate field-null filter
// is needed on top of the predicate.
import { predicate as isRenderable } from "@/lib/messages/catalogDocsValidator";

export default function ErrorsPage() {
  const entries = (Object.values(MESSAGE_CATALOG) as MessageCatalogEntry[])
    .filter(isRenderable)
    .sort((a, b) => a.code.localeCompare(b.code));

  // Group, preserving the alpha sort within each family. Render a family only
  // when it has entries (so empty families + the Other fallback stay hidden).
  const groups = [...FAMILIES, OTHER]
    .map((family) => ({
      family,
      entries: entries.filter((e) => familyFor(e.code).id === family.id),
    }))
    .filter((g) => g.entries.length > 0);

  // No wrapper element: these render as direct children of the layout's
  // `.help-prose` div so the prose typography layer (app/globals.css) styles the
  // h1/h2/h3 and the per-code links.
  return (
    <>
      <h1>Errors</h1>
      <p>
        Every error this app surfaces has a plain-language explanation here. When you hit one in{" "}
        <code>/admin</code>, it shows a short code in capital letters. Find that code below to learn
        what it means and what to do.
      </p>
      <p>
        Entries are grouped by the part of the app they come from. Jump to a section, or search the
        page for your code with <kbd>Ctrl</kbd>/<kbd>⌘</kbd>+<kbd>F</kbd>. Still stuck after reading
        it? There is a report button at the foot of the page.
      </p>

      {/* BL-HELP-REFANCHOR-A11Y-PASS finding 3: this page renders a copy-link
          beside every catalog entry, so a keyboard-only reader crosses ~219
          stops before reaching the report button. This is the first focusable
          element the page fragment contributes — it must precede the jump-list
          nav, whose family anchors would otherwise come first. Class recipe is
          the layout skip link's verbatim (app/help/layout.tsx), which already
          carries the tap floor and the canonical tokens. */}
      <a
        href="#report"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-overlay focus:inline-flex focus:min-h-tap-min focus:items-center focus:rounded-md focus:border focus:border-border-strong focus:bg-surface-raised focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-text-strong focus:shadow-tile focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
      >
        Skip to the report button
      </a>

      <nav aria-label="Jump to an error category" className="my-6">
        <p className="mb-2 font-semibold text-text-strong">Jump to a section</p>
        <ul className="grid list-none grid-cols-1 gap-x-8 gap-y-1 pl-0 sm:grid-cols-2">
          {groups.map(({ family, entries: groupEntries }) => (
            <li key={family.id}>
              <a href={`#${family.id}`}>{family.title}</a>{" "}
              <span className="text-text-subtle">({groupEntries.length})</span>
            </li>
          ))}
        </ul>
      </nav>

      {/* Fragments (not <section>): the family h2 + blurb must be DIRECT
          children of the layout's `.help-prose` div, because the prose layer
          styles headings via the direct-child combinator (`.help-prose > h2`).
          A wrapper element would leave the h2 at body size. */}
      {groups.map(({ family, entries: groupEntries }) => (
        <Fragment key={family.id}>
          <h2 id={family.id}>{family.title}</h2>
          <p className="text-text-subtle">{family.blurb}</p>
          {groupEntries.map((entry) => (
            <Fragment key={entry.code}>
              <RefAnchor id={entry.code} as="h3">
                {entry.title}
              </RefAnchor>
              <p className="mb-1">
                {/* break-all: the longest codes are single unbreakable
                    underscore tokens (~43 chars) that would overflow the 390px
                    column without a break opportunity. */}
                <code className="text-sm break-all">{entry.code}</code>
              </p>
              <p>{entry.longExplanation}</p>
            </Fragment>
          ))}
        </Fragment>
      ))}

      {/* The skip link's target. `tabIndex={-1}` for the Safari/VoiceOver
          combos that do not move focus on fragment navigation without it — the
          same caveat the layout documents on <main id="main">. The wrapper is
          deliberately tight around the Callout so the next Tab after the jump
          lands on the report button rather than on a catalog entry. */}
      <div id="report" tabIndex={-1}>
        <Callout type="note">
          {/* AC-11.11 r12 (2026-08-09 spec §2.5) retires the r11 mailto stopgap:
            the trailing CTA is the §13.1 surface-5 report button, rendered ONCE
            here rather than under every entry (audit Chunk 4). The button
            captures whichever code anchor the reader arrived on, so the prose
            does not ask them to retype it. */}
          <p className="mb-3">
            Read your code&rsquo;s explanation above. If it keeps happening after that, report it
            and Eric will pick it up.
          </p>
          <HelpReportCta />
        </Callout>
      </div>
    </>
  );
}
