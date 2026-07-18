"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { adminApi } from "@/services/api/admin-api";
import { authApi } from "@/services/api/auth-api";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { useSessionStore } from "@/stores/session-store";



// ─── Types ────────────────────────────────────────────────────────────────────

export type ProfileSection = "profile" | "settings" | "shortcuts" | "tutorial" | "whatsnew";

interface ProfileModalProps {
  email: string | null;
  isOpen: boolean;
  onClose: () => void;
  initialSection?: ProfileSection;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function ls(key: string, fallback = "") {
  if (typeof window === "undefined") return fallback;
  return localStorage.getItem(key) ?? fallback;
}

function saveLs(key: string, value: string) {
  if (typeof window !== "undefined") localStorage.setItem(key, value);
}

// ─── Nav item ─────────────────────────────────────────────────────────────────

function NavItem({
  icon, label, active, onClick,
}: { icon: React.ReactNode; label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={[
        "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[13px] transition",
        active
          ? "bg-white/[0.08] text-[var(--text-primary)] font-medium"
          : "text-zinc-500 hover:bg-white/[0.04] hover:text-zinc-300",
      ].join(" ")}
    >
      <span className={active ? "text-[var(--text-primary)]" : "text-zinc-600"}>{icon}</span>
      {label}
    </button>
  );
}

// ─── Section header ───────────────────────────────────────────────────────────

function SectionHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-8">
      <h2 className="text-[20px] font-semibold text-[var(--text-primary)]">{title}</h2>
      {subtitle && <p className="mt-1 text-[13px] text-zinc-500">{subtitle}</p>}
    </div>
  );
}

// ─── Field wrapper ────────────────────────────────────────────────────────────

