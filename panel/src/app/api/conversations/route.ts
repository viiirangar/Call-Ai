import { NextResponse } from "next/server";
import { db } from "@/lib/db";

/** Liste des conversations triée par dernière activité */
export async function GET() {
  const conversations = await db.conversation.findMany({
    orderBy: { lastMessageAt: "desc" },
    take: 100,
    include: {
      messages: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { content: true, role: true, createdAt: true },
      },
    },
  });

  return NextResponse.json(
    conversations.map((c) => ({
      id: c.id,
      telegramChatId: c.telegramChatId,
      contactName: c.contactName,
      audienceMode: c.audienceMode,
      lastAudience: c.lastAudience,
      needsAttention: c.needsAttention,
      messageCount: c.messageCount,
      lastMessageAt: c.lastMessageAt,
      lastMessage: c.messages[0]?.content || "",
      lastRole: c.messages[0]?.role || "",
    }))
  );
}
