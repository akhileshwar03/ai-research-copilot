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
GROWTH_EVERY_N_LOGS = 5  # every 10 minutes at the default interval
GROWTH_TOP_N = 8

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


def object_growth_report() -> str:
    """Top object types by count, with the change since the previous call.

    The point is to find what is growing: a steady rise in one type across reports is the leak.
    Walks every tracked object (a few tens of ms), so it runs only every GROWTH_EVERY_N_LOGS logs.
    Search the Render logs for ``object_growth``."""
    import gc
    from collections import Counter

    counts = Counter(type(o).__name__ for o in gc.get_objects())
    previous = getattr(object_growth_report, "_previous", None) or {}
    object_growth_report._previous = dict(counts)  # type: ignore[attr-defined]
    # Rank by growth since last time (first call: by size), then show size and delta.
    ranked = sorted(counts, key=lambda k: (counts[k] - previous.get(k, 0)) if previous else counts[k], reverse=True)
    parts = [f"{k}={counts[k]}({counts[k] - previous.get(k, 0):+d})" for k in ranked[:GROWTH_TOP_N]]
    # gc.get_objects() skips containers holding only plain numbers/strings, and every str/bytes. The
    # allocator-block total sees them all: if RSS climbs while py_blocks stays flat, the growth is native
    # memory or allocator fragmentation, not Python objects.
    return f"py_blocks={sys.getallocatedblocks()} " + " ".join(parts)


async def run_memory_monitor(interval_seconds: int = LOG_INTERVAL_SECONDS) -> None:
    """Log memory immediately, then every interval, until cancelled. Never raises."""
    tick = 0
    while True:
        try:
            log_memory_usage()
            if tick % GROWTH_EVERY_N_LOGS == 0:
                logger.info("object_growth %s", object_growth_report())
        except Exception:
            logger.exception("memory_usage_log_failed")
        tick += 1
        await asyncio.sleep(interval_seconds)
