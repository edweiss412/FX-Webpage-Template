#!/usr/bin/env python3
"""Machine-wide admission control for heavy local phases.

Spec: docs/superpowers/specs/2026-08-10-heavy-phase-semaphore-design.md

Usage: python3 scripts/with-heavy-slot.py [--priority] -- <cmd> [args...]

The wrapper takes one of N flock'd slot files in a shared directory and then
`execvp`s into the command, so the wrapper process BECOMES the heavy command:
the lock rides through exec on an inheritable fd, and the kernel releases it when
the last process holding that fd exits. Crash of the holder — any signal,
including SIGKILL — therefore releases the slot with zero cleanup code (C5), and
the caller sees the command's own exit status because no forwarding logic exists
(§4.1.8).

Python 3 stdlib only (C6): macOS ships no flock(1) and Node has no stdlib flock.

Every emission is ASCII and goes to stderr: stdout belongs to the wrapped
command, and a non-ASCII byte would raise on a C-locale stderr.
"""

from __future__ import annotations

import fcntl
import json
import os
import random
import sys
import time

DEFAULT_SLOT_DIR = "/tmp/fx-heavy-slots"
DEFAULT_SLOTS = 2
DEFAULT_POLL_MS = 3000
DEFAULT_WAIT_WARN_S = 300
DEFAULT_JITTER_PCT = 20

UNKNOWN_HOLDER = "holder unknown (metadata unreadable)"


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
            return argv[:i], argv[i + 1 :]
    return argv, []


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


def resolve_slots(slot_dir: str, desired: int) -> int:
    """The dir-recorded slot count wins over this invocation's own preference.

    Two sessions disagreeing about N must not run two differently-sized
    semaphores over one dir, so a published `config` is authoritative.
    """
    config_path = os.path.join(slot_dir, "config")
    try:
        with open(config_path, "r", encoding="utf-8") as handle:
            return int(json.loads(handle.read())["slots"])
    except (OSError, ValueError, KeyError, TypeError):
        pass
    with open(config_path, "w", encoding="utf-8") as handle:
        handle.write(json.dumps({"slots": desired}) + "\n")
    return desired


def try_acquire(slot_dir: str, slots: int) -> tuple[int, int] | tuple[None, None]:
    """First slot whose non-blocking exclusive flock succeeds wins.

    A LOSING fd is closed immediately: leaving it open would pin the inode of a
    slot this process does not own.
    """
    for index in range(slots):
        path = os.path.join(slot_dir, "slot-%d" % index)
        fd = os.open(path, os.O_CREAT | os.O_RDWR, 0o644)
        try:
            fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except OSError:
            os.close(fd)
            continue
        return index, fd
    return None, None


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
    data = read_holder(os.path.join(slot_dir, "slot-%d" % index))
    if data is None:
        return UNKNOWN_HOLDER
    return "pid=%s cmd=%s argc=%s prio=%s since=%s" % (
        data.get("pid"),
        data.get("cmd"),
        data.get("argc"),
        1 if data.get("priority") else 0,
        data.get("at"),
    )


def emit_wait_warning(slot_dir: str, slots: int) -> None:
    warn(
        "waiting for a heavy slot (slots=%d); a recorded pid may have exited while a "
        "shell descendant retains the lock" % slots
    )
    for index in range(slots):
        warn("waiting: slot-%d held by %s" % (index, describe_holder(slot_dir, index)))


def poll_seconds(poll_ms: int, jitter_pct: int) -> float:
    spread = poll_ms * jitter_pct / 100.0
    return max(0.0, poll_ms + random.uniform(-spread, spread)) / 1000.0


def main(argv: list[str]) -> int:
    _wrapper_args, command = split_argv(argv)
    if not command:
        warn("usage: with-heavy-slot.py [--priority] -- <cmd> [args...]")
        return 2

    env = dict(os.environ)

    if env_flag(env, "FX_HEAVY_DISABLE"):
        os.execvp(command[0], command)

    priority = env_flag(env, "FX_HEAVY_PRIORITY")
    desired = env_int(env, "FX_HEAVY_SLOTS", DEFAULT_SLOTS, 1, 64)
    poll_ms = env_int(env, "FX_HEAVY_POLL_MS", DEFAULT_POLL_MS, 50, 600000)
    warn_s = env_int(env, "FX_HEAVY_WAIT_WARN_S", DEFAULT_WAIT_WARN_S, 10, 86400)
    jitter_pct = env_int(env, "FX_HEAVY_JITTER_PCT", DEFAULT_JITTER_PCT, 0, 50)

    slot_dir = ensure_slot_dir(env)
    slots = resolve_slots(slot_dir, desired)

    last_warn: float | None = None
    while True:
        index, fd = try_acquire(slot_dir, slots)
        if fd is not None:
            break
        # Cadence is evaluated AT EACH WAKE, so the effective interval is
        # max(poll, warn) — a poll above the warn interval warns once per wake
        # rather than promising an impossible sub-poll cadence. The first wait
        # always warns immediately.
        now = time.monotonic()
        if last_warn is None or (now - last_warn) >= warn_s:
            emit_wait_warning(slot_dir, slots)
            last_warn = now
        time.sleep(poll_seconds(poll_ms, jitter_pct))

    write_metadata(fd, command, priority)
    warn("acquired slot-%d (slots=%d)" % (index, slots))
    # The fd must survive execvp — that is the whole mechanism. Python marks fds
    # non-inheritable by default (PEP 446).
    os.set_inheritable(fd, True)
    os.execvp(command[0], command)


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
