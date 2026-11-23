import { db } from "@/lib/db";

// ============================================================
// Fonctions de communication avec l'API Telegram Bot
// ============================================================

const TG_API = "https://api.telegram.org";

export interface TgUser {
  id: number;
  is_bot?: boolean;
  first_name?: string;
  last_name?: string;
  username?: string;
  language_code?: string;
}

export interface TgChat {
  id: number;
  type: string; // private | group | channel | supergroup
  first_name?: string;
  last_name?: string;
  username?: string;
  title?: string;
}

export interface TgUpdate {
  update_id: number;
  message?: {
    message_id: number;
    from?: TgUser;
    chat: TgChat;
    date: number;
    text?: string;
    reply_to_message?: { message_id: number };
  };
  edited_message?: TgUpdate["message"];
}

async function callApi<T = unknown>(token: string, method: string, payload?: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${TG_API}/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload || {}),
    signal: AbortSignal.timeout(35_000),
  });
  const data = await res.json().catch(() => ({ ok: false, description: "réponse JSON invalide" }));
  if (!data.ok) {
    throw new Error(data.description || `Telegram API error (${res.status})`);
  }
  return data.result as T;
}

export async function getMe(token: string): Promise<TgUser> {
  return callApi<TgUser>(token, "getMe");
}

export async function setWebhook(token: string, url: string, secret: string): Promise<void> {
  await callApi(token, "setWebhook", {
    url,
    secret_token: secret,
    allowed_updates: ["message"],
    drop_pending_updates: false,
  });
}

export async function deleteWebhook(token: string, dropPending = true): Promise<void> {
  await callApi(token, "deleteWebhook", { drop_pending_updates: dropPending });
}

export async function getWebhookInfo(token: string): Promise<Record<string, unknown>> {
  return callApi<Record<string, unknown>>(token, "getWebhookInfo");
}

export async function sendMessage(token: string, chatId: number | string, text: string): Promise<TgUpdate["message"]> {
  return callApi<TgUpdate["message"]>(token, "sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: undefined,
  });
}

export async function sendChatAction(token: string, chatId: number | string, action = "typing"): Promise<void> {
  try {
    await callApi(token, "sendChatAction", { chat_id: chatId, action });
  } catch {
    // non critique
  }
}

/**
 * Enregistrement sûr du token du bot dans les réglages et stockage de son nom d'utilisateur
 */
export async function saveBotIdentity(username: string): Promise<void> {
  await db.botConfig.update({ where: { id: 1 }, data: { botUsername: username } });
}
