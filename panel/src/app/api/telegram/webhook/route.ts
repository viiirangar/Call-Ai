import { NextRequest, NextResponse } from "next/server";
import { getConfig } from "@/lib/config";
import { processUpdate, type ProcessResult } from "@/lib/processor";
import type { TgUpdate } from "@/lib/telegram";

/**
 * Webhook Telegram (pour un déploiement sur Vercel/Render).
 * La sécurité est vérifiée avec l'en-tête secret X-Telegram-Bot-Api-Secret-Token.
 */
export async function POST(req: NextRequest) {
  const config = await getConfig();

  const secret = req.headers.get("x-telegram-bot-api-secret-token");
  if (config.webhookSecret && secret !== config.webhookSecret) {
    return NextResponse.json({ ok: false, error: "secret mismatch" }, { status: 401 });
  }
  if (!config.botToken) {
    // token non configuré — renvoyer 200 pour que Telegram ne réessaie pas sans fin
    return NextResponse.json({ ok: true, ignored: "no token" });
  }

  const update = (await req.json()) as TgUpdate;
  const result: ProcessResult = await processUpdate(update);
  return NextResponse.json({ ok: true, action: result.action, detail: result.detail });
}
