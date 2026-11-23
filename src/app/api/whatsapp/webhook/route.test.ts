import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn(async () => ({ data: null, error: null }));
vi.mock("@/lib/supabase/server", () => ({ createAdminClient: () => ({ rpc }) }));

import { GET, POST } from "./route";

const URL_BASE = "https://app/api/whatsapp/webhook";
const sign = (body: string, secret = "appsecret") => "sha256=" + createHmac("sha256", secret).update(body).digest("hex");
const post = (body: string, sig: string | null) =>
  POST(new Request(URL_BASE, { method: "POST", body, headers: sig ? { "x-hub-signature-256": sig } : {} }));
const statuses = (list: object[]) => JSON.stringify({ entry: [{ changes: [{ value: { statuses: list } }] }] });

beforeEach(() => {
  process.env.WHATSAPP_VERIFY_TOKEN = "verif";
  process.env.WHATSAPP_APP_SECRET = "appsecret";
  rpc.mockClear();
});

describe("webhook WhatsApp", () => {
  it("vérification Meta : renvoie le challenge avec le bon jeton", async () => {
    const ok = await GET(new Request(`${URL_BASE}?hub.mode=subscribe&hub.verify_token=verif&hub.challenge=42`));
    expect(ok.status).toBe(200);
    expect(await ok.text()).toBe("42");
    expect((await GET(new Request(`${URL_BASE}?hub.mode=subscribe&hub.verify_token=faux&hub.challenge=42`))).status).toBe(403);
  });

  it("401 avec une fausse signature, rien modifié", async () => {
    const body = statuses([{ id: "wamid.1", status: "delivered" }]);
    expect((await post(body, sign(body, "autre"))).status).toBe(401);
    expect((await post(body, null)).status).toBe(401);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("applique les statuts signés", async () => {
    const body = statuses([{ id: "wamid.1", status: "delivered" }]);
    const res = await post(body, sign(body));
    expect(res.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("whatsapp_apply_status", { p_wamid: "wamid.1", p_status: "remis", p_error: null });
  });

  it("ignore les messages entrants", async () => {
    const body = JSON.stringify({ entry: [{ changes: [{ value: { messages: [{ id: "x", text: { body: "Bonjour" } }] } }] }] });
    expect((await post(body, sign(body))).status).toBe(200);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("500 si la base échoue (Meta réessaiera)", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: "panne" } } as never);
    const body = statuses([{ id: "wamid.1", status: "read" }]);
    expect((await post(body, sign(body))).status).toBe(500);
  });
});
