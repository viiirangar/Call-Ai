import { NextRequest, NextResponse } from "next/server";
import { getConfig } from "@/lib/config";
import { enrollVoice } from "@/lib/voice";

/**
 * Enregistrement de l'échantillon vocal de l'utilisateur pour le clonage de voix.
 * POST /api/call/voice-sample
 * body: multipart/form-data avec le champ file (mp3/wav/webm/ogg — au moins 6 secondes de son)
 */
export async function POST(req: NextRequest) {
  let file: File | null = null;
  try {
    const form = await req.formData();
    const f = form.get("file");
    if (f instanceof File) file = f;
  } catch {
    file = null;
  }
  try {
    if (!file) {
      return NextResponse.json({ ok: false, error: "aucun fichier audio envoyé" }, { status: 400 });
    }
    if (file.size > 15 * 1024 * 1024) {
      return NextResponse.json({ ok: false, error: "fichier trop volumineux (max 15 Mo)" }, { status: 400 });
    }

    const ext = (file.name.split(".").pop() || "wav").toLowerCase().replace(/[^a-z0-9]/g, "") || "wav";
    const fmt = ["mp3", "wav", "ogg", "webm", "m4a", "aac", "flac", "opus"].includes(ext) ? ext : "wav";

    const config = await getConfig();
    const phrases = [config.callGreeting, config.callGoodbye];

    const result = await enrollVoice(await file.arrayBuffer(), fmt, phrases, config.callVoiceName);
    if (!result.ok) {
      return NextResponse.json({ ok: false, error: result.error }, { status: 400 });
    }
    return NextResponse.json({ ok: true, duration: result.duration });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
