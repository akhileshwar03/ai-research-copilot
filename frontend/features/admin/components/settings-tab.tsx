"use client";

import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { adminApi, type AdminSetting, type SettingValue } from "@/services/api/admin-api";
import { Button, INPUT_CLASS, SectionCard, Toggle } from "@/features/admin/components/shared";
import { buildApiUrl } from "@/constants/config";
import { type BackgroundPage, useAppConfig } from "@/features/shared/hooks/use-app-config";

const BACKGROUND_PAGE_LABELS: Record<BackgroundPage, string> = {
  landing: "Landing page",
  research_copilot: "Research Copilot",
  humanizer: "Humanizer",
  checker: "AI Checker",
  realtime: "Real-time AI",
  paper_analyzer: "Paper Analyzer",
};

const SETTING_LABELS: Record<string, string> = {
  maintenance_mode: "Maintenance mode",
  signups_enabled: "Allow new sign-ups",
  announcement_text: "Announcement banner",
  github_link_enabled: "Show GitHub link on landing page",
  github_repo_url: "GitHub repo URL",
  ...Object.fromEntries(
    Object.entries(BACKGROUND_PAGE_LABELS).map(([page, label]) => [`bg_mode_${page}`, `${label} background`])
  ),
  tool_research_copilot_enabled: "Research Copilot",
  tool_humanizer_enabled: "Humanizer",
  tool_checker_enabled: "AI Checker & Writing Feedback",
  tool_realtime_enabled: "Real-time AI",
  tool_paper_analyzer_enabled: "Paper Analyzer",
  tool_extract_enabled: "URL / image text extraction",
  humanizer_ultra_backend: "Ultra Human backend",
  chat_follow_up_suggestions: "Follow-up question suggestions",
  max_upload_size_mb: "Maximum upload size (MB)",
  rag_top_k: "Retrieved chunks per query (top-k)",
  rag_similarity_threshold: "Similarity threshold (0–2, lower = stricter)",
  rag_full_document_max_chars: "Whole-document context budget (chars)",
  vision_ingestion_max_pages: "Max pages vision-captioned per upload (0 = off)",
  chat_rate_limit_per_minute: "Chat rate limit (requests/min per IP)",
  chat_max_chars: "Chat max characters per message",
  upload_rate_limit_per_minute: "Upload rate limit (requests/min per IP)",
  documents_rate_limit_per_minute: "Document endpoints rate limit (requests/min per IP)",
  retention_days: "Data retention window (days, 0 = keep forever)",
  humanize_max_chars: "Max characters per request",
  humanize_min_words: "Minimum words per request (0 = no minimum)",
  humanize_max_words: "Max words per request",
  humanize_rate_limit_per_hour: "Rate limit (requests/hour per IP)",
  checker_max_chars: "AI Checker max characters per request",
  checker_rate_limit_per_hour: "AI Checker rate limit (requests/hour per IP)",
  feedback_max_chars: "Writing Feedback max characters per request",
  feedback_rate_limit_per_hour: "Writing Feedback rate limit (requests/hour per IP)",
  realtime_rate_limit_per_hour: "Rate limit (requests/hour per IP)",
  extract_rate_limit_per_hour: "Rate limit (requests/hour per IP)",
  paper_analyzer_max_pages: "Max PDF pages per request",
  paper_analyzer_rate_limit_per_hour: "Rate limit (requests/hour per IP)",
  support_email: "Support email (footer Contact link)",
  legal_entity_name: "Legal entity name",
  privacy_policy_content: "Privacy Policy page body",
  terms_of_service_content: "Terms of Service page body",
};

// Long-form text settings get a multi-line textarea instead of the default
// single-line input — everything else (a URL, an email, a short banner) is
// fine on one line.
const LONG_TEXT_KEYS = new Set(["privacy_policy_content", "terms_of_service_content"]);

const DANGEROUS_KEYS = new Set(["maintenance_mode"]);

function valuesEqual(a: SettingValue, b: SettingValue): boolean {
  return String(a) === String(b);
}

/**
 * Inline upload/replace/remove control shown under a bg_mode_<page> row
 * whenever that row's pending value is "static" — the backend independently
 * refuses to save "static" without an image already uploaded (see admin.py's
 * update_runtime_settings), so this exists to make that obvious up front
 * rather than as a save-time error, and to let the image be replaced or
 * removed once static is already live.
 */
