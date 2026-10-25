"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { Button, INPUT_CLASS, SectionCard, Toggle } from "@/features/admin/components/shared";
import { FounderCard } from "@/features/landing/founder-card";
import type { FounderPublic } from "@/features/landing/use-founder";
import {
  FOUNDER_LINK_RULES,
  validateFounderLink,
  type FounderLinkKey,
} from "@/features/shared/lib/founder-links";
import { adminApi, type AdminSetting, type SettingValue } from "@/services/api/admin-api";

const LINK_KEYS = Object.keys(FOUNDER_LINK_RULES) as FounderLinkKey[];
const LINK_KIND: Record<FounderLinkKey, FounderPublic["links"][number]["kind"]> = {
  founder_linkedin_url: "linkedin",
  founder_github_url: "github",
  founder_x_url: "x",
  founder_website_url: "website",
};

interface Draft {
  founder_section_enabled: boolean;
  founder_name: string;
  founder_title: string;
  founder_note: string;
  founder_linkedin_url: string;
  founder_github_url: string;
  founder_x_url: string;
  founder_website_url: string;
}
type DraftKey = keyof Draft;

function fromSettings(settings: AdminSetting[]): Draft {
  const get = (key: string): SettingValue => settings.find((s) => s.key === key)?.value ?? "";
  return {
    founder_section_enabled: Boolean(get("founder_section_enabled")),
    founder_name: String(get("founder_name")),
    founder_title: String(get("founder_title")),
    founder_note: String(get("founder_note")),
    founder_linkedin_url: String(get("founder_linkedin_url")),
    founder_github_url: String(get("founder_github_url")),
    founder_x_url: String(get("founder_x_url")),
    founder_website_url: String(get("founder_website_url")),
  };
}

function limit(settings: AdminSetting[], key: string, fallback: number): number {
  return settings.find((s) => s.key === key)?.max ?? fallback;
}

/** Why the section is (or would be) hidden, or null when it is publishable. */
function hiddenReason(d: Pick<Draft, "founder_section_enabled" | "founder_name" | "founder_note">): string | null {
  if (!d.founder_section_enabled) return "The section is switched off.";
  if (!d.founder_name.trim()) return "Add your name.";
  if (!d.founder_note.trim()) return "Write your note.";
  return null;
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-[12.5px] font-semibold text-zinc-200">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[11px] leading-relaxed text-zinc-500">{hint}</span>}
    </label>
  );
}

