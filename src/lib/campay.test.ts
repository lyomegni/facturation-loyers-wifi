import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { campayConfigured, createPaymentLink, getTransaction } from "./campay";

type Call = { url: string; init?: RequestInit };

function fakeFetch(status: number, body: unknown) {
  const calls: Call[] = [];
  const impl = (async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  }) as unknown as typeof fetch;
  return { impl, calls };
}

const req = { amount: 75000, description: "FAC-2026-0001 · Loyer", externalReference: "inv1", redirectUrl: "https://app/f/t?paiement=retour" };

beforeEach(() => {
  process.env.CAMPAY_TOKEN = "tok";
  process.env.CAMPAY_WEBHOOK_KEY = "wk";
  delete process.env.CAMPAY_BASE_URL;
});
afterEach(() => {
  delete process.env.CAMPAY_TOKEN;
  delete process.env.CAMPAY_WEBHOOK_KEY;
});

describe("createPaymentLink", () => {
  it("appelle get_payment_link sur l'environnement démo", async () => {
    const f = fakeFetch(200, { link: "https://pay/x", reference: "r1" });
    expect(await createPaymentLink(req, f.impl)).toEqual({ link: "https://pay/x", reference: "r1" });
    const c = f.calls[0];
    expect(c.url).toBe("https://demo.campay.net/api/get_payment_link/");
    expect(c.init?.method).toBe("POST");
    expect((c.init?.headers as Record<string, string>).Authorization).toBe("Token tok");
    expect(JSON.parse(String(c.init?.body))).toMatchObject({ amount: "75000", currency: "XAF", external_reference: "inv1" });
  });

  it("rejette une réponse d'erreur", async () => {
    const f = fakeFetch(400, { message: "ER201" });
    await expect(createPaymentLink(req, f.impl)).rejects.toThrow(/Campay/);
  });
});

describe("getTransaction", () => {
  it("encode la référence dans l'URL", async () => {
    const f = fakeFetch(200, { reference: "r 1", status: "SUCCESSFUL", amount: 10 });
    await getTransaction("r 1", f.impl);
    expect(f.calls[0].url).toBe("https://demo.campay.net/api/transaction/r%201/");
  });
});

describe("campayConfigured", () => {
  it("vrai seulement avec jeton et clé webhook", () => {
    expect(campayConfigured()).toBe(true);
    delete process.env.CAMPAY_WEBHOOK_KEY;
    expect(campayConfigured()).toBe(false);
  });
});
