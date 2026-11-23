import { db } from "@/lib/db";
import { getConfig } from "@/lib/config";
import { generateReply, buildWelcomeMessage, detectAudienceHeuristic } from "@/lib/brain";
import { sendMessage, sendChatAction, type TgUpdate } from "@/lib/telegram";
import type { Audience, ChatMessage } from "@/lib/types";

// ============================================================
// Traitement d'une mise à jour Telegram (webhook ou Polling)
// ============================================================

function nowInZone(timezone: string): { hhmm: string } {
  try {
    const fmt = new Intl.DateTimeFormat("en-GB", {
      timeZone: timezone,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    return { hhmm: fmt.format(new Date()) };
  } catch {
    return { hhmm: "12:00" };
  }
}

function isOutsideWorkHours(config: { workHoursEnabled: boolean; workStart: string; workEnd: string; timezone: string }): boolean {
  if (!config.workHoursEnabled) return false;
  const { hhmm } = nowInZone(config.timezone);
  const cur = hhmm;
  const { workStart: s, workEnd: e } = config;
  if (s <= e) return cur < s || cur >= e;
  // Shift de nuit (ex. 22h à 6h)
  return cur < s && cur >= e;
}



export interface ProcessResult {
  ok: boolean;
  action: "ignored" | "replied" | "away" | "welcome" | "paused" | "error" | "command";
  detail?: string;
}

export async function processUpdate(update: TgUpdate): Promise<ProcessResult> {
  const msg = update.message || update.edited_message;
  if (!msg?.text || !msg.from) return { ok: true, action: "ignored", detail: "sans texte ni expéditeur" };

  // Seulement les chats privés — les messages de groupes sont ignorés
  if (msg.chat.type !== "private") return { ok: true, action: "ignored", detail: "chat non privé" };

  const config = await getConfig();
  const token = config.botToken;
  if (!token) return { ok: false, action: "error", detail: "token du bot non configuré" };

  const chatId = msg.chat.id;
  const senderTgId = String(msg.from.id);
  const text = msg.text.trim();
  const isOwner = !!config.ownerTelegramId && senderTgId === config.ownerTelegramId;

  // ---- Conversation dans la base de données ----
  const contactName = [msg.from.first_name, msg.from.last_name].filter(Boolean).join(" ") || msg.from.username || `Utilisateur ${msg.from.id}`;
  const conversation = await db.conversation.upsert({
    where: { telegramChatId: String(chatId) },
    create: { telegramChatId: String(chatId), contactName, messageCount: 0 },
    update: { contactName },
  });

  // Enregistrement du message (avec contrôle de doublon)
  const tgMsgId = msg.message_id ? String(msg.message_id) : null;
  const existing = tgMsgId
    ? await db.message.findFirst({
        where: { conversationId: conversation.id, telegramMessageId: tgMsgId },
      })
    : null;
  if (existing) return { ok: true, action: "ignored", detail: "message en double" };
  await db.message.create({
    data: { conversationId: conversation.id, role: "user", content: text, telegramMessageId: tgMsgId },
  });

  // ---- Commandes du propriétaire ----
  if (isOwner && text.startsWith("/")) {
    const cmd = text.toLowerCase().split(/\s+/)[0];
    if (cmd === "/pause") {
      await db.botConfig.update({ where: { id: 1 }, data: { enabled: false } });
      await sendMessage(token, chatId, "La réponse automatique a été temporairement désactivée. Réactivez-la avec /resume.");
      return { ok: true, action: "command", detail: "pause" };
    }
    if (cmd === "/resume") {
      await db.botConfig.update({ where: { id: 1 }, data: { enabled: true } });
      await sendMessage(token, chatId, "La réponse automatique est de nouveau activée.");
      return { ok: true, action: "command", detail: "resume" };
    }
    if (cmd === "/status") {
      const st = config.enabled ? "actif" : "désactivé";
      const prov = config.aiProvider === "demo" ? "démo" : config.aiProvider;
      await sendMessage(token, chatId, `État du bot : ${st}\nService d'intelligence artificielle : ${prov}\nLangue des réponses : ${config.replyLanguage.toUpperCase()}\nConversations enregistrées : ${await db.conversation.count()}`);
      return { ok: true, action: "command", detail: "status" };
    }
  }

  // ---- Identifiant personnel (/id) ----
  if (text.toLowerCase() === "/id" || text.toLowerCase() === "/start") {
    const welcome = buildWelcomeMessage(config, isOwner);
    const extra = !config.ownerTelegramId ? `\n\nVotre identifiant Telegram (pour devenir propriétaire, entrez ce nombre dans le panneau de réglages) :\n\`${msg.from.id}\`` : "";
    await sendMessage(token, chatId, welcome + extra);
    return { ok: true, action: "welcome" };
  }

  // ---- Propriétaire : message normal du propriétaire → note (sans réponse IA) ----
  if (isOwner) {
    await db.message.create({
      data: { conversationId: conversation.id, role: "system_note", content: "Message du propriétaire — sans réponse automatique", telegramMessageId: null },
    });
    return { ok: true, action: "ignored", detail: "message du propriétaire" };
  }

  // ---- Bot désactivé ou hors heures de travail ----
  if (!config.enabled) {
    await db.message.create({
      data: { conversationId: conversation.id, role: "system_note", content: "Bot désactivé — aucune réponse envoyée", telegramMessageId: null },
    });
    return { ok: true, action: "paused" };
  }
  if (isOutsideWorkHours(config)) {
    await sendChatAction(token, chatId);
    const sent = await sendMessage(token, chatId, config.awayMessage);
    await db.message.create({
      data: { conversationId: conversation.id, role: "assistant", content: config.awayMessage, telegramMessageId: sent?.message_id ? String(sent.message_id) : null },
    });
    await db.conversation.update({
      where: { id: conversation.id },
      data: { lastMessageAt: new Date(), messageCount: { increment: 1 } },
    });
    return { ok: true, action: "away" };
  }

  // ---- Génération de la réponse IA ----
  await sendChatAction(token, chatId);

  const historyRows = await db.message.findMany({
    where: { conversationId: conversation.id, role: { in: ["user", "assistant"] } },
    orderBy: { createdAt: "desc" },
    take: Math.max(2, Math.min(40, config.maxHistory) ),
  });
  const history: ChatMessage[] = historyRows
    .reverse()
    .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));
  // Le dernier message (enregistré à l'instant) est retiré de l'historique car il est envoyé séparément
  if (history.length && history[history.length - 1].content === text) history.pop();

  const audience = conversation.audienceMode === "auto"
    ? "auto" as const
    : (conversation.audienceMode as Exclude<Audience, "unknown">);

  try {
    const result = await generateReply(config, {
      history,
      incoming: text,
      audience,
      contactName,
    });

    // Détection finale de l'interlocuteur
    const finalAudience: Audience = result.audience !== "unknown" ? result.audience : detectAudienceHeuristic(text);

    await sendChatAction(token, chatId);
    const sent = await sendMessage(token, chatId, result.reply);
    await db.message.create({
      data: { conversationId: conversation.id, role: "assistant", content: result.reply, telegramMessageId: sent?.message_id ? String(sent.message_id) : null },
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
    return { ok: true, action: "replied", detail: `réponse en français envoyée (${result.providerUsed})` };
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    await db.conversation.update({ where: { id: conversation.id }, data: { needsAttention: true } });
    // Message d'excuse poli à l'interlocuteur
    const apology = "Désolé, j'ai eu un petit souci technique. Pouvez-vous renvoyer votre message ?";
    try {
      const sent = await sendMessage(token, chatId, apology);
      await db.message.create({
        data: { conversationId: conversation.id, role: "assistant", content: apology, telegramMessageId: sent?.message_id ? String(sent.message_id) : null },
      });
    } catch {
      // l'envoi a aussi échoué
    }
    return { ok: false, action: "error", detail };
  }
}
