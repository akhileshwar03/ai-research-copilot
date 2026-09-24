import path from "path";
import { test, expect } from "@playwright/test";
import { signIn, uniqueEmail } from "./helpers";

const FIXTURE_PDF = path.join(__dirname, "fixtures", "sample.pdf");

test("upload a PDF and get a grounded, cited chat answer", async ({ page }) => {
  await signIn(page, uniqueEmail("research-copilot"));
  await page.goto("/chat");
  await expect(page.getByLabel("Chat prompt")).toBeVisible({ timeout: 15_000 });

  // The hidden <input type="file"> works directly with setInputFiles — no
  // need to click the surrounding <label> first (see documents-panel.tsx;
  // there's no aria-label on the input itself, so `input[type=file]` is the
  // most reliable locator — confirmed there are no data-testid attributes
  // anywhere in this codebase).
  await page.locator('input[type="file"]').first().setInputFiles(FIXTURE_PDF);

  // The sidebar row's accessible name is the whole button text ("sample
  // PDF · 767 B · ...") — the document list strips the .pdf extension from
  // the displayed name (documents-panel.tsx), so match on the stem, not
  // the full filename. Real end-to-end ingestion (extract -> chunk ->
  // embed -> store), not mocked — the page-count only appears in that name
  // once the full pipeline finishes server-side (use-documents.ts's
  // processing-status poll).
  await expect(page.getByRole("button", { name: /^sample.*\d+ pages?/i })).toBeVisible({ timeout: 30_000 });

  // Uploading a document does NOT automatically scope the chat to it —
  // chat_service.py skips retrieval entirely when document_ids is empty
  // (a deliberate "general assistant" mode, not "search everything",
  // despite the sources picker's own copy suggesting otherwise). Without
  // this step the question below gets an ungrounded, non-streamed
  // "general" reply instead of a real retrieval-grounded one.
  await page.getByTitle("Choose which documents this chat can see").click();
  await page.getByRole("button", { name: "sample", exact: true }).click();
  // The picker only closes on an outside mousedown (chat-header.tsx has no
  // Escape handler) — clicking the chat input both closes it and focuses
  // the field the next step fills.
  await page.getByLabel("Chat prompt").click();

  // A fact that only exists inside the fixture PDF's text (see
  // e2e/fixtures/sample.pdf, built by /tmp/build_fixture_pdf.py) -- the
  // model can only answer this correctly by actually retrieving and
  // reading the uploaded document, not from general knowledge.
  await page.getByLabel("Chat prompt").fill("What is the Aurora migration launch date?");
  await page.getByRole("button", { name: "Send message" }).click();

  // Not asserting the intermediate "Stop" button state: for a 1-chunk
  // fixture doc the whole reply can stream faster than a 10s poll window
  // reliably catches that transition (a real flake seen in this test, not
  // a real bug) — waiting on the final "Send message" reappearing plus the
  // actual answer content below is the real completion signal anyway.
  await expect(page.getByRole("button", { name: "Send message" })).toBeVisible({ timeout: 60_000 });

  await expect(page.getByText(/march\s*12,?\s*2031/i)).toBeVisible();

  // A citation chip naming the source document confirms the answer is
  // actually grounded (retrieved + cited), not just a lucky guess.
  await expect(page.getByText("sample.pdf", { exact: false }).last()).toBeVisible();
});
