import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { getTransaction } from "@/lib/campay";
import { recordCampayPayment } from "@/lib/payments";
import { parseWebhookParams, verifyHs256Jwt } from "@/lib/domain/campay";
import { todayIso } from "@/lib/domain/dates";
import { sendReceiptIfDue } from "@/lib/whatsapp-dispatch";
import { whatsappDeps } from "@/lib/whatsapp-deps";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Notification de Campay après un paiement. La signature (JWT HS256, clé webhook) est vérifiée,
 * puis la transaction est relue chez Campay : seuls ses champs font foi.
 */
async function handle(params: URLSearchParams): Promise<Response> {
  const hook = parseWebhookParams(params);
  if (!hook) return NextResponse.json({ error: "Paramètres manquants" }, { status: 400 });
  const key = process.env.CAMPAY_WEBHOOK_KEY;
  if (!key || !verifyHs256Jwt(hook.signature, key)) {
    return NextResponse.json({ error: "Signature invalide" }, { status: 401 });
  }
  try {
    const tx = await getTransaction(hook.reference);
    const db = createAdminClient();
    const outcome = await recordCampayPayment(db, tx, todayIso());
    if (outcome === "enregistre" && tx.externalReference) {
      // Reçu WhatsApp immédiat ; ne lève jamais, le cron du lendemain rattrape un échec.
      await sendReceiptIfDue(whatsappDeps(db), tx.externalReference);
    }
    if (outcome === "facture_introuvable" || outcome === "facture_annulee") {
      console.error(`[campay] paiement ${tx.reference} non rattaché : ${outcome} (${tx.externalReference})`);
    }
    return NextResponse.json({ outcome });
  } catch (e) {
    console.error("[campay] webhook", e);
    return NextResponse.json({ error: "Erreur temporaire" }, { status: 500 });
  }
}

export async function GET(request: Request) {
  return handle(new URL(request.url).searchParams);
}

export async function POST(request: Request) {
  const params = new URL(request.url).searchParams;
  const type = request.headers.get("content-type") ?? "";
  try {
    if (type.includes("application/json")) {
      const body = (await request.json()) as Record<string, unknown>;
      for (const [k, v] of Object.entries(body)) if (!params.has(k) && v !== null && v !== undefined) params.set(k, String(v));
    } else if (type.includes("form")) {
      const form = await request.formData();
      for (const [k, v] of form.entries()) if (!params.has(k) && typeof v === "string") params.set(k, v);
    }
  } catch {
    return NextResponse.json({ error: "Corps illisible" }, { status: 400 });
  }
  return handle(params);
}
