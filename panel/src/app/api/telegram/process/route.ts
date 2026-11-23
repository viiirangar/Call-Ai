import { NextRequest, NextResponse } from "next/server";
import { processUpdate, type ProcessResult } from "@/lib/processor";
import type { TgUpdate } from "@/lib/telegram";

/**
 * Traitement d'une mise à jour Telegram brute — appelé par le worker (Polling).
 * Doit uniquement être appelé depuis localhost.
 */
export async function POST(req: NextRequest) {
  const host = req.headers.get("host") || "";
  const isLocal = host.startsWith("localhost") || host.startsWith("127.0.0.1");
  if (!isLocal) {
    return NextResponse.json({ ok: false, error: "cette route est interne uniquement" }, { status: 403 });
  }

  const update = (await req.json()) as TgUpdate;
  if (!update?.update_id) {
    return NextResponse.json({ ok: false, error: "sans update_id" }, { status: 400 });
  }

  try {
    const result: ProcessResult = await processUpdate(update);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return NextResponse.json(
      { ok: false, action: "error", detail: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
