import { test, expect } from "@playwright/test";
import { signIn, uniqueEmail } from "./helpers";

// Deliberately loaded with checker_service.py's own _AI_TELL_PHRASES list
// ("delve into", "moreover", "it's important to note", "seamless",
// "paradigm shift", "unlock the potential", "in conclusion") plus uniform
// sentence lengths and repetitive phrasing (low burstiness/lexical
// diversity) — both the heuristic scorer and the LLM prompt (which flags
// "generic transitions... overused stock phrases" as top evidence) key off
// exactly this, so this text should reliably land as AI-GENERATED rather
// than in the ambiguous 0.4-0.6 "uncertain" band. At 70+ words it also
// clears MIN_WORDS_FOR_CONFIDENCE=60, avoiding the "low confidence" caveat
// that short text gets regardless of signal.
const AI_LIKE_TEXT = `
In today's world, it's important to delve into the many benefits of this approach.
Moreover, this solution offers a seamless experience for every user. Furthermore,
it's important to note that this represents a genuine paradigm shift in how we
think about the problem. Additionally, this framework helps unlock the potential
of every team that adopts it. Moreover, the seamless integration delivers a
paradigm shift that benefits everyone involved. In conclusion, it's important
to note that this seamless, paradigm-shifting approach helps unlock real value
for every organization moving forward.
`.trim();

test("AI Detector flags obviously AI-generated text", async ({ page }) => {
  await signIn(page, uniqueEmail("checker"));
  await page.goto("/checker");

  // "AI Detector" is the default mode, but click explicitly for
  // determinism rather than relying on default state.
  const detectorTab = page.getByRole("button", { name: "AI Detector" });
  await expect(detectorTab).toBeVisible({ timeout: 15_000 });
  await detectorTab.click();

  await page.getByPlaceholder("Paste text here…").fill(AI_LIKE_TEXT);

  const runButton = page.getByRole("button", { name: "Run detection" });
  await expect(runButton).toBeEnabled();
  await runButton.click();

  // Synchronous (not streamed) — the verdict pill appearing is the real
  // completion signal, more reliable than polling the button's own label
  // ("Scanning…" -> disabled the whole time it's pending anyway).
  const verdict = page.getByText(/HUMAN-WRITTEN|MIXED SIGNALS|AI-GENERATED/);
  await expect(verdict).toBeVisible({ timeout: 30_000 });

  // The verdict itself involves a live LLM call blended with deterministic
  // heuristics (checker_service.py's _verdict thresholds), so it's not
  // 100% guaranteed reproducible — but text this saturated with literal
  // AI-tell phrases and flat, repetitive phrasing should reliably clear
  // the >0.6 probability threshold for AI-GENERATED, not land in the
  // ambiguous middle band.
  await expect(verdict).toHaveText("AI-GENERATED");

  // A real percentage from the gauge, not a placeholder/zero value.
  // .first(): the gauge, an "AI N%"/"Human N%" breakdown, and a model-
  // estimate line all separately contain a percentage.
  await expect(page.getByText(/%/).first()).toBeVisible();

  // Confirms the 60-word floor was actually cleared — a false "short text"
  // caveat would mean the test's own input assumptions were wrong.
  await expect(page.getByText(/text is short/i)).not.toBeVisible();
});

test("Writing Feedback mode produces real, non-empty feedback", async ({ page }) => {
  await signIn(page, uniqueEmail("checker-feedback"));
  await page.goto("/checker");

  await page.getByRole("button", { name: "Writing Feedback" }).click();

  // The placeholder is identical between AI Detector and Writing Feedback
  // (both "Paste text here…") — scoping to whichever is visible after the
  // mode switch is enough since only one panel renders at a time.
  await page.getByPlaceholder("Paste text here…").fill(AI_LIKE_TEXT);

  const checkButton = page.getByRole("button", { name: "Check writing" });
  await expect(checkButton).toBeEnabled();
  await checkButton.click();

  // Real completion signal: writing-feedback-panel.tsx renders either
  // "No issues found" or "N issue(s) found" once result is set — a
  // genuine response landed, not just the button reverting from
  // "Reviewing…" back to its idle label.
  await expect(page.getByText(/no issues found|\d+ issues? found/i)).toBeVisible({ timeout: 30_000 });
});
