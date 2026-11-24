import asyncio
import logging

from app.services import memory_monitor


def test_snapshot_has_a_process_reading():
    snap = memory_monitor.memory_snapshot()
    assert snap["rss_mb"] is not None and snap["rss_mb"] > 0


def test_log_line_is_searchable(caplog):
    with caplog.at_level(logging.INFO, logger="app.services.memory_monitor"):
        memory_monitor.log_memory_usage()
    assert any("memory_usage rss_mb=" in r.getMessage() for r in caplog.records)


def test_monitor_logs_immediately_and_survives_a_failed_read(monkeypatch, caplog):
    calls = {"n": 0}

    def flaky():
        calls["n"] += 1
        if calls["n"] == 1:
            raise RuntimeError("boom")

    monkeypatch.setattr(memory_monitor, "log_memory_usage", flaky)

    async def run():
        task = asyncio.create_task(memory_monitor.run_memory_monitor(interval_seconds=0.01))
        await asyncio.sleep(0.1)
        task.cancel()

    with caplog.at_level(logging.ERROR, logger="app.services.memory_monitor"):
        asyncio.run(run())
    assert calls["n"] >= 2  # kept going after the first call raised


def test_object_growth_report_names_types_and_deltas():
    from app.services.memory_monitor import object_growth_report

    class Leaky:
        pass

    first = object_growth_report()
    assert "py_blocks=" in first and "=" in first
    keep = [Leaky() for _ in range(5000)]  # noqa: F841 -- keeps 5000 tracked objects alive
    second = object_growth_report()
    assert "Leaky=5000(+5000)" in second  # the type that grew is reported with its change