function FounderPhotoControl() {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const photo = useQuery({
    queryKey: ["admin-founder-photo"],
    queryFn: () => adminApi.founderPhoto(),
    retry: false,
  });
  const photoUrl = useMemo(() => (photo.data ? URL.createObjectURL(photo.data) : null), [photo.data]);
  useEffect(
    () => () => {
      if (photoUrl) URL.revokeObjectURL(photoUrl);
    },
    [photoUrl],
  );

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["admin-founder-photo"] });
    queryClient.invalidateQueries({ queryKey: ["founder"] });
    queryClient.invalidateQueries({ queryKey: ["admin-audit"] });
  };

  const upload = useMutation({
    mutationFn: (file: File) => adminApi.uploadFounderPhoto(file),
    onSuccess: () => {
      refresh();
      toast.success("Photo updated");
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Upload failed"),
  });
  const remove = useMutation({
    mutationFn: () => adminApi.deleteFounderPhoto(),
    onSuccess: () => {
      refresh();
      toast.success("Photo removed");
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Remove failed"),
  });

  const onFile = (file: File | undefined) => {
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      toast.error("Only JPEG, PNG, or WebP images are allowed");
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      toast.error("Photo exceeds the 8 MB limit");
      return;
    }
    upload.mutate(file);
  };

  return (
    <div className="flex flex-wrap items-center gap-4 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-0)] p-3.5">
      {photoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={photoUrl} alt="" className="h-16 w-16 shrink-0 rounded-full object-cover ring-1 ring-[var(--border-medium)]" />
      ) : (
        <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-[var(--surface-2)] text-center text-[10px] font-semibold leading-tight text-zinc-500 ring-1 ring-[var(--border-medium)]">
          No photo
        </div>
      )}
      <div className="min-w-0 flex-1 text-[11.5px] leading-relaxed text-zinc-400">
        <p className="font-semibold text-zinc-200">Photo (optional)</p>
        A real head-and-shoulders photo of you, at least 160 px. It is cropped to a square around the centre, resized,
        and re-encoded, which also removes hidden metadata such as GPS location. Without one, no avatar is shown.
      </div>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => {
          onFile(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      <div className="flex items-center gap-1.5">
        <Button size="sm" variant="secondary" onClick={() => fileInputRef.current?.click()} disabled={upload.isPending}>
          {upload.isPending ? "Uploading…" : photoUrl ? "Replace photo" : "Upload photo"}
        </Button>
        {photoUrl && (
          <Button size="sm" variant="ghost" onClick={() => remove.mutate()} disabled={remove.isPending}>
            Remove
          </Button>
        )}
      </div>
    </div>
  );
}

/**
 * Settings → Founder. Entirely hand-entered: nothing is pre-filled or generated, and the homepage section
 * stays hidden until it is switched on with a name and a note. Saves independently of the generic settings
 * list (it has its own button) and previews exactly what visitors will see.
 */
export function FounderSettings({ settings }: { settings: AdminSetting[] }) {
  const queryClient = useQueryClient();
  const saved = useMemo(() => fromSettings(settings), [settings]);
  const [draft, setDraft] = useState<Draft>(saved);

  const photo = useQuery({ queryKey: ["admin-founder-photo"], queryFn: () => adminApi.founderPhoto(), retry: false });
  const previewPhoto = useMemo(() => (photo.data ? URL.createObjectURL(photo.data) : null), [photo.data]);
  useEffect(
    () => () => {
      if (previewPhoto) URL.revokeObjectURL(previewPhoto);
    },
    [previewPhoto],
  );

  const set = <K extends DraftKey>(key: K, value: Draft[K]) => setDraft((d) => ({ ...d, [key]: value }));

  const linkErrors = useMemo(() => {
    const out: Partial<Record<FounderLinkKey, string>> = {};
    for (const key of LINK_KEYS) {
      const error = validateFounderLink(key, draft[key]);
      if (error) out[key] = error;
    }
    return out;
  }, [draft]);

  const changedKeys = (Object.keys(draft) as DraftKey[]).filter((k) => draft[k] !== saved[k]);
  const dirty = changedKeys.length > 0;
  const hasErrors = Object.keys(linkErrors).length > 0;

  const save = useMutation({
    mutationFn: () => {
      const changes: Record<string, SettingValue> = {};
      for (const key of changedKeys) {
        const value = draft[key];
        changes[key] = typeof value === "string" ? value.trim() : value;
      }
      return adminApi.updateSettings(changes);
    },
    onSuccess: (fresh) => {
      queryClient.setQueryData(["admin-settings"], fresh);
      queryClient.invalidateQueries({ queryKey: ["founder"] });
      queryClient.invalidateQueries({ queryKey: ["admin-audit"] });
      setDraft(fromSettings(fresh));
      toast.success("Founder section saved");
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Save failed"),
  });

  const liveReason = hiddenReason(saved);
  const draftReason = hiddenReason(draft);

  const preview: FounderPublic = {
    enabled: true,
    name: draft.founder_name.trim(),
    title: draft.founder_title.trim(),
    note: draft.founder_note.trim(),
    photo_url: null,
    links: LINK_KEYS.filter((k) => draft[k].trim() && !linkErrors[k]).map((k) => ({
      kind: LINK_KIND[k],
      label: FOUNDER_LINK_RULES[k].label,
      url: draft[k].trim(),
    })),
  };

  const noteMax = limit(settings, "founder_note", 3000);

  return (
    <SectionCard
      title="Founder"
      description="A personal note on the public homepage: your name, an optional photo and title, your own words, and links to your profiles. Everything here is optional except the name and the note, and nothing is shown until you switch it on."
      icon={
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
        </svg>
      }
    >
      <div className="space-y-5">
        <div
          className={`flex flex-wrap items-center justify-between gap-3 rounded-lg border px-3.5 py-2.5 text-[12.5px] ${
            liveReason
              ? "border-amber-500/40 bg-amber-500/10 text-amber-800 dark-theme:text-amber-200"
              : "border-emerald-500/40 bg-emerald-500/10 text-emerald-800 dark-theme:text-emerald-200"
          }`}
        >
          <span>
            {liveReason ? `Not on the homepage right now. ${liveReason}` : "Live on the homepage, above the closing call to action."}
          </span>
          {dirty && <span className="font-semibold">Unsaved changes</span>}
        </div>

        <div className="flex items-center justify-between gap-4 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-0)] px-3.5 py-3">
          <div>
            <p className="text-[13px] font-semibold text-zinc-200">Show on the homepage</p>
            <p className="mt-0.5 text-[11.5px] text-zinc-400">Appears only when this is on and both a name and a note are saved. Switching off or removing the photo takes effect within a few minutes (browsers may keep a copy of the photo for up to 5 minutes).</p>
          </div>
          <Toggle checked={draft.founder_section_enabled} onChange={(v) => set("founder_section_enabled", v)} />
        </div>

        <FounderPhotoControl />

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name" hint="As you want it shown publicly. Required.">
            <input
              type="text"
              value={draft.founder_name}
              maxLength={limit(settings, "founder_name", 80)}
              onChange={(e) => set("founder_name", e.target.value)}
              className={`${INPUT_CLASS} mt-1.5 w-full`}
            />
          </Field>
          <Field label="Role (optional)" hint='For example "Founder, Querex". Left empty, no role line is shown.'>
            <input
              type="text"
              value={draft.founder_title}
              maxLength={limit(settings, "founder_title", 120)}
              onChange={(e) => set("founder_title", e.target.value)}
              className={`${INPUT_CLASS} mt-1.5 w-full`}
            />
          </Field>
        </div>

        <Field
          label="Your note"
          hint="Plain text. A blank line starts a new paragraph. Say who you are, why you built Querex, and what you do with people's documents: specific and honest works better than polished."
        >
          <textarea
            value={draft.founder_note}
            maxLength={noteMax}
            rows={10}
            onChange={(e) => set("founder_note", e.target.value)}
            className={`${INPUT_CLASS} mt-1.5 w-full resize-y text-[13px] leading-relaxed`}
          />
          <span className="mt-1 block text-right font-data text-[10.5px] text-zinc-500">
            {draft.founder_note.length.toLocaleString()} / {noteMax.toLocaleString()} chars
          </span>
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          {LINK_KEYS.map((key) => (
            <Field key={key} label={`${FOUNDER_LINK_RULES[key].label} (optional)`}>
              <input
                type="url"
                value={draft[key]}
                maxLength={limit(settings, key, 200)}
                placeholder={FOUNDER_LINK_RULES[key].placeholder}
                onChange={(e) => set(key, e.target.value)}
                aria-invalid={Boolean(linkErrors[key])}
                className={`${INPUT_CLASS} mt-1.5 w-full ${linkErrors[key] ? "border-red-500/60" : ""}`}
              />
              {linkErrors[key] && <span className="mt-1 block text-[11px] text-red-700 dark-theme:text-red-300">{linkErrors[key]}</span>}
            </Field>
          ))}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2">
          {dirty && (
            <Button size="sm" variant="ghost" onClick={() => setDraft(saved)} disabled={save.isPending}>
              Discard changes
            </Button>
          )}
          <Button size="sm" variant="primary" onClick={() => save.mutate()} disabled={!dirty || hasErrors || save.isPending}>
            {save.isPending ? "Saving…" : "Save founder section"}
          </Button>
        </div>

        <div>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-zinc-500">Preview, as visitors will see it</p>
          {draft.founder_name.trim() && draft.founder_note.trim() ? (
            <div className="marketing-light rounded-xl p-4 md:p-6">
              <FounderCard founder={preview} photoSrc={previewPhoto} />
              {draftReason && (
                <p className="mt-3 text-center text-[11.5px] text-zinc-500">Not shown on the site yet: {draftReason}</p>
              )}
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-[var(--border-medium)] px-4 py-8 text-center text-[12.5px] text-zinc-500">
              Add a name and a note to see the preview. Nothing is filled in for you.
            </div>
          )}
        </div>
      </div>
    </SectionCard>
  );
}
