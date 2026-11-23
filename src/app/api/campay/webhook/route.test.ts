import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn();
vi.mock("@/lib/supabase/server", () => ({ createAdminClient: () => ({ rpc }) }));

import { GET, POST } from "./route";

const INV = "0b6f6a52-1d1b-4c5e-9f3b-7f1b2c3d4e5f";
const b64url = (s: string) => Buffer.from(s).toString("base64url");
function sign(payload: object, key: string) {
  const head = `${b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }))}.${b64url(JSON.stringify(payload))}`;
  return `${head}.${createHmac("sha256", key).update(head).digest("base64url")}`;
}
const url = (q: string) => `https://app.test/api/campay/webhook?${q}`;

beforeEach(() => {
  process.env.CAMPAY_TOKEN = "tok";
  process.env.CAMPAY_WEBHOOK_KEY = "wk";
  rpc.mockReset();
  // La transaction relue chez Campay fait foi.
  vi.stubGlobal("fetch", vi.fn(async () =>
    new Response(JSON.stringify({ reference: "r1", status: "SUCCESSFUL", amount: "75000", operator: "MTN", external_reference: INV, operator_reference: "op1" }), { status: 200 }),
  ));
});
afterEach(() => vi.unstubAllGlobals());

describe("webhook Campay", () => {
  it("400 sans signature", async () => {
    expect((await GET(new Request(url("reference=r1&status=SUCCESSFUL")))).status).toBe(400);
  });

  it("401 si la signature est fausse, sans rien enregistrer", async () => {
    const res = await GET(new Request(url(`reference=r1&status=SUCCESSFUL&signature=${sign({}, "mauvaise")}`)));
    expect(res.status).toBe(401);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("enregistre une transaction réussie relue chez Campay", async () => {
    rpc.mockResolvedValue({ data: "enregistre", error: null });
    const res = await GET(new Request(url(`reference=r1&status=SUCCESSFUL&external_reference=${INV}&signature=${sign({ status: "SUCCESSFUL" }, "wk")}`)));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ outcome: "enregistre" });
    expect(rpc).toHaveBeenCalledWith("record_provider_payment", expect.objectContaining({ p_invoice: INV, p_amount: 75000, p_provider_ref: "r1" }));
  });

  it("webhook rejoué : 200 sans doublon", async () => {
    rpc.mockResolvedValue({ data: "deja_enregistre", error: null });
    const res = await POST(new Request(url(`reference=r1&status=SUCCESSFUL&signature=${sign({}, "wk")}`), { method: "POST" }));
    expect(await res.json()).toEqual({ outcome: "deja_enregistre" });
  });

  it("ne croit pas le statut annoncé : la transaction relue est en échec", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ reference: "r1", status: "FAILED", amount: "75000", external_reference: INV }), { status: 200 })));
    const res = await GET(new Request(url(`reference=r1&status=SUCCESSFUL&signature=${sign({}, "wk")}`)));
    expect(await res.json()).toEqual({ outcome: "ignore_statut" });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("POST : lit aussi les paramètres d'un corps de formulaire", async () => {
    rpc.mockResolvedValue({ data: "enregistre", error: null });
    const body = new URLSearchParams({ reference: "r1", status: "SUCCESSFUL", signature: sign({}, "wk") });
    const res = await POST(new Request("https://app.test/api/campay/webhook", { method: "POST", body, headers: { "content-type": "application/x-www-form-urlencoded" } }));
    expect(res.status).toBe(200);
  });

  it("500 si Campay ne répond pas (Campay réessaiera)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("err", { status: 502 })));
    const res = await GET(new Request(url(`reference=r1&signature=${sign({}, "wk")}`)));
    expect(res.status).toBe(500);
  });
});
