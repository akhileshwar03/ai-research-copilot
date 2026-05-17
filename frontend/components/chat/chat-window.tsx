"use client";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useState } from "react";

type Message = {
  role: "user" | "assistant";
  content: string;
};

export default function ChatWindow() {

  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content: "Welcome to AI Research Copilot.",
    },
  ]);

  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSendMessage = async () => {
    if (!input.trim()) return;

    const userMessage: Message = {
      role: "user",
      content: input,
    };

    const updatedMessages = [
      ...messages,
      userMessage,
    ];

    setMessages(updatedMessages);

    const currentInput = input;

    setInput("");
    setLoading(true);

    const assistantMessage: Message = {
      role: "assistant",
      content: "",
    };

    setMessages((prev) => [
      ...prev,
      assistantMessage,
    ]);

    try {

      const response = await fetch(
        "http://127.0.0.1:8000/chat",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            messages: updatedMessages,
          }),
        }
      );

      const reader = response.body?.getReader();

      if (!reader) return;

      const decoder = new TextDecoder();

      let streamedText = "";

      while (true) {

        const { done, value } =
          await reader.read();

        if (done) break;

        streamedText += decoder.decode(value);

        setMessages((prev) => {

          const updated = [...prev];

          updated[updated.length - 1] = {
            role: "assistant",
            content: streamedText,
          };

          return updated;
        });
      }

    } catch (error) {

      console.error(error);

    }

    setLoading(false);
  };

  return (
    <div className="flex h-screen flex-col bg-black text-white">

      {/* Header */}
      <header className="border-b border-zinc-800 p-4">
        <h2 className="text-lg font-semibold">
          Research Session
        </h2>
      </header>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-6">

        <div className="mx-auto max-w-3xl space-y-4">

          {messages.map((message, index) => (
            <div
              key={index}
              className={`rounded-2xl p-4 border border-zinc-800 ${
                message.role === "user"
                  ? "bg-white text-black"
                  : "bg-zinc-900 text-zinc-200"
              }`}
            >
              <div className="prose prose-invert max-w-none prose-pre:bg-zinc-950 prose-pre:border prose-pre:border-zinc-800">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {message.content}
                </ReactMarkdown>
              </div>
            </div>
          ))}

          {loading && (
            <div className="rounded-2xl bg-zinc-900 p-4 text-zinc-400">
              AI is thinking...
            </div>
          )}

        </div>

      </div>

      {/* Input */}
      <div className="border-t border-zinc-800 p-4">

        <div className="mx-auto flex max-w-3xl items-center gap-3 rounded-2xl border border-zinc-700 bg-zinc-900 p-3">

          <input
            type="text"
            placeholder="Ask anything..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                handleSendMessage();
              }
            }}
            className="flex-1 bg-transparent outline-none"
          />

          <button
            onClick={handleSendMessage}
            disabled={loading}
            className="rounded-xl bg-white px-4 py-2 font-medium text-black disabled:opacity-50"
          >
            Send
          </button>

        </div>

      </div>

    </div>
  );
}