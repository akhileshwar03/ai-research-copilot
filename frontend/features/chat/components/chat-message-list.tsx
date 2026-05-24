"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";

import type { Message } from "@/shared/types/chat";

interface ChatMessageListProps {
  messages: Message[];
  isStreaming: boolean;
}

// ─── Streaming dots ───────────────────────────────────────────────────────────

function StreamingDot() {
  return (
    <span className="inline-flex items-center gap-1 py-1">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="inline-block h-1.5 w-1.5 rounded-full bg-zinc-500"
          style={{ animation: `pulse-dot 1.2s ease-in-out ${i * 0.2}s infinite` }}
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

// ─── Copy button ──────────────────────────────────────────────────────────────

function CopyButton({ text, className = "" }: { text: string; className?: string }) {
  const [copied, setCopied] = useState(false);

  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {/* ignore */}
  }, [text]);

  return (
    <button
      onClick={copy}
      className={[
        "flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium transition",
        copied
          ? "text-emerald-400"
          : "text-zinc-600 hover:bg-white/[0.06] hover:text-zinc-300",
        className,
      ].join(" ")}
      title={copied ? "Copied!" : "Copy"}
    >
      {copied ? (
        <>
          <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
          Copied
        </>
      ) : (
        <>
          <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
          Copy
        </>
      )}
    </button>
  );
}

// ─── Code block with copy ─────────────────────────────────────────────────────

function CodeBlock({ language, code }: { language: string; code: string }) {
  return (
    <div className="group/code relative my-3 overflow-hidden rounded-xl">
      <div className="flex items-center justify-between border-b border-white/[0.06] bg-[#0d0d0d] px-4 py-1.5">
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
          background: "#0d0d0d",
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
      className="absolute bottom-4 right-4 flex h-8 w-8 items-center justify-center rounded-full border border-white/[0.08] bg-[#111] text-zinc-400 shadow-lg transition hover:border-white/20 hover:text-zinc-200"
      title="Scroll to bottom"
    >
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
      </svg>
    </button>
  );
}

// ─── Message bubble ───────────────────────────────────────────────────────────

function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === "user";

  return (
    <div className={`group flex gap-3 ${isUser ? "flex-row-reverse" : ""}`}>
      {/* Avatar */}
      <div className={[
        "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold ring-1",
        isUser
          ? "bg-white text-black ring-white/20"
          : "bg-white/[0.05] text-zinc-500 ring-white/[0.06]",
      ].join(" ")}>
        {isUser ? "Y" : "AI"}
      </div>

      {/* Bubble */}
      <div className={[
        "relative max-w-[80%] rounded-2xl",
        isUser
          ? "rounded-tr-sm bg-white px-4 py-3 text-black"
          : "rounded-tl-sm bg-[#111] px-4 py-3 text-zinc-200 ring-1 ring-white/[0.06]",
      ].join(" ")}>
        {isUser ? (
          <p className="text-[14px] leading-relaxed whitespace-pre-wrap">{message.content}</p>
        ) : (
          <>
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
                      <code className="rounded bg-white/[0.06] px-1.5 py-0.5 text-[13px] font-mono text-zinc-300">
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
                    <blockquote className="border-l-2 border-white/20 pl-4 italic text-zinc-400">{children}</blockquote>
                  ),
                  table: ({ children }) => (
                    <div className="mb-3 overflow-x-auto">
                      <table className="w-full border-collapse text-[13px]">{children}</table>
                    </div>
                  ),
                  th: ({ children }) => (
                    <th className="border border-white/[0.08] bg-white/[0.04] px-3 py-1.5 text-left font-semibold">{children}</th>
                  ),
                  td: ({ children }) => (
                    <td className="border border-white/[0.08] px-3 py-1.5">{children}</td>
                  ),
                }}
              >
                {message.content}
              </ReactMarkdown>
            </div>

            {/* Copy button — appears on hover */}
            <div className="mt-2 flex items-center justify-between opacity-0 transition-opacity group-hover:opacity-100">
              <CopyButton text={message.content} />
              {message.sources && (
                <div className="flex items-center gap-1.5">
                  <svg className="h-3 w-3 text-zinc-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                  </svg>
                  <span className="text-[11px] text-zinc-600">{message.sources}</span>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── List ─────────────────────────────────────────────────────────────────────

export function ChatMessageList({ messages, isStreaming }: ChatMessageListProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const [showScrollFab, setShowScrollFab] = useState(false);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    bottomRef.current?.scrollIntoView({ behavior });
  }, []);

  useEffect(() => { scrollToBottom("smooth"); }, [messages.length, isStreaming, scrollToBottom]);

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

  const visibleMessages = messages.filter(
    (m) => !(m.role === "assistant" && m.content === "Welcome to AI Research Copilot.") || messages.length === 1
  );

  return (
    <div ref={containerRef} className="relative flex-1 overflow-y-auto scrollbar-thin">
      <div className="mx-auto max-w-3xl space-y-6 px-4 py-6">

        {/* Welcome / empty state */}
        {visibleMessages.length <= 1 && !isStreaming && (
          <div className="flex flex-col items-center justify-center gap-4 py-20 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/[0.04] ring-1 ring-white/[0.06]">
              <svg className="h-7 w-7 text-white/25" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
              </svg>
            </div>
            <div>
              <p className="text-[15px] font-medium text-zinc-400">Start your research</p>
              <p className="mt-1 text-[13px] text-zinc-600">Upload a PDF or ask anything to begin</p>
            </div>
            <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
              {[
                "Summarise the key findings",
                "What are the main arguments?",
                "Compare the methodologies",
                "List all citations",
              ].map((hint) => (
                <div
                  key={hint}
                  className="cursor-default rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-2.5 text-[12px] text-zinc-600 transition hover:border-white/[0.10] hover:text-zinc-500"
                >
                  {hint}
                </div>
              ))}
            </div>
          </div>
        )}

        {visibleMessages.map((message, index) => (
          <MessageBubble key={index} message={message} />
        ))}

        {/* Streaming indicator */}
        {isStreaming && (
          <div className="flex gap-3">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/[0.05] text-[10px] font-semibold text-zinc-500 ring-1 ring-white/[0.06]">
              AI
            </div>
            <div className="max-w-[80%] rounded-2xl rounded-tl-sm bg-[#111] px-4 py-3 ring-1 ring-white/[0.06]">
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
