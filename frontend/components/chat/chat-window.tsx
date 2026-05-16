"use client";

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

  const handleSendMessage = () => {
    if (!input.trim()) return;

    const newMessage: Message = {
      role: "user",
      content: input,
    };

    setMessages((prev) => [...prev, newMessage]);

    setInput("");
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
              className={`rounded-2xl p-4 ${
                message.role === "user"
                  ? "bg-white text-black"
                  : "bg-zinc-900 text-zinc-200"
              }`}
            >
              <p className="text-sm leading-7">
                {message.content}
              </p>
            </div>
          ))}

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
            className="rounded-xl bg-white px-4 py-2 font-medium text-black hover:bg-zinc-200 transition"
          >
            Send
          </button>

        </div>

      </div>

    </div>
  );
}