function BackgroundImageControl({ page }: { page: BackgroundPage }) {
  const { config } = useAppConfig();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageUrl = config.backgrounds[page]?.image_url;

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["app-config"] });
    queryClient.invalidateQueries({ queryKey: ["admin-settings"] });
  };

  const uploadMutation = useMutation({
    mutationFn: (file: File) => adminApi.uploadBackgroundImage(page, file),
    onSuccess: () => {
      invalidate();
      toast.success("Image uploaded — click Save above to switch this page to static");
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Upload failed"),
  });

  const deleteMutation = useMutation({
    mutationFn: () => adminApi.deleteBackgroundImage(page),
    onSuccess: () => {
      invalidate();
      toast.success("Image removed — reverted to the dynamic background");
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Remove failed"),
  });

  const handleFile = (file: File | undefined) => {
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      toast.error("Only JPEG, PNG, or WebP images are allowed");
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      toast.error("Image exceeds the 8 MB limit");
      return;
    }
    uploadMutation.mutate(file);
  };

  return (
    <div className="ml-1 mt-2 flex items-center gap-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-0)] p-2.5">
      {imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- admin-only preview of an arbitrary uploaded file, not a Next-optimizable static asset
        <img src={buildApiUrl(imageUrl)} alt="" className="h-12 w-20 shrink-0 rounded-md object-cover ring-1 ring-[var(--border-medium)]" />
      ) : (
        <div className="flex h-12 w-20 shrink-0 items-center justify-center rounded-md bg-[var(--surface-2)] text-[10px] text-zinc-600 ring-1 ring-[var(--border-medium)]">
          No image
        </div>
      )}
      <div className="min-w-0 flex-1 text-[11px] text-zinc-500">
        {imageUrl
          ? "Uploaded image, live once saved."
          : "Required before this page can be saved as static — JPEG/PNG/WebP, up to 8 MB."}
      </div>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => { handleFile(e.target.files?.[0]); e.target.value = ""; }}
      />
      <Button variant="ghost" onClick={() => fileInputRef.current?.click()} disabled={uploadMutation.isPending}>
        {uploadMutation.isPending ? "Uploading…" : imageUrl ? "Replace" : "Upload"}
      </Button>
      {imageUrl && (
        <Button variant="ghost" onClick={() => deleteMutation.mutate()} disabled={deleteMutation.isPending}>
          Remove
        </Button>
      )}
    </div>
  );
}

/**
 * The brand logo, admin-uploadable, global (not per-page like backgrounds).
 * Not a typed runtime_setting — same reasoning as _bg_image_<page>, it's a
 * bookkeeping row, not a value a human hand-types — so it lives in its own
 * always-visible SectionCard instead of inside the generated category list.
 * Swapping it updates every placement at once via BrandMark (landing nav +
 * footer, legal pages nav, the app's top nav, the login page).
 */
function LogoUploadControl() {
  const { config } = useAppConfig();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const logoUrl = config.logo_url;

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["app-config"] });

  const uploadMutation = useMutation({
    mutationFn: (file: File) => adminApi.uploadLogo(file),
    onSuccess: () => {
      invalidate();
      toast.success("Logo updated everywhere it's shown");
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Upload failed"),
  });

  const deleteMutation = useMutation({
    mutationFn: () => adminApi.deleteLogo(),
    onSuccess: () => {
      invalidate();
      toast.success("Logo removed — the default mark is shown again");
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Remove failed"),
  });

  const handleFile = (file: File | undefined) => {
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      toast.error("Only JPEG, PNG, or WebP images are allowed");
      return;
    }
    if (file.size > 4 * 1024 * 1024) {
      toast.error("Image exceeds the 4 MB limit");
      return;
    }
    uploadMutation.mutate(file);
  };

  return (
    <div className="flex items-center gap-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-0)] p-2.5">
      {logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- admin-only preview of an arbitrary uploaded file, not a Next-optimizable static asset
        <img src={buildApiUrl(logoUrl)} alt="" className="h-12 w-12 shrink-0 rounded-lg object-contain ring-1 ring-[var(--border-medium)]" />
      ) : (
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-[var(--surface-2)] text-[10px] text-zinc-600 ring-1 ring-[var(--border-medium)]">
          Default
        </div>
      )}
      <div className="min-w-0 flex-1 text-[11px] text-zinc-500">
        {logoUrl
          ? "Uploaded logo, live now, everywhere the mark appears."
          : "Showing the default spark mark. Upload a logo — JPEG/PNG/WebP, up to 4 MB, transparency preserved."}
      </div>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => { handleFile(e.target.files?.[0]); e.target.value = ""; }}
      />
      <Button variant="ghost" onClick={() => fileInputRef.current?.click()} disabled={uploadMutation.isPending}>
        {uploadMutation.isPending ? "Uploading…" : logoUrl ? "Replace" : "Upload"}
      </Button>
      {logoUrl && (
        <Button variant="ghost" onClick={() => deleteMutation.mutate()} disabled={deleteMutation.isPending}>
          Remove
        </Button>
      )}
    </div>
  );
}

