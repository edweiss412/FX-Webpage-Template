#!/usr/bin/env python3
"""Machine-wide admission control for heavy local phases.

Spec: docs/superpowers/specs/2026-08-10-heavy-phase-semaphore-design.md

Usage:
    python3 scripts/with-heavy-slot.py [--priority] -- <cmd> [args...]
    python3 scripts/with-heavy-slot.py --recreate --slots <N>

The wrapper takes one of N flock'd slot files in a shared directory and then
`execvp`s into the command, so the wrapper process BECOMES the heavy command:
the lock rides through exec on an inheritable fd, and the kernel releases it when
the last process holding that fd exits. Crash of the holder — any signal,
including SIGKILL — therefore releases the slot with zero cleanup code (C5), and
the caller sees the command's own exit status because no forwarding logic exists
(§4.1.8).

Python 3 stdlib only (C6): macOS ships no flock(1) and Node has no stdlib flock.

Every emission goes to stderr: stdout belongs to the wrapped command. Emissions
are ASCII apart from the two reentrancy notices, whose exact text is fixed by
spec §4.1 and carries an em dash.
"""

from __future__ import annotations

import atexit
import fcntl
import json
import os
import random
import re
import sys
import time

DEFAULT_SLOT_DIR = "/tmp/fx-heavy-slots"
DEFAULT_SLOTS = 2
DEFAULT_POLL_MS = 3000
DEFAULT_PRIORITY_POLL_MS = 1000
DEFAULT_WAIT_WARN_S = 300
DEFAULT_JITTER_PCT = 20

SLOTS_MIN = 1
SLOTS_MAX = 64

UNKNOWN_HOLDER = "holder unknown (metadata unreadable)"
SLOT_NAME = re.compile(r"^slot-(\d+)$")
MARKER_ENV = "FX_HEAVY_SLOT_HELD"
# Admission CLASSES. A class is an ADDITIONAL lock taken alongside an ordinary
# slot, never a second slot directory: two directories are two independent
# semaphores, so a class run plus two ordinary phases would be THREE concurrent
# heavy phases -- more load, from a change whose whole purpose is less.
CLASS_NAMES = ("mutation",)
PRIO_PREFIX = "prio-wait-"
# The floor bounds how long a CRASHED priority waiter's marker can throttle
# others at ordinary poll rates.
FRESHNESS_FLOOR_S = 600


def warn(message: str) -> None:
    sys.stderr.write(message + "\n")
    sys.stderr.flush()


def split_argv(argv: list[str]) -> tuple[list[str], list[str]]:
    """Wrapper flags before the first bare `--`; the command after it.

    Splitting on the first EXACT `--` token keeps a command argument that merely
    starts with a dash — including a literal `"-- literal"` string — intact.
    """
    for i, token in enumerate(argv):
        if token == "--":
            command = argv[i + 1 :]
            # `pnpm run` forwards a user-supplied `--` VERBATIM after the script
            # body's own, so `pnpm heavy -- node ...` arrives here as `-- -- node
            # ...`. Bare leading separators are dropped; an argument that merely
            # begins with dashes, including a literal `"-- literal"` string, is
            # not a bare `--` and survives untouched.
            while command and command[0] == "--":
                command = command[1:]
            return argv[:i], command
    return argv, []


def parse_class_flag(args: list[str]) -> tuple[str | None, str | None]:
    """`(class, error)`. An unknown value is an ERROR, never a new lock.

    A typo that mints its own independent lock reports success and bounds
    nothing, which is the failure mode this exists to prevent wearing a
    different name.
    """
    raw: str | None = None
    seen = False
    for i, token in enumerate(args):
        if token == "--class":
            seen = True
            raw = args[i + 1] if i + 1 < len(args) else None
            break
        if token.startswith("--class="):
            seen = True
            raw = token.split("=", 1)[1]
            break
    if not seen:
        return None, None
    # `--class` with nothing after it is a MALFORMED REQUEST, never "no class
    # wanted". Reading it as absence is the worst available reading: the caller
    # asked to be bounded, and would have been silently admitted unbounded.
    if raw is None or raw == "":
        return None, "--class requires a value; accepted: %s" % ", ".join(CLASS_NAMES)
    if raw not in CLASS_NAMES:
        return None, "unknown --class %r; accepted: %s" % (raw, ", ".join(CLASS_NAMES))
    return raw, None


