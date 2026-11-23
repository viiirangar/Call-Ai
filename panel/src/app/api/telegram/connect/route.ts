import { NextRequest, NextResponse } from "next/server";
import { getConfig, updateConfig } from "@/lib/config";
import { getMe, deleteWebhook, getWebhookInfo, setWebhook } from "@/lib/telegram";
import { workerHealth } from "@/app/api/status/route";

const WORKER_URL = "http://localhost:3010";
const WORKER_KEY = process.env.WORKER_KEY || "worker-secret-2024";

/**
 * Connexion du bot :
 * 1) Validation du token avec getMe
 * 2) Enregistrement du token et du nom du bot
 * 3) Suppression de l'ancien webhook et activation du Polling sur le worker
 */
export async function POST(req: NextRequest) {
  try {
    const { botToken } = (await req.json()) as { botToken?: string };
    const config = await getConfig();
    const token = botToken && !botToken.includes("•••") ? botToken.trim() : config.botToken;

    if (!token) {
      return NextResponse.json(
        { ok: false, error: "Aucun token de bot saisi. Récupérez un token auprès de @BotFather et entrez-le ici." },
        { status: 400 }
      );
    }

    // 1) Validation
    let me;
    try {
      me = await getMe(token);
    } catch (err) {
      return NextResponse.json(
        {
          ok: false,
          error: "Le token du bot est invalide ou Telegram est injoignable.",
          detail: err instanceof Error ? err.message : String(err),
        },
        { status: 400 }
      );
    }

    // 2) Enregistrement
    await updateConfig({ botToken: token, botUsername: me.username ? `@${me.username}` : "" });

    // ---- Mode serveur cloud (Vercel) : webhook automatique — sans besoin de worker ----
    if (process.env.VERCEL) {
      const secret = config.webhookSecret || `whk-${crypto.randomUUID().replace(/-/g, "")}`;
      const baseUrl = process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : `https://${req.headers.get("host") || ""}`;
      const hookUrl = `${baseUrl.replace(/\/$/, "")}/api/telegram/webhook`;
      try {
        await setWebhook(token, hookUrl, secret);
        await updateConfig({ botToken: token, botUsername: me.username ? `@${me.username}` : "", webhookSecret: secret });
        return NextResponse.json({
          ok: true,
          botUsername: me.username ? `@${me.username}` : "",
          botFirstName: me.first_name || "",
          mode: "webhook",
          message: "Bot connecté et webhook configuré — actif 24h/24.",
        });
      } catch (e) {
        return NextResponse.json({
          ok: true,
          botUsername: me.username ? `@${me.username}` : "",
          botFirstName: me.first_name || "",
          mode: "webhook",
          message: "Token enregistré mais la configuration du webhook a échoué — réappuyez sur le bouton de connexion.",
          detail: e instanceof Error ? e.message : String(e),
        });
      }
    }

    // 3) Suppression du webhook (pour éviter un conflit avec le Polling)
    try {
      const wh = await getWebhookInfo(token);
      if (wh?.url) await deleteWebhook(token, false);
    } catch {
      // non critique
    }

    // 4) Démarrage du Polling
    let polling = false;
    try {
      const res = await fetch(`${WORKER_URL}/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Worker-Key": WORKER_KEY },
        signal: AbortSignal.timeout(8000),
      });
      const data = await res.json().catch(() => ({}));
      polling = !!data.ok;
    } catch {
      polling = false;
    }

    const health = await workerHealth();

    return NextResponse.json({
      ok: true,
      botUsername: me.username ? `@${me.username}` : "",
      botFirstName: me.first_name || "",
      mode: polling ? "polling" : "webhook",
      polling,
      workerOnline: health.online,
      message: polling
        ? "Bot connecté et en train d'écouter les messages Telegram."
        : "Token enregistré mais le service Polling n'est pas accessible. Pour un fonctionnement permanent, le worker doit tourner ou utilisez le webhook.",
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: "Erreur inattendue lors de la connexion", detail: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
