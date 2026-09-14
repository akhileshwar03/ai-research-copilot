"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
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
          ? "bg-[var(--surface-3)] text-[var(--text-primary)] font-medium"
          : "text-zinc-500 hover:bg-[var(--surface-2)] hover:text-zinc-300",
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
        <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full bg-[var(--surface-3)] text-[28px] font-bold uppercase text-[var(--text-primary)] ring-1 ring-[var(--border-medium)]">
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
                  ? "border-[var(--border-strong)] bg-[var(--surface-3)] text-[var(--text-primary)]"
                  : "border-[var(--border-subtle)] bg-[var(--surface-1)] text-zinc-500 hover:border-[var(--border-medium)] hover:text-zinc-300",
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
        <div className="divide-y divide-[var(--border-subtle)] rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-1)]">
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
        <div className="divide-y divide-[var(--border-subtle)] rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-1)]">
          <SettingRow
            title="Export all chats"
            description="Download every conversation in this workspace as a JSON file."
          >
            <button
              onClick={handleExportChats}
              className="hover-surface shrink-0 rounded-xl border border-[var(--border-medium)] px-3.5 py-1.5 text-[12px] font-medium text-[var(--text-primary)] transition hover:border-[var(--border-strong)]"
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
              className="hover-surface shrink-0 rounded-xl border border-[var(--border-medium)] px-3.5 py-1.5 text-[12px] font-medium text-[var(--text-primary)] transition hover:border-[var(--border-strong)]"
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
        <div className="divide-y divide-[var(--border-subtle)] rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-1)]">
          <SettingRow
            title="Signed in as"
            description={email ?? "Unknown account"}
          >
            <button
              onClick={logout}
              className="hover-surface shrink-0 rounded-xl border border-[var(--border-medium)] px-3.5 py-1.5 text-[12px] font-medium text-[var(--text-primary)] transition hover:border-[var(--border-strong)]"
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
                        className="min-w-[28px] rounded-md border border-[var(--border-medium)] bg-[var(--surface-2)] px-2 py-1 text-center text-[11px] font-mono text-zinc-300"
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

interface TutorialStep {
  title: string;
  desc: string;
}

interface TutorialGroup {
  icon: string;
  tool: string;
  tagline: string;
  steps: TutorialStep[];
}

