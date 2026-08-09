"use client";

import { useEffect, useRef, useState } from "react";

import { useAuth } from "@/features/auth/hooks/use-auth";
import { ProfileModal, type ProfileSection } from "@/features/workspace/components/sidebar/profile-modal";

/**
 * Self-contained profile trigger + settings/sign-out menu + ProfileModal.
 * Mounted at the bottom of every product's sidebar (WorkspaceSidebar,
 * RealtimeSidebar, ProductShellSidebar) so account access is consistent
 * across the whole app rather than Chat-only.
 */
export function WorkspaceProfileFooter() {
  const { email, logout } = useAuth();
  const [profileOpen, setProfileOpen] = useState(false);
  const [profileSection, setProfileSection] = useState<ProfileSection>("profile");

  const openProfile = (section: ProfileSection) => {
    setProfileSection(section);
    setProfileOpen(true);
  };

  // Listen for ⌘+, "open-settings" event dispatched by chat/page.tsx
  useEffect(() => {
    const handler = () => openProfile("settings");
    window.addEventListener("open-settings", handler);
    return () => window.removeEventListener("open-settings", handler);
  }, []);

  return (
    <>
      <UserFooter email={email} logout={logout} onOpenProfile={openProfile} />
      <ProfileModal
        email={email}
        isOpen={profileOpen}
        onClose={() => setProfileOpen(false)}
        initialSection={profileSection}
      />
    </>
  );
}

// ─── Profile menu ──────────────────────────────────────────────────────────────

function UserFooter({
  email,
  logout,
  onOpenProfile,
}: {
  email: string | null;
  logout: () => void;
  onOpenProfile: (section: ProfileSection) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const initial = email ? email[0].toUpperCase() : "?";

  const openSection = (section: ProfileSection) => {
    setOpen(false);
    onOpenProfile(section);
  };

  return (
    <div ref={ref} className="relative shrink-0 border-t border-[var(--border-subtle)] px-3 py-3">
      {/* Pop-up menu */}
      {open && (
        <div className="absolute bottom-full left-3 right-3 mb-2 overflow-hidden rounded-2xl border border-[var(--border-medium)] bg-[var(--surface-2)] shadow-2xl shadow-black/60 ring-1 ring-black/20">
          {/* Account info */}
          <div className="px-4 py-3.5 border-b border-[var(--border-subtle)]">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--surface-3)] text-[13px] font-bold uppercase text-[var(--text-primary)] ring-1 ring-[var(--border-medium)]">
                {initial}
              </div>
              <div className="min-w-0">
                <p className="truncate text-[13px] font-medium text-[var(--text-primary)]">{email}</p>
                <p className="text-[11px] text-zinc-600">Querex account</p>
              </div>
            </div>
          </div>

          {/* Menu items */}
          <div className="py-1.5">
            <MenuItem icon={<SettingsIcon />} label="Settings" onClick={() => openSection("settings")} />
            <MenuItem icon={<ShortcutsIcon />} label="Keyboard Shortcuts" hint="⌘K" onClick={() => openSection("shortcuts")} />
            <MenuItem icon={<TutorialIcon />} label="Tutorial & Help" onClick={() => openSection("tutorial")} />
            <MenuItem icon={<WhatsNewIcon />} label="What's New" onClick={() => openSection("whatsnew")} />
          </div>

          <div className="border-t border-[var(--border-subtle)] py-1.5">
            <MenuItem
              icon={<SignOutIcon />}
              label="Sign Out"
              destructive
              onClick={() => { setOpen(false); logout(); }}
            />
          </div>
        </div>
      )}

      {/* Trigger button */}
      <button
        onClick={() => setOpen((o) => !o)}
        className={[
          "hover-surface flex w-full items-center gap-2.5 rounded-xl px-2 py-2 transition",
          open ? "bg-[var(--surface-2)]" : "",
        ].join(" ")}
      >
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--surface-3)] text-[11px] font-bold uppercase text-zinc-300 ring-1 ring-[var(--border-subtle)]">
          {initial}
        </div>
        <div className="min-w-0 flex-1 text-left">
          <p className="truncate text-[12px] text-zinc-300">{email || "Not signed in"}</p>
        </div>
        <svg
          className={["h-3.5 w-3.5 shrink-0 text-zinc-600 transition-transform", open ? "rotate-180" : ""].join(" ")}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
        </svg>
      </button>
    </div>
  );
}

function MenuItem({
  icon, label, hint, destructive = false, onClick,
}: {
  icon: React.ReactNode; label: string; hint?: string;
  destructive?: boolean; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={[
        "flex w-full items-center gap-3 px-4 py-2 text-[13px] transition",
        destructive
          ? "text-red-400 hover:bg-red-500/[0.08]"
          : "hover-surface text-zinc-300",
      ].join(" ")}
    >
      <span className={destructive ? "text-red-400/70" : "text-zinc-500"}>{icon}</span>
      <span className="flex-1 text-left">{label}</span>
      {hint && <kbd className="rounded-md border border-[var(--border-medium)] bg-[var(--surface-2)] px-1.5 py-0.5 text-[10px] text-zinc-600">{hint}</kbd>}
    </button>
  );
}

// ── Menu icons ─────────────────────────────────────────────────────────────────
const i = (d: string) => (
  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
    <path strokeLinecap="round" strokeLinejoin="round" d={d} />
  </svg>
);
const SettingsIcon = () => i("M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z");
const ShortcutsIcon = () => i("M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v18m0 0h10a2 2 0 002-2V9M9 21H5a2 2 0 01-2-2V9m0 0h18");
const TutorialIcon = () => i("M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z");
const WhatsNewIcon = () => i("M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z");
const SignOutIcon = () => i("M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1");
