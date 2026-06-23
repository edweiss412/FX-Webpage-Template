// app/help/errors/page.tsx
// M11 Phase E.13: catalog-iterating reference page. Server component — no
// client JS of its own (RefAnchor is the only client island).
//
// Audit Chunk 4 (help-readability): the flat, alphabetical, dozens-long index
// is grouped by code family under plain `<h2 id="kebab">` section headings with
// a top jump-list, each code shows its CODE (the thing Doug copies from /admin),
// and the "tell Eric" CTA renders ONCE at the bottom instead of under every
// entry. The h2 group level also fixes the prior h1 -> h3 outline skip
// (DEFERRED.md D7) without widening RefAnchor's catalog-code-only VALID_ID
// (D.5 contract): catalog codes keep RefAnchor + copy-link; the family headings
// are plain chapter-style `<h2 id="...">` anchors (the jump-list targets).
import { Fragment } from "react";
import { MESSAGE_CATALOG, type MessageCatalogEntry } from "@/lib/messages/catalog";
import { RefAnchor } from "@/app/help/_components/RefAnchor";
import { Callout } from "@/app/help/_components/Callout";
import { FAMILIES, OTHER, familyFor } from "@/app/help/errors/_families";

// AC-11.6 predicate: severity !== "info" AND dougFacing != null AND all three
// M11 fields non-null. The live-catalog biconditional in
// tests/messages/_metaErrorCatalogDocs.test.ts proves the M11 fields are
// populated for every predicate entry; this filter is the runtime mirror.
function isRenderable(entry: MessageCatalogEntry): boolean {
  return (
    entry.severity !== "info" &&
    entry.dougFacing !== null &&
    entry.title !== null &&
    entry.longExplanation !== null &&
    entry.helpHref !== null
  );
}

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
        <code>/admin</code>, it shows a short code (like <code>SYNC_STALLED</code>). Find that code
        below to learn what it means and what to do.
      </p>
      <p>
        Entries are grouped by the part of the app they come from. Jump to a section, or search the
        page for your code with <kbd>Ctrl</kbd>/<kbd>⌘</kbd>+<kbd>F</kbd>. Still stuck after reading
        it? There is a contact link at the foot of the page.
      </p>

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

      <Callout type="note">
        {/* AC-11.11 r10: the trailing CTA is "tell Eric →" (link text + aria-label
            pinned by tests/help/page-errors.test.tsx); rendered ONCE here instead
            of under every entry (audit Chunk 4). The link is the closing clause so
            the decorative arrow sits at the sentence terminus. aria-label drops
            the arrow from the accessible name. */}
        Read your code&rsquo;s explanation above, and note the code and what you were doing.{" "}
        <a
          href="mailto:edweiss412@gmail.com?subject=FXAV%20bug%3A&body=What%20happened%3A%0A%0AWhich%20code%3A%0A"
          aria-label="If this keeps happening, tell Eric"
          className="underline underline-offset-2"
        >
          If this keeps happening, tell Eric →
        </a>
      </Callout>
    </>
  );
}
