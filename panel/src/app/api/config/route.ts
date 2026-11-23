import { NextRequest, NextResponse } from "next/server";
import { getConfig, updateConfig, maskSecret } from "@/lib/config";
import type { BotConfigData, FaqItem } from "@/lib/types";

export async function GET() {
  const config = await getConfig();
  return NextResponse.json({
    ...config,
    botToken: maskSecret(config.botToken),
    aiApiKey: maskSecret(config.aiApiKey),
    botConnected: !!config.botToken,
    aiConfigured: config.aiProvider !== "demo" && !!config.aiApiKey,
  });
}

export async function PUT(req: NextRequest) {
  try {
    const body = (await req.json()) as Partial<BotConfigData> & { faqs?: FaqItem[] };
    const saved = await updateConfig(body);
    return NextResponse.json({
      ...saved,
      botToken: maskSecret(saved.botToken),
      aiApiKey: maskSecret(saved.aiApiKey),
      botConnected: !!saved.botToken,
      aiConfigured: saved.aiProvider !== "demo" && !!saved.aiApiKey,
    });
  } catch (err) {
    return NextResponse.json(
      { error: "Échec de l'enregistrement des réglages", detail: err instanceof Error ? err.message : String(err) },
      { status: 400 }
    );
  }
}
