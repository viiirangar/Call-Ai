import { NextResponse } from "next/server";

const WORKER_URL = "http://localhost:3010";
const WORKER_KEY = process.env.WORKER_KEY || "worker-secret-2024";

/** Arrêt du Polling */
export async function POST() {
  let stopped = false;
  try {
    const res = await fetch(`${WORKER_URL}/stop`, {
      method: "POST",
      headers: { "X-Worker-Key": WORKER_KEY },
      signal: AbortSignal.timeout(5000),
    });
    const data = await res.json().catch(() => ({}));
    stopped = !!data.ok;
  } catch {
    stopped = false;
  }
  return NextResponse.json({ ok: true, stopped });
}
