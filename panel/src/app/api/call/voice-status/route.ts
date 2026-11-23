import { NextRequest, NextResponse } from "next/server";
import { getConfig } from "@/lib/config";
import { getVoiceStatus } from "@/lib/voice";

/**
 * État de la voix de l'assistante — un échantillon vocal est-il enregistré et le voice-server est-il actif ?
 * GET /api/call/voice-status
 */
export async function GET() {
  try {
    const config = await getConfig();
    const status = await getVoiceStatus();
    return NextResponse.json({
      ok: true,
      voiceOnline: status?.online ?? false,
      enrolled: status?.enrolled ?? false,
      callVoiceMode: config.callVoiceMode,
      callVoiceName: config.callVoiceName,
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
