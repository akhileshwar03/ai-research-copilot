"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { adminApi, type AdminSetting, type SettingValue } from "@/services/api/admin-api";
import { Button, INPUT_CLASS, SectionCard, Toggle } from "@/features/admin/components/shared";

const SETTING_LABELS: Record<string, string> = {
  maintenance_mode: "Maintenance mode",
  signups_enabled: "Allow new sign-ups",
  announcement_text: "Announcement banner",
  tool_research_copilot_enabled: "Research Copilot",
  tool_humanizer_enabled: "Humanizer",
  tool_checker_enabled: "AI Checker & Writing Feedback",
  tool_realtime_enabled: "Real-time AI",
  tool_paper_analyzer_enabled: "Paper Analyzer",
  tool_extract_enabled: "URL / image text extraction",
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
};

const DANGEROUS_KEYS = new Set(["maintenance_mode"]);

function valuesEqual(a: SettingValue, b: SettingValue): boolean {
  return String(a) === String(b);
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

  let control: React.ReactNode;
  if (setting.type === "bool") {
    control = <Toggle checked={Boolean(current)} onChange={(v) => onChange(v)} />;
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

  return (
    <div className={`flex items-center justify-between gap-4 rounded-lg px-2 py-2 ${dirty ? "bg-[var(--surface-1)]" : ""}`}>
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
          {setting.type === "str" && ` · up to ${setting.max} characters`}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {!atDefault && (
          <Button variant="ghost" onClick={() => onChange(setting.default)} title="Reset to default">
            Reset
          </Button>
        )}
        {control}
      </div>
    </div>
  );
}

export function SettingsTab() {
  const queryClient = useQueryClient();
  const { data: settings, isLoading } = useQuery({ queryKey: ["admin-settings"], queryFn: () => adminApi.settings() });
  const [draft, setDraft] = useState<Record<string, SettingValue>>({});

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
          {dirtyCount > 0 && (
            <Button variant="ghost" onClick={() => setDraft({})}>Discard {dirtyCount} change{dirtyCount === 1 ? "" : "s"}</Button>
          )}
          <Button variant="primary" onClick={handleSave} disabled={saveMutation.isPending || dirtyCount === 0}>
            {saveMutation.isPending ? "Saving…" : dirtyCount > 0 ? `Save ${dirtyCount} change${dirtyCount === 1 ? "" : "s"}` : "Save changes"}
          </Button>
        </div>
      </div>

      {isLoading ? (
        <p className="py-6 text-center text-[13px] text-zinc-500">Loading settings…</p>
      ) : (
        groups.map(([category, group]) => (
          <SectionCard key={category} title={group.label}>
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
        ))
      )}
    </section>
  );
}
