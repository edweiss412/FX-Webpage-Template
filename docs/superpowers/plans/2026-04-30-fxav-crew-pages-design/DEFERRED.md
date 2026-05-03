# Deferred Items Log

Non-blocking findings from milestone adversarial reviews that were intentionally deferred rather than fixed in-milestone. Each item names a suggested home milestone where it should be picked up. **This is not a TODO list to clear automatically** — every entry has context for why it was deferred and where the right place to address it is.

When picking up a deferred item:
1. Move it from "Open" to "In progress" with the milestone it landed in.
2. Resolve it in that milestone's handoff doc convergence log.
3. Update the row to "Resolved" with the commit SHA + milestone reference.

---

## Open

### M2-D1 — Hardcoded admin allow-list rotation

**Source:** M2 adversarial review, Round 1 advisory note
**Description:** `ADMIN_EMAILS` is env-driven (set once in `.env.local` per spec §14.3), but there is no documented rotation procedure, audit trail, or in-product UX for adding/removing admins. Today the only path is "edit env, redeploy."
**Why deferred:** Out of M2 schema scope. Doesn't block anything functional — admins work, the allow-list is honored. It's an ops-hardening question.
**Suggested home:** M9 (polish) or X.* (cross-cutting). Could also land as a separate ops doc rather than code.

### M2-D2 — Static-vs-runtime breadth for the 21 admin-table RLS matrix

**Source:** M2 adversarial review, Round 1 advisory note
**Description:** AC-2.5 tests pin the §4.3 admin-only table list (21 tables × 4 verbs = 84 cells) at schema-introspection time. There is no runtime probe that the *live* policy set still matches §4.3 after future migrations land. A future migration could silently drop or weaken a policy and current tests wouldn't catch it.
**Why deferred:** M2's introspection coverage is correct for "what shipped at M2." Runtime drift detection is a separate concern, and the right time to add it is when there are actually multiple migrations in play (M3+).
**Suggested home:** X.6 (traceability matrix walker) — it already enumerates spec sections, can be extended to assert live-policy parity. Alternatively land it as part of the next M2-touching migration.

### M2-D3 — `transportation.show_id` single-row uniqueness model

**Source:** M2 adversarial review, Round 1 advisory note
**Description:** Schema treats `(show_id)` as the unique key on `transportation`, allowing only one transport row per show. Spec §4 / parser output supports a single transport block per show, but production-shaped sheets sometimes carry multiple drivers/vehicles per show.
**Why deferred:** Matches current spec + parser. Changing it requires a spec amendment, not a fix-in-place. Until a real fixture demands multi-driver, the constraint is intentional.
**Suggested home:** Treat as a spec question. If/when a fixture surfaces with multi-driver, open a brainstorming session for a spec amendment, then schema-bump in a new migration (NOT an edit of the M2 file).

### M2-D4 — Missing introspection pin for `crew_members_show_id_name_key`

**Source:** M2 adversarial review, Round 1 advisory note
**Description:** The `crew_members_show_id_name_key` named unique constraint exists in the migration but is not asserted by name in `tests/db/schema-introspection.test.ts`. Other named constraints in the same table are pinned.
**Why deferred:** Cosmetic — the constraint is in place and functions correctly; it's just missing from the introspection allow-list. Unlikely to drift in isolation.
**Suggested home:** Fold into the next M2-touching change (e.g., when M5/M6 add code that depends on the constraint). One-line test addition.

### M2-D5 — Seed's hardcoded restage fixture filename

**Source:** M2 adversarial review, Round 1 advisory note
**Description:** `supabase/seed.ts` hardcodes a specific raw-fixture filename for the restage scenario rather than deriving it from `fixtures/shows/raw/`. If that fixture is renamed or replaced, seed silently breaks.
**Why deferred:** Works against today's fixture set. The general fix (glob + filter) is mild refactoring that's easier to do alongside the next seed change rather than in isolation.
**Suggested home:** Whenever seed is next touched (likely during M4 tile development when a new fixture variant is needed for testing).

### M2-D6 — App-side advisory-lock helper shape deferred to consumer milestones

**Source:** M2 adversarial review, Round 1 advisory note
**Description:** Plan-wide invariant §1.2 mandates per-show advisory locks on every code path that mutates `shows` / `crew_members` / `crew_member_auth` / `pending_syncs` / `pending_ingestions`, with tests asserting the lock is held. M2 ships the schema that supports this; the actual helper and the lock-held tests live with the code paths that hold the lock (M5 auth, M6 sync).
**Why deferred:** Defensible separation of concerns — testing "the lock is held" requires a code path that holds it, which doesn't exist until M5/M6.
**Suggested home:** M5 handoff §6 (watchpoints) — explicitly call out that M5's auth-side mutations need the helper authored. M6 handoff §6 — same for sync. The helper itself probably belongs in `lib/db/advisoryLock.ts`.

---

## Resolved

_(empty)_
