/** Real gap found 2026-09-28: none of the three PDF-upload flows (Research Copilot documents,
 * AI Checker, Paper Analyzer) checked a file's size before uploading it -- the limit
 * (max_upload_size_mb) was never even exposed to the frontend, so a user could wait through an
 * entire large-file upload (a real production case took 6.5s over a real connection) only to be
 * rejected at the very end with a 413. This lets every upload site give instant, pre-upload
 * feedback instead, using the same limit the backend actually enforces (via useAppConfig -- see
 * PublicAppConfig.max_upload_size_mb).
 */
export function oversizeMessage(file: File, maxUploadSizeMb: number): string | null {
  const maxBytes = maxUploadSizeMb * 1024 * 1024;
  if (file.size <= maxBytes) return null;
  const fileMb = (file.size / (1024 * 1024)).toFixed(1);
  return `"${file.name}" is ${fileMb} MB, over the ${maxUploadSizeMb} MB limit`;
}