function SettingRow({
  setting,
  draft,
  onChange,
}: {
  setting: AdminSetting;
  draft: SettingValue | undefined;
  onChange: (value: SettingValue) => void;
}) {
  const current = draft ?? setting.value;
  const dirty = draft !== undefined && !valuesEqual(draft, setting.value);
  const atDefault = valuesEqual(current, setting.default);
  const label = SETTING_LABELS[setting.key] ?? setting.key;
  const backgroundPage = setting.key.startsWith("bg_mode_")
    ? (setting.key.slice("bg_mode_".length) as BackgroundPage)
    : null;

  let control: React.ReactNode;
  if (setting.type === "bool") {
    control = <Toggle checked={Boolean(current)} onChange={(v) => onChange(v)} />;
  } else if (setting.type === "str" && setting.choices && setting.choices.length > 0) {
    // A constrained str setting (e.g. the Ultra Human backend selector) — a dropdown
    // of exactly the valid values instead of free text, so this can't be typo'd into
    // an invalid backend name from the admin panel.
    control = (
      <select
        value={String(current)}
        onChange={(e) => onChange(e.target.value)}
        className={`${INPUT_CLASS} w-40`}
      >
        {setting.choices.map((choice) => (
          <option key={choice} value={choice}>
            {choice}
          </option>
        ))}
      </select>
    );
  } else if (setting.type === "str" && LONG_TEXT_KEYS.has(setting.key)) {
    control = (
      <textarea
        value={String(current)}
        maxLength={setting.max}
        placeholder="Empty = page shows a “not yet published” notice"
        onChange={(e) => onChange(e.target.value)}
        rows={6}
        className={`${INPUT_CLASS} w-full resize-y`}
      />
    );
  } else if (setting.type === "str") {
    control = (
      <input
        type="text"
        value={String(current)}
        maxLength={setting.max}
        placeholder="Empty = hidden"
        onChange={(e) => onChange(e.target.value)}
        className={`${INPUT_CLASS} w-72`}
      />
    );
  } else {
    control = (
      <input
        type="number"
        min={setting.min}
        max={setting.max}
        step={setting.type === "int" ? 1 : 0.05}
        value={String(current)}
        onChange={(e) => onChange(e.target.value)}
        className={`${INPUT_CLASS} w-28 text-right`}
      />
    );
  }

  const isLongText = LONG_TEXT_KEYS.has(setting.key);
  const header = (
    <div className="min-w-0">
      <p className="text-[13px] font-medium text-zinc-200">
        {label}
        {DANGEROUS_KEYS.has(setting.key) && Boolean(current) && (
          <span className="ml-2 rounded bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-amber-400">on</span>
        )}
      </p>
      <p className="text-[12px] text-zinc-500">
        {setting.description}
        {setting.type !== "bool" && setting.type !== "str" && ` · range ${setting.min}–${setting.max} · default ${setting.default}`}
        {setting.type === "str" && !setting.choices && ` · up to ${setting.max} characters`}
        {setting.type === "str" && setting.choices && ` · default ${setting.default}`}
      </p>
    </div>
  );
  const resetButton = !atDefault && (
    <Button variant="ghost" onClick={() => onChange(setting.default)} title="Reset to default">
      Reset
    </Button>
  );

  return (
    <div className={`rounded-lg px-2 py-2 ${dirty ? "bg-[var(--surface-1)]" : ""}`}>
      {isLongText ? (
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-4">
            {header}
            {resetButton}
          </div>
          {control}
        </div>
      ) : (
        <div className="flex items-center justify-between gap-4">
          {header}
          <div className="flex shrink-0 items-center gap-2">
            {resetButton}
            {control}
          </div>
        </div>
      )}
      {backgroundPage && current === "static" && <BackgroundImageControl page={backgroundPage} />}
    </div>
  );
}

