"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";

import type { Message } from "@/shared/types/chat";
import { Glare } from "@/features/shared/motion/motion";
import { CopyButton } from "@/features/shared/components/copy-button";

interface ChatMessageListProps {
  messages: Message[];
  isStreaming: boolean;
  /** First letter of the current user's email — shown in the avatar */
  userInitial?: string;
  /** Called when an empty-state suggestion chip is clicked */
  onSuggestionClick?: (text: string) => void;
}

const SUGGESTION_CHIPS = [
  "Summarise the key findings",
  "What are the main arguments?",
  "Compare the methodologies",
  "List all citations",
];

// ─── Streaming dots ───────────────────────────────────────────────────────────

function StreamingDot() {
  return (
    <span className="inline-flex items-center gap-1 py-1">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="inline-block h-1.5 w-1.5 rounded-full"
          style={{
            backgroundColor: "var(--marketing-accent)",
            animation: `pulse-dot 1.2s ease-in-out ${i * 0.2}s infinite`,
          }}
        />
      ))}
      <style>{`
        @keyframes pulse-dot {
          0%,80%,100%{opacity:.3;transform:scale(.8)}
          40%{opacity:1;transform:scale(1)}
        }
      `}</style>
    </span>
  );
}

// ─── Code block with copy ─────────────────────────────────────────────────────

function CodeBlock({ language, code }: { language: string; code: string }) {
  return (
    <div className="group/code relative my-3 overflow-hidden rounded-xl">
      <div className="flex items-center justify-between border-b border-[var(--border-subtle)] bg-[var(--code-bg)] px-4 py-1.5">
        <span className="text-[11px] font-mono text-zinc-600">{language || "code"}</span>
        <CopyButton text={code} />
      </div>
      <SyntaxHighlighter
        style={oneDark}
        language={language || "text"}
        PreTag="div"
        customStyle={{
          margin: 0,
          borderRadius: 0,
          fontSize: "13px",
          background: "var(--code-bg)",
          padding: "1rem",
        }}
      >
        {code}
      </SyntaxHighlighter>
    </div>
  );
}

// ─── Scroll-to-bottom FAB ─────────────────────────────────────────────────────

function ScrollFab({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="absolute bottom-4 right-4 flex h-8 w-8 items-center justify-center rounded-full border border-[var(--border-medium)] bg-[var(--surface-1)] text-zinc-400 shadow-lg transition hover:border-[var(--border-strong)] hover:text-zinc-200"
      title="Scroll to bottom"
    >
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
      </svg>
    </button>
  );
}

// ─── Message timestamp ────────────────────────────────────────────────────────

function MessageTimestamp() {
  // Lazy initializer runs once on mount, so the timestamp doesn't update
  // during streaming re-renders — and state (unlike a ref) is safe to read
  // during render.
  const [time] = useState(() =>
    new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
  );
  return (
    <span className="msg-timestamp shrink-0 text-[10px] text-zinc-700 self-end mb-1">
      {time}
    </span>
  );
}

// ─── Message bubble ───────────────────────────────────────────────────────────

function MessageBubble({ message, userInitial }: { message: Message; userInitial: string }) {
  const isUser = message.role === "user";

  return (
    <div className={`animate-message-in group flex items-end gap-3 ${isUser ? "flex-row-reverse" : ""}`}>
      {/* Avatar */}
      <div className={[
        "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold ring-1",
        isUser
          ? "bg-[var(--bubble-user-bg)] text-[var(--bubble-user-text)] ring-[var(--border-medium)]"
          : "bg-[var(--surface-2)] text-zinc-500 ring-[var(--border-subtle)]",
      ].join(" ")}>
        {isUser ? userInitial : "AI"}
      </div>

      {/* Bubble — user stays a solid accent fill (the "sent" affordance);
          AI responses are glass-card, matching the mockup's elevated cards. */}
      {isUser ? (
        <div className="relative max-w-[80%] rounded-2xl rounded-tr-sm bg-[var(--bubble-user-bg)] px-4 py-3 text-[var(--bubble-user-text)]">
          <p className="text-[14px] leading-relaxed whitespace-pre-wrap">{message.content}</p>
        </div>
      ) : (
        <Glare className="glass-card relative block max-w-[80%] rounded-2xl rounded-tl-sm px-4 py-3 text-[var(--bubble-ai-text)]">
            <div className="prose prose-sm prose-invert max-w-none [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  code(props) {
                    const { children, className } = props;
                    const match = /language-(\w+)/.exec(className || "");
                    const codeStr = String(children).replace(/\n$/, "");
                    if (match) {
                      return <CodeBlock language={match[1]} code={codeStr} />;
                    }
                    return (
                      <code className="rounded bg-[var(--surface-3)] px-1.5 py-0.5 text-[13px] font-mono text-zinc-300">
                        {children}
                      </code>
                    );
                  },
                  p: ({ children }) => <p className="mb-3 text-[14px] leading-relaxed last:mb-0">{children}</p>,
                  ul: ({ children }) => <ul className="mb-3 space-y-1 pl-4 text-[14px] last:mb-0">{children}</ul>,
                  ol: ({ children }) => <ol className="mb-3 space-y-1 pl-4 text-[14px] last:mb-0">{children}</ol>,
                  li: ({ children }) => <li className="leading-relaxed">{children}</li>,
                  h1: ({ children }) => <h1 className="mb-3 text-[16px] font-bold">{children}</h1>,
                  h2: ({ children }) => <h2 className="mb-2 text-[15px] font-semibold">{children}</h2>,
                  h3: ({ children }) => <h3 className="mb-2 text-[14px] font-semibold">{children}</h3>,
                  blockquote: ({ children }) => (
                    <blockquote className="border-l-2 border-[var(--border-medium)] pl-4 italic text-zinc-400">{children}</blockquote>
                  ),
                  table: ({ children }) => (
                    <div className="mb-3 overflow-x-auto">
                      <table className="w-full border-collapse text-[13px]">{children}</table>
                    </div>
                  ),
                  th: ({ children }) => (
                    <th className="border border-[var(--border-subtle)] bg-[var(--surface-3)] px-3 py-1.5 text-left font-semibold">{children}</th>
                  ),
                  td: ({ children }) => (
                    <td className="border border-[var(--border-subtle)] px-3 py-1.5">{children}</td>
                  ),
                }}
              >
                {message.content}
              </ReactMarkdown>
            </div>

            {/* Citation chips — always visible; it's the product's core promise, not a footnote.
                One pill per document, matching the pattern already built for Real-time AI's
                web sources — split on the ", " separator formatSources() joins with. */}
            {message.sources && (
              <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                {message.sources.split(", ").map((name, si) => (
                  <span
                    key={si}
                    className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium"
                    style={{ backgroundColor: "var(--marketing-accent-soft)", color: "var(--marketing-accent-text)" }}
                  >
                    <svg className="h-3 w-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    {name}
                  </span>
                ))}
              </div>
            )}

            {/* Copy — appears on hover */}
            <div className="mt-1.5 opacity-0 transition-opacity group-hover:opacity-100">
              <CopyButton text={message.content} />
            </div>
        </Glare>
      )}

      {/* Timestamp — fades in on group hover */}
      <MessageTimestamp />
    </div>
  );
}

