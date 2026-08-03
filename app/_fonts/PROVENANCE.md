# Font provenance

`InterVariable.woff2` in this directory is a vendored upstream release binary. It is **not** build output — nothing in this repo generates it, and no CI gate compares its bytes. That is the point: a signed release artifact needs no reproducibility story, which is why the alternative of committing a subsetted font was rejected. See `docs/superpowers/specs/2026-08-03-inter-numeral-disambiguation-design.md` §2.6.

| | |
| --- | --- |
| Family | Inter |
| Version | v4.1 |
| Upstream | https://github.com/rsms/inter/releases/download/v4.1/Inter-4.1.zip |
| Path inside the release | web/InterVariable.woff2 |
| Fetched | 2026-08-03 |
| License | SIL Open Font License 1.1 — full text in `LICENSE.txt`, shipped verbatim from the same release |

## Checksums

```
693b77d4f32ee9b8bfc995589b5fad5e99adf2832738661f5402f9978429a8e3  InterVariable.woff2
9883fdd4a49d4fb66bd8177ba6625ef9a64aa45899767dde3d36aa425756b11e  Inter-4.1.zip
```

Verify with `shasum -a 256 InterVariable.woff2`.

## Why upstream rather than Google Fonts

Google Fonts serves a build of Inter with the character-variant and stylistic-set features stripped. Measured 2026-08-03 against the live latin subset: `calt ccmp dnom frac kern locl mark mkmk numr pnum tnum`, `wght` axis only. No `zero`, no `cv05`, no `cv08`, no `cv11`, no `ss01`–`ss08`, no `case`, no `opsz`.

This file carries all of them plus the `opsz` axis. `tests/styles/fontFeatureAvailability.test.ts` asserts that every OpenType tag `app/globals.css` declares is actually present here, so a repeat of the two-year-dead `cv11` declaration fails the build instead of rendering nothing.

## Replacing it

Download the release, verify the zip checksum above, copy `web/InterVariable.woff2` and `LICENSE.txt` out of it, update the version, URL, date, and both checksums in this file, and run the font tests. Do not subset it in place — if subsetting becomes necessary, that is a spec-level decision about payload, not a maintenance step.
