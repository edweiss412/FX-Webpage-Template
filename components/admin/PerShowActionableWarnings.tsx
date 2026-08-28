import { isMessageCode, messageFor } from "@/lib/messages/lookup";
import type { MessageCode } from "@/lib/messages/catalog";
import { buildSheetDeepLink } from "@/lib/sheet-links/buildSheetDeepLink";
import { renderEmphasis } from "@/components/messages/renderEmphasis";
import { candidateLabel } from "@/lib/parser/candidateLabel";
import { labelFromRawSnippet } from "@/lib/parser/rawSnippet";
import { autocorrectGuidance } from "@/lib/messages/autocorrectGuidance";
import type { ParseWarning } from "@/lib/parser/types";
import { stableWarningKeys } from "@/lib/dataQuality/warningIdentity";
import { CompactAlertCard } from "@/components/admin/CompactAlertCard";
import { CompactAlertHelp } from "@/components/admin/compactAlertHelp";
import { NewTabHint } from "@/components/shared/NewTabHint";
import type { ReactNode } from "react";

/**
 * Operator-actionable parse warnings (SCHEDULE_TIME_UNPARSED, UNKNOWN_ROLE_TOKEN,
 * UNKNOWN_DAY_RESTRICTION, FIELD_UNREADABLE) with a source-sheet deep link when
 * the scan resolved the offending cell/region. Renders the catalog TITLE (else
 * the human .message) — NEVER the bare code (invariant 5).
 *
 * Laid out as `CompactAlertCard` (spec 2026-07-20-show-alert-compact §4.2):
 * the offending row label collapses into the detail band, and the catalog's
 * helpful context moved into the `?` popover. The "Open in Sheet" deep link and
 * the item controls share ONE controls band — link inline at the left, the
 * controls cluster pushed to the right (ml-auto) — so the link never occupies
 * its own footer row. `renderItemControls` returns a full cluster (Report/Ignore,
 * the use-raw radio interface, the role editor), which is why this lives in the
 * expansive controls band rather than the footer's right cluster (spec §3.3,
 * amendment A1).
 *
 * These cards carry no stripe: the live surface never had one, so the shell's
 * `review` default is overridden explicitly on the warning path as well as the
 * muted one.
 *
 * Pure presentational: `items` are ALREADY filtered + deduped + stable-ordered by
 * `operatorActionableWarnings` at the data boundary (the per-show page and the
 * StagedRow derivation), so the filter runs exactly once per surface (whole-diff
 * R1). Renders nothing when `items` is empty. Shared by the per-show panel and
 * StagedReviewCard.
 */
/** Guard: spec 2026-07-20-warning-card-copy-restore §5 - empty/whitespace/absent copy fields render nothing. */
export function warningCardCopyFields(
  entry: { helpfulContext?: string | null; triggerContext?: string | null } | null,
): { guidance: string | null; trigger: string | null } {
  const pick = (v: string | null | undefined) =>
    typeof v === "string" && v.trim().length > 0 ? v.trim() : null;
  return { guidance: pick(entry?.helpfulContext), trigger: pick(entry?.triggerContext) };
}

// The inline guidance line, discriminated so the render site knows whether it is a
// composed instance string (plain text, injection-safe) or catalog markup (rendered
// via renderEmphasis) — spec 2026-07-21-warning-card-identity-placement §4.4. Explicit
// union so `kind` does not widen under strict TS.
export type GuidanceResult =
  | { kind: "instance"; text: string }
  | { kind: "catalog"; markup: string | null };

/** Resolve the card's inline guidance: the composed autocorrect line when available,
 *  else the catalog helpfulContext (today's behavior). */
export function resolveGuidance(
  entry: { helpfulContext?: string | null; triggerContext?: string | null } | null,
  warning: ParseWarning,
): GuidanceResult {
  const instance = autocorrectGuidance(warning.code, warning.autocorrect);
  if (instance !== null) return { kind: "instance", text: instance };
  return { kind: "catalog", markup: warningCardCopyFields(entry).guidance };
}

/**
 * Append the catalog's controls note to CATALOG guidance, and only then. An INSTANCE
 * (autocorrect) line is left alone - it describes what we read on this row, and the
 * controls sentence is a property of the card, not of the instance - and a null note
 * leaves the guidance untouched. Pure and exported so spec §4.3's guard table is
 * unit-testable without a render.
 */
export function withControlsNote(guidance: GuidanceResult, note: string | null): GuidanceResult {
  if (guidance.kind === "instance" || note === null) return guidance;
  const markup = [guidance.markup, note]
    .filter((p): p is string => typeof p === "string" && p.trim().length > 0)
    .join(" ");
  return { kind: "catalog", markup: markup.length > 0 ? markup : null };
}

