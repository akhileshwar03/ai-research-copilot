"""The fine-tune scripts must never reach the production database by default.

Run in subprocesses, exactly the way the scripts are launched (python -m scripts.finetune.<name>
from backend/), with a fake production DATABASE_URL in the environment standing in for backend/.env.
"""

import os
import subprocess
import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[2]
FAKE_PROD = "postgresql://owner:pw@ep-fake.us-east-1.aws.neon.tech/neondb"


def _run(extra_env):
    env = {**os.environ, "DATABASE_URL": FAKE_PROD, "ENVIRONMENT": "development"}
    env.pop("FINETUNE_DATABASE_URL", None)
    env.pop("FINETUNE_ALLOW_PRODUCTION", None)
    env.update(extra_env)
    code = "import scripts.finetune, os; print('URL=' + os.environ['DATABASE_URL'])"
    return subprocess.run([sys.executable, "-c", code], cwd=BACKEND, env=env, capture_output=True, text=True)


def test_default_ignores_the_env_database_and_uses_local_sqlite():
    r = _run({})
    assert r.returncode == 0, r.stderr
    url = [l for l in r.stdout.splitlines() if l.startswith("URL=")][0]
    assert "neon.tech" not in url and url.startswith("URL=sqlite:///") and url.endswith("finetune_local.db")


def test_explicit_non_neon_url_is_honoured():
    r = _run({"FINETUNE_DATABASE_URL": "sqlite:////tmp/some_other.db"})
    assert r.returncode == 0 and "URL=sqlite:////tmp/some_other.db" in r.stdout


def test_neon_url_is_refused_without_the_second_flag():
    r = _run({"FINETUNE_DATABASE_URL": FAKE_PROD})
    assert r.returncode != 0 and "Refusing to run" in (r.stderr + r.stdout)


def test_neon_url_needs_both_flags():
    r = _run({"FINETUNE_DATABASE_URL": FAKE_PROD, "FINETUNE_ALLOW_PRODUCTION": "yes"})
    assert r.returncode == 0 and f"URL={FAKE_PROD}" in r.stdout
