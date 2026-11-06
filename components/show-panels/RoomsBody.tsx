/**
 * components/show-panels/RoomsBody.tsx
 *
 * The Rooms section body both surfaces render (crew page redesign spec §6.2,
 * `rooms` row): the room list of the admin's `RoomsBreakdown`, one card per room,
 * a header (name, kind, floor, Set · Show · Strike, setup, dimensions) over its
 * discipline rows.
 *
 * - Admin: `cap` = `ROOMS_CAP` with its note, sentinels as parsed, all five
 *   disciplines ("Not specified" when unparsed), and `data-room-nav` for the room
 *   rail. It passes nothing else, so every optional prop defaults to its output.
 * - Crew (PR C plan Task 7): no cap, the crew's room label, `h4` names, sentinels
 *   hidden, empty disciplines dropped, the viewer's own disciplines labeled and
 *   first, no rail, rows that read their container, and search targets.
 *
 * Plain props, hook-free, no context: the crew page calls it as a function inside
 * `WrappedSection`'s render callback (spec §6.1, error containment), and it calls
 * its own pieces the same way, so every line it runs is inside that catch.
 * `room-scope-key` is the one test id that stays unprefixed.
 */
import { EYEBROW_STYLE } from "@/components/show-panels/FieldRowList";
import {
  ROOM_HEADER_LABELS as LABEL,
  ROOM_KIND_LABEL,
  ROOM_SCOPE_UNSPECIFIED,
  YOUR_SCOPE,
  roomHeaderValue,
  roomScopeRows,
  type RoomScopeKey,
  type RoomScopeRow,
} from "@/components/show-panels/roomScope";
import type { RoomRow } from "@/lib/parser/types";

/** A room's searchable lines: its name, each header field, each discipline. */
export type RoomLineKey =
  | "name"
  | "floor"
  | "set_time"
  | "show_time"
  | "strike_time"
  | "setup"
  | "dimensions"
  | RoomScopeKey;

/** One room's search targets (lib/search/entryId.ts), by line. */
export type RoomTargets = Partial<Record<RoomLineKey, string | undefined>>;

export type RoomsBodyProps = {
  rooms: readonly RoomRow[];
  /** Rooms shown (the admin's `ROOMS_CAP`); null shows every room. */
  cap: number | null;
  /** What follows the list under a cap; null for nothing. Absent, nothing follows. */
  overflowNote?: (total: number, cap: number) => string | null;
  /** Each room's `${testIdPrefix}-room-${index}-header`, `-times` and `-scope`. */
  testIdPrefix: string;
  /** The room's heading. The default is the admin's: the parsed name, or "Room". */
  roomName?: (room: RoomRow) => string;
  /** The name's element: "span" (the default, admin), or "h4" (crew, plan decision 8). */
  nameAs?: "span" | "h4";
  /** "show" (the default, admin): a sentinel header field as parsed. "hide": omitted. */
  sentinels?: "show" | "hide";
  /** false (the default, admin): all five disciplines. true: an empty one renders no row. */
  dropEmpty?: boolean;
  /** The viewer's disciplines: labeled and sorted first. The default is none. */
  emphasize?: ReadonlySet<RoomScopeKey>;
  /** true (the default, admin): each room carries `data-room-nav` for the room rail. */
  navAnchors?: boolean;
  /**
   * "fixed" (the default, admin): the chip, key and value tracks at every width.
   * "fluid" (crew): below the crew split the chip and key share a line and the value
   * takes the row under them. The tracks took 124px of a phone's row, leaving a gear
   * list 160px at 390, 90px at 320 and nothing under 200% page zoom (gate repair 1).
   */
  scopeLayout?: "fixed" | "fluid";
  /**
   * Per room, by its place in `rooms`, a search target per line. Given, the body
   * also marks what is not a line: a line with no target, the kind pill, the
   * "Your scope" label and the note are skipped, so no text is left uncovered.
   */
  targets?: readonly RoomTargets[];
};

const NO_DISCIPLINES: ReadonlySet<RoomScopeKey> = new Set();

const defaultRoomName = (room: RoomRow) => room.name || "Room";

type SearchMarker = { "data-search-target"?: string; "data-search-skip"?: "" };

const SKIP: SearchMarker = { "data-search-skip": "" };

/** Under `targets`, a line carries its target, or is skipped. Without them, nothing. */
function lineMarker(lines: RoomTargets | undefined, key: RoomLineKey): SearchMarker {
  if (lines === undefined) return {};
  const id = lines[key];
  return id === undefined ? SKIP : { "data-search-target": id };
}

