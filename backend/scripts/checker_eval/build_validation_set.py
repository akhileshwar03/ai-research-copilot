"""Builds validation_set_v1.jsonl — see README.md for the ground-truth design.

Deliberately standalone: does NOT import anything from `app.*`, so it never touches
DATABASE_URL or any database, per this project's own hard rule about scripts and the
default (production) .env. The only thing read from .env is OPENAI_API_KEY, used for a
direct OpenAI API call — no different from any other OpenAI client script.

The Basic Humanizer step calls the REAL production API (querex.app's backend), using a
bearer token you provide (a fresh token from an already-logged-in browser session's
localStorage, same technique used throughout this project's live verification this
session) — never hardcoded, never committed. Pass it as PROD_BEARER_TOKEN.
"""

import json
import os
import sys
import time
from pathlib import Path

import httpx
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[2]  # backend/
load_dotenv(ROOT / ".env")

CORPUS_DIR = ROOT / "scripts" / "finetune" / "pre2015_corpus"
OUT_PATH = Path(__file__).resolve().parent / "validation_set_v1.jsonl"

PROD_API_BASE = "https://ai-research-copilot-xtmd.onrender.com/api/v1"

# Topic -> (corpus filename stem, a plain human-readable topic name for the AI prompt).
# Picked for real diversity: hard science, everyday process, food, weather, biology.
TOPICS = [
    ("wiki_Photosynthesis", "photosynthesis"),
    ("wiki_Sourdough", "how sourdough bread is made"),
    ("wiki_Bicycle", "how a bicycle works"),
    ("wiki_Volcano", "how volcanoes form and erupt"),
    ("wiki_Compost", "how composting works"),
    ("wiki_Espresso", "how espresso is brewed"),
    ("wiki_Thunderstorm", "how thunderstorms form"),
    ("wiki_Honey_bee", "the life of honey bees"),
]

WORD_TARGET = 180  # ~ first paragraph or two of each wiki article


def _first_n_words(text: str, n: int) -> str:
    words = text.split()
    if len(words) <= n:
        return text.strip()
    # Cut at the last sentence boundary at or before word n, so we don't truncate mid-sentence.
    truncated = " ".join(words[:n])
    last_period = truncated.rfind(". ")
    if last_period > len(truncated) * 0.5:
        return truncated[: last_period + 1].strip()
    return truncated.strip() + "."


def _generate_ai_original(client, topic_name: str) -> str:
    """A plain, realistic prompt an ordinary user would actually type — not stuffed with
    AI-tells on purpose. This is what makes the resulting text a fair, real AI-generated
    sample rather than a strawman."""
    response = client.chat.completions.create(
        model="gpt-4.1-mini",
        messages=[
            {
                "role": "user",
                "content": f"Write a short informational paragraph (about 150 words) explaining {topic_name}.",
            }
        ],
        temperature=0.7,
    )
    return response.choices[0].message.content.strip()


def _humanize_basic_once(token: str, text: str) -> str:
    """Parses the real SSE format (app/api/routes/humanize.py / pipeline.py's own
    docstring: "at most one revised event ... IF Pass 3 patched a paragraph"). An earlier
    version of this function treated `event: revised` as always required and raised when it
    didn't appear — that was a bug in THIS SCRIPT, not the production pipeline: confirmed by
    reading the real frontend's own stream handler
    (frontend/features/humanizer/hooks/use-humanize-stream.ts), which accumulates plain
    `token` events into the final text by default and only overwrites it with `revised` if
    Pass 3 actually found something worth patching. No `revised` event just means Pass 2's
    rewrite was already clean — a good outcome, not a failure — so the correct fallback is
    the accumulated token text, exactly matching what a real user actually sees."""
    timeout = httpx.Timeout(connect=15.0, read=120.0, write=15.0, pool=15.0)
    with httpx.Client(timeout=timeout) as http_client:
        resp = http_client.post(
            f"{PROD_API_BASE}/humanize",
            headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
            json={"text": text, "style": "normal", "expand": False},
        )
        resp.raise_for_status()
        lines = resp.text.splitlines()
        current_event = "message"
        accumulated = ""
        revised_text = None
        for line in lines:
            if line.startswith("event:"):
                current_event = line[len("event:") :].strip()
            elif line.startswith("data:"):
                payload = line[len("data:") :].strip()
                if not payload:
                    continue
                if current_event == "revised":
                    revised_text = json.loads(payload)
                elif current_event == "message":
                    accumulated += json.loads(payload)
        if revised_text is not None:
            return revised_text.strip()
        if accumulated:
            return accumulated.strip()
        raise RuntimeError(f"No text at all in humanize response: {resp.text[:500]!r}")