function Field({
  label, hint, children,
}: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between">
        <label className="text-[12px] font-medium text-zinc-400">{label}</label>
        {hint && <span className="text-[11px] text-zinc-600">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

function TextInput({
  value, onChange, placeholder, disabled, type = "text",
}: {
  value: string;
  onChange?: (v: string) => void;
  placeholder?: string;
  disabled?: boolean;
  type?: string;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange?.(e.target.value)}
      placeholder={placeholder}
      disabled={disabled}
      className={[
        "w-full rounded-xl border border-[var(--border-medium)] bg-[var(--surface-1)] px-3.5 py-2.5",
        "text-[13px] text-[var(--text-primary)] placeholder:text-zinc-600 outline-none transition",
        "focus:border-[var(--border-strong)] focus:ring-1 focus:ring-[var(--border-medium)]",
        disabled ? "cursor-not-allowed opacity-50" : "",
      ].join(" ")}
    />
  );
}

// ─── Profile section ──────────────────────────────────────────────────────────

function ProfileSection({ email }: { email: string | null }) {
  const [firstName, setFirstName] = useState(() => ls("pf_firstname"));
  const [lastName, setLastName] = useState(() => ls("pf_lastname"));
  const [saved, setSaved] = useState(false);

  const initial = email ? email[0].toUpperCase() : "?";
  const displayName =
    firstName || lastName ? `${firstName} ${lastName}`.trim() : email?.split("@")[0] ?? "User";

  const handleSave = () => {
    saveLs("pf_firstname", firstName);
    saveLs("pf_lastname", lastName);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  return (
    <div>
      <SectionHeader title="Profile" subtitle="Display name shown in this workspace (stored on this device)" />

      {/* Avatar */}
      <div className="mb-8 flex items-center gap-5">
        <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full bg-white/[0.08] text-[28px] font-bold uppercase text-[var(--text-primary)] ring-1 ring-[var(--border-medium)]">
          {initial}
        </div>
        <div>
          <p className="text-[16px] font-semibold text-[var(--text-primary)]">{displayName}</p>
          <p className="text-[13px] text-zinc-500">{email}</p>
        </div>
      </div>

      <div className="flex flex-col gap-5">
        <div className="grid grid-cols-2 gap-4">
          <Field label="First Name">
            <TextInput value={firstName} onChange={setFirstName} placeholder="John" />
          </Field>
          <Field label="Last Name">
            <TextInput value={lastName} onChange={setLastName} placeholder="Doe" />
          </Field>
        </div>

        <Field label="Email Address" hint="Cannot be changed">
          <TextInput value={email ?? ""} disabled />
        </Field>

        <div className="pt-2">
          <button
            onClick={handleSave}
            className={[
              "flex items-center gap-2 rounded-xl px-5 py-2.5 text-[13px] font-medium transition",
              saved
                ? "bg-emerald-500/20 text-emerald-400 ring-1 ring-emerald-500/30"
                : "bg-[var(--text-primary)] text-[var(--app-bg)] hover:opacity-90",
            ].join(" ")}
          >
            {saved ? (
              <>
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
                Saved
              </>
            ) : (
              "Save Profile"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Settings section ─────────────────────────────────────────────────────────

/** Apply a theme choice to the document. "system" follows the OS. */
function applyTheme(t: string) {
  const dark =
    t === "dark" ||
    (t === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("light-theme", !dark);
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="relative h-6 w-11 shrink-0 rounded-full transition-colors"
      style={{ backgroundColor: checked ? "var(--marketing-accent)" : "var(--border-strong)" }}
    >
      <span
        className="absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all"
        style={{ left: checked ? "22px" : "2px" }}
      />
    </button>
  );
}

function SettingRow({
  title, description, children,
}: { title: string; description: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 px-5 py-4">
      <div className="min-w-0">
        <p className="text-[13px] font-medium text-[var(--text-primary)]">{title}</p>
        <p className="mt-0.5 text-[12px] leading-relaxed text-zinc-500">{description}</p>
      </div>
      {children}
    </div>
  );
}

function SettingsSection({ email }: { email: string | null }) {
  const { logout } = useAuth();
  const [theme, setTheme] = useState(() => ls("pf_theme", "light"));
  const [enterToSend, setEnterToSend] = useState(() => ls("pf_enter_send", "on") !== "off");

  // Delete account state
  const [showDeleteZone, setShowDeleteZone] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);

  // "System" theme: follow live OS changes while the preference is active.
  useEffect(() => {
    if (theme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyTheme("system");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [theme]);

  const handleTheme = (t: string) => {
    setTheme(t);
    saveLs("pf_theme", t);
    applyTheme(t);
  };

  const handleEnterToSend = (v: boolean) => {
    setEnterToSend(v);
    saveLs("pf_enter_send", v ? "on" : "off");
  };

  const handleExportChats = () => {
    const sessions = useSessionStore.getState().sessions;
    const payload = {
      exported_at: new Date().toISOString(),
      account: email,
      sessions: sessions.map((s) => ({
        title: s.title,
        pinned: s.pinned ?? false,
        messages: s.messages,
      })),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `querex-chats-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${sessions.length} chat${sessions.length === 1 ? "" : "s"}`);
  };

  const handleClearDeviceData = () => {
    if (!window.confirm("Clear all data stored on this device? This signs you out and resets local preferences. Your account and chats on the server are not affected.")) return;
    localStorage.clear();
    window.location.href = "/login";
  };

  return (
    <div>
      <SectionHeader title="Settings" subtitle="Appearance, chat behaviour, data, and account" />

      {/* Appearance */}
      <div className="mb-8">
        <h3 className="mb-4 text-[13px] font-semibold uppercase tracking-widest text-zinc-600">
          Appearance
        </h3>
        <div className="grid grid-cols-3 gap-3">
          {([
            { id: "light", label: "Light", hint: "Bright & clean" },
            { id: "dark", label: "Dark", hint: "Easy on the eyes" },
            { id: "system", label: "System", hint: "Match your OS" },
          ] as const).map(({ id, label, hint }) => (
            <button
              key={id}
              onClick={() => handleTheme(id)}
              className={[
                "flex flex-col items-start gap-2 rounded-xl border px-4 py-3 text-left transition",
                theme === id
                  ? "border-[var(--border-strong)] bg-white/[0.08] text-[var(--text-primary)]"
                  : "border-[var(--border-subtle)] bg-white/[0.02] text-zinc-500 hover:border-[var(--border-medium)] hover:text-zinc-300",
              ].join(" ")}
              style={theme === id ? { borderColor: "var(--marketing-accent)" } : undefined}
            >
              {id === "dark" ? (
                <svg className="h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21.752 15.002A9.718 9.718 0 0118 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 003 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 009.002-5.998z" />
                </svg>
              ) : id === "light" ? (
                <svg className="h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z" />
                </svg>
              ) : (
                <svg className="h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 17.25v1.007a3 3 0 01-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0115 18.257V17.25m6-12V15a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 15V5.25m18 0A2.25 2.25 0 0018.75 3H5.25A2.25 2.25 0 003 5.25m18 0V12a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 12V5.25" />
                </svg>
              )}
              <div>
                <p className="text-[13px] font-medium">{label}</p>
                <p className="text-[11px] text-zinc-600">{hint}</p>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* ── Chat preferences ─────────────────────────────────────────────── */}
      <div className="mb-8">
        <h3 className="mb-4 text-[13px] font-semibold uppercase tracking-widest text-zinc-600">
          Chat
        </h3>
        <div className="divide-y divide-[var(--border-subtle)] rounded-2xl border border-[var(--border-subtle)] bg-white/[0.02]">
          <SettingRow
            title="Press Enter to send"
            description="When off, Enter inserts a newline — send with the button or ⌘+Enter."
          >
            <Toggle checked={enterToSend} onChange={handleEnterToSend} />
          </SettingRow>
        </div>
      </div>

      {/* ── Data & storage ───────────────────────────────────────────────── */}
      <div className="mb-8">
        <h3 className="mb-4 text-[13px] font-semibold uppercase tracking-widest text-zinc-600">
          Data &amp; storage
        </h3>
        <div className="divide-y divide-[var(--border-subtle)] rounded-2xl border border-[var(--border-subtle)] bg-white/[0.02]">
          <SettingRow
            title="Export all chats"
            description="Download every conversation in this workspace as a JSON file."
          >
            <button
              onClick={handleExportChats}
              className="shrink-0 rounded-xl border border-[var(--border-medium)] px-3.5 py-1.5 text-[12px] font-medium text-[var(--text-primary)] transition hover:border-[var(--border-strong)] hover:bg-white/[0.05]"
            >
              Export
            </button>
          </SettingRow>
          <SettingRow
            title="Clear device data"
            description="Removes local preferences and signs you out. Server data is untouched."
          >
            <button
              onClick={handleClearDeviceData}
              className="shrink-0 rounded-xl border border-[var(--border-medium)] px-3.5 py-1.5 text-[12px] font-medium text-[var(--text-primary)] transition hover:border-[var(--border-strong)] hover:bg-white/[0.05]"
            >
              Clear
            </button>
          </SettingRow>
          <SettingRow
            title="Retention policy"
            description="Documents and chats are kept for 7 days on the free plan, then removed automatically."
          >
            <span
              className="shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium"
              style={{ backgroundColor: "var(--marketing-accent-soft)", color: "var(--marketing-accent-text)" }}
            >
              7 days
            </span>
          </SettingRow>
        </div>
      </div>

      {/* ── Account ──────────────────────────────────────────────────────── */}
      <div className="mb-8">
        <h3 className="mb-4 text-[13px] font-semibold uppercase tracking-widest text-zinc-600">
          Account
        </h3>
        <div className="divide-y divide-[var(--border-subtle)] rounded-2xl border border-[var(--border-subtle)] bg-white/[0.02]">
          <SettingRow
            title="Signed in as"
            description={email ?? "Unknown account"}
          >
            <button
              onClick={logout}
              className="shrink-0 rounded-xl border border-[var(--border-medium)] px-3.5 py-1.5 text-[12px] font-medium text-[var(--text-primary)] transition hover:border-[var(--border-strong)] hover:bg-white/[0.05]"
            >
              Sign out
            </button>
          </SettingRow>
        </div>
      </div>

      {/* ── Danger Zone ─────────────────────────────────────────────────── */}
      <div className="mt-10">
        <h3 className="mb-4 text-[13px] font-semibold uppercase tracking-widest text-red-500/60">
          Danger Zone
        </h3>
        <div className="overflow-hidden rounded-2xl border border-red-500/20 bg-red-500/[0.04]">
          <div className="flex items-start justify-between p-5">
            <div>
              <p className="text-[13px] font-semibold text-[var(--text-primary)]">Delete Account</p>
              <p className="mt-1 text-[12px] leading-relaxed text-zinc-500">
                Permanently remove your account, all chat sessions, and documents. This cannot be undone.
              </p>
            </div>
            <button
              onClick={() => setShowDeleteZone((s) => !s)}
              className="ml-4 shrink-0 rounded-xl border border-red-500/30 px-3 py-1.5 text-[12px] font-medium text-red-400 transition hover:border-red-500/50 hover:bg-red-500/10"
            >
              {showDeleteZone ? "Cancel" : "Delete Account"}
            </button>
          </div>

          {showDeleteZone && (
            <div className="border-t border-red-500/20 p-5 space-y-4">
              <p className="text-[12px] text-zinc-500">
                Type <span className="font-mono font-bold text-red-400">DELETE</span> below to confirm you understand this action is irreversible.
              </p>
              <input
                type="text"
                value={deleteConfirmText}
                onChange={(e) => setDeleteConfirmText(e.target.value)}
                placeholder="Type DELETE to confirm"
                className="w-full rounded-xl border border-red-500/25 bg-red-500/[0.06] px-3.5 py-2.5 text-[13px] text-[var(--text-primary)] placeholder:text-zinc-700 outline-none transition focus:border-red-500/40 focus:ring-1 focus:ring-red-500/20"
              />
              <button
                disabled={deleteConfirmText !== "DELETE" || isDeleting}
                onClick={async () => {
                  setIsDeleting(true);
                  try {
                    await authApi.deleteAccount();
                    toast.success("Account deleted");
                    logout();
                  } catch (err) {
                    toast.error(err instanceof Error ? err.message : "Failed to delete account");
                  } finally {
                    setIsDeleting(false);
                  }
                }}
                className="flex items-center gap-2 rounded-xl bg-red-500 px-4 py-2.5 text-[13px] font-semibold text-white transition hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {isDeleting ? (
                  <>
                    <svg className="h-3.5 w-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Deleting…
                  </>
                ) : (
                  "Permanently Delete My Account"
                )}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Keyboard shortcuts section ───────────────────────────────────────────────

const SHORTCUT_GROUPS = [
  {
    group: "Navigation",
    items: [
      { keys: ["⌘", "K"], desc: "Open command palette" },
      { keys: ["⌘", "N"], desc: "New chat session" },
      { keys: ["⌘", "B"], desc: "Toggle sidebar" },
      { keys: ["⌘", ","], desc: "Open settings" },
      { keys: ["⌘", "/"], desc: "Focus message input" },
      { keys: ["Esc"], desc: "Close modal / cancel" },
    ],
  },
  {
    group: "Chat",
    items: [
      { keys: ["↵"], desc: "Send message" },
      { keys: ["⇧", "↵"], desc: "New line in message" },
    ],
  },
];

function ShortcutsSection() {
  return (
    <div>
      <SectionHeader title="Keyboard Shortcuts" subtitle="Speed up your workflow" />
      <div className="flex flex-col gap-6">
        {SHORTCUT_GROUPS.map(({ group, items }) => (
          <div key={group}>
            <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-zinc-600">
              {group}
            </h3>
            <div className="overflow-hidden rounded-xl border border-[var(--border-subtle)]">
              {items.map(({ keys, desc }, i) => (
                <div
                  key={desc}
                  className={[
                    "flex items-center justify-between px-4 py-3",
                    i < items.length - 1 ? "border-b border-[var(--border-subtle)]" : "",
                  ].join(" ")}
                >
                  <span className="text-[13px] text-zinc-300">{desc}</span>
                  <div className="flex items-center gap-1">
                    {keys.map((k) => (
                      <kbd
                        key={k}
                        className="min-w-[28px] rounded-md border border-[var(--border-medium)] bg-white/[0.06] px-2 py-1 text-center text-[11px] font-mono text-zinc-300"
                      >
                        {k}
                      </kbd>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Tutorial & Help section ──────────────────────────────────────────────────

const TUTORIAL_STEPS = [
  {
    step: "01",
    title: "Create an account",
    desc: "Sign up with your email. You'll receive a 6-digit verification code to confirm your identity. Your data stays private and isolated to your account.",
    icon: "👤",
  },
  {
    step: "02",
    title: "Upload a PDF document",
    desc: "Click the upload icon in the Documents panel on the left sidebar, or drag and drop a PDF. Querex extracts, indexes, and embeds your document for intelligent retrieval.",
    icon: "📄",
  },
  {
    step: "03",
    title: "Select a document",
    desc: "Click on any uploaded document to select it as the active context. The AI will use it as a knowledge base when answering your questions.",
    icon: "🎯",
  },
  {
    step: "04",
    title: "Start a chat session",
    desc: "Click the + button in the Chats panel to start a new conversation. Each session maintains its own history so you can keep research threads separate.",
    icon: "💬",
  },
  {
    step: "05",
    title: "Ask questions",
    desc: "Type your question in the input box and press Enter. Querex searches your document for relevant passages and synthesizes a precise, cited answer.",
    icon: "🔍",
  },
  {
    step: "06",
    title: "Compare multiple documents",
    desc: "Check the checkbox on multiple documents to select them simultaneously. Then ask cross-document questions like 'Compare the findings of both papers.'",
    icon: "⚡",
  },
];

function TutorialSection() {
  return (
    <div>
      <SectionHeader
        title="Tutorial & Help"
        subtitle="Get the most out of Querex — your AI research workspace"
      />
      <div className="flex flex-col gap-4">
        {TUTORIAL_STEPS.map(({ step, title, desc, icon }) => (
          <div
            key={step}
            className="flex gap-4 rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-0)] p-4"
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/[0.05] text-[20px]">
              {icon}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono text-zinc-600">{step}</span>
                <p className="text-[13px] font-semibold text-[var(--text-primary)]">{title}</p>
              </div>
              <p className="mt-1 text-[12px] leading-relaxed text-zinc-500">{desc}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-8 rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-0)] p-5">
        <p className="text-[13px] font-semibold text-[var(--text-primary)]">Need more help?</p>
        <p className="mt-1 text-[12px] text-zinc-500">
          For questions, bugs, or feature requests, reach out at{" "}
          <span className="text-zinc-300">support@querex.app</span>
        </p>
      </div>
    </div>
  );
}

// ─── What's New section ───────────────────────────────────────────────────────

const FEATURES = [
  {
    icon: "🧠",
    badge: "Core",
    title: "RAG-Powered Document Q&A",
    desc: "Querex uses Retrieval-Augmented Generation (RAG) to search your documents with vector embeddings, retrieve the most relevant passages, and generate accurate, grounded answers — no hallucinations.",
  },
  {
    icon: "🔒",
    badge: "Privacy",
    title: "Per-Account Document Isolation",
    desc: "Every document you upload is private to your account. No cross-account leakage — each user sees only their own PDFs, with ownership enforced at the database level.",
  },
  {
    icon: "⚡",
    badge: "Speed",
    title: "Streaming AI Responses",
    desc: "Answers stream in real-time token by token, so you start reading immediately. No waiting for the full response — same feel as leading AI chat products.",
  },
  {
    icon: "📚",
    badge: "Multi-Doc",
    title: "Multi-Document Analysis",
    desc: "Select multiple PDFs simultaneously to run cross-document comparisons, synthesis queries, and gap analysis — perfect for literature reviews and competitive research.",
  },
  {
    icon: "💬",
    badge: "Sessions",
    title: "Persistent Chat Sessions",
    desc: "Your conversations are saved and synced to your account. Switch between sessions, rename them, pick up where you left off — your research history is always there.",
  },
  {
    icon: "📧",
    badge: "Auth",
    title: "Passwordless Email OTP Login",
    desc: "Sign in with a 6-digit code sent to your email — no password to remember or lose. Powered by Resend with a verified custom domain for reliable delivery worldwide.",
  },
];

function WhatsNewSection() {
  return (
    <div>
      <SectionHeader
        title="What's New"
        subtitle="The features that make Querex uniquely powerful"
      />

      <div className="mb-6 flex items-center gap-3 rounded-2xl border border-[var(--border-subtle)] bg-gradient-to-r from-white/[0.04] to-transparent p-4">
        <span className="text-[24px]">🚀</span>
        <div>
          <p className="text-[13px] font-semibold text-[var(--text-primary)]">Querex — AI Research Workspace</p>
          <p className="text-[12px] text-zinc-500">
            Built for researchers, students, and professionals who work with large documents and need AI that actually cites its sources.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {FEATURES.map(({ icon, badge, title, desc }) => (
          <div
            key={title}
            className="flex flex-col gap-2 rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-0)] p-4"
          >
            <div className="flex items-center gap-2">
              <span className="text-[22px]">{icon}</span>
              <span className="rounded-md border border-[var(--border-medium)] bg-white/[0.04] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
                {badge}
              </span>
            </div>
            <p className="text-[13px] font-semibold text-[var(--text-primary)]">{title}</p>
            <p className="text-[12px] leading-relaxed text-zinc-500">{desc}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Nav icons ────────────────────────────────────────────────────────────────

const ni = (d: string) => (
  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
    <path strokeLinecap="round" strokeLinejoin="round" d={d} />
  </svg>
);

const NavProfileIcon = () => ni("M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z");
const NavSettingsIcon = () => ni("M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z");
const NavShortcutsIcon = () => ni("M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v18m0 0h10a2 2 0 002-2V9M9 21H5a2 2 0 01-2-2V9m0 0h18");
const NavTutorialIcon = () => ni("M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z");
const NavWhatsNewIcon = () => ni("M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z");
const NavAdminIcon = () => ni("M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z");

// ─── Main modal ───────────────────────────────────────────────────────────────

const NAV_ITEMS: { id: ProfileSection; label: string; icon: () => React.ReactElement }[] = [
  { id: "profile",   label: "Profile",            icon: NavProfileIcon },
  { id: "settings",  label: "Settings",           icon: NavSettingsIcon },
  { id: "shortcuts", label: "Keyboard Shortcuts", icon: NavShortcutsIcon },
  { id: "tutorial",  label: "Tutorial & Help",    icon: NavTutorialIcon },
  { id: "whatsnew",  label: "What's New",         icon: NavWhatsNewIcon },
];

export function ProfileModal({
  email,
  isOpen,
  onClose,
  initialSection = "profile",
}: ProfileModalProps) {
  const router = useRouter();
  const [active, setActive] = useState<ProfileSection>(initialSection);
  const contentRef = useRef<HTMLDivElement>(null);

  // Admin panel entry is shown only to admins (ADMIN_EMAILS on the backend).
  const { data: me } = useQuery({
    queryKey: ["me"],
    queryFn: () => adminApi.me(),
    enabled: isOpen && Boolean(email),
    staleTime: 60_000,
    retry: false,
  });

  // Sync to new initialSection when modal opens
  useEffect(() => {
    if (isOpen) {
      setActive(initialSection);
    }
  }, [isOpen, initialSection]);

  // Scroll content to top on section change
  useEffect(() => {
    contentRef.current?.scrollTo({ top: 0, behavior: "instant" });
  }, [active]);

  // Trap escape key
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="relative z-10 flex h-[88vh] w-full max-w-[860px] overflow-hidden rounded-2xl border border-[var(--border-medium)] bg-[var(--modal-bg)] shadow-2xl shadow-black/60">

        {/* ── Left nav ──────────────────────────────────────────────── */}
        <div className="flex w-[210px] shrink-0 flex-col border-r border-[var(--border-subtle)] bg-[var(--sidebar-bg)] p-3">
          {/* Header */}
          <div className="mb-4 px-3 py-2">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-600">
              Account
            </p>
          </div>

          <nav className="flex flex-col gap-0.5">
            {NAV_ITEMS.map(({ id, label, icon: Icon }) => (
              <NavItem
                key={id}
                icon={<Icon />}
                label={label}
                active={active === id}
                onClick={() => {
                  setActive(id);
                }}
              />
            ))}
          </nav>

          {me?.is_admin && (
            <>
              <div className="mx-3 my-3 h-px bg-[var(--border-subtle)]" />
              <p className="mb-1 px-3 text-[11px] font-semibold uppercase tracking-widest text-zinc-600">
                Administration
              </p>
              <NavItem
                icon={<NavAdminIcon />}
                label="Admin panel"
                active={false}
                onClick={() => {
                  onClose();
                  router.push("/admin");
                }}
              />
            </>
          )}
        </div>

        {/* ── Right content ──────────────────────────────────────────── */}
        <div
          ref={contentRef}
          className="flex-1 overflow-y-auto p-8 scrollbar-thin"
        >
          {active === "profile"   && <ProfileSection email={email} />}
          {active === "settings"  && <SettingsSection email={email} />}
          {active === "shortcuts" && <ShortcutsSection />}
          {active === "tutorial"  && <TutorialSection />}
          {active === "whatsnew"  && <WhatsNewSection />}
        </div>

        {/* ── Close button ───────────────────────────────────────────── */}
        <button
          onClick={onClose}
          className="absolute right-4 top-4 flex h-7 w-7 items-center justify-center rounded-lg border border-[var(--border-medium)] bg-white/[0.04] text-zinc-500 transition hover:border-[var(--border-strong)] hover:text-zinc-200"
        >
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
}
