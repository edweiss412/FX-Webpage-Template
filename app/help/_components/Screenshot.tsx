const BASE = "/help/screenshots";

export function Screenshot({
  name,
  alt,
  caption,
}: {
  // Manifest key (matches scripts/help-screenshots.manifest.ts `key` field).
  // Phase F's _metaScreenshotManifest meta-test (test #9) catches missing
  // manifest entries. Phase F's screenshot-coverage test (test #8) catches
  // missing WebPs on disk.
  //
  // NOTE: prop is `name`, NOT `key`. `key` is React-reserved and would never
  // arrive in props.
  name: string;
  alt: string;
  caption?: string;
}) {
  // r4 fix per D-r3 finding 2: an empty name would render
  // `/help/screenshots/-light.webp` (broken image) without failing the build.
  // Throw eagerly so a typo like `<Screenshot name="" ...>` becomes a hard
  // render-time error caught by H.3's MDX smoke test instead of a silently
  // shipped 404. Spec §6.3 already documents this as "Empty `name` → build
  // fails."
  if (name.trim() === "") {
    throw new Error(
      `<Screenshot>: \`name\` prop is empty. Provide a manifest key, e.g. <Screenshot name="dashboard-overview" />.`,
    );
  }
  return (
    <figure className="my-4">
      <picture>
        <source
          media="(prefers-color-scheme: dark)"
          srcSet={`${BASE}/${name}-dark.webp`}
        />
        <img
          src={`${BASE}/${name}-light.webp`}
          alt={alt}
          className="block w-full rounded border border-border"
          loading="lazy"
          decoding="async"
        />
      </picture>
      {caption && (
        <figcaption className="mt-2 text-xs text-text-subtle text-center">
          {caption}
        </figcaption>
      )}
    </figure>
  );
}
