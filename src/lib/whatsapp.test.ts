import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { sendTemplate, whatsappConfigured } from "./whatsapp";

type Call = { url: string; init?: RequestInit };

function fakeFetch(status: number, body: unknown) {
  const calls: Call[] = [];
  const impl = (async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    return new Response(typeof body === "string" ? body : JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  }) as unknown as typeof fetch;
  return { impl, calls };
}

const call = { name: "facture_emise", params: ["Jean", "FAC-1"] };

beforeEach(() => {
  process.env.WHATSAPP_TOKEN = "tok";
  process.env.WHATSAPP_PHONE_NUMBER_ID = "123";
  delete process.env.WHATSAPP_API_VERSION;
});
afterEach(() => {
  delete process.env.WHATSAPP_TOKEN;
  delete process.env.WHATSAPP_PHONE_NUMBER_ID;
  delete process.env.WHATSAPP_API_VERSION;
});

describe("sendTemplate", () => {
  it("envoie le modèle et renvoie l'identifiant Meta", async () => {
    const ok = fakeFetch(200, { messages: [{ id: "wamid.9" }] });
    expect(await sendTemplate("+237699000000", call, ok.impl)).toEqual({ outcome: "envoye", wamid: "wamid.9" });
    const c = ok.calls[0];
    expect(c.url).toBe("https://graph.facebook.com/v23.0/123/messages");
    expect(c.init?.method).toBe("POST");
    expect((c.init?.headers as Record<string, string>).Authorization).toBe("Bearer tok");
    expect(JSON.parse(String(c.init?.body))).toEqual({
      messaging_product: "whatsapp",
      to: "237699000000",
      type: "template",
      template: {
        name: "facture_emise",
        language: { code: "fr" },
        components: [{ type: "body", parameters: [{ type: "text", text: "Jean" }, { type: "text", text: "FAC-1" }] }],
      },
    });
  });

  it("suit la version d'API configurée", async () => {
    process.env.WHATSAPP_API_VERSION = "v99.0";
    const ok = fakeFetch(200, { messages: [{ id: "w" }] });
    await sendTemplate("+237699000000", call, ok.impl);
    expect(ok.calls[0].url).toBe("https://graph.facebook.com/v99.0/123/messages");
  });

  it("refus explicite de Meta : échec réessayable", async () => {
    const r = await sendTemplate("+237699000000", call, fakeFetch(400, { error: { message: "Template name does not exist" } }).impl);
    expect(r).toEqual({ outcome: "echec", error: "Template name does not exist" });
  });

  it("réponse ambiguë : incertain", async () => {
    expect((await sendTemplate("+237699000000", call, fakeFetch(503, {}).impl)).outcome).toBe("incertain");
    expect((await sendTemplate("+237699000000", call, fakeFetch(200, {}).impl)).outcome).toBe("incertain");
    expect((await sendTemplate("+237699000000", call, fakeFetch(400, {}).impl)).outcome).toBe("incertain");
    expect((await sendTemplate("+237699000000", call, fakeFetch(200, "<html>").impl)).outcome).toBe("incertain");
    const boom = (async () => {
      throw new Error("ECONNRESET");
    }) as unknown as typeof fetch;
    expect((await sendTemplate("+237699000000", call, boom)).outcome).toBe("incertain");
  });
});

describe("whatsappConfigured", () => {
  it("vrai seulement avec jeton et numéro", () => {
    expect(whatsappConfigured()).toBe(true);
    delete process.env.WHATSAPP_TOKEN;
    expect(whatsappConfigured()).toBe(false);
  });
});
