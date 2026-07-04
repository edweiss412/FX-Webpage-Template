/**
 * components/admin/ShowsTableHeading.tsx
 *
 * The shows-table section heading. When a watched Drive folder name is present,
 * it renders as an IDENTIFIER: a small "Watched folder" eyebrow over the name in
 * a monospace face — so a slug-style name (lowercase, hyphens, underscores)
 * reads as a deliberate folder identifier rather than a mis-styled human title.
 * Falls back to the plain bucket label ("Active shows" / "Archived shows") when
 * no folder name is set.
 *
 * The folder name (or the fallback label) is the <h3> heading; the eyebrow is a
 * sibling label, so heading-navigation still lands on the name. Shared by the
 * active (ShowsTable) and archived (Dashboard) bucket headers so the treatment
 * stays identical across both.
 */
export function ShowsTableHeading({
  folderName,
  fallbackLabel,
}: {
  folderName: string | null;
  fallbackLabel: string;
}) {
  if (!folderName) {
    return (
      <h3 className="min-w-0 wrap-break-word text-lg font-semibold text-text-strong">
        {fallbackLabel}
      </h3>
    );
  }
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <span
        data-testid="shows-heading-eyebrow"
        className="text-xs font-medium uppercase text-text-subtle"
        style={{ letterSpacing: "var(--tracking-eyebrow)" }}
      >
        Watched folder
      </span>
      <h3 className="min-w-0 wrap-break-word font-mono text-base font-medium tracking-tight text-text-strong">
        {folderName}
      </h3>
    </div>
  );
}