/**
 * One discipline: icon chip, eyebrow key, value. An emphasized row carries the 1px
 * accent edge the crew's scope card carried (at 1px, under the >1px colored
 * side-stripe ban), pulled out into the list's gutter so its chip stays in line with
 * the other rows, and its divider rule keeps the edge on a room's last row, where
 * `last:border-0` would take every border. The label and the edge together carry the
 * emphasis, so it is not color alone.
 */
function ScopeRow({
  row: { key, label, Icon, color, value, emphasized },
  lines,
  scopeLayout,
}: {
  row: RoomScopeRow;
  lines: RoomTargets | undefined;
  scopeLayout: "fixed" | "fluid";
}) {
  const fluid = scopeLayout === "fluid";
  const tracks = fluid
    ? "grid-cols-[1.5rem_minmax(0,1fr)] @min-crew-split:grid-cols-[1.5rem_5rem_minmax(0,1fr)]"
    : "grid-cols-[1.5rem_5rem_minmax(0,1fr)]";
  const valueTrack = fluid
    ? "col-span-full pt-1 @min-crew-split:col-span-1 @min-crew-split:pt-0.5"
    : "pt-0.5";
  return (
    // Icon chip / eyebrow key / value tracks.
    <li
      key={label}
      {...lineMarker(lines, key)}
      {...(emphasized ? { "data-emphasis": "you" } : {})}
      className={
        emphasized
          ? `-ml-2 grid ${tracks} items-start gap-x-2.5 border-b border-l border-b-border border-l-accent-on-bg py-2 pl-1.75 last:border-b-0`
          : `grid ${tracks} items-start gap-x-2.5 border-b border-border py-2 last:border-0`
      }
    >
      {emphasized ? (
        <span
          {...(lines === undefined ? {} : SKIP)}
          className="col-span-full pb-1 text-xs font-medium uppercase tracking-eyebrow text-accent-on-bg"
        >
          {YOUR_SCOPE}
        </span>
      ) : null}
      <span
        className="grid size-6 place-items-center rounded-md bg-surface-sunken"
        style={value ? { color } : undefined}
      >
        <Icon
          aria-hidden="true"
          className={"size-3.5" + (value ? "" : " text-text-faint opacity-60")}
        />
      </span>
      <span
        data-testid="room-scope-key"
        className="pt-1 text-xs font-semibold uppercase text-text-subtle"
        style={EYEBROW_STYLE}
      >
        {label}
      </span>
      <span
        className={
          value
            ? `wrap-break-word ${valueTrack} text-xs text-text`
            : `${valueTrack} text-xs italic text-text-subtle`
        }
      >
        {value ?? ROOM_SCOPE_UNSPECIFIED}
      </span>
    </li>
  );
}

