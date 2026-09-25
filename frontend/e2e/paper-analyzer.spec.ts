import path from "path";
import { test, expect } from "@playwright/test";
import { signIn, uniqueEmail } from "./helpers";

const FIXTURE_PDF = path.join(__dirname, "fixtures", "sample.pdf");

test("Paper Analyzer scores a real PDF against a style guide", async ({ page }) => {
  await signIn(page, uniqueEmail("paper-analyzer"));
  await page.goto("/paper-analyzer");

  // Unlike the other tools, this one is pure deterministic computation
  // (pdfplumber measuring real PDF layout geometry — margins, font,
  // spacing, alignment) scored against a style guide, no LLM involved and
  // not streamed: a single synchronous POST /paper-analyzer/analyze.
  //
  // The upload button stays disabled until a style guide is picked
  // (style-picker.tsx) -- page.tsx's handleFilePicked also guards on this
  // independently of the button's disabled state, so skipping this step
  // would silently no-op the upload rather than fail loudly.
  // Full accessible name is "APA 7th edition — 1in margins, double-spaced"
  // (style-picker.tsx) — match the prefix, not the whole description.
  const apaButton = page.getByRole("button", { name: /^APA\b/ });
  await expect(apaButton).toBeVisible({ timeout: 15_000 });
  await apaButton.click();

  await page.locator('input[type="file"]').setInputFiles(FIXTURE_PDF);

  // No minimum page/content or "paper-like" structure requirement exists
  // in paper_analyzer_service.py (confirmed against its actual error
  // paths — UNREADABLE_PDF/EMPTY_PDF/NO_TEXT_EXTRACTED/TOO_MANY_PAGES are
  // the only failure modes, none of which apply to this fixture) --  a
  // trivial 1-page, 3-sentence PDF still produces a full, valid result,
  // just a low score, since it's not really formatted like a paper. That's
  // fine: this test verifies the tool runs end-to-end and renders a real
  // result, not that the fixture is well-formatted.
  // Exact text, not a loose /1 page/i match — "0/1 pages numbered" (one of
  // the check rows) also contains "1 page" and would collide.
  await expect(page.getByText("1 page analyzed")).toBeVisible({ timeout: 20_000 });

  // A real score percentage from the gauge.
  await expect(page.getByText(/%/).first()).toBeVisible();

  // The style guide actually chosen, echoed back from the real response's
  // style_guide field (paper_analyzer_service.py's _STYLE_LABELS["apa"])
  // as its own standalone paragraph: "APA (7th ed.)". exact: true targets
  // that one paragraph specifically — the disclaimer text further down
  // also contains "(7th ed.)" as a substring within a longer sentence, so
  // a loose substring match is ambiguous here.
  await expect(page.getByText("APA (7th ed.)", { exact: true })).toBeVisible();

  // These 9 check labels are fixed and always render regardless of the
  // PDF's actual formatting quality (paper_analyzer_service.py always
  // computes all of them) — asserting a representative few confirms the
  // full checks list rendered, without asserting brittle exact
  // pass/warning/fail verdicts or measured values that depend on this
  // specific fixture's incidental layout. exact: true throughout this
  // file: getByText's plain-string mode is a case-insensitive substring
  // match, and each of these words also appears inside the longer
  // per-check explanation sentences (e.g. "...against the target
  // margins.") -- a loose match hits both and strict-mode-violates.
  await expect(page.getByText("Margins", { exact: true })).toBeVisible();
  await expect(page.getByText("Line spacing", { exact: true })).toBeVisible();
  await expect(page.getByText("Font", { exact: true })).toBeVisible();
});
