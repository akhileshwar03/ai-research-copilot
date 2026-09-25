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

const CATEGORY_DESCRIPTIONS: Record<string, string> = {
  platform:
    "Site-wide controls: maintenance mode (takes every tool offline except sign-in and this admin panel), whether new accounts can sign up, the announcement banner shown to signed-in users, and the GitHub link on the public landing page.",
  appearance:
    "Background for each of the 6 pages (landing + the 5 tools) — either the built-in animated scene, or a static image you upload per page below.",
  features:
    "Per-tool kill switches — turn any of the 5 tools (or URL/image text extraction) off without a deploy, e.g. to pause one during an incident. Also controls whether Research Copilot generates follow-up question suggestions after each answer.",
  uploads:
    "Limits and cleanup for uploaded documents: max file size, per-IP rate limits, how many pages get sent for vision captioning of diagrams/charts, and how many days documents and chats are kept before automatic deletion.",
  research_copilot:
    "Tuning for the document-chat tool: how many text chunks are retrieved per question, how strict the similarity match has to be, the character budget for whole-document questions (summaries/reports), and chat rate limits.",
  humanizer:
    "Controls for the Humanizer tool: which backend serves the fine-tuned 'Ultra Human' mode (local/Modal/off), request size limits, and per-IP rate limits.",
  checker:
    "Limits for AI Checker and Writing Feedback: max text length accepted and per-IP hourly rate limits for each.",
  realtime: "Per-IP hourly rate limit for the Real-time AI (web-search-grounded chat) tool.",
  extract: "Per-IP hourly rate limit for URL/image text extraction.",
  paper_analyzer: "Limits for Paper Analyzer: max PDF pages accepted per request and the per-IP hourly rate limit.",
  legal:
    "Public-facing contact and legal text: the support email shown in the footer, your legal entity name (footer copyright + legal pages), and the full body text of the Privacy Policy and Terms of Service pages.",
};

