"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { useAuthGuard } from "@/features/auth/hooks/use-auth-guard";
import { useRealtimeStream } from "@/features/realtime/hooks/use-realtime-stream";
import { useRealtimeSessions } from "@/features/realtime/hooks/use-realtime-sessions";
import { RealtimeSidebar } from "@/features/realtime/components/realtime-sidebar";
import type { RealtimeMessage, RealtimeSessionSummary } from "@/services/api/realtime-api";
import { AtmosphereBackground } from "@/features/shared/components/atmosphere-background";
import { Glare } from "@/features/shared/motion/motion";
import { CopyButton } from "@/features/shared/components/copy-button";
import MainLayout from "@/components/layout/main-layout";

function deriveTitle(firstUserMessage: string): string {
  const trimmed = firstUserMessage.trim().replace(/\s+/g, " ");
  return trimmed.length > 48 ? `${trimmed.slice(0, 48)}…` : trimmed || "New conversation";
}

export default function RealtimePage() {
  const { isReady, isAuthenticated } = useAuthGuard();
  const { stream, isStreaming } = useRealtimeStream();
  const { sessions, isLoading, retentionDays, createSession, updateSession, deleteSession } = useRealtimeSessions();

  const [activeSessionId, setActiveSessionId] = useState<number | null>(null);
  const [messages, setMessages] = useState<RealtimeMessage[]>([]);
  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const hasAutoSelected = useRef(false);

  // Auto-open the most recent conversation on first load; leave it as a
  // fresh, unsaved conversation if the user has none yet.
  useEffect(() => {
    if (hasAutoSelected.current || isLoading) return;
    hasAutoSelected.current = true;
    if (sessions.length > 0) {
      setActiveSessionId(sessions[0].id);
      setMessages(sessions[0].messages);
    }
  }, [isLoading, sessions]);

  if (!isReady || !isAuthenticated) {
    return (
      <div className="flex h-screen items-center justify-center bg-[var(--app-bg)]">
        <div
          className="h-6 w-6 animate-spin rounded-full border-2"
          style={{ borderColor: "var(--border-medium)", borderTopColor: "var(--marketing-accent)" }}
        />
      </div>
    );
  }

  const handleSelect = (id: number) => {
    const session = sessions.find((s) => s.id === id);
    if (!session) return;
    setActiveSessionId(id);
    setMessages(session.messages);
  };

  const handleNewSession = () => {
    setActiveSessionId(null);
    setMessages([]);
  };

  const handleRename = async (id: number, title: string) => {
    const session = sessions.find((s) => s.id === id);
    if (!session) return;
    await updateSession({ id, title, pinned: session.pinned, messages: session.messages });
  };

  const handlePin = async (id: number, pinned: boolean) => {
    const session = sessions.find((s) => s.id === id);
    if (!session) return;
    await updateSession({ id, title: session.title || "Untitled", pinned, messages: session.messages });
  };

  const handleDelete = async (id: number) => {
    await deleteSession(id);
    if (activeSessionId === id) {
      setActiveSessionId(null);
      setMessages([]);
    }
  };

  const persist = async (finalMessages: RealtimeMessage[]) => {
    const existing = sessions.find((s) => s.id === activeSessionId);
    try {
      if (activeSessionId && existing) {
        await updateSession({
          id: activeSessionId,
          title: existing.title || "Untitled",
          pinned: existing.pinned,
          messages: finalMessages,
        });
      } else {
        const firstUserMessage = finalMessages.find((m) => m.role === "user")?.content ?? "";
        const created = await createSession({
          id: 0,
          title: deriveTitle(firstUserMessage),
          pinned: false,
          messages: finalMessages,
        });
        setActiveSessionId(created.id);
      }
    } catch {
      toast.error("Failed to save conversation");
    }
  };

  const handleSend = async () => {
    const text = input.trim();
    if (!text || isStreaming) return;

    const nextMessages: RealtimeMessage[] = [...messages, { role: "user", content: text }];
    setMessages([...nextMessages, { role: "assistant", content: "" }]);
    setInput("");
    requestAnimationFrame(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }));

    let finalAssistant: RealtimeMessage = { role: "assistant", content: "" };
    try {
      await stream({
        messages: nextMessages,
        onAssistantToken: (text, sources) => {
          finalAssistant = { role: "assistant", content: text, sources };
          setMessages((prev) => {
            const updated = [...prev];
            updated[updated.length - 1] = finalAssistant;
            return updated;
          });
        },
      });
      await persist([...nextMessages, finalAssistant]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Search failed");
      setMessages((prev) => prev.slice(0, -1));
    }
  };

  return (
    <MainLayout
      background={<AtmosphereBackground variant="photo" />}
      sidebar={
        <RealtimeSidebar
          sessions={sessions as RealtimeSessionSummary[]}
          activeSessionId={activeSessionId}
          onSelect={handleSelect}
          onDelete={handleDelete}
          onRename={handleRename}
          onPin={handlePin}
          onNewSession={handleNewSession}
          isLoading={isLoading}
          retentionDays={retentionDays}
        />
      }
    >
      <div className="relative z-10 flex h-full flex-col overflow-hidden">
        <header className="glass-bar flex shrink-0 items-center justify-between border-b px-6 py-4">
          <div>
            <h1 className="font-headline text-[15px] font-bold text-[var(--text-primary)]">
              {activeSessionId ? sessions.find((s) => s.id === activeSessionId)?.title || "Conversation" : "New conversation"}
            </h1>
            <p className="mt-0.5 text-[12px] text-zinc-500">Grounded in live web search</p>
          </div>
        </header>

        {/* No opaque background here, deliberately — the "photo" atmosphere
            is meant to show through behind the glass answer cards, per the
            mockup. Legibility comes from .glass-card--photo's higher
            opacity on the cards themselves, not from an opaque pane. */}
        <div className="mx-auto w-full max-w-3xl flex-1 space-y-5 overflow-y-auto px-6 py-6">
          {messages.length === 0 && (
            <Glare className="glass-card glass-card--photo mx-auto mt-16 block max-w-md rounded-2xl px-6 py-8 text-center">
              <p className="text-[14px] text-[var(--text-primary)]">Ask anything — answers are grounded in a live web search.</p>
            </Glare>
          )}
          {messages.map((message, i) => {
            const isLastAssistant = message.role === "assistant" && i === messages.length - 1;
            const bubbleContent = (
              <>
                <p className="whitespace-pre-wrap leading-relaxed">
                  {message.content || (isStreaming && isLastAssistant ? "…" : "")}
                </p>
                {message.sources && message.sources.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5 border-t border-[var(--border-subtle)] pt-2.5">
                    {message.sources.map((source, si) => (
                      <a
                        key={si}
                        href={source.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded-full border border-[var(--border-subtle)] px-2.5 py-1 text-[11px] text-zinc-400 hover-surface"
                        title={source.url}
                      >
                        [{si + 1}] {source.title || new URL(source.url).hostname}
                      </a>
                    ))}
                  </div>
                )}
                {message.role === "assistant" && message.content && !(isStreaming && isLastAssistant) && (
                  <div className="mt-1.5 opacity-0 transition-opacity group-hover:opacity-100">
                    <CopyButton text={message.content} />
                  </div>
                )}
              </>
            );
            return (
              <div key={i} className={message.role === "user" ? "flex justify-end" : "flex justify-start"}>
                {message.role === "user" ? (
                  <div
                    className="max-w-[80%] rounded-2xl px-4 py-2.5 text-[14px] text-white"
                    style={{ backgroundColor: "var(--marketing-accent)" }}
                  >
                    {bubbleContent}
                  </div>
                ) : (
                  <Glare className="group glass-card glass-card--photo block max-w-[85%] rounded-2xl px-4 py-3 text-[14px] text-[var(--text-primary)]">
                    {bubbleContent}
                  </Glare>
                )}
              </div>
            );
          })}
          <div ref={bottomRef} />
        </div>

        <div className="mx-auto w-full max-w-3xl px-6 pb-6">
          <Glare className="glass-card glass-card--photo flex items-end gap-2 rounded-xl p-2">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder="Ask anything…"
              rows={1}
              className="max-h-40 min-h-[40px] flex-1 resize-none bg-transparent px-2 py-2 text-[14px] text-[var(--text-primary)] outline-none placeholder:text-zinc-600"
            />
            <button
              onClick={handleSend}
              disabled={!input.trim() || isStreaming}
              className="shrink-0 rounded-lg px-4 py-2 text-[13px] font-medium text-white transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
              style={{ backgroundColor: "var(--marketing-accent)" }}
            >
              {isStreaming ? "Searching…" : "Send"}
            </button>
          </Glare>
          <p className="mt-2 text-center text-[11px] text-zinc-600">
            Answers may still be wrong — search results are cited, but verify anything important.
          </p>
        </div>
      </div>
    </MainLayout>
  );
}
