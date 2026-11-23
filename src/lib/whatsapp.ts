import type { TemplateCall } from "@/lib/domain/whatsapp";

const DEFAULT_VERSION = "v23.0";
const TIMEOUT_MS = 15_000;

export function whatsappConfigured(): boolean {
  return !!process.env.WHATSAPP_TOKEN && !!process.env.WHATSAPP_PHONE_NUMBER_ID;
}

export type SendResult = { outcome: "envoye"; wamid: string } | { outcome: "echec" | "incertain"; error: string };

const uncertain = (error: string): SendResult => ({ outcome: "incertain", error: error.slice(0, 300) });

/**
 * Envoie un modèle WhatsApp via l'API Cloud de Meta. Ne lève jamais.
 * - « envoye » : Meta a accepté le message (identifiant wamid).
 * - « echec » : refus explicite de Meta (4xx avec un objet error) ; le message n'est pas parti, on peut réessayer.
 * - « incertain » : réponse ambiguë (réseau, délai, 5xx…) ; Meta a peut-être envoyé, ne pas réessayer.
 */
export async function sendTemplate(to: string, call: TemplateCall, fetchImpl: typeof fetch = fetch): Promise<SendResult> {
  const token = process.env.WHATSAPP_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!token || !phoneId) return { outcome: "echec", error: "WhatsApp n'est pas configuré" };
  const version = process.env.WHATSAPP_API_VERSION || DEFAULT_VERSION;

  let res: Response;
  try {
    res = await fetchImpl(`https://graph.facebook.com/${version}/${encodeURIComponent(phoneId)}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: to.replace(/^\+/, ""),
        type: "template",
        template: {
          name: call.name,
          language: { code: "fr" },
          components: [{ type: "body", parameters: call.params.map((text) => ({ type: "text", text })) }],
        },
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (e) {
    return uncertain(`Réseau : ${e instanceof Error ? e.message : String(e)}`);
  }

  let json: Record<string, unknown> | null = null;
  try {
    const parsed: unknown = JSON.parse(await res.text());
    if (parsed && typeof parsed === "object") json = parsed as Record<string, unknown>;
  } catch {
    json = null;
  }

  if (res.ok) {
    const first = Array.isArray(json?.messages) ? (json.messages[0] as Record<string, unknown> | undefined) : undefined;
    const id = first?.id;
    return typeof id === "string" && id ? { outcome: "envoye", wamid: id } : uncertain(`Réponse sans identifiant (HTTP ${res.status})`);
  }

  const err = json?.error;
  if (res.status >= 400 && res.status < 500 && err && typeof err === "object") {
    const message = (err as Record<string, unknown>).message;
    return { outcome: "echec", error: (typeof message === "string" && message ? message : `HTTP ${res.status}`).slice(0, 300) };
  }
  return uncertain(`HTTP ${res.status}`);
}