const TUTORIAL_GROUPS: TutorialGroup[] = [
  {
    icon: "👋",
    tool: "Getting started",
    tagline: "One account, five tools",
    steps: [
      {
        title: "Sign in",
        desc: "Use email (a 6-digit code, no password to remember) or continue with Google or GitHub. One account gives you every tool below.",
      },
      {
        title: "Switch tools from the top bar",
        desc: "Chat, AI Checker, Humanizer, Real-time AI, and Paper Analyzer are all one click away in the bar at the top of the screen. \"Search tools…\" (top right) jumps straight to any of them by typing.",
      },
      {
        title: "Two different searches, on purpose",
        desc: "The top bar's search only finds tools. Each sidebar has its own \"Search documents & chats…\" box for finding something inside that specific workspace — they're deliberately separate.",
      },
    ],
  },
  {
    icon: "💬",
    tool: "Research Copilot",
    tagline: "Chat with your PDFs, with page citations",
    steps: [
      {
        title: "Upload a document",
        desc: "Drag a PDF onto the sidebar, or click \"Upload your first PDF\". It's indexed in the background — you can keep working while it processes.",
      },
      {
        title: "Choose which documents a chat can see",
        desc: "Click \"Sources\" in the top-right of the chat window to pick one or more documents for that conversation. No selection means it searches everything you've uploaded. This is separate from clicking a document in the sidebar, which just opens it in the preview pane on the right.",
      },
      {
        title: "Ask anything — with real citations",
        desc: "Every answer cites the page it came from. Ask about a specific page (\"what's on page 12\") or a count across the whole document (\"how many references does this have\") and Research Copilot picks the right retrieval strategy automatically.",
      },
      {
        title: "Run a one-click research action",
        desc: "With sources selected, a row of actions appears above the input: Summarize, Key findings, Research report, Compare, References, and Study questions. Each runs over the full document set and always cites its pages.",
      },
      {
        title: "Follow up, or regenerate",
        desc: "Suggested follow-up questions appear under the latest answer — click one to ask it instantly. Hover the last reply for a Regenerate button if you want another pass.",
      },
      {
        title: "Compare documents directly",
        desc: "Select more than one document as a source, then ask a comparison question — or use the Compare research action for a structured side-by-side table.",
      },
    ],
  },
  {
    icon: "✅",
    tool: "AI Checker",
    tagline: "AI-probability detection and writing feedback",
    steps: [
      {
        title: "Paste text or upload a PDF",
        desc: "Check the AI Detector tab. You can paste text directly, upload a PDF, import a URL, or upload an image (text is extracted automatically).",
      },
      {
        title: "Read the verdict",
        desc: "You get an AI-probability score, a confidence read, and a set of contributing signals. Turn on Advanced Scan for a paragraph-by-paragraph breakdown — slower, but more precise about which parts read as AI-written.",
      },
      {
        title: "Get writing feedback",
        desc: "Switch to the Writing Feedback tab for structural and clarity notes on the same text, independent of the AI-detection verdict.",
      },
      {
        title: "Send flagged text to the Humanizer",
        desc: "If a result flags text as likely AI-written, an \"Apply humanization?\" prompt can hand that exact text straight to the Humanizer to rewrite.",
      },
    ],
  },
  {
    icon: "✍️",
    tool: "Humanizer",
    tagline: "Rewrite AI-sounding text so it reads naturally",
    steps: [
      {
        title: "Choose Basic or Ultra Human",
        desc: "Basic is a fast, multi-pass GPT rewrite. Ultra Human runs a separate fine-tuned model — slower, and only available where it's hosted, but built specifically for this task rather than a prompted general model.",
      },
      {
        title: "Paste, import, or try a sample",
        desc: "Paste text directly, import from a URL or image, or click \"Try a sample\" to see it in action before using your own text.",
      },
      {
        title: "Allow elaboration, if you want it",
        desc: "By default the rewrite keeps the same facts and roughly the same length. Turning on \"Allow elaboration\" lets it add brief clarifying context — review that output more carefully, since it's no longer a strict same-facts rewrite.",
      },
      {
        title: "Compare with the diff view",
        desc: "Switch between the plain rewritten text and a word-level diff against your original to see exactly what changed.",
      },
      {
        title: "Revisit past runs",
        desc: "Every run is saved to your history (top right) so you can come back to an earlier rewrite without redoing the work.",
      },
    ],
  },
  {
    icon: "🌐",
    tool: "Real-time AI",
    tagline: "Web-grounded chat with cited sources",
    steps: [
      {
        title: "Ask about anything current",
        desc: "Unlike Research Copilot, Real-time AI isn't limited to your uploaded documents — it searches the live web and grounds its answer in what it finds.",
      },
      {
        title: "Check the sources",
        desc: "Answers come with citation chips linking to the actual pages used, so you can verify anything before relying on it.",
      },
      {
        title: "Keep separate conversations",
        desc: "Real-time AI has its own conversation history, independent from Research Copilot's chat sessions — the two products don't share context.",
      },
    ],
  },
  {
    icon: "📐",
    tool: "Paper Analyzer",
    tagline: "Check a PDF's formatting against a real style guide",
    steps: [
      {
        title: "Pick a style guide",
        desc: "Choose APA, MLA, or IEEE before uploading — each has different margin, spacing, and citation rules to check against.",
      },
      {
        title: "Upload your paper",
        desc: "Every check is measured directly from the PDF's real margins, spacing, font, and alignment — nothing is guessed from the text alone.",
      },
      {
        title: "Fix what's flagged",
        desc: "Each result shows exactly which rule failed and what the style guide expects, so you know precisely what to change.",
      },
    ],
  },
];