def class_lock_path(slot_dir: str, cls: str) -> str:
    r"""Lives in the SAME slot dir. Slot enumeration filters on `^slot-(\d+)$`,
    so this file is ignored by it exactly as `recreate.lock` already is."""
    return os.path.join(slot_dir, "class-%s.lock" % cls)


def acquire_class_lock(
    slot_dir: str, cls: str, poll_ms: int, jitter_pct: int, cadence: WarnCadence
) -> int:
    """Poll for the class lock, BEFORE any slot is taken.

    Class-first is the whole ordering argument: ordinary runs never want a class
    lock, so with the class always taken first no cycle exists. The one case
    that WOULD invert it -- a nested run that already inherited a slot -- is
    refused in `main` rather than allowed to wait here.
    """
    path = class_lock_path(slot_dir, cls)
    while True:
        fd = os.open(path, os.O_CREAT | os.O_RDWR, 0o644)
        try:
            fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except OSError:
            os.close(fd)
            if cadence.due("class"):
                warn("waiting for the %s class (one run at a time)" % cls)
            time.sleep(poll_seconds(poll_ms, jitter_pct))
            continue
        return fd


def env_int(env: dict[str, str], name: str, default: int, low: int, high: int) -> int:
    """Out-of-domain values fall back with one warning line — never a crash, never
    silence. A gate run must not be blocked by a typo in an env var."""
    raw = env.get(name)
    if raw is None:
        return default
    try:
        value: int | None = int(raw)
    except ValueError:
        value = None
    if value is None or value < low or value > high:
        warn(
            "%s: invalid value %r (want an integer in [%d, %d]); using %d"
            % (name, raw, low, high, default)
        )
        return default
    return value


def env_flag(env: dict[str, str], name: str) -> bool:
    """UNSET means off silently; any other non-`1` value means off WITH a warning —
    a typo like `true` must not silently disable the behavior it requested."""
    raw = env.get(name)
    if raw is None:
        return False
    if raw == "1":
        return True
    warn("%s: ignoring value %r (want exactly '1'); treating as unset" % (name, raw))
    return False


def ensure_slot_dir(env: dict[str, str]) -> str:
    slot_dir = env.get("FX_HEAVY_SLOT_DIR", DEFAULT_SLOT_DIR)
    os.makedirs(slot_dir, mode=0o755, exist_ok=True)
    return slot_dir


def poll_seconds(poll_ms: int, jitter_pct: int) -> float:
    spread = poll_ms * jitter_pct / 100.0
    return max(0.0, poll_ms + random.uniform(-spread, spread)) / 1000.0


class WarnCadence:
    """Warning cadence, evaluated AT EACH WAKE.

    The effective interval is therefore max(poll, FX_HEAVY_WAIT_WARN_S) — a poll
    above the warn interval warns once per wake rather than promising an
    impossible sub-poll cadence. Each KIND fires immediately the first time, so a
    block on the recreation bracket and a block on a slot each surface at once
    instead of one consuming the other's first-wait.
    """

    def __init__(self, warn_s: int) -> None:
        self._warn_s = warn_s
        self._last: dict[str, float] = {}

    def due(self, kind: str) -> bool:
        now = time.monotonic()
        last = self._last.get(kind)
        if last is None or (now - last) >= self._warn_s:
            self._last[kind] = now
            return True
        return False


# --- shared state: config publication and holder metadata --------------------


def config_path(slot_dir: str) -> str:
    return os.path.join(slot_dir, "config")


def slot_path(slot_dir: str, index: int) -> str:
    return os.path.join(slot_dir, "slot-%d" % index)


def read_config(slot_dir: str) -> int | None:
    try:
        with open(config_path(slot_dir), "r", encoding="utf-8") as handle:
            value = json.loads(handle.read())["slots"]
    except (OSError, ValueError, KeyError, TypeError):
        return None
    if isinstance(value, bool) or not isinstance(value, int):
        return None
    return value


