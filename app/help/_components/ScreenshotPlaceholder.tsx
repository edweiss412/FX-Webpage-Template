// app/help/_components/ScreenshotPlaceholder.tsx
//
// DRAFT-ONLY component. Phase H Task H.4 enforces zero references in shipped
// v1 MDX. Use during Phase E content authoring before Phase F captures real
// screenshots, then replace each with <Screenshot name="..." alt="..." />.

export function ScreenshotPlaceholder({
  alt,
  caption,
}: {
  alt: string;
  caption?: string;
}) {
  return (
    <figure className="my-4">
      <div
        role="img"
        aria-label={alt}
        className="aspect-video w-full rounded border-2 border-dashed border-border-strong bg-surface-raised flex items-center justify-center text-center p-4"
      >
        <span className="text-sm italic text-text-subtle">
          Screenshot pending: {alt}
        </span>
      </div>
      {caption && (
        <figcaption className="mt-2 text-xs text-text-subtle text-center">
          {caption}
        </figcaption>
      )}
    </figure>
  );
}
