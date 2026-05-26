"use client";

import { useEffect, useRef, useState } from "react";
import { authApi } from "@/services/api/auth-api";

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
          ? "bg-white/[0.08] text-white font-medium"
          : "text-zinc-500 hover:bg-white/[0.04] hover:text-zinc-300",
      ].join(" ")}
    >
      <span className={active ? "text-white" : "text-zinc-600"}>{icon}</span>
      {label}
    </button>
  );
}

// ─── Section header ───────────────────────────────────────────────────────────

function SectionHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-8">
      <h2 className="text-[20px] font-semibold text-white">{title}</h2>
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
        "w-full rounded-xl border border-white/[0.08] bg-white/[0.04] px-3.5 py-2.5",
        "text-[13px] text-white placeholder:text-zinc-600 outline-none transition",
        "focus:border-white/20 focus:ring-1 focus:ring-white/10",
        disabled ? "cursor-not-allowed opacity-50" : "",
      ].join(" ")}
    />
  );
}

// ─── Profile section ──────────────────────────────────────────────────────────

function ProfileSection({ email }: { email: string | null }) {
  const [firstName, setFirstName] = useState(() => ls("pf_firstname"));
  const [lastName, setLastName] = useState(() => ls("pf_lastname"));
  const [phone, setPhone] = useState(() => ls("pf_phone"));
  const [saved, setSaved] = useState(false);

  const initial = email ? email[0].toUpperCase() : "?";
  const displayName =
    firstName || lastName ? `${firstName} ${lastName}`.trim() : email?.split("@")[0] ?? "User";

  const handleSave = () => {
    saveLs("pf_firstname", firstName);
    saveLs("pf_lastname", lastName);
    saveLs("pf_phone", phone);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  return (
    <div>
      <SectionHeader title="Profile" subtitle="Manage your personal information" />

      {/* Avatar */}
      <div className="mb-8 flex items-center gap-5">
        <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full bg-white/[0.08] text-[28px] font-bold uppercase text-white ring-1 ring-white/10">
          {initial}
        </div>
        <div>
          <p className="text-[16px] font-semibold text-white">{displayName}</p>
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

        <Field label="Phone Number" hint="Optional">
          <TextInput
            value={phone}
            onChange={setPhone}
            placeholder="+1 (555) 000-0000"
            type="tel"
          />
        </Field>

        <div className="pt-2">
          <button
            onClick={handleSave}
            className={[
              "flex items-center gap-2 rounded-xl px-5 py-2.5 text-[13px] font-medium transition",
              saved
                ? "bg-emerald-500/20 text-emerald-400 ring-1 ring-emerald-500/30"
                : "bg-white text-black hover:bg-zinc-200",
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

function SettingsSection() {
  const [theme, setTheme] = useState(() => ls("pf_theme", "dark"));
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [pwError, setPwError] = useState("");
  const [pwSuccess, setPwSuccess] = useState("");
  const [isChanging, setIsChanging] = useState(false);

  const handleTheme = (t: string) => {
    setTheme(t);
    saveLs("pf_theme", t);
    if (t === "light") {
      document.documentElement.classList.add("light-theme");
    } else {
      document.documentElement.classList.remove("light-theme");
    }
  };

  const handleChangePw = async () => {
    setPwError("");
    setPwSuccess("");
    if (!currentPw) return setPwError("Enter your current password.");
    if (newPw.length < 8) return setPwError("New password must be at least 8 characters.");
    if (newPw !== confirmPw) return setPwError("Passwords do not match.");

    setIsChanging(true);
    try {
      await authApi.changePassword(currentPw, newPw);
      setPwSuccess("Password changed successfully!");
      setCurrentPw("");
      setNewPw("");
      setConfirmPw("");
    } catch (err) {
      setPwError(err instanceof Error ? err.message : "Failed to change password.");
    } finally {
      setIsChanging(false);
    }
  };

  return (
    <div>
      <SectionHeader title="Settings" subtitle="Appearance and security preferences" />

      {/* Appearance */}
      <div className="mb-8">
        <h3 className="mb-4 text-[13px] font-semibold uppercase tracking-widest text-zinc-600">
          Appearance
        </h3>
        <div className="grid grid-cols-2 gap-3">
          {(["dark", "light"] as const).map((t) => (
            <button
              key={t}
              onClick={() => handleTheme(t)}
              className={[
                "flex items-center gap-3 rounded-xl border px-4 py-3 text-left transition",
                theme === t
                  ? "border-white/30 bg-white/[0.08] text-white"
                  : "border-white/[0.06] bg-white/[0.02] text-zinc-500 hover:border-white/[0.12] hover:text-zinc-300",
              ].join(" ")}
            >
              <span className="text-[20px]">{t === "dark" ? "🌑" : "☀️"}</span>
              <div>
                <p className="text-[13px] font-medium capitalize">{t} Theme</p>
                <p className="text-[11px] text-zinc-600">
                  {t === "dark" ? "Easy on the eyes" : "Bright & clean"}
                </p>
              </div>
              {theme === t && (
                <div className="ml-auto flex h-4 w-4 items-center justify-center rounded-full bg-white">
                  <svg className="h-2.5 w-2.5 text-black" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </div>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Security */}
      <div>
        <h3 className="mb-4 text-[13px] font-semibold uppercase tracking-widest text-zinc-600">
          Security · Change Password
        </h3>
        <div className="flex flex-col gap-4 rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5">
          <Field label="Current Password">
            <TextInput
              type="password"
              value={currentPw}
              onChange={setCurrentPw}
              placeholder="Enter current password"
            />
          </Field>
          <Field label="New Password" hint="Min 8 characters">
            <TextInput
              type="password"
              value={newPw}
              onChange={setNewPw}
              placeholder="Enter new password"
            />
          </Field>
          <Field label="Confirm New Password">
            <TextInput
              type="password"
              value={confirmPw}
              onChange={setConfirmPw}
              placeholder="Confirm new password"
            />
          </Field>

          {pwError && (
            <div className="flex items-center gap-2 rounded-xl border border-red-500/20 bg-red-500/10 px-3.5 py-2.5 text-[12px] text-red-400">
              <svg className="h-3.5 w-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              {pwError}
            </div>
          )}
          {pwSuccess && (
            <div className="flex items-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-3.5 py-2.5 text-[12px] text-emerald-400">
              <svg className="h-3.5 w-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
              {pwSuccess}
            </div>
          )}

          <button
            onClick={handleChangePw}
            disabled={isChanging}
            className="flex items-center justify-center rounded-xl bg-white px-5 py-2.5 text-[13px] font-medium text-black transition hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isChanging ? (
              <span className="flex items-center gap-2">
                <svg className="h-3.5 w-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Updating…
              </span>
            ) : (
              "Update Password"
            )}
          </button>
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
      { keys: ["⌘", "/"], desc: "Focus message input" },
      { keys: ["Esc"], desc: "Close modal / cancel" },
    ],
  },
  {
    group: "Chat",
    items: [
      { keys: ["↵"], desc: "Send message" },
      { keys: ["⇧", "↵"], desc: "New line in message" },
      { keys: ["⌘", "⌫"], desc: "Clear current input" },
      { keys: ["↑"], desc: "Edit last message" },
    ],
  },
  {
    group: "Documents",
    items: [
      { keys: ["⌘", "U"], desc: "Upload PDF document" },
      { keys: ["⌘", "D"], desc: "Toggle document panel" },
      { keys: ["⌫"], desc: "Delete selected document" },
      { keys: ["⌘", "A"], desc: "Select all documents" },
    ],
  },
  {
    group: "Interface",
    items: [
      { keys: ["⌘", "B"], desc: "Toggle sidebar" },
      { keys: ["⌘", ","], desc: "Open settings" },
      { keys: ["⌘", "⇧", "F"], desc: "Toggle fullscreen" },
      { keys: ["⌘", "⇧", "T"], desc: "New tab" },
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
            <div className="overflow-hidden rounded-xl border border-white/[0.06]">
              {items.map(({ keys, desc }, i) => (
                <div
                  key={desc}
                  className={[
                    "flex items-center justify-between px-4 py-3",
                    i < items.length - 1 ? "border-b border-white/[0.04]" : "",
                  ].join(" ")}
                >
                  <span className="text-[13px] text-zinc-300">{desc}</span>
                  <div className="flex items-center gap-1">
                    {keys.map((k) => (
                      <kbd
                        key={k}
                        className="min-w-[28px] rounded-md border border-white/[0.12] bg-white/[0.06] px-2 py-1 text-center text-[11px] font-mono text-zinc-300"
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
            className="flex gap-4 rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4"
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/[0.05] text-[20px]">
              {icon}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono text-zinc-600">{step}</span>
                <p className="text-[13px] font-semibold text-white">{title}</p>
              </div>
              <p className="mt-1 text-[12px] leading-relaxed text-zinc-500">{desc}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-8 rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5">
        <p className="text-[13px] font-semibold text-white">Need more help?</p>
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

      <div className="mb-6 flex items-center gap-3 rounded-2xl border border-white/[0.06] bg-gradient-to-r from-white/[0.04] to-transparent p-4">
        <span className="text-[24px]">🚀</span>
        <div>
          <p className="text-[13px] font-semibold text-white">Querex — AI Research Workspace</p>
          <p className="text-[12px] text-zinc-500">
            Built for researchers, students, and professionals who work with large documents and need AI that actually cites its sources.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {FEATURES.map(({ icon, badge, title, desc }) => (
          <div
            key={title}
            className="flex flex-col gap-2 rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4"
          >
            <div className="flex items-center gap-2">
              <span className="text-[22px]">{icon}</span>
              <span className="rounded-md border border-white/[0.08] bg-white/[0.04] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
                {badge}
              </span>
            </div>
            <p className="text-[13px] font-semibold text-white">{title}</p>
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

// ─── Main modal ───────────────────────────────────────────────────────────────

const NAV_ITEMS: { id: ProfileSection; label: string; icon: () => React.ReactElement }[] = [
  { id: "profile",   label: "Profile",            icon: NavProfileIcon },
  { id: "settings",  label: "Settings",           icon: NavSettingsIcon },
  { id: "shortcuts", label: "Keyboard Shortcuts", icon: NavShortcutsIcon },
  { id: "tutorial",  label: "Tutorial & Help",    icon: NavTutorialIcon },
  { id: "whatsnew",  label: "What's New",         icon: NavWhatsNewIcon },
];

export function ProfileModal({ email, isOpen, onClose, initialSection = "profile" }: ProfileModalProps) {
  const [active, setActive] = useState<ProfileSection>(initialSection);
  const contentRef = useRef<HTMLDivElement>(null);

  // Reset to initialSection when modal opens
  useEffect(() => {
    if (isOpen) setActive(initialSection);
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
      <div className="relative z-10 flex h-[88vh] w-full max-w-[860px] overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0e0e0e] shadow-2xl shadow-black/60">

        {/* ── Left nav ──────────────────────────────────────────────── */}
        <div className="flex w-[210px] shrink-0 flex-col border-r border-white/[0.05] bg-[#0a0a0a] p-3">
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
                onClick={() => setActive(id)}
              />
            ))}
          </nav>
        </div>

        {/* ── Right content ──────────────────────────────────────────── */}
        <div
          ref={contentRef}
          className="flex-1 overflow-y-auto p-8 scrollbar-thin"
        >
          {active === "profile"   && <ProfileSection email={email} />}
          {active === "settings"  && <SettingsSection />}
          {active === "shortcuts" && <ShortcutsSection />}
          {active === "tutorial"  && <TutorialSection />}
          {active === "whatsnew"  && <WhatsNewSection />}
        </div>

        {/* ── Close button ───────────────────────────────────────────── */}
        <button
          onClick={onClose}
          className="absolute right-4 top-4 flex h-7 w-7 items-center justify-center rounded-lg border border-white/[0.08] bg-white/[0.04] text-zinc-500 transition hover:border-white/20 hover:text-zinc-200"
        >
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
}
