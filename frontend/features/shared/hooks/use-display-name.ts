"use client";

import { useEffect, useState } from "react";

const EVENT = "profile-name-updated";

function readName(): string {
  if (typeof window === "undefined") return "";
  const first = localStorage.getItem("pf_firstname") ?? "";
  const last = localStorage.getItem("pf_lastname") ?? "";
  return `${first} ${last}`.trim();
}

/**
 * The user's chosen display name (set in Profile settings, stored on this
 * device only — see profile-modal.tsx's ProfileSection). Previously this was
 * write-only: saved to localStorage but read back nowhere else in the app,
 * so "Save Profile" had no visible effect anywhere a user would notice.
 * This hook is what gives it a real use — the top-bar account button and
 * its dropdown header both read from here now, falling back to the email's
 * local part when no name has been set. Updates live in every mounted
 * instance the moment Profile settings are saved, via a same-tab custom
 * event — localStorage's own "storage" event only fires in OTHER tabs.
 */
export function useDisplayName(email: string | null): string {
  const [name, setName] = useState(readName);

  useEffect(() => {
    const handler = () => setName(readName());
    window.addEventListener(EVENT, handler);
    return () => window.removeEventListener(EVENT, handler);
  }, []);

  return name || (email ? email.split("@")[0] : "Account");
}

export function notifyDisplayNameUpdated() {
  window.dispatchEvent(new Event(EVENT));
}
