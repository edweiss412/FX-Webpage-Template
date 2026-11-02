/**
 * components/show-panels/CrewBody.tsx
 *
 * The Crew roster body both surfaces render (crew page redesign spec §6.2,
 * `crew` row): the member list of the admin's `CrewBreakdown`. One row per
 * member up to `cap`: an avatar, the name, the role line, and the call, text and
 * email actions as drawn icons.
 *
 * - Admin: `cap` = `CREW_CAP` and its "…and N more people" note, the name as
 *   parsed ("Unnamed" when blank), the role and the partial-attendance label
 *   joined on one line (`partialAs: "line"`), sentinels as parsed, the actions at
 *   the row's end, Call and Email through the admin's raw builders, and two slots
 *   per member: the row-actions trigger and the attention stack under the row.
 *   No search markers, no test ids.
 * - Crew: `cap` = `CREW_INLINE_CAP` with the crew's overflow stub, the "You",
 *   "Lead" and partial-attendance chips beside the name (`partialAs: "chip"`),
 *   a sentinel role hidden, the actions under the identity, Call and Text only
 *   when the phone has digits and Email behind its sentinel gate (plan decision
 *   8), a search target per identity line, and `crew-panel` row test ids
 *   (`crewRows.ts`, `rosterPanel`).
 *
 * The role line renders the role as the sheet writes it and wraps (spec §9.2);
 * it is never cut to one line, so a trailing position code ("A1", "V1") stays.
 *
 * Plain props, hook-free, no context: the crew page calls it as a function
 * inside `WrappedSection`'s render callback (spec §6.1, error containment); the
 * admin's `CrewBreakdown` keeps its hooks and passes their values in.
 */
import type { ReactNode } from "react";
import { CalendarDays, Mail, MessageSquare, Phone, type LucideIcon } from "lucide-react";

import { Avatar } from "@/components/atoms/Avatar";
import { cn } from "@/lib/ui/cn";
import { shouldHideGenericOptional } from "@/lib/visibility/emptyState";

export type CrewBodyMember = {
  /** The row's key, and the key of its identity line in `targets`. */
  key: string;
  /** The heading; null renders none (the role is then the identity). */
  name: string | null;
  /** The avatar's source name (the admin's is null for an unnamed member). */
  avatarName: string | null;
  /** The role as the sheet writes it. */
  role: string | null;
  /** The partial-attendance label, placed by `partialAs`. */
  partial: string | null;
  phone: string | null;
  email: string | null;
  /** The viewer's own row: a "You" chip (crew). */
  you?: boolean;
  /** A department lead: a "Lead" chip (crew). */
  lead?: boolean;
  /** After the actions: the admin's row-actions trigger. */
  rowActions?: ReactNode;
  /** Under the row: the admin's attention stack. Given, the row hosts it. */
  underRow?: ReactNode;
};

export type CrewBodyProps = {
  members: readonly CrewBodyMember[];
  /** Rows shown; the members past it are counted, not rendered. */
  cap: number;
  /** What follows the list when `members.length - cap` is above zero. */
  overflow: (hidden: number) => ReactNode;
  /** A phone's call link, or null for none. */
  telHref: (phone: string) => string | null;
  /** A phone's text link, or null for none. Absent, no Text action renders. */
  smsHref?: (phone: string) => string | null;
  /** An email's link, or null for none. */
  mailtoHref: (email: string) => string | null;
  /** "show": a sentinel role renders as parsed (admin). "hide": it is omitted (crew). */
  sentinels: "show" | "hide";
  /** "line": the partial label joins the role line (admin). "chip": a chip by the name (crew). */
  partialAs: "line" | "chip";
  /** "end": the actions close the row (admin). "below": they sit under the identity (crew). */
  actionsPlacement: "end" | "below";
  /** Search target ids by member key (crew). Given, the avatar and the actions are skipped. */
  targets?: Readonly<Record<string, string>>;
  /** Given, each row is `${testIdPrefix}-crew-row`. */
  testIdPrefix?: string;
};

export type CrewBodyIdentity = { value: string; context: string[] };

type IdentityOptions = Pick<CrewBodyProps, "sentinels" | "partialAs">;

