"""Few-shot before/after pairs for the Humaniser rewrite prompt (Pass 2).

⚠️ DRAFT — needs your manual review before you'd want to fully trust it in
production. These are strong first-pass examples meant to demonstrate the
technique (structural rewrite, burstiness, banned-vocab removal) for each of
the three style modes, but example quality is the single biggest lever on
output quality, and it benefits from a human ear more than anything else in
this pipeline. Edit pairs directly in EXAMPLES below — this is plain data,
no other file references specific pair content.

Each entry is (before, after). `note` is for your reference only; it is
never sent to the model.
"""

from dataclasses import dataclass


@dataclass(frozen=True)
class ExamplePair:
    before: str
    after: str
    note: str = ""


EXAMPLES: dict[str, list[ExamplePair]] = {
    "normal": [
        ExamplePair(
            "Moreover, it is important to note that regular exercise plays a crucial role in "
            "maintaining overall health and wellbeing.",
            "Exercise isn't optional if you want to actually feel good. Skip it for a week and "
            "you'll notice.",
            "Cuts transition spam + banned vocab; short punchy replacement.",
        ),
        ExamplePair(
            "In today's fast-paced world, it is essential to leverage technology in order to "
            "remain competitive and unlock new opportunities.",
            "Everyone's busy. If you're not using the tools available to you, you're leaving an "
            "edge on the table.",
            "Kills the empty opener entirely; restructures around a short-then-long pair.",
        ),
        ExamplePair(
            "Furthermore, the results demonstrate a clear, consistent, and compelling improvement "
            "across all measured categories.",
            "The results were better across the board — not by a little, either.",
            "Removes the parallel triad; one em dash, not a list.",
        ),
        ExamplePair(
            "Additionally, it is worth noting that customer feedback has been overwhelmingly "
            "positive since the product launch.",
            "Customers have liked it. A lot, actually — we weren't expecting reviews this good.",
            "Direct address, fragment ('A lot, actually'), contraction.",
        ),
        ExamplePair(
            "This holistic approach fosters a seamless integration of design and functionality, "
            "ultimately elevating the user experience.",
            "Good design and good function aren't separate problems here. Solve one and the other "
            "mostly follows.",
            "Concrete verbs replace nominalizations; no AI vocabulary survives.",
        ),
        ExamplePair(
            "Consequently, businesses must navigate the complexities of an ever-evolving digital "
            "landscape to remain relevant.",
            "The rules keep changing. Stay still too long and you're behind.",
            "Two short sentences instead of one long hedge-heavy one.",
        ),
        ExamplePair(
            "It is crucial to underscore the pivotal role that data plays in shaping informed "
            "business decisions.",
            "Data isn't a nice-to-have here. Decisions made without it are just guesses with "
            "better spelling.",
            "Commits to a specific, slightly wry claim instead of hedging.",
        ),
        ExamplePair(
            "Overall, the team's dedication and hard work have been instrumental in achieving "
            "these outstanding results.",
            "The team put in the hours, and it paid off. This kind of result doesn't happen by "
            "accident.",
            "Plain verbs, no summary-closer framing.",
        ),
    ],
    "clear_structured": [
        ExamplePair(
            "The quarterly report demonstrates a robust and holistic improvement in operational "
            "efficiency, underscoring the effectiveness of the new workflow.",
            "Operational efficiency improved this quarter. The new workflow is the main reason "
            "why.",
            "Two plain sentences; claim and cause separated.",
        ),
        ExamplePair(
            "It is important to note that customer churn decreased by 12%, which is a testament "
            "to the success of the retention initiative.",
            "Customer churn dropped 12%. The retention initiative worked.",
            "Numbers preserved exactly; no hedge before the number.",
        ),
        ExamplePair(
            "Moreover, the data indicates a myriad of factors contributing to the delay, chief "
            "among them being supply chain disruptions.",
            "Several factors caused the delay. Supply chain disruptions were the biggest one.",
            "'Myriad' removed; structure (cause -> biggest cause) kept, phrasing plain.",
        ),
        ExamplePair(
            "In summary, the findings underscore the crucial need to reassess current inventory "
            "management practices.",
            "The findings point to one thing: inventory management practices need a second look.",
            "Colon construction reads as plain report prose, not a summary-closer template.",
        ),
        ExamplePair(
            "The survey results boast a significant increase in employee satisfaction, further "
            "validating the new benefits package.",
            "Employee satisfaction rose significantly. The new benefits package appears to be "
            "why.",
            "'Appears to be' keeps the same epistemic hedge as 'validating', just plainer.",
        ),
        ExamplePair(
            "Notably, revenue growth this quarter was driven by a seamless expansion into three "
            "new regional markets.",
            "Revenue grew this quarter. Three new regional markets drove most of it.",
            "Split into two short claims; 'seamless' removed without losing meaning.",
        ),
        ExamplePair(
            "It is worth noting that the pilot program's results, while preliminary, are "
            "consistent with the projected outcomes.",
            "The pilot's results are preliminary, but they match projections so far.",
            "'So far' does the hedging work 'while preliminary' was doing, more naturally.",
        ),
        ExamplePair(
            "At the end of the day, the audit confirmed that compliance standards were met across "
            "every department.",
            "The audit confirmed compliance across every department.",
            "Drops the filler opener entirely — the sentence didn't need it.",
        ),
    ],
    "simple_formal": [
        ExamplePair(
            "Furthermore, this proposal seeks to leverage existing resources in order to optimize "
            "departmental efficiency.",
            "This proposal uses resources already available to the department. The goal is a "
            "measurable gain in efficiency, not a new budget line.",
            "No contractions; still varies sentence length and adds a concrete, specific claim.",
        ),
        ExamplePair(
            "It is important to note that the merger will foster a more robust and cohesive "
            "organizational structure.",
            "The merger changes the organizational structure. It should be more cohesive, though "
            "the transition period will require oversight.",
            "Measured tone preserved; hedge ('should') is honest rather than templated.",
        ),
        ExamplePair(
            "Consequently, we must navigate the complexities of the new regulatory landscape with "
            "a holistic approach.",
            "The new regulations are complex, and no single department can address them alone. "
            "This requires coordination across legal, finance, and operations.",
            "Names the actual departments instead of 'holistic approach'.",
        ),
        ExamplePair(
            "Moreover, the pilot initiative underscores the pivotal importance of cross-functional "
            "collaboration.",
            "The pilot initiative relied on cross-functional collaboration. Without it, the "
            "timeline would not have been met.",
            "Specific, falsifiable claim replaces the vague 'underscores the importance'.",
        ),
        ExamplePair(
            "Overall, this strategy is designed to unlock long-term value while maintaining a "
            "seamless client experience.",
            "This strategy targets long-term value. Client-facing changes will be minimal during "
            "the transition.",
            "'Seamless' becomes a concrete, checkable claim about what the client will notice.",
        ),
        ExamplePair(
            "It is crucial to underscore that the vendor's performance has been a testament to the "
            "strength of the partnership.",
            "The vendor's performance this year has been strong. Renewal is recommended.",
            "Direct recommendation replaces vague praise — still formal, no contractions.",
        ),
        ExamplePair(
            "In today's competitive landscape, businesses must harness data-driven insights to "
            "remain viable.",
            "Competitive pressure has increased. Decisions grounded in data are no longer optional "
            "for remaining viable.",
            "Empty opener removed; claim broken into two sentences of different length.",
        ),
        ExamplePair(
            "At the end of the day, the committee's holistic review affirmed that current "
            "policies remain effective.",
            "The committee reviewed current policy in full. It remains effective; no changes are "
            "recommended at this time.",
            "One semicolon, used deliberately rather than habitually.",
        ),
    ],
}


def format_examples(style: str, limit: int = 6) -> str:
    """Render a style's few-shot pairs as prompt text. `limit` caps how many
    pairs are sent per request — keeps prompt length (and cost) bounded even
    though the source lists hold 8 pairs each for your review."""
    pairs = EXAMPLES.get(style, EXAMPLES["normal"])[:limit]
    if not pairs:
        return ""
    blocks = [f"Example {i}:\nBefore: {pair.before}\nAfter: {pair.after}" for i, pair in enumerate(pairs, start=1)]
    return "Examples of the technique applied:\n\n" + "\n\n".join(blocks)
