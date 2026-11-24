"""Periodic memory-usage log line.

WHY: Render's free tier kills the instance when it passes 512 MB and hides the memory graph, so
the restarts (emailed as "exceeded its memory limit") could not be explained. This writes one
INFO line every few minutes with the process's own memory and, where the container exposes it,
the container-wide figure Render actually enforces. Read-only: it changes no behaviour.

Search the Render logs for ``memory_usage`` to get the curve.
"""

import asyncio
import logging
import os
import resource
import sys
from pathlib import Path

logger = logging.getLogger(__name__)

LOG_INTERVAL_SECONDS = 120

_CGROUP_FILES = (
    Path("/sys/fs/cgroup/memory.current"),  # cgroup v2
    Path("/sys/fs/cgroup/memory/memory.usage_in_bytes"),  # cgroup v1
)


def _mb(num_bytes: int) -> float:
    return round(num_bytes / (1024 * 1024), 1)


def process_rss_mb() -> float | None:
    """Resident memory of this process, in MB. None if it cannot be read."""
    try:
        for line in Path("/proc/self/status").read_text().splitlines():  # Linux (Render)
            if line.startswith("VmRSS:"):
                return round(int(line.split()[1]) / 1024, 1)  # value is in kB
    except OSError:
        pass
    try:  # macOS / fallback: peak RSS (bytes on macOS, kB elsewhere)
        peak = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
        return _mb(peak if sys.platform == "darwin" else peak * 1024)
    except Exception:
        return None


def container_mb() -> float | None:
    """Container-wide memory (what the platform limit applies to), in MB, if exposed."""
    for path in _CGROUP_FILES:
        try:
            return _mb(int(path.read_text().strip()))
        except (OSError, ValueError):
            continue
    return None


def memory_snapshot() -> dict:
    return {"rss_mb": process_rss_mb(), "container_mb": container_mb(), "pid": os.getpid()}


def log_memory_usage() -> None:
    snap = memory_snapshot()
    logger.info(
        "memory_usage rss_mb=%s container_mb=%s pid=%s", snap["rss_mb"], snap["container_mb"], snap["pid"]
    )


async def run_memory_monitor(interval_seconds: int = LOG_INTERVAL_SECONDS) -> None:
    """Log memory immediately, then every interval, until cancelled. Never raises."""
    while True:
        try:
            log_memory_usage()
        except Exception:
            logger.exception("memory_usage_log_failed")
        await asyncio.sleep(interval_seconds)
