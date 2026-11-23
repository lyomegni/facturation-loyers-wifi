import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { parseStatusUpdates, verifyMetaSignature } from "@/lib/domain/whatsapp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Vérification de l'abonnement par Meta. */
export async function GET(request: Request) {
  const q = new URL(request.url).searchParams;
  const expected = process.env.WHATSAPP_VERIFY_TOKEN;
  if (expected && q.get("hub.mode") === "subscribe" && q.get("hub.verify_token") === expected) {
    return new Response(q.get("hub.challenge") ?? "", { status: 200, headers: { "content-type": "text/plain" } });
  }
  return new Response("Interdit", { status: 403 });
}

/** Statuts de remise (envoyé, remis, lu, non remis) des messages WhatsApp. */
export async function POST(request: Request) {
  const raw = await request.text();
  const secret = process.env.WHATSAPP_APP_SECRET;
  if (!secret || !verifyMetaSignature(raw, request.headers.get("x-hub-signature-256"), secret)) {
    return NextResponse.json({ error: "Signature invalide" }, { status: 401 });
  }
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Corps illisible" }, { status: 400 });
  }
  const updates = parseStatusUpdates(json);
  if (updates.length === 0) return NextResponse.json({ updated: 0 });
  const db = createAdminClient();
  for (const u of updates) {
    const { error } = await db.rpc("whatsapp_apply_status", { p_wamid: u.wamid, p_status: u.status, p_error: u.error });
    if (error) {
      console.error("[whatsapp] webhook", error.message);
      return NextResponse.json({ error: "Erreur temporaire" }, { status: 500 });
    }
  }
  return NextResponse.json({ updated: updates.length });
}