export function SettingsTab() {
  const queryClient = useQueryClient();
  const { data: settings, isLoading } = useQuery({ queryKey: ["admin-settings"], queryFn: () => adminApi.settings() });
  const [draft, setDraft] = useState<Record<string, SettingValue>>({});
  // Collapsed by default — 9 categories stacked always-open was the actual
  // complaint ("very unorganised"). Explicit per-category state (not just
  // each SectionCard's own internal toggle) so "Expand all" and
  // auto-expanding a category with an unsaved change both work.
  const [openCategories, setOpenCategories] = useState<Record<string, boolean>>({});

  const saveMutation = useMutation({
    mutationFn: (changed: Record<string, SettingValue>) => adminApi.updateSettings(changed),
    onSuccess: (fresh) => {
      queryClient.setQueryData(["admin-settings"], fresh);
      queryClient.invalidateQueries({ queryKey: ["app-config"] });
      queryClient.invalidateQueries({ queryKey: ["admin-audit"] });
      setDraft({});
      toast.success("Settings saved — live within 30 seconds on every server");
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Save failed"),
  });

  const groups = useMemo(() => {
    const byCategory = new Map<string, { label: string; items: AdminSetting[] }>();
    for (const s of settings ?? []) {
      const entry = byCategory.get(s.category) ?? { label: s.category_label, items: [] };
      entry.items.push(s);
      byCategory.set(s.category, entry);
    }
    return Array.from(byCategory.entries());
  }, [settings]);

  const changed = useMemo(() => {
    const out: Record<string, SettingValue> = {};
    for (const [key, raw] of Object.entries(draft)) {
      const setting = settings?.find((s) => s.key === key);
      if (!setting) continue;
      let parsed: SettingValue = raw;
      if (setting.type === "int") parsed = parseInt(String(raw), 10);
      else if (setting.type === "float") parsed = parseFloat(String(raw));
      if (!valuesEqual(parsed, setting.value)) out[key] = parsed;
    }
    return out;
  }, [draft, settings]);

  // A category with an unsaved change auto-expands — the point of collapsing
  // by default is decluttering, not hiding a change you're mid-way through.
  const dirtyCategories = useMemo(() => {
    const cats = new Set<string>();
    for (const key of Object.keys(changed)) {
      const setting = settings?.find((s) => s.key === key);
      if (setting) cats.add(setting.category);
    }
    return cats;
  }, [changed, settings]);

  const allOpen = groups.length > 0 && groups.every(([category]) => openCategories[category] ?? dirtyCategories.has(category));

  const handleSave = () => {
    for (const [key, value] of Object.entries(changed)) {
      if (typeof value === "number" && Number.isNaN(value)) {
        toast.error(`${SETTING_LABELS[key] ?? key}: not a valid number`);
        return;
      }
    }
    if (Object.keys(changed).length === 0) {
      toast.info("No changes to save");
      return;
    }
    if ("maintenance_mode" in changed && changed.maintenance_mode === true) {
      if (!window.confirm("Turn on maintenance mode? Every tool request from every user will be declined until you switch it off.")) return;
    }
    saveMutation.mutate(changed);
  };

  const dirtyCount = Object.keys(changed).length;

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-headline text-[15px] font-bold text-zinc-200">Runtime settings</h2>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            onClick={() => {
              const next: Record<string, boolean> = {};
              for (const [category] of groups) next[category] = !allOpen;
              setOpenCategories(next);
            }}
          >
            {allOpen ? "Collapse all" : "Expand all"}
          </Button>
          {dirtyCount > 0 && (
            <Button variant="ghost" onClick={() => setDraft({})}>Discard {dirtyCount} change{dirtyCount === 1 ? "" : "s"}</Button>
          )}
          <Button variant="primary" onClick={handleSave} disabled={saveMutation.isPending || dirtyCount === 0}>
            {saveMutation.isPending ? "Saving…" : dirtyCount > 0 ? `Save ${dirtyCount} change${dirtyCount === 1 ? "" : "s"}` : "Save changes"}
          </Button>
        </div>
      </div>

      <SectionCard title="Branding">
        <LogoUploadControl />
      </SectionCard>

      {isLoading ? (
        <p className="py-6 text-center text-[13px] text-zinc-500">Loading settings…</p>
      ) : (
        groups.map(([category, group]) => {
          const dirtyInCategory = group.items.filter((s) => s.key in changed).length;
          const isOpen = openCategories[category] ?? dirtyCategories.has(category);
          return (
            <SectionCard
              key={category}
              title={group.label}
              collapsible
              open={isOpen}
              onOpenChange={(next) => setOpenCategories((o) => ({ ...o, [category]: next }))}
              action={
                <div className="flex items-center gap-2">
                  {dirtyInCategory > 0 && (
                    <span className="rounded-full bg-[var(--marketing-accent-soft)] px-2 py-0.5 text-[10px] font-semibold text-[var(--marketing-accent-text)]">
                      {dirtyInCategory} unsaved
                    </span>
                  )}
                  <span className="text-[11px] text-zinc-600">{group.items.length}</span>
                </div>
              }
            >
              <div className="space-y-1">
                {group.items.map((setting) => (
                  <SettingRow
                    key={setting.key}
                    setting={setting}
                    draft={draft[setting.key]}
                    onChange={(value) => setDraft((d) => ({ ...d, [setting.key]: value }))}
                  />
                ))}
              </div>
            </SectionCard>
          );
        })
      )}
    </section>
  );
}