const SETTING_LABELS: Record<string, string> = {
  maintenance_mode: "Maintenance mode",
  signups_enabled: "Allow new sign-ups",
  announcement_text: "Announcement banner",
  github_link_enabled: "Show GitHub link on landing page",
  github_repo_url: "GitHub repo URL",
  ...Object.fromEntries(
    Object.entries(BACKGROUND_PAGE_LABELS).map(([page, label]) => [`bg_mode_${page}`, `${label} background`]),
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

const LONG_TEXT_KEYS = new Set(["privacy_policy_content", "terms_of_service_content"]);
const DANGEROUS_KEYS = new Set(["maintenance_mode"]);

function valuesEqual(a: SettingValue, b: SettingValue): boolean {
  return String(a) === String(b);
}

function CategoryIcon({ category }: { category: string }) {
  if (category === "platform") {
    return (
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 013 12c0-.778.099-1.533.284-2.253" />
      </svg>
    );
  }
  if (category === "appearance") {
    return (
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M4.098 19.902a3.75 3.75 0 005.304 0l6.401-6.402M6.75 21A3.75 3.75 0 013 17.25V4.125C3 3.504 3.504 3 4.125 3h5.25c.621 0 1.125.504 1.125 1.125v4.072M6.75 21a3.75 3.75 0 003.75-3.75V8.197M6.75 21h13.125c.621 0 1.125-.504 1.125-1.125v-5.25c0-.621-.504-1.125-1.125-1.125h-4.072M10.5 8.197l9.804-9.804a2.828 2.828 0 114 4l-9.804 9.804" />
      </svg>
    );
  }
  if (category === "features") {
    return (
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M5.636 5.636a9 9 0 1012.728 0M12 3v9" />
      </svg>
    );
  }
  if (category === "uploads") {
    return (
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
      </svg>
    );
  }
  if (category === "legal") {
    return (
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v17.25m0 0c-1.472 0-2.882.265-4.185.75M12 20.25c1.472 0 2.882.265 4.185.75M18.75 4.97A48.416 48.416 0 0012 4.5c-2.291 0-4.545.16-6.75.47m13.5 0c1.01.143 2.01.317 3 .52m-16.5-.52l3.75 7.5m12.75-7.5l-3.75 7.5m0 0A7.5 7.5 0 114.5 12.47m15 0A7.5 7.5 0 109.5 12.47" />
      </svg>
    );
  }
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
}

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
      toast.success("Image uploaded — click Save changes to switch this page to static");
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
    <div className="mt-2.5 flex flex-wrap items-center gap-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-0)] p-3">
      {imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={buildApiUrl(imageUrl)}
          alt=""
          className="h-12 w-20 shrink-0 rounded-md object-cover ring-1 ring-[var(--border-medium)]"
        />
      ) : (
        <div className="flex h-12 w-20 shrink-0 items-center justify-center rounded-md bg-[var(--surface-2)] text-[10px] font-bold text-zinc-500 ring-1 ring-[var(--border-medium)]">
          No image
        </div>
      )}
      <div className="min-w-0 flex-1 text-[11.5px] text-zinc-400">
        {imageUrl
          ? "Uploaded static image, active once settings are saved."
          : "Required before this page can be saved as static — JPEG/PNG/WebP, up to 8 MB."}
      </div>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => {
          handleFile(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      <div className="flex items-center gap-1.5">
        <Button
          size="sm"
          variant="secondary"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploadMutation.isPending}
        >
          {uploadMutation.isPending ? "Uploading…" : imageUrl ? "Replace" : "Upload"}
        </Button>
        {imageUrl && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => deleteMutation.mutate()}
            disabled={deleteMutation.isPending}
          >
            Remove
          </Button>
        )}
      </div>
    </div>
  );
}

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
      toast.success("Logo removed — default spark mark restored");
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
    <div className="flex flex-wrap items-center gap-3.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-0)] p-3">
      {logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={buildApiUrl(logoUrl)}
          alt=""
          className="h-12 w-12 shrink-0 rounded-lg object-contain ring-1 ring-[var(--border-medium)] bg-[var(--surface-1)] p-1"
        />
      ) : (
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-[var(--surface-2)] text-[10px] font-bold text-zinc-500 ring-1 ring-[var(--border-medium)]">
          Default
        </div>
      )}
      <div className="min-w-0 flex-1 text-[11.5px] text-zinc-400">
        {logoUrl
          ? "Uploaded brand logo active across landing, nav, footer, and login."
          : "Currently showing default spark mark. Upload custom logo (JPEG/PNG/WebP, max 4 MB)."}
      </div>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => {
          handleFile(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      <div className="flex items-center gap-1.5">
        <Button
          size="sm"
          variant="secondary"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploadMutation.isPending}
        >
          {uploadMutation.isPending ? "Uploading…" : logoUrl ? "Replace logo" : "Upload logo"}
        </Button>
        {logoUrl && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => deleteMutation.mutate()}
            disabled={deleteMutation.isPending}
          >
            Remove
          </Button>
        )}
      </div>
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
    control = (
      <select
        value={String(current)}
        onChange={(e) => onChange(e.target.value)}
        className={`${INPUT_CLASS} w-44 font-semibold text-zinc-200 cursor-pointer`}
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
      <div className="w-full space-y-1">
        <textarea
          value={String(current)}
          maxLength={setting.max}
          placeholder="Leave empty to display default 'not yet published' banner"
          onChange={(e) => onChange(e.target.value)}
          rows={6}
          className={`${INPUT_CLASS} w-full font-mono text-[12px] leading-relaxed resize-y`}
        />
        <div className="flex justify-end text-[10.5px] font-data text-zinc-500">
          {String(current).length.toLocaleString()} / {setting.max?.toLocaleString()} chars
        </div>
      </div>
    );
  } else if (setting.type === "str") {
    control = (
      <input
        type="text"
        value={String(current)}
        maxLength={setting.max}
        placeholder="Empty = hidden"
        onChange={(e) => onChange(e.target.value)}
        className={`${INPUT_CLASS} w-64 sm:w-80`}
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
        className={`${INPUT_CLASS} w-28 text-right font-data font-semibold`}
      />
    );
  }

  const isLongText = LONG_TEXT_KEYS.has(setting.key);

  const header = (
    <div className="min-w-0 pr-2">
      <div className="flex items-center gap-2">
        <p className="text-[13px] font-semibold text-zinc-200">{label}</p>
        {DANGEROUS_KEYS.has(setting.key) && Boolean(current) && (
          <span className="rounded border border-amber-500/30 bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-bold uppercase text-amber-300">
            Active
          </span>
        )}
        {dirty && (
          <span className="rounded border border-[var(--marketing-accent)] bg-[var(--marketing-accent-soft)] px-1.5 py-0.5 text-[10px] font-bold text-[var(--marketing-accent-text)]">
            Modified
          </span>
        )}
      </div>
      <p className="mt-0.5 text-[11.5px] leading-relaxed text-zinc-400">
        {setting.description}
        {setting.type !== "bool" &&
          setting.type !== "str" &&
          ` · range ${setting.min}–${setting.max} (default ${setting.default})`}
        {setting.type === "str" && !setting.choices && ` · max ${setting.max} chars`}
        {setting.type === "str" && setting.choices && ` · default "${setting.default}"`}
      </p>
    </div>
  );

  const resetButton = !atDefault && (
    <Button
      size="sm"
      variant="ghost"
      onClick={() => onChange(setting.default)}
      title={`Reset to default value: ${setting.default}`}
    >
      ↺ Default
    </Button>
  );

  return (
    <div
      className={`rounded-xl p-2.5 transition-all sm:p-3 ${
        dirty
          ? "border-l-4 border-l-[var(--marketing-accent)] bg-[var(--surface-2)]/90 shadow-xs"
          : "hover:bg-[var(--surface-1)]/60"
      }`}
    >
      {isLongText ? (
        <div className="space-y-2.5">
          <div className="flex items-start justify-between gap-3">
            {header}
            {resetButton}
          </div>
          {control}
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3 sm:flex-nowrap">
          {header}
          <div className="flex shrink-0 items-center gap-2 self-center">
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
  const { data: settings, isLoading } = useQuery({
    queryKey: ["admin-settings"],
    queryFn: () => adminApi.settings(),
  });
  const [draft, setDraft] = useState<Record<string, SettingValue>>({});
  const [openCategories, setOpenCategories] = useState<Record<string, boolean>>({});
  const [searchFilter, setSearchFilter] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");

  const saveMutation = useMutation({
    mutationFn: (changed: Record<string, SettingValue>) => adminApi.updateSettings(changed),
    onSuccess: (fresh) => {
      queryClient.setQueryData(["admin-settings"], fresh);
      queryClient.invalidateQueries({ queryKey: ["app-config"] });
      queryClient.invalidateQueries({ queryKey: ["admin-audit"] });
      setDraft({});
      toast.success("Settings saved — live within 30 seconds across all nodes");
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

  const dirtyCategories = useMemo(() => {
    const cats = new Set<string>();
    for (const key of Object.keys(changed)) {
      const setting = settings?.find((s) => s.key === key);
      if (setting) cats.add(setting.category);
    }
    return cats;
  }, [changed, settings]);

  const filteredGroups = useMemo(() => {
    return groups
      .filter(([cat]) => selectedCategory === "all" || cat === selectedCategory)
      .map(([cat, group]) => {
        if (!searchFilter.trim()) return [cat, group] as const;
        const q = searchFilter.toLowerCase();
        const matchesCat =
          group.label.toLowerCase().includes(q) ||
          (CATEGORY_DESCRIPTIONS[cat] || "").toLowerCase().includes(q);
        const matchingItems = group.items.filter((item) => {
          const label = (SETTING_LABELS[item.key] || item.key).toLowerCase();
          const desc = (item.description || "").toLowerCase();
          const key = item.key.toLowerCase();
          return label.includes(q) || desc.includes(q) || key.includes(q);
        });
        return [cat, { ...group, items: matchesCat ? group.items : matchingItems }] as const;
      })
      .filter(([, group]) => group.items.length > 0);
  }, [groups, selectedCategory, searchFilter]);

  const allOpen =
    groups.length > 0 &&
    groups.every(([category]) => openCategories[category] ?? dirtyCategories.has(category));

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
      if (
        !window.confirm(
          "Turn on maintenance mode? Every tool request from every user will be declined until you switch it off.",
        )
      ) {
        return;
      }
    }
    saveMutation.mutate(changed);
  };

  const dirtyCount = Object.keys(changed).length;

  return (
    <section className="space-y-4">
      {/* Top Header & Global Actions */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-headline text-[15px] font-bold text-[var(--text-primary)]">
            Runtime Settings
          </h2>
          <p className="mt-0.5 text-[12px] text-zinc-400">
            Configure platform limits, kill switches, and AI tuning without server deploys
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Quick Search Input */}
          <div className="relative">
            <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500">
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
              </svg>
            </span>
            <input
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              placeholder="Search setting key or keyword…"
              className={`${INPUT_CLASS} w-52 pl-8 pr-7 sm:w-64`}
            />
            {searchFilter && (
              <button
                type="button"
                onClick={() => setSearchFilter("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"
                title="Clear search"
              >
                ✕
              </button>
            )}
          </div>

          <Button
            size="sm"
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
            <Button size="sm" variant="ghost" onClick={() => setDraft({})}>
              Discard {dirtyCount} change{dirtyCount === 1 ? "" : "s"}
            </Button>
          )}

          <Button
            size="sm"
            variant="primary"
            onClick={handleSave}
            disabled={saveMutation.isPending || dirtyCount === 0}
          >
            {saveMutation.isPending
              ? "Saving…"
              : dirtyCount > 0
                ? `Save ${dirtyCount} change${dirtyCount === 1 ? "" : "s"}`
                : "Save changes"}
          </Button>
        </div>
      </div>

      {/* Category Filter Pills */}
      <div className="flex items-center gap-1 overflow-x-auto pb-1 scrollbar-thin">
        <button
          onClick={() => setSelectedCategory("all")}
          className={`shrink-0 rounded-lg px-2.5 py-1 text-[11.5px] font-semibold transition ${
            selectedCategory === "all"
              ? "bg-[var(--surface-2)] text-[var(--marketing-accent-text)] ring-1 ring-[var(--border-medium)]"
              : "text-zinc-400 hover:bg-[var(--surface-1)] hover:text-zinc-200"
          }`}
        >
          All categories ({settings?.length ?? 0})
        </button>
        {groups.map(([category, grp]) => {
          const isSelected = selectedCategory === category;
          const dirtyInCat = grp.items.filter((s) => s.key in changed).length;
          return (
            <button
              key={category}
              onClick={() => setSelectedCategory(isSelected ? "all" : category)}
              className={`shrink-0 flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11.5px] font-semibold transition ${
                isSelected
                  ? "bg-[var(--surface-2)] text-[var(--marketing-accent-text)] ring-1 ring-[var(--border-medium)]"
                  : "text-zinc-400 hover:bg-[var(--surface-1)] hover:text-zinc-200"
              }`}
            >
              <span>{grp.label}</span>
              {dirtyInCat > 0 && (
                <span className="h-1.5 w-1.5 rounded-full bg-[var(--marketing-accent)]" />
              )}
            </button>
          );
        })}
      </div>

      {/* Floating Unsaved Changes Warning Banner */}
      {dirtyCount > 0 && (
        <div className="sticky top-2 z-20 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--marketing-accent)] bg-[var(--surface-2)]/95 px-4 py-3 shadow-xl backdrop-blur-md">
          <div className="flex items-center gap-2.5">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[var(--marketing-accent)] text-white text-xs font-bold">
              !
            </span>
            <div>
              <p className="text-[13px] font-bold text-[var(--text-primary)]">
                You have {dirtyCount} unsaved setting change{dirtyCount === 1 ? "" : "s"}
              </p>
              <p className="text-[11.5px] text-zinc-400">
                Click &quot;Save changes&quot; to apply to all running instances
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="ghost" onClick={() => setDraft({})}>
              Discard all
            </Button>
            <Button
              size="sm"
              variant="primary"
              onClick={handleSave}
              disabled={saveMutation.isPending}
            >
              {saveMutation.isPending ? "Saving…" : "Save changes now"}
            </Button>
          </div>
        </div>
      )}

      {/* Branding Section */}
      {(selectedCategory === "all" || selectedCategory === "appearance") && !searchFilter && (
        <SectionCard
          title="Branding &amp; App Identity"
          description="Your logo/mark, shown in the nav, footer, and login screen across the whole app. Upload a custom image to replace the default spark icon everywhere it appears — no code changes needed. Every upload/removal is written to the audit log below."
          icon={<CategoryIcon category="appearance" />}
        >
          <LogoUploadControl />
        </SectionCard>
      )}

      {/* Categorized Settings Groups */}
      {isLoading ? (
        <div className="glass-card flex items-center justify-center rounded-xl p-12 text-center">
          <div className="flex flex-col items-center gap-2">
            <div
              className="h-6 w-6 animate-spin rounded-full border-2"
              style={{ borderColor: "var(--border-medium)", borderTopColor: "var(--marketing-accent)" }}
            />
            <p className="text-[13px] font-medium text-zinc-400">Loading settings schema…</p>
          </div>
        </div>
      ) : filteredGroups.length === 0 ? (
        <div className="glass-card flex items-center justify-center rounded-xl p-8 text-center text-zinc-400">
          No settings match &quot;{searchFilter}&quot;
        </div>
      ) : (
        filteredGroups.map(([category, group]) => {
          const dirtyInCategory = group.items.filter((s) => s.key in changed).length;
          const isSearching = Boolean(searchFilter.trim());
          const isOpen = isSearching || (openCategories[category] ?? dirtyCategories.has(category));

          return (
            <SectionCard
              key={category}
              title={group.label}
              description={CATEGORY_DESCRIPTIONS[category]}
              collapsible
              open={isOpen}
              onOpenChange={(next) => setOpenCategories((o) => ({ ...o, [category]: next }))}
              icon={<CategoryIcon category={category} />}
              action={
                <div className="flex items-center gap-2">
                  {dirtyInCategory > 0 && (
                    <span className="rounded-full bg-[var(--marketing-accent-soft)] px-2 py-0.5 text-[10.5px] font-bold text-[var(--marketing-accent-text)] ring-1 ring-[var(--marketing-accent)]">
                      {dirtyInCategory} unsaved
                    </span>
                  )}
                  <span className="rounded bg-[var(--surface-2)] px-2 py-0.5 font-data text-[11px] font-bold text-zinc-400">
                    {group.items.length}
                  </span>
                </div>
              }
            >
              <div className="divide-y divide-[var(--border-subtle)] space-y-1">
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
