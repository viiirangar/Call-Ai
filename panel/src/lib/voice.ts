import type { BotConfigData } from "@/lib/types";

/**
 * Communication avec le voice-server (Python, port 3020) pour produire la voix de l'assistante.
 * Toute erreur renvoie silencieusement null — l'appli retombe sur le TTS local en l'absence de fichier audio.
 */

const VOICE_URL = process.env.VOICE_SERVER_URL || "http://127.0.0.1:3020";

export interface CallAudio {
  base64: string;
  format: "wav";
}

function isCloneMode(config: BotConfigData): boolean {
  return config.callVoiceMode === "clone";
}

/** texte → wav base64 ; en cas d'erreur ou d'indisponibilité, null */
export async function synthesizeCallAudio(text: string, config: BotConfigData): Promise<CallAudio | null> {
  if (!text || !text.trim()) return null;
  try {
    const res = await fetch(`${VOICE_URL}/tts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: text.trim().slice(0, 600),
        voice: config.callVoiceName || "fr-FR-DeniseNeural",
        clone: isCloneMode(config),
      }),
      signal: AbortSignal.timeout(25_000),
    });
    if (!res.ok) return null;
    const buf = await res.arrayBuffer();
    if (!buf.byteLength) return null;
    return { base64: Buffer.from(buf).toString("base64"), format: "wav" };
  } catch {
    return null;
  }
}

export async function getVoiceStatus(): Promise<{ online: boolean; enrolled: boolean } | null> {
  try {
    const res = await fetch(`${VOICE_URL}/status`, { signal: AbortSignal.timeout(4000) });
    if (!res.ok) return null;
    const j = (await res.json()) as { enrolled?: boolean };
    return { online: true, enrolled: !!j.enrolled };
  } catch {
    return { online: false, enrolled: false };
  }
}

/** Envoi de l'échantillon vocal de l'utilisateur au voice-server pour créer la signature vocale + préchauffage des phrases fixes */
export async function enrollVoice(
  audio: ArrayBuffer,
  fmt: string,
  phrases: string[],
  voice: string,
): Promise<{ ok: boolean; error?: string; duration?: number }> {
  try {
    const q = new URLSearchParams({ fmt, voice });
    if (phrases.length) q.set("prewarm", JSON.stringify(phrases));
    const res = await fetch(`${VOICE_URL}/enroll?${q.toString()}`, {
      method: "POST",
      body: Buffer.from(audio),
      signal: AbortSignal.timeout(120_000),
    });
    const j = (await res.json()) as { ok?: boolean; error?: string; duration?: number };
    return j.ok ? { ok: true, duration: j.duration } : { ok: false, error: j.error || "Erreur lors de l'enregistrement de l'échantillon" };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "voice-server injoignable" };
  }
}
