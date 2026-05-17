"use client";

import { useState } from "react";
import axios from "axios";

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

    // Build updated conversation history
    const updatedMessages = [
      ...messages,
      userMessage,
    ];

    // Update UI immediately
    setMessages(updatedMessages);

    // Clear input
    setInput("");

    // Show loading state
    setLoading(true);

    try {

      const response = await axios.post(
        "http://127.0.0.1:8000/chat",
        {
          messages: updatedMessages,
        }
      );

      const aiMessage: Message = {
        role: "assistant",
        content: response.data.response,
      };

      // Add AI response to conversation
      setMessages((prev) => [
        ...prev,
        aiMessage,
      ]);

    } catch (error) {

      console.error(error);

      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "Something went wrong.",
        },
      ]);

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
              className={`rounded-2xl p-4 ${
                message.role === "user"
                  ? "bg-white text-black"
                  : "bg-zinc-900 text-zinc-200"
              }`}
            >
              <p className="whitespace-pre-wrap text-sm leading-7">
                {message.content}
              </p>
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