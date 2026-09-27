"""OpenAI list prices, used to turn logged token counts into an *estimated* cost.

Every number below was read from OpenAI's own pricing page (Standard tier, USD per 1M tokens) on the date
in PRICING_VERIFIED_ON. Prices change: re-check the source before trusting a figure, and update the date
when you do. A model with no entry is reported as "unpriced" -- never as zero and never guessed.
"""

from dataclasses import dataclass

PRICING_SOURCE = "https://developers.openai.com/api/docs/pricing"
PRICING_VERIFIED_ON = "2026-09-27"


@dataclass(frozen=True)
class ModelPrice:
    input: float  # USD per 1M input tokens
    output: float  # USD per 1M output tokens (0 for embeddings)
    cached_input: float | None = None  # USD per 1M cached input tokens; None = billed like normal input


PRICES: dict[str, ModelPrice] = {
    # Chat / completion models (Standard tier).
    "gpt-4.1-mini": ModelPrice(input=0.40, cached_input=0.10, output=1.60),
    "gpt-4.1-nano": ModelPrice(input=0.10, cached_input=0.025, output=0.40),
    "gpt-4.1": ModelPrice(input=2.00, cached_input=0.50, output=8.00),
    "gpt-4o-mini": ModelPrice(input=0.15, cached_input=0.075, output=0.60),
    "gpt-4o": ModelPrice(input=2.50, cached_input=1.25, output=10.00),
    "gpt-5-mini": ModelPrice(input=0.25, cached_input=0.025, output=2.00),
    "gpt-5-nano": ModelPrice(input=0.05, cached_input=0.005, output=0.40),
    # Embeddings. The pricing page lists ada-002 at $0.10 per 1M tokens; its model page labels that figure
    # "Batch API price", so treat it as list price and cross-check against the OpenAI usage dashboard.
    "text-embedding-ada-002": ModelPrice(input=0.10, output=0.0),
    "text-embedding-3-small": ModelPrice(input=0.02, output=0.0),
    "text-embedding-3-large": ModelPrice(input=0.13, output=0.0),
}


def price_for(model: str) -> ModelPrice | None:
    """Exact name, or a dated snapshot of a known model ("gpt-4.1-mini-2025-04-14" -> "gpt-4.1-mini").
    The longest matching name wins so "gpt-4.1-mini-..." is never priced as "gpt-4.1"."""
    if model in PRICES:
        return PRICES[model]
    matches = [name for name in PRICES if model.startswith(name + "-")]
    return PRICES[max(matches, key=len)] if matches else None


def cost_usd(model: str, input_tokens: int, output_tokens: int, cached_input_tokens: int = 0) -> float | None:
    """Estimated cost in USD, or None when the model has no verified price."""
    price = price_for(model)
    if price is None:
        return None
    cached = min(max(cached_input_tokens, 0), input_tokens)
    cached_rate = price.cached_input if price.cached_input is not None else price.input
    return ((input_tokens - cached) * price.input + cached * cached_rate + output_tokens * price.output) / 1_000_000


# ── Web search (Tavily) ────────────────────────────────────────────────────────
# Read from https://docs.tavily.com/documentation/api-credits on PRICING_VERIFIED_ON: a basic-depth search costs
# 1 credit, advanced costs 2; pay-as-you-go is $0.008 per credit; the free plan includes 1,000 credits a month.
# The app only issues basic searches. Cost is shown at the pay-as-you-go rate, which overstates spend while the
# monthly free allowance is not used up -- check Tavily's billing page for what is actually charged.
SEARCH_SOURCE = "https://docs.tavily.com/documentation/api-credits"
SEARCH_USD_PER_CREDIT = 0.008
SEARCH_FREE_CREDITS_PER_MONTH = 1000
SEARCH_CREDITS_PER_CALL: dict[str, int] = {"tavily-search-basic": 1, "tavily-search-advanced": 2}


def search_credits(model: str, calls: int) -> int | None:
    per_call = SEARCH_CREDITS_PER_CALL.get(model)
    return None if per_call is None else per_call * calls


def search_cost_usd(model: str, calls: int) -> float | None:
    credits = search_credits(model, calls)
    return None if credits is None else credits * SEARCH_USD_PER_CREDIT