/** Condensed popover slots (spec 2026-07-23-crewwarn-underrow-polish §3): DERIVED
 *  from full mode's two slots so the described set is {movedGuidance} ∪ full mode's
 *  described set in every row — fullBody keeps its described position, followUp
 *  keeps its full-mode slot. Pure + exported so the 8-row table is unit-testable. */
export function condensedPopoverSlots(args: {
  movedGuidance: string | null;
  context: string | null;
  followUp: string | null;
}): { popoverBody: string | null; afterBodyText: string | null } {
  const { movedGuidance, context, followUp } = args;
  const fullBody = context ?? followUp;
  const fullAfter = context !== null ? followUp : null;
  const popoverBody =
    movedGuidance !== null && fullBody !== null
      ? `${movedGuidance} ${fullBody}`
      : (movedGuidance ?? fullBody);
  return { popoverBody, afterBodyText: fullAfter };
}

export function PerShowActionableWarnings({
  items,
  driveFileId,
  renderItemControls,
  tone = "warning",
  followUpCopy,
  condensed,
  showControlsNote,
}: {
  items: ParseWarning[];
  driveFileId: string | null;
  /** Optional per-item controls slot (per-show admin panel only; absent on StagedReviewCard). */
  renderItemControls?: (w: ParseWarning, i: number) => ReactNode;
  /** `warning` (default): the active amber card skin. `muted`: de-emphasized skin for
   *  the collapsed "Ignored (N)" list — reads as resolved, not active. AA contrast kept
   *  (text-strong title + text-subtle body on surface-sunken); no opacity dimming. */
  tone?: "warning" | "muted";
  /** warning-surface-trim §4.1/§4.3: appended to each card's help popover after
   *  the code's `triggerContext`. Supplied by the PUBLISHED extras factory only
   *  (`components/admin/showpage/sectionWarningExtras.tsx`); `StagedReviewCard`
   *  passes nothing and is unchanged. Caller-supplied rather than hardcoded here
   *  because the sentence names the Re-sync affordance, which exists on the
   *  published surface and not on the staged one.
   *
   *  Normalized by the SAME rule as `triggerContext` (see `warningCardCopyFields`
   *  above): trimmed, and an empty result is treated as absent, so a
   *  whitespace-only value cannot manufacture an empty popover. */
  followUpCopy?: string;
  /** Under-row placement (spec 2026-07-23-crewwarn-underrow-polish §3): the catalog
   *  guidance line moves into the `?` popover BODY; instance (autocorrect) guidance
   *  stays inline. Switches on `condensed === true`; false ≡ omitted. Group,
   *  fallback, ignored, and staged surfaces omit this — full copy unchanged. */
  condensed?: boolean;
  /** Spec 2026-08-27-wizard-warning-row-links-copy §4.3: append the catalog's
   *  `controlsNote` to catalog guidance. Passed by the two ACTIVE per-show mounts only
   *  (`components/admin/showpage/sectionWarningExtras.tsx`), because they are the mounts
   *  that render `DataQualityWarningControls` with Report + Ignore. The ignored list does
   *  NOT pass it: its controls read Report + Un-ignore, and a sentence naming "Ignore"
   *  beside an Un-ignore button is wrong. StagedReviewCard and the attention gallery pass
   *  nothing and are unchanged. */
  showControlsNote?: boolean;
}) {
  if (items.length === 0) return null;
  // Order-independent keys so an ignore-driven refresh does not remount surviving
  // cards (which would drop an open Report modal). See lib/dataQuality/warningIdentity.
  const keys = stableWarningKeys(items);
  // The "Open in Sheet" link's focus ring-offset must match the card background it sits on,
  // or the 2px gap renders Tailwind v4's default (white) on the tinted card (same class the
  // DQIGNORE-5 button ringOffset work fixed; impeccable audit class-sweep). Full literal
  // strings so the JIT resolves each.
  const linkOffsetClass =
    tone === "muted"
      ? "focus-visible:ring-offset-surface-sunken"
      : "focus-visible:ring-offset-warning-bg";
  return (
    <ul className="flex flex-col gap-2" data-testid="per-show-actionable-warnings">
      {items.map((w, i) => {
        const entry = isMessageCode(w.code) ? messageFor(w.code as MessageCode) : null;
        // invariant 5 (whole-diff R1): catalog title when present, else the human
        // .message — but NEVER the bare code, even if a producer's .message IS its
        // code (defense beyond the four known human-message codes).
        const humanMessage = w.message && w.message !== w.code ? w.message : null;
        const title = (entry?.title ?? null) || humanMessage || "Data quality issue";
        // Inline guidance = condensed helpfulContext; popover = triggerContext
        // (spec 2026-07-20-warning-card-copy-restore §3.3 - reverses #509 G2).
        const { trigger: context } = warningCardCopyFields(entry);
        // Inline guidance: the composed autocorrect instance line (plain text) when
        // available, else catalog helpfulContext markup (spec §4.4).
        // Gated on the EXPLICIT PROP only. React renders `undefined`, `false` and `""` as
        // nothing, so a `renderItemControls` that returned a node is not evidence that a
        // control is on the card; the prop is the mount's promise, and only the two active
        // per-show mounts make it (spec §4.3, amended at plan review R1).
        const controlsNote =
          showControlsNote === true &&
          typeof entry?.controlsNote === "string" &&
          entry.controlsNote.trim().length > 0
            ? entry.controlsNote.trim()
            : null;
        const guidanceResult = withControlsNote(resolveGuidance(entry, w), controlsNote);
        // §4.3 four-row guard table. Both inputs collapse to "absent" under one
        // rule, so `undefined`, null, "", and any whitespace run behave alike
        // and the table is total over each input's full domain.
        //
        // Gated on `w.sourceCell` (whole-diff review finding 3). The sentence
        // says "Edit the cell", and a warning WITHOUT a source cell has no cell
        // to edit: the asset and Drive codes (DIAGRAMS_TAB_MISSING,
        // OPENING_REEL_PERMISSION_DENIED, AGENDA_*, LINKED_FOLDER_*) are raised
        // by `lib/sync/enrichWithDrivePins.ts:162`, which builds every warning as
        // `{severity, code, message}` with no cell, and are fixed in Drive or in
        // the sheet's TAB STRUCTURE, not in a cell. Two of them carry no
        // `triggerContext` either, so ungated this handed those cards a brand-new
        // popover whose entire content was advice that does not apply to them.
        // The cell is the referent the sentence already names, so this is the
        // condition the copy was always making — now stated.
        // Gated on a1, not on the anchor (spec 2026-08-27 §2.4): the sentence says "Edit
        // the cell", and a TAB-level anchor names no cell. A cell anchor and a region
        // range both keep it exactly as before.
        const followUp =
          typeof w.sourceCell?.a1 === "string" &&
          w.sourceCell.a1.trim().length > 0 &&
          typeof followUpCopy === "string" &&
          followUpCopy.trim().length > 0
            ? followUpCopy.trim()
            : null;
        // Spec 2026-07-22-warning-panel-polish §3.1: the follow-up is a second
        // popover paragraph OUTSIDE the aria-describedby text run, not joined
        // into the body. Guard boundary (§3.1): with a null trigger context the
        // follow-up IS the body — the only content of a producer-less defensive
        // case — so the card keeps a described popover instead of losing its
        // trigger entirely. `context` is already `string | null` (the
        // warningCardCopyFields ternary above), the one nullable sentinel.
        const isCondensed = condensed === true;
        const movedGuidance =
          isCondensed && guidanceResult.kind === "catalog" ? guidanceResult.markup : null;
        // Full mode: movedGuidance is null, so this degenerates to exactly the
        // two expressions it replaced (body = context ?? followUp; after =
        // context !== null ? followUp : null) — byte-identical output.
        const { popoverBody, afterBodyText } = condensedPopoverSlots({
          movedGuidance,
          context,
          followUp,
        });

        // Branch on the RESULT, never on `sourceCell` alone: a non-null cell with a
        // null driveFileId still yields no link (spec §5.2).
        const href = w.sourceCell ? buildSheetDeepLink(driveFileId, w.sourceCell) : null;

        // The offending row label (from rawSnippet "<label> | <value>"): the
        // catalog title is generic, so this identifies the row even when the
        // deep link is absent (legacy/ambiguous anchor).
        //
        // ONLY UNKNOWN_FIELD writes rawSnippet in the `<label> | <value>` shape
        // (lib/parser/warnings.ts emitUnknownField). Other
        // OPERATOR_ACTIONABLE_ANCHORED codes — PULL_SHEET_AMBIGUOUS_FORMAT /
        // PULL_SHEET_PARSE_PARTIAL — carry a RAW pipe-delimited markdown ROW as
        // rawSnippet, so labelFromRawSnippet would render a garbled first-cell
        // fragment as a fake field label. Gate the muted label on UNKNOWN_FIELD
        // (audit idx46/#217).
        const rawLabel = w.code === "UNKNOWN_FIELD" ? labelFromRawSnippet(w.rawSnippet) : null;
        const rowLabel = rawLabel && rawLabel.trim().length > 0 ? rawLabel.trim() : null;

        // FIELD_UNREADABLE discriminator band (spec 2026-07-23-crewwarn-instance-discriminator
        // §2.2). USABLE rule: string + non-empty after trim, rendered trimmed; anything else
        // (null, number, object — the jsonb boundary is unvalidated) is ABSENT. Render-side
        // only; the identity/dedup folds use the raw string. Name renders in full mode only:
        // condensed cards sit under the member's crew row, where the name would duplicate it.
        const usable = (v: unknown): string | null =>
          typeof v === "string" && v.trim().length > 0 ? v.trim() : null;
        const fieldRaw = w.code === "FIELD_UNREADABLE" ? usable(w.blockRef?.field) : null;
        const fieldLabel =
          fieldRaw === null
            ? null
            : fieldRaw === "phone"
              ? "Phone"
              : fieldRaw === "email"
                ? "Email"
                : fieldRaw;
        const bandName = isCondensed ? null : usable(w.blockRef?.name);
        const bandValue = usable(w.rawSnippet);
        // Name and value render in SEPARATE spans (whole-diff R2): a single joined
        // string lets delimiter-bearing sheet data collapse two distinct warnings into
        // one visible text (name `Jordan · "office"` + value `night` vs name `Jordan` +
        // value `office" · "night`). Separate spans keep the (name, value) tuple
        // distinct in the DOM, and the proportional name vs mono quoted value keeps
        // them typographically distinct on screen. Name is prose, so break-words —
        // the mono/break-all treatment is reserved for the junk value.
        const fieldBand: ReactNode = fieldLabel ? (
          <span
            className="inline-flex min-w-0 flex-wrap items-center gap-1.5"
            data-testid="per-show-actionable-field-label"
          >
            <span className="text-[10px] font-semibold tracking-wider break-all text-warning-text uppercase">
              {fieldLabel}
            </span>
            {bandName !== null ? (
              <span
                className="min-w-0 text-xs wrap-break-word text-text"
                data-testid="per-show-actionable-field-name"
              >
                {bandName}
              </span>
            ) : null}
            {bandName !== null && bandValue !== null ? (
              <span aria-hidden="true" className="text-xs text-text-subtle">
                ·
              </span>
            ) : null}
            {bandValue !== null ? (
              <span
                className="font-mono text-xs break-all text-text"
                data-testid="per-show-actionable-field-label-value"
              >
                {`"${bandValue}"`}
              </span>
            ) : null}
          </span>
        ) : null;

        const detailBand: ReactNode = rowLabel ? (
          <span
            className="inline-flex items-center gap-1.5"
            data-testid="per-show-actionable-row-label"
          >
            <span className="text-[10px] font-semibold tracking-wider text-warning-text uppercase">
              Sheet row
            </span>
            <span
              className="font-mono text-xs text-text"
              data-testid="per-show-actionable-row-label-value"
            >
              {rowLabel}
            </span>
          </span>
        ) : null;

        // The matched vocabulary label the near-miss detector attached (spec §3.2). Same band
        // grammar as `Sheet row` above, which is the shipped detail-band idiom, with its own
        // testids.
        //
        // `Closest match` is a NOUN phrase, so it reads as a field label like every other
        // eyebrow in this family (`Sheet row`, `Phone`, `Email`) rather than a predicate. It is
        // also the weaker and more accurate claim: `candidate` is `match.entry.raw`, the first
        // spelling inserted when the vocabulary was built, so on the live corpus it can be a
        // SECTION HEADER (`DETAILS/ROOM DIAGRAM`, knownSections.ts), one of several equally
        // valid aliases shown in the shoutiest form (`VENUE ADDRESS`, aliases.ts), or a known
        // corpus typo (`DIagrams`, types.ts). "Looks like" asserts resemblance and is at its
        // most confident exactly where it is least right.
        //
        // NOT mono, and that is the point of the pairing. `Sheet row` is Doug's own string and
        // mono invites the character-by-character comparison. This is OUR nearest vocabulary
        // entry, and mono would read as "reproduce this exactly" under a card whose imperative
        // is "rename the row" (spec §8 limit 4).
        //
        // `min-w-0` + `wrap-break-word` match the twin on wizard step 3 and the sibling
        // `fieldBand` value above, which carries `min-w-0` + `break-all`. Without them the
        // value cannot wrap INSIDE its band: the enclosing detail band is `flex-wrap`, but
        // that wraps BETWEEN bands. The longest vocabulary entry today is 25 characters
        // (`Hotel Contact Information`, measured over `buildVocabulary()`'s 132 entries), so
        // it clears a 390px viewport by a margin that is a property of the DATA, not of the
        // CSS. Word-boundary wrapping rather than `break-all`: these are labels with spaces,
        // not the junk values `fieldBand` quotes.
        //
        // No `w.code` gate. The guard is on the FIELD, and `candidate` is set on no other code
        // (fieldNearMiss.ts is the sole producer), so a second predicate could only ever agree
        // with the first.
        const candidate = candidateLabel(w);
        const candidateBand: ReactNode = candidate ? (
          <span
            className="inline-flex min-w-0 flex-wrap items-center gap-1.5"
            data-testid="per-show-actionable-candidate"
          >
            <span className="text-[10px] font-semibold tracking-wider text-warning-text uppercase">
              Closest match
            </span>
            <span
              className="min-w-0 text-xs wrap-break-word text-text"
              data-testid="per-show-actionable-candidate-value"
            >
              {candidate}
            </span>
          </span>
        ) : null;

        // §3.3 collapse. `present()` (CompactAlertCard.tsx) is four inequalities, and a JSX
        // fragment is an object satisfying all four, so wrapping unconditionally would render a
        // bordered but EMPTY band on every card with no detail content. The shell deliberately
        // does not special-case that (compactAlertCard.test.tsx asserts the band RENDERS for 0,
        // NaN and [], over a comment saying adapters normalize), so the collapse belongs here.
        // Written as a conditional rather than `[a, b].filter(Boolean)`: an array of children
        // needs keys, and two literal children in a fragment do not.
        const detail = detailBand ?? fieldBand;
        const combinedDetail: ReactNode =
          detail && candidateBand ? (
            <>
              {detail}
              {candidateBand}
            </>
          ) : (
            (detail ?? candidateBand)
          );

        const sheetLink: ReactNode = href ? (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className={`inline-flex min-h-tap-min min-w-0 items-center truncate text-xs font-medium text-text-strong underline underline-offset-2 focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:outline-none ${linkOffsetClass}`}
          >
            Open in Sheet <span aria-hidden="true">↗</span> <NewTabHint />
          </a>
        ) : null;

        const controls = renderItemControls ? renderItemControls(w, i) : null;

        // Single controls band: the "Open in Sheet" link sits inline at the left,
        // the item controls pushed to the right (ml-auto) — never its own footer row.
        const controlsBand: ReactNode =
          sheetLink || controls ? (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              {sheetLink}
              {controls ? (
                <div className={`flex flex-wrap items-center gap-2 ${sheetLink ? "ml-auto" : ""}`}>
                  {controls}
                </div>
              ) : null}
            </div>
          ) : null;

        return (
          <li key={keys[i]} data-testid="per-show-actionable-item">
            <CompactAlertCard
              tone={tone}
              stripe="none"
              message={
                <span className="flex min-w-0 flex-col gap-1">
                  <span data-testid="per-show-actionable-title" className="text-text-strong">
                    {renderEmphasis(title)}
                  </span>
                  {guidanceResult.kind === "instance" ? (
                    <span
                      data-testid="per-show-actionable-guidance"
                      className={`text-xs/relaxed font-normal ${tone === "muted" ? "text-text-subtle" : "text-warning-text"}`}
                    >
                      {/* Plain text — sheet-derived params are never parsed as markup (§4.4). */}
                      {guidanceResult.text}
                    </span>
                  ) : !isCondensed && guidanceResult.markup ? (
                    <span
                      data-testid="per-show-actionable-guidance"
                      className={`text-xs/relaxed font-normal ${tone === "muted" ? "text-text-subtle" : "text-warning-text"}`}
                    >
                      {renderEmphasis(guidanceResult.markup)}
                    </span>
                  ) : null}
                </span>
              }
              helpTrigger={
                popoverBody !== null ? (
                  <CompactAlertHelp
                    subject={typeof title === "string" ? title : null}
                    popoverCopy={popoverBody}
                    {...(afterBodyText !== null ? { afterBodyText } : {})}
                    // No helpHref on this surface, so the Learn-more route gate
                    // is never consulted; the constant keeps this a server component.
                    helpHref={null}
                    route="/admin"
                    testId={`per-show-actionable-help-${keys[i]}`}
                  />
                ) : null
              }
              detailBand={combinedDetail}
              controlsBand={controlsBand}
            />
          </li>
        );
      })}
    </ul>
  );
}