function hasText(value: string | null | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/** The line under the name: the role, and under "line" the partial label after it. */
function subline(member: CrewBodyMember, { sentinels, partialAs }: IdentityOptions): string {
  const role = sentinels === "hide" && shouldHideGenericOptional(member.role) ? null : member.role;
  const partial = partialAs === "line" ? member.partial : null;
  return [role, partial].filter(hasText).join(" · ");
}

/** The chips beside the name, in render order. */
function chips(member: CrewBodyMember, { partialAs }: IdentityOptions): string[] {
  return [
    ...(member.you ? ["You"] : []),
    ...(member.lead ? ["Lead"] : []),
    ...(partialAs === "chip" && hasText(member.partial) ? [member.partial] : []),
  ];
}

/**
 * A row's identity line as search sees it (spec §2.3), decided here so the crew
 * index and the render apply the same predicates (spec §2.4): the name, with the
 * chips and the role line as its context; the role line alone when there is no
 * name; null when neither renders.
 */
export function crewBodyIdentity(
  member: CrewBodyMember,
  options: IdentityOptions,
): CrewBodyIdentity | null {
  const line = subline(member, options);
  if (member.name !== null) {
    return { value: member.name, context: [...chips(member, options), ...(line ? [line] : [])] };
  }
  return line ? { value: line, context: [] } : null;
}

const CHIP_CLASS =
  "inline-block max-w-full truncate rounded-sm px-1.5 py-0.5 align-middle text-xs font-semibold uppercase tracking-eyebrow";

/** One contact action: the 44px hit box around the bordered 32px square. */
type ContactAction = { verb: string; href: string; Icon: LucideIcon };

export function CrewBody(props: CrewBodyProps) {
  const { members, cap, overflow, sentinels, partialAs, actionsPlacement, targets } = props;
  const hidden = Math.max(0, members.length - cap);
  const skip = targets === undefined ? {} : { "data-search-skip": "" };
  const rowClass =
    actionsPlacement === "end" ? "flex items-center gap-3" : "flex items-start gap-3";

  const rows = members.slice(0, cap).map((member) => {
    const identity = crewBodyIdentity(member, { sentinels, partialAs });
    const line = subline(member, { sentinels, partialAs });
    const actions: ContactAction[] = [];
    const tel = member.phone !== null ? props.telHref(member.phone) : null;
    if (tel !== null) actions.push({ verb: "Call", href: tel, Icon: Phone });
    const sms = member.phone !== null && props.smsHref ? props.smsHref(member.phone) : null;
    if (sms !== null) actions.push({ verb: "Text", href: sms, Icon: MessageSquare });
    const mail = member.email !== null ? props.mailtoHref(member.email) : null;
    if (mail !== null) actions.push({ verb: "Email", href: mail, Icon: Mail });
    // A row with no identity and nothing to tap has nothing to show.
    if (identity === null && actions.length === 0) return null;

    const actionTarget = member.name ?? "contact";
    const rowChips = member.name !== null ? chips(member, { sentinels, partialAs }) : [];
    const nameClass = "block wrap-break-word text-sm font-medium text-text-strong";

    const identityBlock = (
      <span className="min-w-0 flex-1" data-search-target={targets?.[member.key]}>
        {member.name !== null && rowChips.length === 0 ? (
          <span className={nameClass}>{member.name}</span>
        ) : null}
        {rowChips.length > 0 ? (
          // The chips wrap beside the name; with none the name is the admin's line.
          <span className="flex min-w-0 flex-wrap items-center gap-1.5">
            <span className={cn(nameClass, "min-w-0")}>{member.name}</span>
            {member.you ? (
              <span className={cn(CHIP_CLASS, "bg-stale-tint text-accent-on-bg")}>You</span>
            ) : null}
            {member.lead ? (
              <span className={cn(CHIP_CLASS, "bg-surface-sunken text-text-subtle")}>Lead</span>
            ) : null}
            {partialAs === "chip" && hasText(member.partial) ? (
              // Mixed case, not the eyebrow uppercase: it carries a date phrase.
              <span
                data-partial="true"
                title={member.partial}
                className="inline-flex max-w-full items-center gap-1 rounded-sm bg-surface-sunken px-1.5 py-0.5 align-middle text-xs font-medium text-text-subtle"
              >
                <CalendarDays className="size-3 shrink-0" aria-hidden />
                <span className="min-w-0 truncate">{member.partial}</span>
              </span>
            ) : null}
          </span>
        ) : null}
        {line ? (
          <span className="block wrap-break-word text-xs text-text-subtle">{line}</span>
        ) : null}
      </span>
    );

    // §8 exact anchor DOM: the INTERACTIVE <a> is the 44×44 border box
    // (`size-tap-min`); the bordered 32px square is a nested NON-interactive
    // visual. Adjacent anchors sit flush (no gap, no negative margins between
    // them) so hit areas never overlap; the centered visuals leave a natural
    // 12px gutter.
    const actionLinks = (
      <span
        {...skip}
        className={
          actionsPlacement === "end"
            ? "flex shrink-0 items-center"
            : "-ml-1.5 flex shrink-0 items-center"
        }
      >
        {actions.map(({ verb, href, Icon }) => (
          <a
            key={verb}
            href={href}
            aria-label={`${verb} ${actionTarget}`}
            className="inline-flex size-tap-min items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
          >
            <span className="grid size-8 place-items-center rounded-sm border border-text-faint text-text-subtle">
              <Icon aria-hidden="true" className="size-4" />
            </span>
          </a>
        ))}
      </span>
    );

    const inner = (
      <>
        <Avatar name={member.avatarName} searchSkip={targets !== undefined} />
        {actionsPlacement === "end" ? (
          <>
            {identityBlock}
            {actionLinks}
          </>
        ) : (
          <span className="flex min-w-0 flex-1 flex-col gap-1">
            {identityBlock}
            {actionLinks}
          </span>
        )}
        {member.rowActions}
      </>
    );
    const hooks = {
      ...(props.testIdPrefix !== undefined
        ? { "data-testid": `${props.testIdPrefix}-crew-row` }
        : {}),
      ...(member.you ? { "data-you": "true" } : {}),
      ...(member.lead ? { "data-lead": "true" } : {}),
    };
    return member.underRow != null ? (
      // The attention-hosting row (published-show-alerts §5.4): the row nests in
      // a column <li> so the stack sits under it.
      <li key={member.key} {...hooks} className="pt-1 pb-2">
        <div className={rowClass}>{inner}</div>
        {member.underRow}
      </li>
    ) : (
      <li key={member.key} {...hooks} className={`${rowClass} py-1`}>
        {inner}
      </li>
    );
  });

  return (
    <>
      {members.length === 0 ? (
        <p className="text-sm text-text-subtle">No crew parsed.</p>
      ) : (
        <ul className="flex flex-col">{rows}</ul>
      )}
      {hidden > 0 ? overflow(hidden) : null}
    </>
  );
}
