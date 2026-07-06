<!--
  Hand-authored CAPABILITY fixture for the BO-venue-header anchor
  (spec docs/superpowers/specs/2026-07-06-bo-venue-header-anchor.md).
  NOT a Drive render. Exercises the six §6 cases. This fixture is
  deliberately EXCLUDED from the frozen corpus-no-op baseline
  (tests/parser/blocks/__baselines__/origin-main-rooms.json) — it is the
  one place a dims-only BO-venue header is expected to admit a room.
-->

| BO Venue Header Test Show |
| :---: |

<!-- Case 1: dims-only breakout admitted; immediately followed (no blank) by Case 5 -->
| SALON ABCD&#10;60' x 45' | SALON ABCD&#10;60' x 45' |
| :---: | :---: |
| BO Setup | A |
| BO Set Time | 8 AM |
| BO Audio | 2 mics |
| BO Video | screen |
| MERIDIAN&#10;40' x 30' | MERIDIAN&#10;40' x 30' |
| :---: | :---: |
| BO Setup | m-setup |
| BO Audio | m-audio |

<!-- Case 2: label|value asset directly above a BO block — must NOT become a room -->
| PROJECTION SCREEN | 5' x 9' |
| BO Setup | screen-only |

<!-- Case 3: label|value asset, no BO block — must NOT become a room -->
| 4' X 8' RISER | staging |

<!-- Case 4: real DAY-range breakout — owned by the v1 loop, not double-emitted -->
| GRAND HALL&#10;DAY 1 & 2 | GRAND HALL&#10;DAY 1 & 2 |
| :---: | :---: |
| BO Setup | gh-setup |
| BO Video | gh-video |

<!-- Case 6: admitted ORCHID block immediately followed (no blank) by a rejected
     label|value asset + BO block. The rejected PROJECTOR CART header must still
     terminate ORCHID's extraction so ORCHID.setup stays 'orchid-setup'. -->
| ORCHID&#10;50' x 40' | ORCHID&#10;50' x 40' |
| :---: | :---: |
| BO Setup | orchid-setup |
| PROJECTOR CART | 3' x 4' |
| BO Setup | cart-setup |
