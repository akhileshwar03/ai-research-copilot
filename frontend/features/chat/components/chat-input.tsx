"use client";

import { useRef, useEffect, useState } from "react";

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
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!isStreaming && value.trim()) onSubmit();
    }
  };

  return (
    <div className="shrink-0 px-4 pb-5 pt-3">
      <div className="mx-auto max-w-3xl">
        <div
          className="relative rounded-2xl border bg-[var(--surface-1)] transition-all focus-within:bg-[var(--surface-2)]"
          style={{
            borderColor: isFocused ? "var(--marketing-accent-soft)" : "var(--border-medium)",
            boxShadow: isFocused ? "0 0 0 3px var(--marketing-accent-soft)" : "none",
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

          {/* Character counter — visible only when text is long */}
          {value.length > 500 && (
            <div className={[
              "absolute bottom-3 left-4 text-[11px] tabular-nums transition-colors",
              value.length > 3800 ? "text-red-400" : value.length > 2000 ? "text-amber-600" : "text-zinc-600",
            ].join(" ")}>
              {value.length.toLocaleString()}{value.length > 4000 ? " (limit exceeded)" : " / 4 000"}
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
                disabled={!value.trim()}
                className="flex h-8 w-8 items-center justify-center rounded-xl text-black transition hover:opacity-90 disabled:opacity-30"
                style={{ backgroundColor: value.trim() ? "var(--marketing-accent)" : "var(--text-primary)" }}
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
