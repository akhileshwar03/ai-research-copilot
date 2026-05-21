import { ChatSession } from "@/types/chat";
export async function fetchSessions(
  userId: number
): Promise<ChatSession[]> {

  const response =
    await fetch(
      `${process.env.NEXT_PUBLIC_API_URL}/sessions/${userId}`
    );

  return response.json();
}

export async function createSession(
  session: ChatSession,
  userId: number
) {

  await fetch(
    `${process.env.NEXT_PUBLIC_API_URL}/sessions`,
    {
      method: "POST",

      headers: {
        "Content-Type":
          "application/json",
      },

      body: JSON.stringify({
        title:
          session.title,

        user_id:
          userId,

        messages:
          session.messages,
      }),
    }
  );
}

export async function deleteSession(
  sessionId: number
) {

  await fetch(
    `${process.env.NEXT_PUBLIC_API_URL}/sessions/${sessionId}`,
    {
      method: "DELETE",
    }
  );
}

export async function updateSession(
  session: ChatSession,
  userId: number
) {

  await fetch(
    `${process.env.NEXT_PUBLIC_API_URL}/sessions/${session.id}`,
    {
      method: "PUT",

      headers: {
        "Content-Type":
          "application/json",
      },

      body: JSON.stringify({
        title:
          session.title,

        user_id:
          userId,

        messages:
          session.messages,
      }),
    }
  );
}