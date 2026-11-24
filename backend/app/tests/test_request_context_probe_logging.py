import logging

from fastapi.testclient import TestClient

from app.main import app


def test_probe_paths_log_the_caller_but_other_paths_do_not(caplog):
    client = TestClient(app)
    with caplog.at_level(logging.INFO, logger="app.request"):
        client.get("/health", headers={"user-agent": "UptimeRobot/2.0", "x-forwarded-for": "203.0.113.9, 10.0.0.1"})
        client.get("/app/config", headers={"user-agent": "Mozilla/5.0", "x-forwarded-for": "198.51.100.7"})
    callers = [r.getMessage() for r in caplog.records if "probe_caller" in r.getMessage()]
    assert any("path=/health" in m and "client=203.0.113.9" in m and "UptimeRobot/2.0" in m for m in callers)
    assert not any("198.51.100.7" in r.getMessage() for r in caplog.records)  # ordinary users are not logged