def publish_config(slot_dir: str, desired: int) -> bool:
    """Atomic first-writer-wins publication. Returns True iff THIS process created it.

    `link(2)` fails with EEXIST if any other writer already published, so exactly
    one creator can ever win and a published `config` is complete by construction
    — a reader can never observe a partial write, which makes the check-then-write
    race and the torn-read "repair" overwrite structurally impossible.
    """
    tmp_path = os.path.join(slot_dir, "config.tmp.%d" % os.getpid())
    with open(tmp_path, "w", encoding="utf-8") as handle:
        handle.write(json.dumps({"slots": desired}) + "\n")
    created = False
    try:
        os.link(tmp_path, config_path(slot_dir))
        created = True
    except FileExistsError:
        created = False
    finally:
        # `link` creates a SECOND name, it does not consume the source: BOTH
        # outcomes must unlink the tmp name or the dir accumulates residue.
        try:
            os.unlink(tmp_path)
        except OSError:
            pass
    return created


def resolve_slots(slot_dir: str, desired: int, announce: bool) -> int:
    """The dir-recorded count wins over this invocation's own preference.

    Two sessions disagreeing about N must not run two differently-sized
    semaphores over one dir. Announcement happens once per invocation; waiters
    re-resolve on every poll so a topology change converges within one interval,
    but a re-resolve is silent.
    """
    recorded = read_config(slot_dir)
    if recorded is None:
        if publish_config(slot_dir, desired):
            if announce:
                warn("config created (slots=%d)" % desired)
            return desired
        recorded = read_config(slot_dir)
        if recorded is None:
            return desired
    if announce:
        warn("config adopted (slots=%d)" % recorded)
        if recorded != desired:
            warn(
                "FX_HEAVY_SLOTS=%d differs from the recorded slot count; adopting %d"
                % (desired, recorded)
            )
    return recorded


def write_metadata(fd: int, command: list[str], priority: bool) -> None:
    """One JSON line, written with raw unbuffered syscalls so there is nothing to
    flush across `exec`.

    Full argv is deliberately NEVER recorded: slot files are world-readable shared
    state and wait warnings land in transcripts, so a token-bearing argument must
    have no path into either. Only the BASENAME of argv[0] and the argument COUNT.
    """
    payload = {
        "pid": os.getpid(),
        "cmd": os.path.basename(command[0]),
        "argc": len(command),
        "at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "priority": bool(priority),
    }
    os.ftruncate(fd, 0)
    os.write(fd, (json.dumps(payload) + "\n").encode("utf-8"))


def read_holder(path: str) -> dict[str, object] | None:
    """Read holder metadata through a SEPARATE read-only fd, closed after reading —
    never the locking fd, whose offset and lock state belong to the holder."""
    try:
        fd = os.open(path, os.O_RDONLY)
    except OSError:
        return None
    try:
        raw = os.read(fd, 8192)
    except OSError:
        return None
    finally:
        os.close(fd)
    try:
        data = json.loads(raw.decode("utf-8"))
    except (UnicodeDecodeError, ValueError):
        return None
    if not isinstance(data, dict) or "pid" not in data:
        return None
    return data


def describe_holder(slot_dir: str, index: int) -> str:
    """Imprecise-but-surfaced beats silent: empty, torn, and unparseable metadata
    all report as unknown rather than dropping the slot from the warning."""
    data = read_holder(slot_path(slot_dir, index))
    if data is None:
        return UNKNOWN_HOLDER
    return "pid=%s cmd=%s argc=%s prio=%s since=%s" % (
        data.get("pid"),
        data.get("cmd"),
        data.get("argc"),
        1 if data.get("priority") else 0,
        data.get("at"),
    )


def present_slot_indices(slot_dir: str) -> list[int]:
    """Enumerate by GLOB over `slot-*`, never by the 0..N-1 index range.

    Residue from a crashed shrink lives at indices the current count does not
    cover; an index-range enumeration leaves those files behind forever whenever
    a later target lands between the recorded and the old count.
    """
    found = []
    try:
        names = os.listdir(slot_dir)
    except OSError:
        return []
    for name in names:
        match = SLOT_NAME.match(name)
        if match:
            found.append(int(match.group(1)))
    return sorted(found)


# --- priority markers and reentrancy -----------------------------------------


_marker_path: str | None = None


def _remove_priority_marker() -> None:
    global _marker_path
    if _marker_path is None:
        return
    try:
        os.unlink(_marker_path)
    except OSError:
        pass
    _marker_path = None


