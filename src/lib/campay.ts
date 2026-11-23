import { parseTransaction, type CampayTransaction } from "@/lib/domain/campay";

const base = () => (process.env.CAMPAY_BASE_URL || "https://demo.campay.net").replace(/\/+$/, "");

export function campayConfigured(): boolean {
  return !!process.env.CAMPAY_TOKEN && !!process.env.CAMPAY_WEBHOOK_KEY;
}

function headers(): Record<string, string> {
  const token = process.env.CAMPAY_TOKEN;
  if (!token) throw new Error("Campay : CAMPAY_TOKEN manquant");
  return { Authorization: `Token ${token}`, "Content-Type": "application/json" };
}

async function readJson(res: Response, what: string): Promise<Record<string, unknown>> {
  const text = await res.text();
  if (!res.ok) throw new Error(`Campay : ${what} a échoué (HTTP ${res.status}) ${text.slice(0, 200)}`);
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new Error(`Campay : réponse illisible pour ${what}`);
  }
}

export type PaymentLinkRequest = {
  amount: number;
  description: string;
  externalReference: string;
  redirectUrl: string;
  firstName?: string;
  lastName?: string;
  email?: string | null;
};

export async function createPaymentLink(
  req: PaymentLinkRequest,
  fetchImpl: typeof fetch = fetch,
): Promise<{ link: string; reference: string | null }> {
  const res = await fetchImpl(`${base()}/api/get_payment_link/`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      amount: String(req.amount),
      currency: "XAF",
      description: req.description,
      external_reference: req.externalReference,
      redirect_url: req.redirectUrl,
      failure_redirect_url: req.redirectUrl,
      first_name: req.firstName ?? "",
      last_name: req.lastName ?? "",
      email: req.email ?? "",
      payment_options: "MOMO",
      payer_can_pay_more: "no",
    }),
    cache: "no-store",
  });
  const json = await readJson(res, "la création du lien de paiement");
  if (typeof json.link !== "string" || !json.link) throw new Error("Campay : aucun lien de paiement renvoyé");
  return { link: json.link, reference: typeof json.reference === "string" ? json.reference : null };
}

export async function getTransaction(reference: string, fetchImpl: typeof fetch = fetch): Promise<CampayTransaction> {
  const res = await fetchImpl(`${base()}/api/transaction/${encodeURIComponent(reference)}/`, {
    method: "GET",
    headers: headers(),
    cache: "no-store",
  });
  return parseTransaction(await readJson(res, "la lecture de la transaction"));
}