def _humanize_basic(token: str, text: str, retries: int = 2) -> str:
    """A transient network cutoff mid-stream was observed for real (2026-09-29, this build) —
    the connection ended cleanly with no error event, just an incomplete stream. Retrying the
    same request is cheap and safe here (the humanize endpoint has no side effects beyond
    computing and returning text), so a bounded retry is worth it rather than losing an
    already-paid-for ai_original sample to a one-off network hiccup."""
    last_error = None
    for attempt in range(retries + 1):
        try:
            return _humanize_basic_once(token, text)
        except Exception as exc:  # noqa: BLE001 - genuinely want to retry on anything here
            last_error = exc
            print(f"  humanize attempt {attempt + 1} failed: {exc}; retrying..." if attempt < retries else "")
            time.sleep(3)
    raise last_error


def main():
    token = os.environ.get("PROD_BEARER_TOKEN")
    if not token:
        print("ERROR: set PROD_BEARER_TOKEN (a fresh bearer token from an authenticated session).")
        sys.exit(1)

    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        print("ERROR: OPENAI_API_KEY not found in backend/.env")
        sys.exit(1)

    from openai import OpenAI

    client = OpenAI(api_key=api_key)

    # Resumable: topics already fully written (all 3 labels present) are skipped, so a
    # crash partway through (a real transient failure hit while building this exact file)
    # doesn't throw away already-paid-for OpenAI calls on a re-run.
    done_topics: dict[str, set[str]] = {}
    if OUT_PATH.exists():
        with OUT_PATH.open(encoding="utf-8") as f:
            for line in f:
                row = json.loads(line)
                done_topics.setdefault(row["topic"], set()).add(row["label"])

    out_f = OUT_PATH.open("a", encoding="utf-8")

    def _write(row: dict):
        out_f.write(json.dumps(row) + "\n")
        out_f.flush()

    for stem, topic_name in TOPICS:
        have = done_topics.get(topic_name, set())
        if have == {"human", "ai_original", "ai_humanized_basic"}:
            print(f"[{topic_name}] already complete, skipping")
            continue

        corpus_path = CORPUS_DIR / f"{stem}.txt"
        if not corpus_path.exists():
            print(f"WARNING: missing {corpus_path}, skipping")
            continue

        ai_text = None  # needed later for the humanize call even if ai_original was cached

        if "human" not in have:
            raw_human = corpus_path.read_text(encoding="utf-8")
            human_text = _first_n_words(raw_human, WORD_TARGET)
            _write(
                {
                    "topic": topic_name,
                    "label": "human",
                    "text": human_text,
                    "word_count": len(human_text.split()),
                    "source": f"Wikipedia, {stem.replace('wiki_', '').replace('_', ' ')}, pinned 2013 revision",
                }
            )
            print(f"[{topic_name}] human sample: {len(human_text.split())} words")

        if "ai_original" not in have:
            ai_text = _generate_ai_original(client, topic_name)
            _write(
                {
                    "topic": topic_name,
                    "label": "ai_original",
                    "text": ai_text,
                    "word_count": len(ai_text.split()),
                    "source": "gpt-4.1-mini, direct API call, temperature=0.7",
                }
            )
            print(f"[{topic_name}] ai_original: {len(ai_text.split())} words")
            time.sleep(1)

        if "ai_humanized_basic" not in have:
            if ai_text is None:
                # ai_original was already written on a prior run -- read it back rather
                # than paying for a fresh generation (which would also break the
                # topic-matched pairing this dataset's design depends on).
                with OUT_PATH.open(encoding="utf-8") as f:
                    for line in f:
                        row = json.loads(line)
                        if row["topic"] == topic_name and row["label"] == "ai_original":
                            ai_text = row["text"]
                            break
                if ai_text is None:
                    print(f"WARNING: no cached ai_original for {topic_name}, skipping humanize step")
                    continue
            humanized_text = _humanize_basic(token, ai_text)
            _write(
                {
                    "topic": topic_name,
                    "label": "ai_humanized_basic",
                    "text": humanized_text,
                    "word_count": len(humanized_text.split()),
                    "source": "Basic Humanizer, production API, style=normal expand=off",
                }
            )
            print(f"[{topic_name}] ai_humanized_basic: {len(humanized_text.split())} words")
            time.sleep(1)

    out_f.close()
    print(f"\nDone. Dataset at {OUT_PATH}")


if __name__ == "__main__":
    main()
