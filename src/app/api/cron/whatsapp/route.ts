import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { runDaily } from "@/lib/whatsapp-dispatch";
import { whatsappDeps } from "@/lib/whatsapp-deps";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Appelé chaque matin (8 h à Douala) par Vercel Cron : facture, rappels et reçus WhatsApp du jour. */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  const deps = whatsappDeps(createAdminClient());
  try {
    const counts = await runDaily(deps);
    return NextResponse.json({ today: deps.today, configured: deps.configured, ...counts });
  } catch (e) {
    console.error("[whatsapp] cron", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
