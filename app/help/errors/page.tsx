// app/help/errors/page.tsx
// M11 Phase E.13: catalog-iterating reference page. Server component — no
// client JS. Per AC-11.11 r10 the trailing CTA is "tell Eric →" (the
// destination page never self-links back to itself).
import {
  MESSAGE_CATALOG,
  type MessageCatalogEntry,
} from "@/lib/messages/catalog";
import { RefAnchor } from "@/app/help/_components/RefAnchor";

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

  return (
    <article className="prose prose-neutral max-w-none">
      <h1>Errors</h1>
      <p>
        Every error this app surfaces has a plain-language explanation here.
        If you see one in <code>/admin</code> and want more context, look up
        the code below.
      </p>
      {entries.map((entry) => (
        <section key={entry.code} className="mt-6">
          <RefAnchor id={entry.code} as="h3">
            {entry.title}
          </RefAnchor>
          <p>{entry.longExplanation}</p>
          <p className="text-sm text-text-subtle">
            <a
              href="/admin/bug-report"
              className="underline underline-offset-2"
            >
              If this keeps happening, tell Eric →
            </a>
          </p>
        </section>
      ))}
    </article>
  );
}
