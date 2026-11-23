import { createHmac, timingSafeEqual } from "node:crypto";

/** Vérifie un JWT HS256 (signature du webhook Campay). Renvoie la charge utile, ou null si invalide. */
export function verifyHs256Jwt(token: string, key: string): Record<string, unknown> | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [h, p, sig] = parts;
  try {
    const header = JSON.parse(Buffer.from(h, "base64url").toString("utf8"));
    if (header?.alg !== "HS256") return null;
    const expected = createHmac("sha256", key).update(`${h}.${p}`).digest();
    const given = Buffer.from(sig, "base64url");
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
    const payload = JSON.parse(Buffer.from(p, "base64url").toString("utf8"));
    return payload && typeof payload === "object" ? (payload as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export function operatorToMethod(operator: string | null | undefined): "orange_money" | "mtn_momo" | "autre" {
  const o = (operator ?? "").toUpperCase();
  if (o.includes("MTN")) return "mtn_momo";
  if (o.includes("ORANGE")) return "orange_money";
  return "autre";
}

export type CampayWebhook = { reference: string; status: string; externalReference: string | null; signature: string };

export function parseWebhookParams(params: URLSearchParams): CampayWebhook | null {
  const reference = params.get("reference");
  const signature = params.get("signature");
  if (!reference || !signature) return null;
  return { reference, status: params.get("status") ?? "", externalReference: params.get("external_reference") || null, signature };
}

export type CampayTransaction = {
  reference: string;
  status: "SUCCESSFUL" | "FAILED" | "PENDING" | string;
  amount: number;
  operator: string | null;
  externalReference: string | null;
  operatorReference: string | null;
};

export function parseTransaction(json: unknown): CampayTransaction {
  const j = (json ?? {}) as Record<string, unknown>;
  if (typeof j.reference !== "string" || !j.reference) throw new Error("Campay : transaction sans référence");
  const str = (v: unknown) => (typeof v === "string" && v !== "" ? v : null);
  return {
    reference: j.reference,
    status: String(j.status ?? ""),
    amount: Math.round(Number(j.amount ?? 0)),
    operator: str(j.operator),
    externalReference: str(j.external_reference),
    operatorReference: str(j.operator_reference),
  };
}
