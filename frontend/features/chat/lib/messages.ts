import type { Message } from "@/shared/types/chat";

/** Strips the auto-inserted welcome stub (either historical name variant) that
 * every session is seeded with — it isn't a real turn, so it's never shown,
 * never searched, and never counted. Shared by ChatMessageList (what renders)
 * and the in-chat search in ChatWindow/ChatHeader (what's searchable), so the
 * two stay index-aligned — a search match's index always points at the same
 * bubble the list actually rendered for it.
 */
export function visibleChatMessages(messages: Message[]): Message[] {
  return messages.filter(
    (m) =>
      !(
        m.role === "assistant" &&
        (m.content === "Welcome to AI Research Copilot." || m.content === "Welcome to Querex.")
      ),
  );
}
