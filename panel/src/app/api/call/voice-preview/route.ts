import { NextRequest, NextResponse } from "next/server";
import { getConfig } from "@/lib/config";
import { synthesizeCallAudio } from "@/lib/voice";
import type { BotConfigData } from "@/lib/types";

/**
 * Aperçu de la voix de l'assistante dans le panneau — une phrase d'exemple en français.
 * GET /api/call/voice-preview?voice=fr-FR-HenriNeural&clone=1
 * clone=1 ne répond que si un échantillon vocal a déjà été enregistré (sinon la voix de base est utilisée)
 */
export async function GET(req: NextRequest) {
  try {
    const config = await getConfig();
    const voice = req.nextUrl.searchParams.get("voice") || config.callVoiceName;
    const clone = req.nextUrl.searchParams.get("clone") === "1" && config.callVoiceMode === "clone";

    const sample =
      "Bonjour ! Je suis l'assistant téléphonique. Je peux vous parler de mon parcours et de mon expérience professionnelle.";

    const partial = { callVoiceName: voice, callVoiceMode: clone ? "clone" : "ms" } as Partial<BotConfigData>;
    const audio = await synthesizeCallAudio(sample, partial as BotConfigData);
    if (!audio) {
      return NextResponse.json({ ok: false, error: "service vocal indisponible" }, { status: 503 });
    }

    const buf = Buffer.from(audio.base64, "base64");
    return new NextResponse(new Uint8Array(buf), {
      status: 200,
      headers: { "Content-Type": "audio/wav", "Cache-Control": "no-store" },
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