// ─── List ─────────────────────────────────────────────────────────────────────

export function ChatMessageList({
  messages,
  isStreaming,
  userInitial = "?",
  onSuggestionClick,
}: ChatMessageListProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const [showScrollFab, setShowScrollFab] = useState(false);
  const wasStreamingRef = useRef(false);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    bottomRef.current?.scrollIntoView({ behavior });
  }, []);

  const isNearBottom = useCallback(() => {
    const el = containerRef.current;
    if (!el) return true;
    return el.scrollHeight - el.scrollTop - el.clientHeight < 220;
  }, []);

  // Smart auto-scroll: only force-scroll when user is near the bottom
  // OR when streaming just kicked off (so the user sees the first token appear).
  useEffect(() => {
    const justStartedStreaming = isStreaming && !wasStreamingRef.current;
    wasStreamingRef.current = isStreaming;
    if (justStartedStreaming || isNearBottom()) {
      scrollToBottom("smooth");
    }
  }, [messages.length, isStreaming, scrollToBottom, isNearBottom]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onScroll = () => {
      const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
      setShowScrollFab(distFromBottom > 200);
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  // Strip the auto-inserted welcome stub from either name variant
  const visibleMessages = messages.filter(
    (m) => !(m.role === "assistant" && (
      m.content === "Welcome to AI Research Copilot." ||
      m.content === "Welcome to Querex."
    ))
  );

  return (
    <div ref={containerRef} className="relative flex-1 overflow-y-auto bg-[var(--app-bg)] scrollbar-thin">
      <div className="mx-auto max-w-3xl space-y-6 px-4 py-6">

        {/* Welcome / empty state */}
        {visibleMessages.length === 0 && !isStreaming && (
          <div className="flex flex-col items-center justify-center gap-4 py-20 text-center">
            <div className="relative">
              <div
                className="demo-glow pointer-events-none absolute -inset-4 -z-10 rounded-full blur-xl"
                style={{ background: "radial-gradient(circle, rgba(224,138,62,0.35), transparent 70%)" }}
                aria-hidden
              />
              <div
                className="flex h-14 w-14 items-center justify-center rounded-2xl ring-1"
                style={{ backgroundColor: "var(--marketing-accent-soft)", borderColor: "var(--marketing-accent-soft)" }}
              >
                <svg
                  className="h-7 w-7"
                  style={{ color: "var(--marketing-accent-text)" }}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={1.5}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                </svg>
              </div>
            </div>
            <div>
              <p className="font-headline text-[19px] font-bold text-zinc-200">
                Start your research
              </p>
              <p className="mt-1 text-[13px] text-zinc-600">Upload a PDF or ask anything to begin</p>
            </div>
            {/* Suggestion chips — clickable to pre-fill the input */}
            <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
              {SUGGESTION_CHIPS.map((hint) => (
                <button
                  key={hint}
                  onClick={() => onSuggestionClick?.(hint)}
                  className="hover-surface cursor-pointer rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-0)] px-4 py-2.5 text-[12px] text-zinc-600 text-left transition hover:text-zinc-400"
                  style={{ borderColor: "var(--border-subtle)" }}
                  onMouseEnter={(e) => (e.currentTarget.style.borderColor = "var(--marketing-accent-soft)")}
                  onMouseLeave={(e) => (e.currentTarget.style.borderColor = "var(--border-subtle)")}
                >
                  {hint}
                </button>
              ))}
            </div>
          </div>
        )}

        {visibleMessages.map((message, index) => (
          <MessageBubble key={index} message={message} userInitial={userInitial} />
        ))}

        {/* Streaming indicator */}
        {isStreaming && (
          <div className="flex gap-3">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--surface-2)] text-[10px] font-semibold text-zinc-500 ring-1 ring-[var(--border-subtle)]">
              AI
            </div>
            <div className="glass-card max-w-[80%] rounded-2xl rounded-tl-sm px-4 py-3">
              <StreamingDot />
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Scroll-to-bottom FAB */}
      {showScrollFab && <ScrollFab onClick={() => scrollToBottom("smooth")} />}
    </div>
  );
}
