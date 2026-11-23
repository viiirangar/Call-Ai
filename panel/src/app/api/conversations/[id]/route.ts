import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

/** Détails d'une conversation : tous les messages */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const conversation = await db.conversation.findUnique({
    where: { id },
    include: { messages: { orderBy: { createdAt: "asc" }, take: 200 } },
  });
  if (!conversation) return NextResponse.json({ error: "Conversation introuvable" }, { status: 404 });
  return NextResponse.json({
    id: conversation.id,
    contactName: conversation.contactName,
    telegramChatId: conversation.telegramChatId,
    audienceMode: conversation.audienceMode,
    lastAudience: conversation.lastAudience,
    needsAttention: conversation.needsAttention,
    messageCount: conversation.messageCount,
    messages: conversation.messages.map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      createdAt: m.createdAt,
    })),
  });
}

/** Changer le type d'interlocuteur (ton de réponse) */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = (await req.json()) as { audienceMode?: string; needsAttention?: boolean };
  const data: Record<string, unknown> = {};
  if (body.audienceMode && ["auto", "customer", "friend", "colleague"].includes(body.audienceMode)) {
    data.audienceMode = body.audienceMode;
  }
  if (typeof body.needsAttention === "boolean") data.needsAttention = body.needsAttention;
  const updated = await db.conversation.update({ where: { id }, data });
  return NextResponse.json({ ok: true, audienceMode: updated.audienceMode, needsAttention: updated.needsAttention });
}

/** Supprimer la conversation */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await db.conversation.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
