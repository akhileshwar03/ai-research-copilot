"use client";

import { useEffect, useRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";

import type { Message } from "@/shared/types/chat";

interface ChatMessageListProps {
  messages: Message[];
  isStreaming: boolean;
}

function StreamingDot() {
  return (
    <span className="inline-flex items-center gap-1 py-1">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="inline-block h-1.5 w-1.5 rounded-full bg-zinc-500"
          style={{ animation: `pulse 1.2s ease-in-out ${i * 0.2}s infinite` }}
        />
      ))}
      <style>{`
        @keyframes pulse {
          0%, 80%, 100% { opacity: 0.3; transform: scale(0.8); }
          40% { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </span>
  );
}

export function ChatMessageList({ messages, isStreaming }: ChatMessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isStreaming]);

  const visibleMessages = messages.filter((m) => !(m.role === "assistant" && m.content === "Welcome to AI Research Copilot.") || messages.length === 1);

  return (
    <div className="flex-1 overflow-y-auto scrollbar-thin">
      <div className="mx-auto max-w-3xl px-4 py-6 space-y-6">

        {visibleMessages.length <= 1 && !isStreaming && (
          <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/[0.04] ring-1 ring-white/[0.06]">
              <svg className="h-6 w-6 text-white/30" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
              </svg>
            </div>
            <div>
              <p className="text-[15px] font-medium text-zinc-400">Ready to research</p>
              <p className="mt-1 text-[13px] text-zinc-600">Upload a PDF or ask a question to get started</p>
            </div>
          </div>
        )}

        {visibleMessages.map((message, index) => (
          <div key={index} className={`flex gap-3 ${message.role === "user" ? "flex-row-reverse" : ""}`}>
            {/* Avatar */}
            <div className={[
              "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold ring-1",
              message.role === "user"
                ? "bg-white text-black ring-white/20"
                : "bg-white/[0.05] text-zinc-500 ring-white/[0.06]",
            ].join(" ")}>
              {message.role === "user" ? "Y" : "AI"}
            </div>

            {/* Bubble */}
            <div className={[
              "max-w-[80%] rounded-2xl px-4 py-3",
              message.role === "user"
                ? "rounded-tr-sm bg-white text-black"
                : "rounded-tl-sm bg-[#111] text-zinc-200 ring-1 ring-white/[0.06]",
            ].join(" ")}>
              {message.role === "user" ? (
                <p className="text-[14px] leading-relaxed whitespace-pre-wrap">{message.content}</p>
              ) : (
                <div className="prose prose-sm prose-invert max-w-none [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={{
                      code(props) {
                        const { children, className } = props;
                        const match = /language-(\w+)/.exec(className || "");
                        return match ? (
                          <SyntaxHighlighter
                            style={oneDark}
                            language={match[1]}
                            PreTag="div"
                            customStyle={{ margin: "0.5rem 0", borderRadius: "0.75rem", fontSize: "13px" }}
                          >
                            {String(children).replace(/\n$/, "")}
                          </SyntaxHighlighter>
                        ) : (
                          <code className="rounded bg-white/[0.06] px-1.5 py-0.5 text-[13px] text-zinc-300">
                            {children}
                          </code>
                        );
                      },
                      p: ({ children }) => <p className="text-[14px] leading-relaxed mb-3 last:mb-0">{children}</p>,
                      ul: ({ children }) => <ul className="mb-3 space-y-1 pl-4 text-[14px] last:mb-0">{children}</ul>,
                      ol: ({ children }) => <ol className="mb-3 space-y-1 pl-4 text-[14px] last:mb-0">{children}</ol>,
                      li: ({ children }) => <li className="leading-relaxed">{children}</li>,
                      h1: ({ children }) => <h1 className="mb-3 text-[16px] font-bold">{children}</h1>,
                      h2: ({ children }) => <h2 className="mb-2 text-[15px] font-semibold">{children}</h2>,
                      h3: ({ children }) => <h3 className="mb-2 text-[14px] font-semibold">{children}</h3>,
                      blockquote: ({ children }) => (
                        <blockquote className="border-l-2 border-white/20 pl-4 italic text-zinc-400">{children}</blockquote>
                      ),
                    }}
                  >
                    {message.content}
                  </ReactMarkdown>
                </div>
              )}

              {/* Sources badge */}
              {message.sources && (
                <div className="mt-2 flex items-center gap-1.5 border-t border-white/[0.06] pt-2">
                  <svg className="h-3 w-3 text-zinc-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                  </svg>
                  <span className="text-[11px] text-zinc-600">{message.sources}</span>
                </div>
              )}
            </div>
          </div>
        ))}

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
    </div>
  );
}