function RoomCard({
  r,
  i,
  lines,
  testIdPrefix,
  roomName,
  nameAs: Name,
  sentinels,
  dropEmpty,
  emphasize,
  navAnchors,
  scopeLayout,
}: {
  r: RoomRow;
  i: number;
  lines: RoomTargets | undefined;
  testIdPrefix: string;
  roomName: (room: RoomRow) => string;
  nameAs: "span" | "h4";
  sentinels: "show" | "hide";
  dropEmpty: boolean;
  emphasize: ReadonlySet<RoomScopeKey>;
  navAnchors: boolean;
  scopeLayout: "fixed" | "fluid";
}) {
  // Header schedule meta — Set/Show/Strike; keep only parsed values so the row (and
  // its dividers) omit entirely when nothing parsed.
  const times = (
    [
      {
        key: "set_time",
        label: LABEL.set_time,
        value: roomHeaderValue(r.set_time, sentinels),
        emphasized: false,
      },
      {
        key: "show_time",
        label: LABEL.show_time,
        value: roomHeaderValue(r.show_time, sentinels),
        emphasized: true,
      },
      {
        key: "strike_time",
        label: LABEL.strike_time,
        value: roomHeaderValue(r.strike_time, sentinels),
        emphasized: false,
      },
    ] as const
  ).filter((t) => t.value !== null);
  const setup = roomHeaderValue(r.setup, sentinels);
  const dimensions = roomHeaderValue(r.dimensions, sentinels);
  const floor = roomHeaderValue(r.floor, sentinels);
  const hasHeaderBody = times.length > 0 || setup !== null || dimensions !== null;
  const scope = roomScopeRows(r, { dropEmpty, emphasize });
  // A room with no scope rows ends at its header, which then has nothing to divide
  // from what follows: no rule, and no padded empty list.
  const hasScope = scope.length > 0;
  return (
    <li
      key={`${r.name}-${i}`}
      data-room-nav={navAnchors ? i : undefined}
      className="overflow-hidden rounded-md border border-border bg-surface shadow-tile"
    >
      {/* Header — accent-tinted panel (mock --accent-tint). */}
      <div
        data-testid={`${testIdPrefix}-room-${i}-header`}
        className="flex flex-col gap-2 bg-accent/6 px-3.5 py-3"
      >
        {/* name + humanized kind pill + floor */}
        <div
          className={
            "flex flex-wrap items-center gap-x-2 gap-y-1" +
            (hasHeaderBody && hasScope ? " border-b border-border pb-2.5" : "")
          }
        >
          <Name
            {...lineMarker(lines, "name")}
            className="wrap-break-word text-sm font-semibold text-text-strong"
          >
            {roomName(r)}
          </Name>
          <span
            {...(lines === undefined ? {} : SKIP)}
            className="rounded-pill bg-accent/10 px-2 py-0.5 text-[0.625rem] font-semibold uppercase text-accent-on-bg"
            style={{ letterSpacing: "0.07em" }}
          >
            {ROOM_KIND_LABEL[r.kind]}
          </span>
          {floor !== null ? (
            <span {...lineMarker(lines, "floor")} className="ml-auto text-xs text-text-subtle">
              {floor}
            </span>
          ) : null}
        </div>
        {/* Set · Show · Strike (Show emphasized) — spread full-width, hairline divider
            below (no border-l side-stripe). */}
        {times.length > 0 ? (
          <div
            data-testid={`${testIdPrefix}-room-${i}-times`}
            className={
              "flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1" +
              (hasScope ? " border-b border-border pb-2.5" : "")
            }
          >
            {times.map((t) => (
              <span key={t.label} {...lineMarker(lines, t.key)} className="flex items-baseline">
                <span
                  className="text-xs font-semibold uppercase text-text-subtle"
                  style={EYEBROW_STYLE}
                >
                  {t.label}
                </span>
                <span
                  className={
                    "ml-1.5 text-xs tabular-nums " +
                    (t.emphasized ? "font-semibold text-accent-on-bg" : "text-text")
                  }
                >
                  {t.value}
                </span>
              </span>
            ))}
          </div>
        ) : null}
        {setup !== null ? (
          <div {...lineMarker(lines, "setup")} className="flex items-baseline gap-2">
            <span
              className="shrink-0 text-xs font-semibold uppercase text-text-subtle"
              style={EYEBROW_STYLE}
            >
              {LABEL.setup}
            </span>
            <span className="wrap-break-word text-xs text-text-subtle">{setup}</span>
          </div>
        ) : null}
        {dimensions !== null ? (
          <div {...lineMarker(lines, "dimensions")} className="flex items-baseline gap-2">
            <span
              className="shrink-0 text-xs font-semibold uppercase text-text-subtle"
              style={EYEBROW_STYLE}
            >
              {LABEL.dimensions}
            </span>
            <span className="wrap-break-word text-xs tabular-nums text-text">{dimensions}</span>
          </div>
        ) : null}
      </div>
      {/* Scope — unparsed reads "Not specified", unless dropped (roomScopeRows). */}
      {hasScope ? (
        <ul data-testid={`${testIdPrefix}-room-${i}-scope`} className="flex flex-col px-3.5 py-1">
          {scope.map((row) => ScopeRow({ row, lines, scopeLayout }))}
        </ul>
      ) : null}
    </li>
  );
}

export function RoomsBody({
  rooms,
  cap,
  overflowNote,
  testIdPrefix,
  roomName = defaultRoomName,
  nameAs = "span",
  sentinels = "show",
  dropEmpty = false,
  emphasize = NO_DISCIPLINES,
  navAnchors = true,
  scopeLayout = "fixed",
  targets,
}: RoomsBodyProps) {
  const shown = cap === null ? rooms : rooms.slice(0, cap);
  const note = cap === null ? null : (overflowNote?.(rooms.length, cap) ?? null);
  return (
    <>
      {shown.length > 0 ? (
        <ul className="flex flex-col gap-3.5">
          {shown.map((r, i) =>
            RoomCard({
              r,
              i,
              lines: targets === undefined ? undefined : (targets[i] ?? {}),
              testIdPrefix,
              roomName,
              nameAs,
              sentinels,
              dropEmpty,
              emphasize,
              navAnchors,
              scopeLayout,
            }),
          )}
        </ul>
      ) : null}
      {note ? (
        <p {...(targets === undefined ? {} : SKIP)} className="text-xs text-text-subtle">
          {note}
        </p>
      ) : null}
    </>
  );
}