def touch_priority_marker(slot_dir: str, poll_ms: int) -> None:
    """Created on first wait, mtime REFRESHED on every poll attempt.

    Create-once is non-conforming: an actively polling waiter's marker would
    silently age out of its own freshness window, and the whole point of the
    window is that a CRASHED waiter — the one that stops refreshing — is the only
    one that expires. The marker declares its own effective poll interval, since
    an observer computing freshness from ITS interval expires a slow-polling
    waiter that is still very much alive.
    """
    global _marker_path
    path = os.path.join(slot_dir, "%s%d" % (PRIO_PREFIX, os.getpid()))
    if _marker_path is None:
        with open(path, "w", encoding="utf-8") as handle:
            handle.write(json.dumps({"pid": os.getpid(), "poll_ms": poll_ms}) + "\n")
        _marker_path = path
        atexit.register(_remove_priority_marker)
        return
    try:
        os.utime(path, None)
    except OSError:
        # Removed under us (a manual clean); re-create on the next attempt.
        _marker_path = None


def declared_poll_ms(path: str) -> int | None:
    try:
        with open(path, "r", encoding="utf-8") as handle:
            value = json.loads(handle.read()).get("poll_ms")
    except (OSError, ValueError, AttributeError):
        return None
    if isinstance(value, bool) or not isinstance(value, int) or value <= 0:
        return None
    return value


def fresh_priority_waiter(slot_dir: str, self_pid: int) -> tuple[str, str] | None:
    """A foreign priority marker inside its DECLARED-cadence freshness window.

    The window is `max(10 min, 2 x the interval declared IN THE MARKER)`. An
    unreadable marker is fresh at the floor and surfaced as `cadence unknown` —
    never silently ignored.
    """
    try:
        names = os.listdir(slot_dir)
    except OSError:
        return None
    now = time.time()
    mine = "%s%d" % (PRIO_PREFIX, self_pid)
    for name in sorted(names):
        if not name.startswith(PRIO_PREFIX) or name == mine:
            continue
        path = os.path.join(slot_dir, name)
        try:
            age = now - os.stat(path).st_mtime
        except OSError:
            continue
        declared = declared_poll_ms(path)
        if declared is None:
            window, label = float(FRESHNESS_FLOOR_S), "cadence unknown"
        else:
            window = max(float(FRESHNESS_FLOOR_S), 2 * declared / 1000.0)
            label = "cadence %d ms" % declared
        if age <= window:
            return name, label
    return None


