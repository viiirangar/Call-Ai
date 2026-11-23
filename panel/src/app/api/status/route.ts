import { NextResponse } from "next/server";
import { getConfig } from "@/lib/config";
import { db } from "@/lib/db";

const WORKER_URL = "http://localhost:3010";

export interface WorkerStatus {
  online: boolean;
  polling: boolean;
  lastUpdateAt: string | null;
  lastError: string | null;
  processed: number;
}

export async function workerHealth(): Promise<WorkerStatus> {
  try {
    const res = await fetch(`${WORKER_URL}/health`, { signal: AbortSignal.timeout(2500) });
    if (!res.ok) throw new Error(String(res.status));
    const data = await res.json();
    return {
      online: true,
      polling: !!data.polling,
      lastUpdateAt: data.lastUpdateAt ?? null,
      lastError: data.lastError ?? null,
      processed: Number(data.processed ?? 0),
    };
  } catch {
    return { online: false, polling: false, lastUpdateAt: null, lastError: null, processed: 0 };
  }
}

export async function GET() {
  const config = await getConfig();
  const worker = await workerHealth();
  const [conversationCount, messageCount] = await Promise.all([
    db.conversation.count(),
    db.message.count(),
  ]);

  return NextResponse.json({
    botConnected: !!config.botToken,
    botUsername: config.botUsername,
    aiConfigured: config.aiProvider !== "demo" && !!config.aiApiKey,
    aiProvider: config.aiProvider,
    enabled: config.enabled,
    ownerSet: !!config.ownerTelegramId,
    personaComplete: !!config.ownerName && (!!config.personality || !!config.businessInfo),
    replyLanguage: config.replyLanguage,
    worker,
    stats: { conversationCount, messageCount },
  });
}
