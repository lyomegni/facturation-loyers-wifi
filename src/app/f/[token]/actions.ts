"use server";

import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/server";
import { campayConfigured, createPaymentLink } from "@/lib/campay";
import { appUrl } from "@/lib/env";
import { payableAmount, splitName } from "@/lib/domain/pay";
import type { StoredStatus } from "@/lib/domain/invoicing";

const TOKEN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Crée un paiement Campay pour le reste à payer et envoie le client sur la page de paiement. */
export async function startPayment(token: string): Promise<void> {
  if (!TOKEN.test(token) || !campayConfigured()) redirect(`/f/${token}`);
  const back = `/f/${token}`;
  let link: string;
  try {
    const { data, error } = await createAdminClient()
      .from("invoices")
      .select("id, number, label, status, amount_xaf, paid_xaf, customer:customers(name, email)")
      .eq("public_token", token)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) redirect(back);
    const inv = data as unknown as {
      id: string; number: string; label: string; status: StoredStatus; amount_xaf: number; paid_xaf: number;
      customer: { name: string; email: string | null } | null;
    };
    const amount = payableAmount(inv);
    if (amount === 0) redirect(`${back}?paiement=deja`);
    const name = splitName(inv.customer?.name ?? "");
    ({ link } = await createPaymentLink({
      amount,
      description: `${inv.number} · ${inv.label}`.slice(0, 100),
      externalReference: inv.id,
      redirectUrl: `${appUrl()}${back}?paiement=retour`,
      firstName: name.firstName,
      lastName: name.lastName,
      email: inv.customer?.email ?? null,
    }));
  } catch (e) {
    // redirect() lève une exception spéciale : on la laisse passer.
    if (e && typeof e === "object" && "digest" in e && String((e as { digest: unknown }).digest).startsWith("NEXT_REDIRECT")) throw e;
    console.error("[campay] création du lien", e);
    redirect(`${back}?paiement=erreur`);
  }
  redirect(link);
}
