import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getConfig } from "@/lib/config";
import { generateReply, detectAudienceHeuristic } from "@/lib/brain";
import { synthesizeCallAudio } from "@/lib/voice";

/**
 * Point d'entrée de l'appli Android répondeur d'appels vers le cerveau IA.
 *
 * POST /api/call/turn
 * body: {
 *   token:   string — code de sécurité du panneau (callApiToken)
 *   callId:  string — identifiant unique de chaque appel (créé par l'appli)
 *   action:  "start" | "turn" | "end"
 *   text?:   string — texte entendu de l'appelant (pour action=turn)
 *   callerName?: string
 * }
 *
 * Réponse : { ok, action, greeting? | reply? | goodbye?, disabled? }
 */

interface CallTurnBody {
  token?: string;
  callId?: string;
  action?: "start" | "turn" | "end";
  text?: string;
  callerName?: string;
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as CallTurnBody;
    const config = await getConfig();

    // ---- Authentification par code de sécurité ----
    if (!config.callApiToken || !body.token || body.token.trim() !== config.callApiToken) {
      return NextResponse.json(
        { ok: false, error: "code de sécurité invalide" },
        { status: 401 }
      );
    }

    const callId = (body.callId || "").trim().slice(0, 80);
    if (!callId || !/^[a-zA-Z0-9._:-]+$/.test(callId)) {
      return NextResponse.json({ ok: false, error: "identifiant d'appel invalide" }, { status: 400 });
    }

    const chatKey = `call:${callId}`;
    const contactName = (body.callerName || "Caller").trim().slice(0, 80);

    // Conversation propre à cet appel — l'historique naturel est conservé
    const conversation = await db.conversation.upsert({
      where: { telegramChatId: chatKey },
      create: { telegramChatId: chatKey, contactName: `${contactName} (appel)`, messageCount: 0 },
      update: {},
    });

    const action = body.action || "turn";

    // ---- Début d'appel : vérifier l'activation + renvoyer la phrase d'accueil ----
    if (action === "start") {
      if (!config.callEnabled || !config.enabled) {
        return NextResponse.json({ ok: true, action: "start", disabled: true });
      }
      await db.message.create({
        data: { conversationId: conversation.id, role: "system_note", content: "Appel téléphonique démarré", telegramMessageId: null },
      });
      const greetingAudio = await synthesizeCallAudio(config.callGreeting, config);
      return NextResponse.json({
        ok: true,
        action: "start",
        greeting: config.callGreeting,
        language: config.replyLanguage,
        audioBase64: greetingAudio?.base64 ?? null,
        audioFormat: greetingAudio ? "wav" : null,
      });
    }

    // ---- Fin d'appel ----
    if (action === "end") {
      await db.conversation.update({
        where: { id: conversation.id },
        data: { lastMessageAt: new Date(), messageCount: { increment: 1 } },
      });
      const goodbyeAudio = await synthesizeCallAudio(config.callGoodbye, config);
      return NextResponse.json({
        ok: true,
        action: "end",
        goodbye: config.callGoodbye,
        audioBase64: goodbyeAudio?.base64 ?? null,
        audioFormat: goodbyeAudio ? "wav" : null,
      });
    }

    // ---- Tour de conversation normal ----
    const text = (body.text || "").trim().slice(0, 2000);
    if (!text) return NextResponse.json({ ok: false, error: "le texte entendu est vide" }, { status: 400 });

    const tgMsgKey = `u-${Date.now()}`;
    await db.message.create({
      data: { conversationId: conversation.id, role: "user", content: text, telegramMessageId: tgMsgKey },
    });

    if (!config.callEnabled || !config.enabled) {
      return NextResponse.json({ ok: true, action: "turn", reply: config.callGoodbye, disabled: true });
    }

    const historyRows = await db.message.findMany({
      where: { conversationId: conversation.id, role: { in: ["user", "assistant"] } },
      orderBy: { createdAt: "desc" },
      take: Math.max(2, Math.min(20, config.maxHistory)),
    });
    const history = historyRows
      .reverse()
      .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));
    // Le dernier message est text lui-même — on le retire de l'historique
    if (history.length && history[history.length - 1].content === text) history.pop();

    const result = await generateReply(config, {
      history,
      incoming: text,
      audience: "auto",
      contactName: contactName,
    });

    const finalAudience = result.audience !== "unknown" ? result.audience : detectAudienceHeuristic(text);

    await db.message.create({
      data: {
        conversationId: conversation.id,
        role: "assistant",
        content: result.reply,
        telegramMessageId: `a-${Date.now()}`,
      },
    });
    await db.conversation.update({
      where: { id: conversation.id },
      data: {
        lastMessageAt: new Date(),
        messageCount: { increment: 1 },
        lastAudience: finalAudience,
        needsAttention: result.reply.trim() === (config.fallbackMessage || "").trim(),
      },
    });

    const replyAudio = await synthesizeCallAudio(result.reply, config);

    return NextResponse.json({
      ok: true,
      action: "turn",
      reply: result.reply,
      language: config.replyLanguage,
      providerUsed: result.providerUsed,
      audioBase64: replyAudio?.base64 ?? null,
      audioFormat: replyAudio ? "wav" : null,
    });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: "Erreur du serveur lors du traitement de l'appel",
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 500 }
    );
  }
}
