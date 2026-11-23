import { db } from "@/lib/db";
import type { BotConfigData, FaqItem } from "@/lib/types";

/**
 * Lecture des réglages — si la première ligne n'existe pas, elle est créée avec les valeurs par défaut.
 */
export async function getConfig(): Promise<BotConfigData & { id: number }> {
  let row = await db.botConfig.findUnique({ where: { id: 1 } });
  if (!row) {
    try {
      row = await db.botConfig.create({ data: { id: 1 } });
    } catch {
      // ligne créée en parallèle — on relit
      const again = await db.botConfig.findUnique({ where: { id: 1 } });
      if (!again) throw new Error("Échec de la création de la ligne de réglages");
      row = again;
    }
  }
  let faqs: FaqItem[] = [];
  try {
    const parsed = JSON.parse(row.faqs || "[]");
    if (Array.isArray(parsed)) faqs = parsed.filter((f) => f && typeof f.q === "string");
  } catch {
    faqs = [];
  }
  return {
    id: row.id,
    botToken: row.botToken,
    botUsername: row.botUsername,
    ownerTelegramId: row.ownerTelegramId,
    webhookSecret: row.webhookSecret || "",
    aiProvider: (row.aiProvider as BotConfigData["aiProvider"]) || "demo",
    aiApiKey: row.aiApiKey,
    aiModel: row.aiModel,
    aiBaseUrl: row.aiBaseUrl,
    enabled: row.enabled,
    replyLanguage: row.replyLanguage || "fr",
    timezone: row.timezone || "Europe/Paris",
    workHoursEnabled: row.workHoursEnabled,
    workStart: row.workStart || "09:00",
    workEnd: row.workEnd || "18:00",
    awayMessage: row.awayMessage,
    hideAiIdentity: row.hideAiIdentity,
    maxHistory: row.maxHistory || 12,
    ownerName: row.ownerName,
    businessInfo: row.businessInfo,
    personality: row.personality,
    toneCustomer: row.toneCustomer,
    toneFriend: row.toneFriend,
    toneColleague: row.toneColleague,
    extraInstructions: row.extraInstructions,
    faqs,
    signature: row.signature,
    fallbackMessage: row.fallbackMessage,
    callApiToken: row.callApiToken,
    callEnabled: row.callEnabled,
    callGreeting: row.callGreeting || "Bonjour ! Un instant s'il vous plaît, je vous écoute.",
    callGoodbye: row.callGoodbye || "Merci pour votre appel, très bonne journée !",
    callVoiceMode: (row.callVoiceMode as "clone" | "ms" | "phone") || "phone",
    callVoiceName: row.callVoiceName || "fr-FR-DeniseNeural",
  };
}

/**
 * Mise à jour partielle des réglages — seuls les champs envoyés changent.
 * Si la valeur d'un champ masqué est envoyée, la valeur précédente est conservée.
 */
function mask(value: string): string {
  if (!value) return "";
  if (value.length <= 8) return "••••••";
  return value.slice(0, 5) + "••••••" + value.slice(-3);
}

export function maskSecret(value: string): string {
  return mask(value);
}

export function isMasked(value: string | undefined | null): boolean {
  if (!value) return false;
  return value.includes("•••");
}

export async function updateConfig(patch: Partial<BotConfigData>): Promise<BotConfigData & { id: number }> {
  await getConfig(); // garantie de l'existence de la ligne

  const data: Record<string, unknown> = {};

  const strFields = [
    "botToken",
    "botUsername",
    "ownerTelegramId",
    "webhookSecret",
    "aiModel",
    "aiBaseUrl",
    "replyLanguage",
    "timezone",
    "workStart",
    "workEnd",
    "awayMessage",
    "ownerName",
    "businessInfo",
    "personality",
    "toneCustomer",
    "toneFriend",
    "toneColleague",
    "extraInstructions",
    "signature",
    "fallbackMessage",
    "callApiToken",
    "callGreeting",
    "callGoodbye",
    "callVoiceName",
  ] as const;

  for (const f of strFields) {
    if (patch[f] !== undefined && !isMasked(patch[f] as string)) data[f] = patch[f];
  }
  // Champs secrets : si une valeur masquée est envoyée, on la conserve
  for (const f of ["botToken", "aiApiKey", "callApiToken"] as const) {
    if (patch[f] !== undefined && !isMasked(patch[f] as string)) data[f] = patch[f];
  }

  if (patch.aiProvider !== undefined) data.aiProvider = patch.aiProvider;
  if (patch.enabled !== undefined) data.enabled = patch.enabled;
  if (patch.workHoursEnabled !== undefined) data.workHoursEnabled = patch.workHoursEnabled;
  if (patch.hideAiIdentity !== undefined) data.hideAiIdentity = patch.hideAiIdentity;
  if (patch.callEnabled !== undefined) data.callEnabled = patch.callEnabled;
  if (patch.callVoiceMode !== undefined) {
    const m = String(patch.callVoiceMode);
    if (m === "clone" || m === "ms" || m === "phone") data.callVoiceMode = m;
  }
  if (patch.maxHistory !== undefined) data.maxHistory = Math.max(2, Math.min(40, Number(patch.maxHistory) || 12));
  if (patch.faqs !== undefined) data.faqs = JSON.stringify(patch.faqs || []);

  await db.botConfig.update({ where: { id: 1 }, data });
  return getConfig();
}