function TutorialSection({ isAdmin }: { isAdmin: boolean }) {
  return (
    <div>
      <SectionHeader
        title="Tutorial & Help"
        subtitle="A quick guide to every tool in Querex"
      />
      <div className="flex flex-col gap-8">
        {TUTORIAL_GROUPS.map(({ icon, tool, tagline, steps }) => (
          <div key={tool}>
            <div className="mb-3 flex items-center gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--surface-2)] text-[18px]">
                {icon}
              </div>
              <div>
                <p className="text-[13px] font-semibold text-[var(--text-primary)]">{tool}</p>
                <p className="text-[11px] text-zinc-500">{tagline}</p>
              </div>
            </div>
            <div className="flex flex-col gap-2.5 pl-1">
              {steps.map(({ title, desc }, i) => (
                <div
                  key={title}
                  className="flex gap-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-0)] p-3.5"
                >
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--surface-2)] text-[10px] font-mono text-zinc-500">
                    {i + 1}
                  </span>
                  <div className="min-w-0">
                    <p className="text-[12.5px] font-medium text-[var(--text-primary)]">{title}</p>
                    <p className="mt-0.5 text-[12px] leading-relaxed text-zinc-500">{desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}

        {isAdmin && (
          <div>
            <div className="mb-3 flex items-center gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--surface-2)] text-[18px]">
                🛠️
              </div>
              <div>
                <p className="text-[13px] font-semibold text-[var(--text-primary)]">Admin panel</p>
                <p className="text-[11px] text-zinc-500">Visible to you because your account is an admin</p>
              </div>
            </div>
            <div className="flex flex-col gap-2.5 pl-1">
              {[
                {
                  title: "Open it from here",
                  desc: "\"Administration → Admin panel\" appears at the bottom of this menu's left column whenever you're signed in as an admin.",
                },
                {
                  title: "Six tabs, one place",
                  desc: "Overview (live stats and charts), Users, Documents, Settings, Audit & activity, and System — everything needed to run the platform day to day.",
                },
                {
                  title: "Runtime settings apply instantly",
                  desc: "Per-tool kill switches, maintenance mode, sign-up gating, the announcement banner, and every rate limit take effect within 30 seconds — no redeploy required.",
                },
                {
                  title: "Every action is logged",
                  desc: "Suspending a user, deleting a document, or changing a setting is written to the audit log with who did it and when.",
                },
              ].map(({ title, desc }, i) => (
                <div
                  key={title}
                  className="flex gap-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-0)] p-3.5"
                >
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--surface-2)] text-[10px] font-mono text-zinc-500">
                    {i + 1}
                  </span>
                  <div className="min-w-0">
                    <p className="text-[12.5px] font-medium text-[var(--text-primary)]">{title}</p>
                    <p className="mt-0.5 text-[12px] leading-relaxed text-zinc-500">{desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="mt-8 rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-0)] p-5">
        <p className="text-[13px] font-semibold text-[var(--text-primary)]">Need more help?</p>
        <p className="mt-1 text-[12px] text-zinc-500">
          Querex is developed in the open. Found a bug or have a request? Open an issue on{" "}
          <a
            href="https://github.com/akhileshwar03/ai-research-copilot"
            target="_blank"
            rel="noreferrer"
            className="text-zinc-300 underline decoration-zinc-600 underline-offset-2 hover:text-[var(--text-primary)]"
          >
            the GitHub repository
          </a>
          .
        </p>
      </div>
    </div>
  );
}

// ─── What's New section ───────────────────────────────────────────────────────

const WHATS_NEW_UPDATED = "September 2026";

interface ToolSummary {
  icon: string;
  title: string;
  desc: string;
}

const TOOL_SUMMARIES: ToolSummary[] = [
  {
    icon: "💬",
    title: "Research Copilot",
    desc: "Chat with your PDFs with page-cited, document-grounded answers. Six one-click research actions (summary, key findings, full report, compare, references, study questions), per-session source scoping, follow-up question suggestions, and multi-document comparison.",
  },
  {
    icon: "✅",
    title: "AI Checker",
    desc: "AI-probability detection with an optional paragraph-by-paragraph Advanced Scan, plus a separate Writing Feedback mode — with a direct handoff to the Humanizer for anything flagged.",
  },
  {
    icon: "✍️",
    title: "Humanizer",
    desc: "Rewrites AI-sounding text so it reads naturally. Basic runs a multi-pass GPT pipeline; Ultra Human runs a purpose-built fine-tuned model. Word-level diff view and full run history included.",
  },
  {
    icon: "🌐",
    title: "Real-time AI",
    desc: "Web-grounded chat with cited sources and its own independent conversation history — for questions that need current information, not just your documents.",
  },
  {
    icon: "📐",
    title: "Paper Analyzer",
    desc: "Checks a PDF's real margins, spacing, fonts, and alignment against APA, MLA, or IEEE — measured directly from the page, never guessed.",
  },
];

interface PlatformHighlight {
  icon: string;
  badge: string;
  title: string;
  desc: string;
}

const PLATFORM_HIGHLIGHTS: PlatformHighlight[] = [
  {
    icon: "🧭",
    badge: "Layout",
    title: "Redesigned navigation",
    desc: "The tool switcher now lives in a top bar shared by every product, so each sidebar can dedicate its full height to your documents and conversations instead of splitting space with navigation.",
  },
  {
    icon: "🔎",
    badge: "Search",
    title: "Two purpose-built searches",
    desc: "The top bar's search only jumps between tools. Each sidebar's own search looks specifically at that workspace's documents and chats — kept separate on purpose so neither gets cluttered with the other.",
  },
  {
    icon: "🧠",
    badge: "Research Copilot",
    title: "One-click research actions",
    desc: "Summarize, Key findings, Research report, Compare, References, and Study questions now run over your full selected document set in one click, every result cited.",
  },
  {
    icon: "💡",
    badge: "Research Copilot",
    title: "Follow-up suggestions",
    desc: "Every grounded answer now suggests three relevant follow-up questions, plus a Regenerate action if you want another pass at the same question.",
  },
  {
    icon: "🔒",
    badge: "Privacy",
    title: "Per-account isolation, end to end",
    desc: "Every document, chat, and vector embedding is scoped to your account at the database level — enforced independently at every layer, not just the API route.",
  },
  {
    icon: "📡",
    badge: "Reliability",
    title: "Live platform status",
    desc: "If a tool is ever paused for maintenance, you'll see a clear banner explaining it — not a silent failure.",
  },
];

const ADMIN_HIGHLIGHTS: PlatformHighlight[] = [
  {
    icon: "📊",
    badge: "Admin",
    title: "Full analytics dashboard",
    desc: "Live user, document, and request counts; daily activity charts; per-tool error rates and latency; most-active users — all in the Overview tab.",
  },
  {
    icon: "🎛️",
    badge: "Admin",
    title: "Runtime controls, no redeploy",
    desc: "Maintenance mode, sign-up gating, an announcement banner, a kill switch per tool, and every rate limit and size cap are editable live and take effect within 30 seconds.",
  },
  {
    icon: "🗂️",
    badge: "Admin",
    title: "Full user and document management",
    desc: "Search, filter, and export users to CSV; suspend, promote, force sign-out, or delete with a full data purge; inspect or re-ingest any document across every account.",
  },
  {
    icon: "📜",
    badge: "Admin",
    title: "Durable audit log",
    desc: "Every admin action — who changed what, and when — is recorded permanently, along with a rolling log of tool requests for debugging.",
  },
];

function FeatureCard({ icon, badge, title, desc }: PlatformHighlight) {
  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-0)] p-4">
      <div className="flex items-center gap-2">
        <span className="text-[22px]">{icon}</span>
        <span className="rounded-md border border-[var(--border-medium)] bg-[var(--surface-2)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
          {badge}
        </span>
      </div>
      <p className="text-[13px] font-semibold text-[var(--text-primary)]">{title}</p>
      <p className="text-[12px] leading-relaxed text-zinc-500">{desc}</p>
    </div>
  );
}

function WhatsNewSection({ isAdmin }: { isAdmin: boolean }) {
  return (
    <div>
      <SectionHeader title="What's New" subtitle={`Last updated ${WHATS_NEW_UPDATED}`} />

      <div className="mb-6 flex items-center gap-3 rounded-2xl border border-[var(--border-subtle)] bg-gradient-to-r from-white/[0.04] to-transparent p-4">
        <span className="text-[24px]">🚀</span>
        <div>
          <p className="text-[13px] font-semibold text-[var(--text-primary)]">Querex — one account, five AI tools</p>
          <p className="text-[12px] text-zinc-500">
            Research Copilot, AI Checker, Humanizer, Real-time AI, and Paper Analyzer, built for people who work with real documents and need answers they can verify.
          </p>
        </div>
      </div>

      <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-zinc-600">Latest updates</h3>
      <div className="mb-8 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {PLATFORM_HIGHLIGHTS.map((f) => (
          <FeatureCard key={f.title} {...f} />
        ))}
      </div>

      {isAdmin && (
        <>
          <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-zinc-600">
            For admins
          </h3>
          <div className="mb-8 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {ADMIN_HIGHLIGHTS.map((f) => (
              <FeatureCard key={f.title} {...f} />
            ))}
          </div>
        </>
      )}

      <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-zinc-600">Every tool</h3>
      <div className="flex flex-col gap-3">
        {TOOL_SUMMARIES.map(({ icon, title, desc }) => (
          <div
            key={title}
            className="flex gap-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-0)] p-4"
          >
            <span className="text-[20px]">{icon}</span>
            <div className="min-w-0">
              <p className="text-[13px] font-semibold text-[var(--text-primary)]">{title}</p>
              <p className="mt-0.5 text-[12px] leading-relaxed text-zinc-500">{desc}</p>
            </div>
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

  // Sync to the requested section each time the modal opens — derived
  // during render (React's "adjusting state on prop change" pattern), not
  // in an effect, so the first frame already shows the right section.
  const [wasOpen, setWasOpen] = useState(isOpen);
  if (isOpen !== wasOpen) {
    setWasOpen(isOpen);
    if (isOpen) setActive(initialSection);
  }

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

  // Rendered via a portal straight onto <body>: this component is mounted
  // inside the sidebar, whose glass-panel background uses `backdrop-filter`
  // — a property that (like `transform`) creates a new containing block for
  // `position: fixed` descendants. Without the portal, this modal's
  // `fixed inset-0` was being contained within the sidebar's own box instead
  // of the viewport, so it only ever covered the sidebar's width/height and
  // sat *below* unrelated content elsewhere on the page (e.g. the chat
  // input) in paint order — the settings dialog looked clipped and content
  // from the rest of the app rendered on top of it.
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="glass-card relative z-10 flex h-[88vh] w-full max-w-[860px] overflow-hidden rounded-2xl">

        {/* ── Left nav ──────────────────────────────────────────────── */}
        <div className="glass-panel flex w-[210px] shrink-0 flex-col border-r p-3">
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
          {active === "tutorial"  && <TutorialSection isAdmin={Boolean(me?.is_admin)} />}
          {active === "whatsnew"  && <WhatsNewSection isAdmin={Boolean(me?.is_admin)} />}
        </div>

        {/* ── Close button ───────────────────────────────────────────── */}
        <button
          onClick={onClose}
          className="absolute right-4 top-4 flex h-7 w-7 items-center justify-center rounded-lg border border-[var(--border-medium)] bg-[var(--surface-2)] text-zinc-500 transition hover:border-[var(--border-strong)] hover:text-zinc-200"
        >
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>,
    document.body
  );
}
