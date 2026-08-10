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
DEFAULT_JITTER_PCT = 20


def warn(message: str) -> None:
    """Every wrapper emission goes to stderr — stdout belongs to the command."""
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


def ensure_slot_dir(env: dict[str, str]) -> str:
    slot_dir = env.get("FX_HEAVY_SLOT_DIR", DEFAULT_SLOT_DIR)
    os.makedirs(slot_dir, mode=0o755, exist_ok=True)
    return slot_dir


def resolve_slots(slot_dir: str, env: dict[str, str]) -> int:
    """The dir-recorded slot count wins over this invocation's own preference.

    Two sessions disagreeing about N must not run two differently-sized
    semaphores over one dir, so a published `config` is authoritative.
    """
    config_path = os.path.join(slot_dir, "config")
    desired = int(env.get("FX_HEAVY_SLOTS", str(DEFAULT_SLOTS)))
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

    A LOSING fd is closed immediately: leaving it open would pin the inode and,
    on some paths, the lock state of a slot this process does not own.
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


def poll_seconds(env: dict[str, str]) -> float:
    poll_ms = int(env.get("FX_HEAVY_POLL_MS", str(DEFAULT_POLL_MS)))
    jitter_pct = int(env.get("FX_HEAVY_JITTER_PCT", str(DEFAULT_JITTER_PCT)))
    spread = poll_ms * jitter_pct / 100.0
    return max(0.0, poll_ms + random.uniform(-spread, spread)) / 1000.0


def main(argv: list[str]) -> int:
    _wrapper_args, command = split_argv(argv)
    if not command:
        warn("usage: with-heavy-slot.py [--priority] -- <cmd> [args...]")
        return 2

    env = dict(os.environ)
    slot_dir = ensure_slot_dir(env)
    slots = resolve_slots(slot_dir, env)

    while True:
        index, fd = try_acquire(slot_dir, slots)
        if fd is not None:
            break
        time.sleep(poll_seconds(env))

    warn("acquired slot-%d (slots=%d)" % (index, slots))
    # The fd must survive execvp — that is the whole mechanism. Python marks fds
    # non-inheritable by default (PEP 446).
    os.set_inheritable(fd, True)
    os.execvp(command[0], command)


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
