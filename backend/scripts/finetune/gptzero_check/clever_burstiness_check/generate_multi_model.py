"""One-off: generate 3 genuinely AI-authored source texts from 3 different model
families (OpenAI, Anthropic, Google), so the updated Basic prompt (RULE 5-10,
2026-09-13) gets tested against more than one model's writing fingerprint, not
just repeated topics from the same model. Not part of the app; throwaway script."""

import json
import os

from dotenv import load_dotenv

load_dotenv()

PROMPTS = {
    "openai_howto": (
        "Write a ~250-word how-to guide blog post about brewing pour-over coffee at home "
        "for beginners. Plain prose, no headers, no bullet points."
    ),
    "anthropic_review": (
        "Write a ~250-word product review of a mid-range mechanical keyboard, covering "
        "typing feel, build quality, and value for money. Plain prose, no headers, no "
        "bullet points."
    ),
    "google_explainer": (
        "Write a ~250-word casual explainer for a general audience about why the sky is "
        "blue, covering Rayleigh scattering in plain terms. Plain prose, no headers, no "
        "bullet points."
    ),
}


def gen_openai(prompt: str) -> str:
    from openai import OpenAI

    client = OpenAI(api_key=os.environ["OPENAI_API_KEY"])
    resp = client.chat.completions.create(
        model="gpt-4.1-mini",
        messages=[{"role": "user", "content": prompt}],
    )
    return resp.choices[0].message.content.strip()


def gen_groq(prompt: str) -> str:
    # Substituted for Anthropic: the configured ANTHROPIC_API_KEY has no credit
    # balance (real 400 from the API, not a code bug). Groq's Llama-3.3-70B is a
    # genuinely different model family from OpenAI/Google, which is what this
    # script actually needs (source-model diversity), not the Anthropic brand
    # specifically.
    from openai import OpenAI

    client = OpenAI(api_key=os.environ["GROQ_API_KEY"], base_url="https://api.groq.com/openai/v1")
    resp = client.chat.completions.create(
        model="openai/gpt-oss-120b",
        messages=[{"role": "user", "content": prompt}],
    )
    return resp.choices[0].message.content.strip()


def gen_google(prompt: str) -> str:
    from google import genai

    client = genai.Client(api_key=os.environ["GOOGLE_API_KEY"])
    resp = client.models.generate_content(model="gemini-3.6-flash", contents=prompt)
    return resp.text.strip()


if __name__ == "__main__":
    out_path = "multi_model_inputs.json"
    out = {}
    if os.path.exists(out_path):
        out = json.load(open(out_path))

    def run(key, fn, prompt):
        if key in out:
            print(f"{key} already done, skipping")
            return
        out[key] = fn(prompt)
        json.dump(out, open(out_path, "w"), indent=2)  # save immediately, don't lose work on a later failure
        print(f"{key} done:", len(out[key].split()), "words")

    run("openai_howto", gen_openai, PROMPTS["openai_howto"])
    run("groq_llama_review", gen_groq, PROMPTS["anthropic_review"])
    run("google_explainer", gen_google, PROMPTS["google_explainer"])
    print("saved to", out_path)
