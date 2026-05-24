"use client";

import { ChatHeader } from "@/features/chat/components/chat-header";
import { ChatInput } from "@/features/chat/components/chat-input";
import { ChatMessageList } from "@/features/chat/components/chat-message-list";
import { useChat } from "@/features/chat/hooks/use-chat";

interface ChatWindowProps {
  email: string | null;
  selectedDocument: string;
}

export default function ChatWindow({ email, selectedDocument }: ChatWindowProps) {
  const { input, setInput, sendMessage, cancelStreaming, isStreaming, activeSession, chatError } = useChat(email, selectedDocument);

  if (!activeSession) {
    return null;
  }

  return (
    <div className="flex h-full flex-col bg-[#080808] text-white">
      <ChatHeader />
      {chatError ? <div className="mx-6 mt-4 rounded border border-red-700 bg-red-950 px-3 py-2 text-sm text-red-300">{chatError}</div> : null}
      <ChatMessageList messages={activeSession.messages} isStreaming={isStreaming} />
      <ChatInput
        value={input}
        onChange={setInput}
        onSubmit={sendMessage}
        onCancel={cancelStreaming}
        isStreaming={isStreaming}
      />
    </div>
  );
}