def validated_nested_marker(env: dict[str, str]) -> bool | None:
    """None = no marker inherited. True = a LIVE ancestor holds the named slot.

    The marker is never trusted blindly: the env survives Node-spawn descendants
    that the slot fd does not, so an orphaned descendant launching new work would
    otherwise bypass admission entirely. All three checks must hold — the slot's
    metadata records the marker's pid, that pid is alive, and the slot really is
    locked.
    """
    raw = env.get(MARKER_ENV)
    if raw is None:
        return None
    path, _, pid_text = raw.rpartition(":")
    if not path:
        return False
    try:
        pid = int(pid_text)
    except ValueError:
        return False
    data = read_holder(path)
    if data is None or data.get("pid") != pid:
        return False
    try:
        os.kill(pid, 0)
    except OSError:
        return False
    try:
        probe = os.open(path, os.O_RDONLY)
    except OSError:
        return False
    try:
        fcntl.flock(probe, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except OSError:
        return True
    else:
        # The probe WON, so nothing holds the slot: the ancestor is gone.
        fcntl.flock(probe, fcntl.LOCK_UN)
        return False
    finally:
        os.close(probe)


# --- acquisition -------------------------------------------------------------


def hold_bracket(slot_dir: str, cadence: WarnCadence, poll_ms: int, jitter_pct: int) -> int:
    """LOCK_SH on `recreate.lock`, bracketing ONE attempt (resolve, scan, validate).

    A recreator holds LOCK_EX for its entire swap, so no wrapper can resolve,
    publish a config, or acquire a slot inside a swap — excluded by the kernel,
    not by convention. NB-first with immediate surfacing, so a wedged recreation
    is never a silent block.
    """
    fd = os.open(os.path.join(slot_dir, "recreate.lock"), os.O_CREAT | os.O_RDWR, 0o644)
    while True:
        try:
            fcntl.flock(fd, fcntl.LOCK_SH | fcntl.LOCK_NB)
            return fd
        except OSError:
            if cadence.due("recreation"):
                warn("waiting: recreation in progress")
            time.sleep(poll_seconds(poll_ms, jitter_pct))


def try_acquire(
    slot_dir: str, slots: int, hold_open_ms: int
) -> tuple[int, int] | tuple[None, None]:
    """First slot whose non-blocking exclusive flock succeeds wins.

    A LOSING fd is closed immediately: leaving it open would pin the inode of a
    slot this process does not own.
    """
    for index in range(slots):
        fd = os.open(slot_path(slot_dir, index), os.O_CREAT | os.O_RDWR, 0o644)
        if hold_open_ms:
            # Test-only race injection: widens the open -> flock window so the
            # orphaned-inode case is reproducible instead of sub-poll and
            # unreachable through the public interface.
            time.sleep(hold_open_ms / 1000.0)
        try:
            fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except OSError:
            os.close(fd)
            continue
        return index, fd
    return None, None


def validate_acquisition(fd: int, slot_dir: str, index: int) -> str | None:
    """Post-acquire topology validation. Returns a notice on rejection, else None.

    Identity FIRST: a waiter that opened a slot file before a directory
    recreation holds a lock on an ORPHANED inode, and same-size recreation,
    growth, and shrink all produce that shape — an index check alone passes it.
    Then index, read from the config AFTER the lock was taken. An acquisition
    proceeds to exec only holding the CURRENT inode at a CURRENTLY-valid index.
    """
    path = slot_path(slot_dir, index)
    try:
        linked = os.stat(path)
    except OSError:
        return "topology restart: slot-%d is no longer linked (stale generation)" % index
    held = os.fstat(fd)
    if (held.st_dev, held.st_ino) != (linked.st_dev, linked.st_ino):
        return "topology restart: slot-%d inode is no longer the linked one (stale generation)" % index
    current = read_config(slot_dir)
    if current is None or index >= current:
        return "topology restart: slot-%d is at or beyond the current slot count %s" % (
            index,
            current,
        )
    return None


def acquire_loop(
    slot_dir: str,
    desired: int,
    poll_ms: int,
    jitter_pct: int,
    cadence: WarnCadence,
    hold_open_ms: int,
    priority: bool,
) -> tuple[int, int, int]:
    """Returns (index, fd, slots). The SH bracket is released before returning."""
    announce = True
    while True:
        if not priority:
            # Best-effort bias, not a queue: one extra poll interval before each
            # attempt yields the next free slot to a priority waiter with high
            # probability. The back-off happens OUTSIDE the SH bracket — sleeping
            # inside it would block recreations for the length of the yield.
            yielding = fresh_priority_waiter(slot_dir, os.getpid())
            if yielding is not None:
                if cadence.due("yield"):
                    warn("yielding to priority waiter (%s, %s)" % yielding)
                time.sleep(poll_seconds(poll_ms, jitter_pct))
        bracket_fd = hold_bracket(slot_dir, cadence, poll_ms, jitter_pct)
        try:
            slots = resolve_slots(slot_dir, desired, announce)
            announce = False
            index, fd = try_acquire(slot_dir, slots, hold_open_ms)
            if fd is not None:
                problem = validate_acquisition(fd, slot_dir, index)
                if problem is None:
                    return index, fd, slots
                warn(problem)
                os.close(fd)
                continue
            if cadence.due("slots"):
                warn(
                    "waiting for a heavy slot (slots=%d); a recorded pid may have exited "
                    "while a shell descendant retains the lock" % slots
                )
                for other in range(slots):
                    warn("waiting: slot-%d held by %s" % (other, describe_holder(slot_dir, other)))
            if priority:
                touch_priority_marker(slot_dir, poll_ms)
        finally:
            # Released before every poll sleep and before exec: the bracket is
            # never held across a wait and never inherited by the command.
            os.close(bracket_fd)
        time.sleep(poll_seconds(poll_ms, jitter_pct))


# --- recreation --------------------------------------------------------------


def parse_slots_flag(args: list[str]) -> tuple[int | None, str]:
    raw: str | None = None
    for i, token in enumerate(args):
        if token == "--slots":
            raw = args[i + 1] if i + 1 < len(args) else None
            break
        if token.startswith("--slots="):
            raw = token.split("=", 1)[1]
            break
    if raw is None:
        return None, "nothing"
    try:
        value = int(raw)
    except ValueError:
        return None, repr(raw)
    if value < SLOTS_MIN or value > SLOTS_MAX:
        return None, repr(raw)
    return value, ""


def lock_slot_for_recreate(
    slot_dir: str, index: int, cadence: WarnCadence, poll_ms: int, jitter_pct: int
) -> int | None:
    path = slot_path(slot_dir, index)
    while True:
        if not os.path.exists(path):
            return None
        fd = os.open(path, os.O_CREAT | os.O_RDWR, 0o644)
        try:
            fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except OSError:
            os.close(fd)
            if cadence.due("slot-%d" % index):
                warn("waiting: slot-%d held by %s" % (index, describe_holder(slot_dir, index)))
            time.sleep(poll_seconds(poll_ms, jitter_pct))
            continue
        try:
            linked = os.stat(path)
        except OSError:
            os.close(fd)
            return None
        held = os.fstat(fd)
        if (held.st_dev, held.st_ino) != (linked.st_dev, linked.st_ino):
            # This recreator opened a path a PRIOR recreator's swap then replaced.
            # Re-open from the current pathname rather than mutate a stale
            # generation while holding a lock on nothing.
            os.close(fd)
            continue
        return fd


def recreate_main(wrapper_args: list[str], env: dict[str, str]) -> int:
    target, offending = parse_slots_flag(wrapper_args)
    if target is None:
        # Management posture: a management command fails LOUD and changes
        # nothing. Only the wrap path must never block a gate run.
        warn(
            "--recreate: --slots requires an integer in [%d, %d]; got %s"
            % (SLOTS_MIN, SLOTS_MAX, offending)
        )
        return 2

    poll_ms = env_int(env, "FX_HEAVY_POLL_MS", DEFAULT_POLL_MS, 50, 600000)
    warn_s = env_int(env, "FX_HEAVY_WAIT_WARN_S", DEFAULT_WAIT_WARN_S, 10, 86400)
    jitter_pct = env_int(env, "FX_HEAVY_JITTER_PCT", DEFAULT_JITTER_PCT, 0, 50)
    hold_open_ms = env_int(env, "FX_HEAVY_TEST_HOLD_OPEN_MS", 0, 0, 60000)
    slot_dir = ensure_slot_dir(env)
    cadence = WarnCadence(warn_s)

    # `recreate.lock` is created on demand and NEVER unlinked by any operation.
    lock_fd = os.open(os.path.join(slot_dir, "recreate.lock"), os.O_CREAT | os.O_RDWR, 0o644)
    while True:
        try:
            fcntl.flock(lock_fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
            break
        except OSError:
            if cadence.due("recreate-lock"):
                warn("waiting: recreate.lock held")
            time.sleep(poll_seconds(poll_ms, jitter_pct))

    held: list[tuple[int, int]] = []
    for index in present_slot_indices(slot_dir):
        fd = lock_slot_for_recreate(slot_dir, index, cadence, poll_ms, jitter_pct)
        if fd is not None:
            held.append((index, fd))

    # Atomic swap: there is NO all-unlinked window. `os.replace` is atomic, so a
    # valid config exists at every instant and a crash at any point leaves either
    # the old or the new value — never an uninitialized dir for a later wrapper
    # to reseed with its own FX_HEAVY_SLOTS.
    warn("swap begin %d" % time.monotonic_ns())
    tmp_path = os.path.join(slot_dir, "config.tmp.%d" % os.getpid())
    with open(tmp_path, "w", encoding="utf-8") as handle:
        handle.write(json.dumps({"slots": target}) + "\n")
    os.replace(tmp_path, config_path(slot_dir))
    if hold_open_ms:
        time.sleep(hold_open_ms / 1000.0)
    for index, _fd in held:
        if index >= target:
            try:
                os.unlink(slot_path(slot_dir, index))
            except OSError:
                pass
    for index in range(target):
        path = slot_path(slot_dir, index)
        if not os.path.exists(path):
            os.close(os.open(path, os.O_CREAT | os.O_RDWR, 0o644))
    warn("swap end %d" % time.monotonic_ns())

    for _index, fd in held:
        os.close(fd)
    os.close(lock_fd)
    return 0


# --- entry point -------------------------------------------------------------


def main(argv: list[str]) -> int:
    wrapper_args, command = split_argv(argv)
    env = dict(os.environ)

    if "--recreate" in wrapper_args:
        return recreate_main(wrapper_args, env)

    if not command:
        warn("usage: with-heavy-slot.py [--priority] -- <cmd> [args...]")
        warn("       with-heavy-slot.py --recreate --slots <N>")
        return 2

    if env_flag(env, "FX_HEAVY_DISABLE"):
        os.execvp(command[0], command)

    requested_class, class_error = parse_class_flag(wrapper_args)
    if class_error is not None:
        warn(class_error)
        return 2

    nested = validated_nested_marker(env)
    if nested is True:
        # Outermost-owns: the ancestor holds the slot for the whole tree, so a
        # nested qualifying phase must pass through or it self-deadlocks.
        if requested_class is not None:
            # REFUSE, never wait. The inherited slot inverts the class-first
            # ordering: an ordinary holder waiting on this child, while a class
            # holder waits for that holder's slot, is a closed cycle. Waiting
            # here is the deadlock; passing through would run a second class
            # workload unadmitted. Both are wrong, so neither is offered.
            warn(
                "refusing: a %s-class phase nested under a held slot. Wrap at the "
                "OUTERMOST entry instead -- see the heavy-phase rule in AGENTS.md."
                % requested_class
            )
            return 3
        warn("nested under held slot \u2014 passing through")
        os.execvp(command[0], command)
    if nested is False:
        warn("stale slot-held marker \u2014 acquiring normally")
        os.environ.pop(MARKER_ENV, None)
        env.pop(MARKER_ENV, None)

    priority = env_flag(env, "FX_HEAVY_PRIORITY") or "--priority" in wrapper_args
    desired = env_int(env, "FX_HEAVY_SLOTS", DEFAULT_SLOTS, SLOTS_MIN, SLOTS_MAX)
    poll_ms = env_int(
        env,
        "FX_HEAVY_POLL_MS",
        DEFAULT_PRIORITY_POLL_MS if priority else DEFAULT_POLL_MS,
        50,
        600000,
    )
    warn_s = env_int(env, "FX_HEAVY_WAIT_WARN_S", DEFAULT_WAIT_WARN_S, 10, 86400)
    jitter_pct = env_int(env, "FX_HEAVY_JITTER_PCT", DEFAULT_JITTER_PCT, 0, 50)
    hold_open_ms = env_int(env, "FX_HEAVY_TEST_HOLD_OPEN_MS", 0, 0, 60000)

    slot_dir = ensure_slot_dir(env)
    cadence = WarnCadence(warn_s)
    class_fd: int | None = None
    if requested_class is not None:
        # BEFORE the slot, and the announcement order is what pins it: a test can
        # assert "acquired class" precedes "acquired slot-", which is false the
        # moment someone moves this below `acquire_loop`. Acquiring the slot
        # first would mean waiting for the class WHILE HOLDING a slot, which is
        # the wait-while-holding state the whole design excludes.
        class_fd = acquire_class_lock(slot_dir, requested_class, poll_ms, jitter_pct, cadence)
        warn("acquired class %s (before any slot)" % requested_class)
    index, fd, slots = acquire_loop(
        slot_dir, desired, poll_ms, jitter_pct, cadence, hold_open_ms, priority
    )

    _remove_priority_marker()
    write_metadata(fd, command, priority)
    # The command's ONLY env addition (C2): the held slot's pathname plus this
    # holder's pid, so a nested invocation can VALIDATE the claim rather than
    # trust a bare flag.
    os.environ[MARKER_ENV] = "%s:%d" % (
        slot_path(os.path.abspath(slot_dir), index),
        os.getpid(),
    )
    warn("acquired slot-%d (slots=%d)" % (index, slots))
    # The fd must survive execvp — that is the whole mechanism. Python marks fds
    # non-inheritable by default (PEP 446). The class fd rides through the same
    # way and is released by the same kernel path at process death.
    os.set_inheritable(fd, True)
    if class_fd is not None:
        os.set_inheritable(class_fd, True)
    os.execvp(command[0], command)


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
