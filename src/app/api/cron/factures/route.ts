import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { issueInvoicesForOrg } from "@/lib/invoicing";
import { todayIso } from "@/lib/domain/dates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Appelé chaque matin par Vercel Cron : émet les factures arrivées dans leur délai. */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  const db = createAdminClient();
  const today = todayIso();
  const { data: orgs, error } = await db.from("organizations").select("id, invoice_lead_days");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const results: { org: string; issued?: number; error?: string }[] = [];
  for (const org of orgs ?? []) {
    try {
      results.push({ org: org.id, issued: await issueInvoicesForOrg(db, org, today) });
    } catch (e) {
      results.push({ org: org.id, error: e instanceof Error ? e.message : String(e) });
    }
  }
  const issued = results.reduce((s, r) => s + (r.issued ?? 0), 0);
  return NextResponse.json({ today, issued, results }, { status: results.some((r) => r.error) ? 207 : 200 });
}
