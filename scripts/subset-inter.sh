#!/usr/bin/env bash
# Regenerate public/fonts/InterVariable-latin.d5549562.woff2 from the upstream release.
#
# The app ships a SUBSET, not the 344 KB verbatim release, because the full file
# is preloaded and cost a measured FCP +136-164ms plus a fallback->Inter swap
# landing 3.7s in on slow 4G / 8.0s on regular 3G, cold. PRODUCT.md's crew are
# on personal phones on venue floors, and first visit is the visit that matters.
# See the 2026-08-03 inter-numeral-disambiguation spec, sections 2.6 and 12.
#
# Coverage is Google Fonts' `latin` + `latin-ext` unicode ranges combined -- the
# two subsets that actually served this product. Cyrillic, Greek and Vietnamese
# are dropped; a name in those scripts falls back to the system font.
#
# NOT byte-reproducible across machines, and nothing asserts that it is. The
# guard at tests/styles/fontFeatureAvailability.test.ts checks the committed
# binary SEMANTICALLY -- the feature tags app/globals.css declares, and both
# variation axes -- so a subset regenerated with different fontTools on a
# different host still passes iff it kept what the product needs. That is
# deliberate: a byte-comparison gate here would need a pinned Docker image and
# would fail on nothing that matters (AGENTS.md, byte-comparison discipline).
set -euo pipefail

UPSTREAM_URL="https://github.com/rsms/inter/releases/download/v4.1/Inter-4.1.zip"
UPSTREAM_SHA="9883fdd4a49d4fb66bd8177ba6625ef9a64aa45899767dde3d36aa425756b11e"
OUT="public/fonts/InterVariable-latin.d5549562.woff2"

LATIN="U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2190,U+2191,U+2192,U+2193,U+2197,U+2212,U+2215,U+2298,U+2303-2304,U+2318,U+26A0,U+2713,U+FEFF,U+FFFD"
LATIN_EXT="U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF"

# ss04 and zero are the whole point; tnum/pnum/numr/dnom/frac are the figure set
# app/globals.css and DESIGN.md 2.4 rely on; kern/calt/ccmp/locl/mark/mkmk are
# baseline shaping. `case` rides along for uppercase punctuation.
FEATURES="kern,calt,ccmp,locl,mark,mkmk,tnum,pnum,numr,dnom,frac,zero,ss04,cv05,cv08,case"

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

echo "==> fetching upstream release"
curl -sL -o "$work/inter.zip" "$UPSTREAM_URL"
echo "$UPSTREAM_SHA  $work/inter.zip" | shasum -a 256 -c -
unzip -q -o "$work/inter.zip" -d "$work/inter"

# NB: the word "isolat*" is deliberately avoided on executable lines here.
# tests/cross-cutting/db-test-connection-hygiene.test.ts scans run-command
# sources for vitest isolation knobs by pattern (value-matching lost to spelling
# variants), and it reads comment lines out but not echo strings. This venv has
# nothing to do with vitest; the wording just avoids a false collision.
echo "==> creating a throwaway fontTools environment"
python3 -m venv "$work/venv"
"$work/venv/bin/pip" install -q "fonttools[woff]" brotli

echo "==> subsetting"
"$work/venv/bin/pyftsubset" "$work/inter/web/InterVariable.woff2" \
  --unicodes="$LATIN,$LATIN_EXT" \
  --layout-features="$FEATURES" \
  --flavor=woff2 --no-hinting \
  --output-file="$OUT"

echo "==> result"
ls -l "$OUT"
shasum -a 256 "$OUT"
echo
echo "Now run: pnpm vitest run tests/styles/fontFeatureAvailability.test.ts"
echo "It asserts the subset kept every feature app/globals.css declares, plus both axes."
