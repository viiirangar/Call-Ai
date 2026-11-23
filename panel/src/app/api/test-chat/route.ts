import { NextRequest, NextResponse } from "next/server";
import { getConfig } from "@/lib/config";
import { generateReply } from "@/lib/brain";
import type { ChatMessage } from "@/lib/types";

/**
 * Simulateur de conversation dans le panneau — sans envoi à Telegram.
 * audience: customer | friend | colleague | auto
 */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      message?: string;
      audience?: "customer" | "friend" | "colleague" | "auto";
      history?: ChatMessage[];
      contactName?: string;
    };

    const message = (body.message || "").trim();
    if (!message) return NextResponse.json({ error: "Le texte du message est vide" }, { status: 400 });

    const config = await getConfig();
    const history = (body.history || [])
      .filter((m) => m && typeof m.content === "string" && (m.role === "user" || m.role === "assistant"))
      .slice(-14);

    const result = await generateReply(config, {
      history,
      incoming: message,
      audience: body.audience || "auto",
      contactName: body.contactName?.trim() || undefined,
    });

    return NextResponse.json({
      ok: true,
      reply: result.reply,
      detectedAudience: result.audience,
      providerUsed: result.providerUsed,
      language: config.replyLanguage,
    });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: "Échec de la génération de la réponse",
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 500 }
    );
  }
}
