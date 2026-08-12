"use client";

import { useRef, useEffect, useState } from "react";

// Mirrors the backend's chat_max_chars default (see runtime_settings.py).
// Previously this number was only ever *displayed* — nothing actually
// stopped a longer message from being sent, frontend or backend.
const MAX_CHARS = 4000;

interface ChatInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onCancel?: () => void;
  isStreaming: boolean;
}

export function ChatInput({ value, onChange, onSubmit, onCancel, isStreaming }: ChatInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [isFocused, setIsFocused] = useState(false);
  const overLimit = value.length > MAX_CHARS;
  const canSubmit = Boolean(value.trim()) && !overLimit;

  // Auto-grow textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [value]);

  // Auto-focus when mounted
  useEffect(() => { textareaRef.current?.focus(); }, []);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== "Enter") return;

    // ⌘/Ctrl+Enter always sends, regardless of the preference.
    if (e.metaKey || e.ctrlKey) {
      e.preventDefault();
      if (!isStreaming && canSubmit) onSubmit();
      return;
    }

    // Plain Enter sends only when the "Press Enter to send" setting is on
    // (default). Shift+Enter always inserts a newline.
    const enterToSend = localStorage.getItem("pf_enter_send") !== "off";
    if (!e.shiftKey && enterToSend) {
      e.preventDefault();
      if (!isStreaming && canSubmit) onSubmit();
    }
  };

  return (
    <div className="glass-bar shrink-0 px-4 pb-5 pt-3">
      <div className="mx-auto max-w-3xl">
        <div
          className="relative rounded-2xl border bg-[var(--surface-1)] transition-all focus-within:bg-[var(--surface-2)]"
          style={{
            borderColor: isFocused ? "var(--atmosphere-accent-soft)" : "var(--border-medium)",
            boxShadow: isFocused
              ? "0 0 0 3px var(--atmosphere-accent-soft), 0 8px 24px -12px var(--atmosphere-glow)"
              : "0 8px 24px -16px var(--atmosphere-glow)",
          }}
        >
          <textarea
            ref={textareaRef}
            id="chat-input"
            rows={1}
            placeholder="Ask anything… (Shift+Enter for newline)"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            disabled={isStreaming}
            className="w-full resize-none bg-transparent px-4 py-3.5 pr-24 text-[14px] text-[var(--text-primary)] placeholder-zinc-600 outline-none scrollbar-thin"
            style={{ minHeight: "52px", maxHeight: "200px" }}
            aria-label="Chat prompt"
          />

          {/* Character counter — visible only when text is long. Once actually
              over the limit, this is a real block (send is disabled below),
              not just a color change with no enforcement behind it. */}
          {value.length > 500 && (
            <div className={[
              "absolute bottom-3 left-4 text-[11px] tabular-nums transition-colors",
              overLimit ? "text-red-400" : value.length > 2000 ? "text-amber-600" : "text-zinc-600",
            ].join(" ")}>
              {value.length.toLocaleString()}{overLimit ? " (limit exceeded — trim your message to send)" : ` / ${MAX_CHARS.toLocaleString()}`}
            </div>
          )}

          {/* Action buttons */}
          <div className="absolute bottom-2.5 right-2.5 flex items-center gap-1.5">
            {isStreaming ? (
              <button
                onClick={onCancel}
                className="flex h-8 items-center gap-1.5 rounded-xl border border-[var(--border-medium)] px-3 text-[12px] font-medium text-zinc-400 transition hover:border-[var(--border-strong)] hover:text-zinc-200"
              >
                <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 24 24">
                  <rect x="6" y="6" width="12" height="12" rx="2" />
                </svg>
                Stop
              </button>
            ) : (
              <button
                onClick={onSubmit}
                disabled={!canSubmit}
                title={overLimit ? `Message exceeds the ${MAX_CHARS.toLocaleString()}-character limit` : undefined}
                className="flex h-8 w-8 items-center justify-center rounded-xl text-white transition hover:opacity-90 disabled:opacity-30"
                style={{ backgroundColor: canSubmit ? "var(--marketing-accent)" : "var(--text-primary)" }}
                aria-label="Send message"
              >
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 10.5L12 3m0 0l7.5 7.5M12 3v18" />
                </svg>
              </button>
            )}
          </div>
        </div>

        <p className="mt-2 text-center text-[11px] text-zinc-700">
          AI can make mistakes. Verify important information.
        </p>
      </div>
    </div>
  );
}
